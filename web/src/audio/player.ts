/**
 * Tag track player — bake-first independent pitch & speed.
 *
 * Invariants (docs/decisions/pitch-speed-bake.md):
 * - Audible AudioBufferSourceNode.playbackRate is always 1.
 * - Identity (pitch=0, speed=1) never enters the bake pipeline.
 * - Solo/balance live in a persistent gain graph.
 *   Mono / dual-mono sources hard-pan to `monoPanSide` when set (learning tracks);
 *   otherwise they fan to L+R. True stereo uses ChannelSplitter.
 * - Never uses MediaElementAudioSourceNode.
 */
import type { SoloMode } from './channelSolo'
import type { PartSide } from '../lib/audioLayout'
import {
  BALANCE_MAX_BOOST,
  CHANNEL_NORM_MAX,
  OUTPUT_HEADROOM,
  stereoBalanceGains,
} from './playerUtils'
import { bakeCache } from './bakeCache'
import { processOfflineTransform } from './bakeClient'
import {
  bakeCacheKey,
  canonicalizeTransform,
  isCanonicalIdentity,
  originalSecondsToPlayable,
  type CanonicalTransform,
} from './transformContract'
import { decodeService, type DecodedTrack } from './decodeCache'

export type { SoloMode }
export {
  BALANCE_MAX_BOOST,
  CHANNEL_NORM_MAX,
  OUTPUT_HEADROOM,
  stereoBalanceGains,
  channelsEffectivelyMono,
} from './playerUtils'

/**
 * Tag learning-track player with bake-first pitch/speed, solo/balance graph,
 * A–B loop, and original-timeline playhead. See module header invariants.
 */
export class TagAudioPlayer {
  private solo: SoloMode = 'stereo'
  /** When set, mono / dual-mono buffers play on this side only (not fanned to both). */
  private monoPanSide: PartSide | null = null
  private balance = 0
  private requested: CanonicalTransform = { pitchSemitones: 0, speed: 1 }
  private audible: CanonicalTransform = { pitchSemitones: 0, speed: 1 }
  private loop = false
  private onUpdate: (() => void) | null = null
  private onEnded: (() => void) | null = null

  private ctx: AudioContext | null = null
  private original: AudioBuffer | null = null
  private playable: AudioBuffer | null = null
  private sourceRevision = ''
  private bufferSource: AudioBufferSourceNode | null = null
  private sourceGen = 0
  private loadGen = 0
  /** Serialize startSource so seek / region / bake swaps cannot overlap. */
  private startChain: Promise<void> = Promise.resolve()

  private splitter: ChannelSplitterNode | null = null
  private merger: ChannelMergerNode | null = null
  private gainL: GainNode | null = null
  private gainR: GainNode | null = null
  private graphWired = false
  private monoFan: GainNode | null = null

  private playing = false
  /** Playhead in original-timeline seconds. */
  private playheadOriginal = 0
  private startedAtCtx = 0
  /** Original-timeline position when the current source started. */
  private startedAtOriginal = 0
  private tickTimer: ReturnType<typeof setInterval> | null = null
  private intentionalStop = false

  private channelCount = 2
  private _effectivelyMono = false
  private peakL = 0
  private peakR = 0
  /** Peaks from the decoded original — restored on identity (avoid re-scan). */
  private decodedPeakL = 0
  private decodedPeakR = 0
  private normL = 1
  private normR = 1

  private _baking = false
  private _bakeError: string | null = null
  private bakeAbort: AbortController | null = null
  private regionA = 0
  private regionB = 0
  private regionActive = false

  /** Register a callback fired on playhead / bake / solo updates (~50 ms while playing). */
  setUpdateListener(fn: (() => void) | null): void {
    this.onUpdate = fn
  }

  /** Register a callback when playback reaches natural end (not A–B region stop). */
  setEndedListener(fn: (() => void) | null): void {
    this.onEnded = fn
  }

  /** Original-timeline current time (I6 / I15). */
  get currentTime(): number {
    if (!this.playing || !this.ctx || !this.original || !this.playable) {
      return this.playheadOriginal
    }
    const wall = this.ctx.currentTime - this.startedAtCtx
    const scale = this.original.length / Math.max(1, this.playable.length)
    const orig = this.startedAtOriginal + wall * scale
    const dur = this.duration
    if (dur > 0 && orig >= dur) return dur
    return Math.max(0, orig)
  }

  /** Always original buffer duration in seconds. */
  get duration(): number {
    return this.original ? this.original.length / this.original.sampleRate : 0
  }

  get paused(): boolean {
    return !this.playing
  }

  /** True while a non-identity bake is in flight for the requested transform. */
  get baking(): boolean {
    return this._baking
  }

  get bakeError(): string | null {
    return this._bakeError
  }

  /** True when audible transform is non-identity (baked buffer in use). */
  get usingBake(): boolean {
    return !isCanonicalIdentity(this.audible)
  }

  /** @deprecated Use usingBake — live worklet path removed. */
  get usingWorklet(): boolean {
    return false
  }

  get channels(): number {
    return this.channelCount
  }

  get effectivelyMono(): boolean {
    return this._effectivelyMono
  }

  /**
   * Decoded original buffer after a successful {@link load}, or null.
   * Callers can derive waveform peaks without a second fetch/decode.
   */
  getOriginalBuffer(): AudioBuffer | null {
    return this.original
  }

  getBalance(): number {
    return this.balance
  }

  getPitchSemitones(): number {
    return this.requested.pitchSemitones
  }

  getSpeed(): number {
    return this.requested.speed
  }

  getAudiblePitchSemitones(): number {
    return this.audible.pitchSemitones
  }

  getAudibleSpeed(): number {
    return this.audible.speed
  }

  getSolo(): SoloMode {
    return this.solo
  }

  private shouldAutoNormalizeChannels(): boolean {
    // Learning-track hard L/R (or mono hard-pan) is intentional — don't boost the
    // quieter side up to the solo side; that flattens the stereo image.
    if (this.monoPanSide) return false
    if (this.channelCount < 2) return false
    if (this.peakL < 1e-4 || this.peakR < 1e-4) return false
    const ratio = Math.max(this.peakL, this.peakR) / Math.min(this.peakL, this.peakR)
    return ratio > 1.08
  }

  private recomputeNormGains(): void {
    if (!this.shouldAutoNormalizeChannels()) {
      this.normL = 1
      this.normR = 1
      return
    }
    const target = Math.min(OUTPUT_HEADROOM, Math.max(this.peakL, this.peakR))
    this.normL = Math.min(CHANNEL_NORM_MAX, target / this.peakL)
    this.normR = Math.min(CHANNEL_NORM_MAX, target / this.peakR)
  }

  private balanceGains(): { l: number; r: number } {
    return stereoBalanceGains(this.balance, {
      maxBoost: BALANCE_MAX_BOOST,
      normL: this.normL,
      normR: this.normR,
      peakL: this.peakL,
      peakR: this.peakR,
      headroom: OUTPUT_HEADROOM,
    })
  }

  private stopTick(): void {
    if (this.tickTimer != null) {
      clearInterval(this.tickTimer)
      this.tickTimer = null
    }
  }

  private startTick(): void {
    this.stopTick()
    this.tickTimer = setInterval(() => {
      if (!this.playing) return
      if (this.regionActive && this.currentTime >= this.regionB - 0.03) {
        if (this.loop) {
          void this.seek(this.regionA)
          return
        }
        this.stopSource({ capturePlayhead: false })
        this.playheadOriginal = this.regionB
        this.onUpdate?.()
        // Do not fire onEnded for A–B stop — that means "track finished" to the queue.
        return
      }
      this.onUpdate?.()
    }, 50)
  }

  private capturePlayhead(): void {
    if (this.playing) this.playheadOriginal = this.currentTime
  }

  private stopSource(opts?: { capturePlayhead?: boolean }): void {
    if (opts?.capturePlayhead !== false) this.capturePlayhead()
    this.playing = false
    this.stopTick()
    this.intentionalStop = true
    if (this.bufferSource) {
      const src = this.bufferSource
      try {
        src.onended = null
        src.stop()
      } catch {
        /* already stopped */
      }
      try {
        src.disconnect()
      } catch {
        /* ignore */
      }
      this.bufferSource = null
    }
  }

  private wireChannelOutputs(): void {
    if (!this.gainL || !this.gainR || !this.merger) return
    try {
      this.gainL.disconnect()
    } catch {
      /* ignore */
    }
    try {
      this.gainR.disconnect()
    } catch {
      /* ignore */
    }

    if (this.solo === 'left') {
      const peak = this.peakL > 1e-4 ? this.peakL : 1
      this.gainL.gain.value = Math.min(this.normL, OUTPUT_HEADROOM / peak)
      this.gainR.gain.value = 0
      this.gainL.connect(this.merger, 0, 0)
      this.gainL.connect(this.merger, 0, 1)
    } else if (this.solo === 'right') {
      const peak = this.peakR > 1e-4 ? this.peakR : 1
      this.gainL.gain.value = 0
      this.gainR.gain.value = Math.min(this.normR, OUTPUT_HEADROOM / peak)
      this.gainR.connect(this.merger, 0, 0)
      this.gainR.connect(this.merger, 0, 1)
    } else {
      const { l, r } = this.balanceGains()
      this.gainL.gain.value = l
      this.gainR.gain.value = r
      this.gainL.connect(this.merger, 0, 0)
      this.gainR.connect(this.merger, 0, 1)
    }
  }

  private async ensureContext(): Promise<AudioContext> {
    if (!this.ctx) this.ctx = new AudioContext()
    if (this.ctx.state === 'suspended') await this.ctx.resume()
    return this.ctx
  }

  private async ensureTailGraph(ctx: AudioContext): Promise<void> {
    if (!this.splitter) this.splitter = ctx.createChannelSplitter(2)
    if (!this.gainL) this.gainL = ctx.createGain()
    if (!this.gainR) this.gainR = ctx.createGain()
    if (!this.merger) this.merger = ctx.createChannelMerger(2)
    if (!this.monoFan) this.monoFan = ctx.createGain()

    if (!this.graphWired) {
      this.merger.connect(ctx.destination)
      this.graphWired = true
    }
    this.wireChannelOutputs()
  }

  private connectSourceToTail(src: AudioBufferSourceNode, mono: boolean): void {
    // Disconnect prior router inputs
    try {
      this.splitter?.disconnect()
    } catch {
      /* ignore */
    }
    try {
      this.monoFan?.disconnect()
    } catch {
      /* ignore */
    }

    // Only true mono files use the mono fan. Dual-mono stereo (identical L/R) must
    // still go through the splitter — collapsing via GainNode downmixes L+R and was
    // re-creating "same signal in both speakers" when monoPanSide was unset.
    // Learning-track rebuild (finalizeBlobUrl) is responsible for hard L/R separation.
    if (mono && this.monoPanSide) {
      src.connect(this.monoFan!)
      if (this.monoPanSide === 'left') this.monoFan!.connect(this.gainL!)
      else this.monoFan!.connect(this.gainR!)
    } else if (mono) {
      // True mono with no preferred side (e.g. mix-only): fan to both.
      src.connect(this.monoFan!)
      this.monoFan!.connect(this.gainL!)
      this.monoFan!.connect(this.gainR!)
    } else {
      src.connect(this.splitter!)
      this.splitter!.connect(this.gainL!, 0)
      this.splitter!.connect(this.gainR!, 1)
    }
    this.wireChannelOutputs()
  }

  private playableOffsetSeconds(originalSec: number): number {
    if (!this.original || !this.playable) return originalSec
    return originalSecondsToPlayable(
      originalSec,
      this.original.sampleRate,
      this.original.length,
      this.playable.length,
    )
  }

  private async startSource(): Promise<void> {
    const run = async (): Promise<void> => {
      if (!this.playable || !this.original) return
      const ctx = await this.ensureContext()
      if (!this.playable || !this.original) return
      await this.ensureTailGraph(ctx)
      if (!this.playable || !this.original) return

      const gen = ++this.sourceGen
      this.intentionalStop = true
      if (this.bufferSource) {
        try {
          this.bufferSource.onended = null
          this.bufferSource.stop()
        } catch {
          /* ignore */
        }
        try {
          this.bufferSource.disconnect()
        } catch {
          /* ignore */
        }
        this.bufferSource = null
      }

      const playableDur = this.playable.length / this.playable.sampleRate
      const maxOffset = Math.max(0, playableDur - 1 / this.playable.sampleRate)
      const offsetPlayable = Math.min(
        Math.max(0, this.playableOffsetSeconds(this.playheadOriginal)),
        maxOffset,
      )

      const src = ctx.createBufferSource()
      src.buffer = this.playable
      src.playbackRate.value = 1 // I1 — always
      src.loop = false

      if (this.loop && this.regionActive) {
        const a = this.playableOffsetSeconds(this.regionA)
        const b = this.playableOffsetSeconds(this.regionB)
        if (b > a + 0.01) {
          src.loop = true
          src.loopStart = a
          src.loopEnd = b
        }
      } else if (this.loop && !this.regionActive) {
        src.loop = true
      }

      const mono = this.playable.numberOfChannels < 2
      this.connectSourceToTail(src, mono)

      src.onended = () => {
        if (this.sourceGen !== gen || this.bufferSource !== src) return
        if (this.intentionalStop) return
        this.playing = false
        this.bufferSource = null
        this.stopTick()
        if (this.loop && this.regionActive) {
          this.playheadOriginal = this.regionA
          void this.startSource().then(() => this.onUpdate?.())
          return
        }
        if (this.loop && !this.regionActive) {
          this.playheadOriginal = 0
          void this.startSource().then(() => this.onUpdate?.())
          return
        }
        // Natural end of scheduled region or full buffer — stay on original timeline.
        // Region end does NOT mean "track ended" for queue advancement; only full-buffer end does.
        this.playheadOriginal = this.regionActive ? this.regionB : this.duration
        this.onUpdate?.()
        if (!this.regionActive) this.onEnded?.()
      }

      this.bufferSource = src
      this.startedAtCtx = ctx.currentTime
      this.startedAtOriginal = this.playheadOriginal
      this.playing = true
      this.intentionalStop = false

      if (this.regionActive && !this.loop) {
        const endPlayable = this.playableOffsetSeconds(this.regionB)
        const dur = Math.max(0.01, endPlayable - offsetPlayable)
        src.start(0, offsetPlayable, dur)
      } else {
        src.start(0, offsetPlayable)
      }
      this.startTick()
    }

    const next = this.startChain.then(run, run)
    this.startChain = next.then(
      () => undefined,
      () => undefined,
    )
    return next
  }

  private applyDecoded(track: DecodedTrack, solo: SoloMode): void {
    this.original = track.buffer
    this.playable = track.buffer
    this.sourceRevision = track.identity.revision
    this.channelCount = track.channels
    this.peakL = track.peakL
    this.peakR = track.peakR
    this.decodedPeakL = track.peakL
    this.decodedPeakR = track.peakR
    this._effectivelyMono = track.effectivelyMono
    this.solo = solo
    this.audible = { pitchSemitones: 0, speed: 1 }
    this.recomputeNormGains()
    bakeCache.setPinned(null)
  }

  /**
   * Fetch and decode a track URL; resets playhead and applies any pending transform.
   * @param monoPanSide Hard-pan mono/dual-mono learning tracks to L or R when set.
   */
  async load(
    url: string,
    solo: SoloMode = 'stereo',
    opts?: { signal?: AbortSignal; monoPanSide?: PartSide | null },
  ): Promise<void> {
    const gen = ++this.loadGen
    this.bakeAbort?.abort()
    this.bakeAbort = null
    this._baking = false
    this._bakeError = null
    this.stopSource()
    this.solo = solo
    this.monoPanSide = opts?.monoPanSide ?? null
    this.playheadOriginal = 0
    this.original = null
    this.playable = null
    this.sourceRevision = ''
    this.peakL = 0
    this.peakR = 0
    this.decodedPeakL = 0
    this.decodedPeakR = 0
    this.normL = 1
    this.normR = 1
    this._effectivelyMono = false
    this.channelCount = 2
    this.regionActive = false

    const track = await decodeService.decode(url, { signal: opts?.signal })
    if (gen !== this.loadGen || opts?.signal?.aborted) return
    this.applyDecoded(track, solo)

    // Re-apply requested transform if non-identity
    if (!isCanonicalIdentity(this.requested)) {
      await this.applyRequestedTransform(true)
    }
    if (gen !== this.loadGen) return
    this.onUpdate?.()
  }

  /** Drop the current source without closing the audio context. */
  clearSource(): void {
    this.loadGen++
    this.bakeAbort?.abort()
    this.bakeAbort = null
    this._baking = false
    this.stopSource()
    this.original = null
    this.playable = null
    this.sourceRevision = ''
    this.playheadOriginal = 0
    this.peakL = 0
    this.peakR = 0
    this.decodedPeakL = 0
    this.decodedPeakR = 0
    this.normL = 1
    this.normR = 1
    this._effectivelyMono = false
    this.monoPanSide = null
    this.channelCount = 2
    this.regionActive = false
    bakeCache.setPinned(null)
  }

  async setSolo(solo: SoloMode): Promise<void> {
    this.solo = solo
    if (this.ctx) await this.ensureTailGraph(this.ctx)
    this.wireChannelOutputs()
    this.onUpdate?.()
  }

  async setBalance(value: number): Promise<void> {
    this.balance = Math.max(-1, Math.min(1, value))
    if (this.ctx) await this.ensureTailGraph(this.ctx)
    this.wireChannelOutputs()
    this.onUpdate?.()
  }

  async setPitchSemitones(n: number): Promise<void> {
    this.requested = canonicalizeTransform(n, this.requested.speed)
    await this.applyRequestedTransform(true)
  }

  async setSpeed(n: number): Promise<void> {
    this.requested = canonicalizeTransform(this.requested.pitchSemitones, n)
    await this.applyRequestedTransform(true)
  }

  /** Set pitch and speed together (one bake). Prefer this over sequential setPitch/setSpeed. */
  async setTransform(pitchSemitones: number, speed: number): Promise<void> {
    this.requested = canonicalizeTransform(pitchSemitones, speed)
    await this.applyRequestedTransform(true)
  }

  private async applyRequestedTransform(restartIfPlaying: boolean): Promise<void> {
    if (!this.original) {
      this.onUpdate?.()
      return
    }

    const req = this.requested
    this.bakeAbort?.abort()
    this.bakeAbort = null
    this._bakeError = null

    const swapPlayable = async (next: AudioBuffer, audible: CanonicalTransform): Promise<void> => {
      // Capture on the *current* playable timeline before swapping buffers.
      this.capturePlayhead()
      const resumeAt = this.playheadOriginal
      const wasPlaying = this.playing
      this.stopSource({ capturePlayhead: false })
      this.playable = next
      this.audible = audible
      this.playheadOriginal = resumeAt
      if (wasPlaying && restartIfPlaying) await this.startSource()
    }

    if (isCanonicalIdentity(req)) {
      this._baking = false
      // Already on identity original — restore decode peaks without tearing down audio.
      if (this.playable === this.original && isCanonicalIdentity(this.audible)) {
        this.peakL = this.decodedPeakL
        this.peakR = this.decodedPeakR
        this.recomputeNormGains()
        bakeCache.setPinned(null)
        this.onUpdate?.()
        return
      }
      await swapPlayable(this.original, { pitchSemitones: 0, speed: 1 })
      this.peakL = this.decodedPeakL
      this.peakR = this.decodedPeakR
      this.recomputeNormGains()
      this.wireChannelOutputs()
      bakeCache.setPinned(null)
      this.onUpdate?.()
      return
    }

    // Keep last audible while baking (I15).
    this._baking = true
    this.onUpdate?.()

    const ac = new AbortController()
    this.bakeAbort = ac
    const gen = this.loadGen
    // Do not snapshot resumeAt here — user may scrub while baking; swapPlayable captures fresh.

    let baked: AudioBuffer | null = null
    try {
      baked = await processOfflineTransform(this.original, req.pitchSemitones, req.speed, {
        sourceRevision: this.sourceRevision,
        signal: ac.signal,
      })
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        // Only clear baking if this request still owns the abort controller —
        // a newer setSpeed/setPitch may already be in flight.
        if (gen === this.loadGen && this.bakeAbort === ac) this._baking = false
        return
      }
      throw err
    }

    if (gen !== this.loadGen || ac.signal.aborted) {
      if (this.bakeAbort === ac) this._baking = false
      return
    }

    if (!baked) {
      this._baking = false
      this._bakeError = 'Pitch/speed transform failed. Previous audio kept.'
      this.requested = { ...this.audible }
      this.onUpdate?.()
      return
    }

    if (
      this.requested.pitchSemitones !== req.pitchSemitones ||
      this.requested.speed !== req.speed
    ) {
      if (this.bakeAbort === ac) this._baking = false
      return
    }

    this._baking = false
    const prevPlayable = this.playable
    const prevAudible = { ...this.audible }
    const resumePlaying = this.playing
    try {
      await swapPlayable(baked, { ...req })
    } catch (err) {
      console.warn('[TagAudioPlayer] bake swap failed', err)
      this.playable = prevPlayable
      this.audible = prevAudible
      this.requested = { ...prevAudible }
      this._bakeError = 'Pitch/speed transform failed. Previous audio kept.'
      if (prevPlayable && resumePlaying) {
        try {
          await this.startSource()
        } catch {
          /* ignore secondary failure */
        }
      }
      this.onUpdate?.()
      return
    }

    const pinKey = bakeCacheKey({
      sourceRevision: this.sourceRevision,
      sampleRate: baked.sampleRate,
      channels: Math.min(2, baked.numberOfChannels),
      pitchSemitones: req.pitchSemitones,
      speed: req.speed,
    })
    const cachedPeaks = bakeCache.get(pinKey)
    if (cachedPeaks) {
      this.peakL = cachedPeaks.peakL
      this.peakR = cachedPeaks.peakR
    } else {
      const d0 = baked.getChannelData(0)
      let pL = 0
      const step = Math.max(1, d0.length >> 16)
      for (let i = 0; i < d0.length; i += step) pL = Math.max(pL, Math.abs(d0[i]!))
      this.peakL = pL
      if (baked.numberOfChannels > 1) {
        const d1 = baked.getChannelData(1)
        let pR = 0
        for (let i = 0; i < d1.length; i += step) pR = Math.max(pR, Math.abs(d1[i]!))
        this.peakR = pR
      } else {
        this.peakR = pL
      }
    }
    this.recomputeNormGains()
    this.wireChannelOutputs()

    bakeCache.setPinned(pinKey)
    this.onUpdate?.()
  }

  async play(): Promise<void> {
    if (!this.playable) return
    if (this.playing) return
    if (this.duration > 0 && this.playheadOriginal >= this.duration - 0.02) {
      this.playheadOriginal = this.regionActive ? this.regionA : 0
    }
    await this.startSource()
    this.onUpdate?.()
  }

  pause(): void {
    if (!this.playing) return
    this.stopSource()
    this.onUpdate?.()
  }

  async seek(t: number): Promise<void> {
    const dur = this.duration
    const next = Math.max(0, dur > 0 ? Math.min(t, dur) : t)
    const wasPlaying = this.playing
    this.stopSource({ capturePlayhead: false })
    this.playheadOriginal = next
    if (wasPlaying) await this.startSource()
    this.onUpdate?.()
  }

  setLoop(loop: boolean): void {
    this.loop = loop
  }

  /** A–B region in original seconds. Pass b<=a to clear. Remaps live if playing. */
  setPlayRegion(a: number, b: number): void {
    if (b <= a + 0.05) {
      const wasActive = this.regionActive
      this.regionActive = false
      this.regionA = 0
      this.regionB = 0
      // Drop scheduled one-shot stop if we were playing inside a region.
      if (wasActive && this.playing && !this.loop) {
        this.capturePlayhead()
        void this.startSource().then(() => this.onUpdate?.())
      }
      return
    }
    this.regionActive = true
    this.regionA = Math.max(0, a)
    this.regionB = b
    // If currently playing a one-shot region, restart so scheduled stop uses new B.
    if (this.playing && !this.loop) {
      this.capturePlayhead()
      void this.startSource().then(() => this.onUpdate?.())
    }
  }

  /** Tear down nodes, abort bakes, and close the audio context. */
  dispose(): void {
    this.loadGen++
    this.bakeAbort?.abort()
    this.bakeAbort = null
    this.stopSource()
    try {
      this.splitter?.disconnect()
    } catch {
      /* ignore */
    }
    try {
      this.monoFan?.disconnect()
    } catch {
      /* ignore */
    }
    try {
      this.gainL?.disconnect()
    } catch {
      /* ignore */
    }
    try {
      this.gainR?.disconnect()
    } catch {
      /* ignore */
    }
    try {
      this.merger?.disconnect()
    } catch {
      /* ignore */
    }
    this.splitter = null
    this.monoFan = null
    this.gainL = null
    this.gainR = null
    this.merger = null
    this.graphWired = false
    this.original = null
    this.playable = null
    bakeCache.setPinned(null)
    void this.ctx?.close()
    this.ctx = null
  }
}
