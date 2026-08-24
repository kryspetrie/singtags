/**
 * Tag track player: Web Audio graph for channel solo (mono downmix),
 * stereo balance, and optional SoundTouch pitch/speed.
 */
import { createSoundTouchNode, type SoundTouchNodeLike } from './soundtouch'
import type { SoloMode } from './channelSolo'

export type { SoloMode }

/** Max linear gain when balance is fully to one side (+6 dB), if headroom allows. */
export const BALANCE_MAX_BOOST = 2
/** Max linear gain when normalizing a quieter channel (+12 dB), if headroom allows. */
export const CHANNEL_NORM_MAX = 4
/** Stay just under digital full-scale so boosts never clip. */
export const OUTPUT_HEADROOM = 0.99

/**
 * Stereo balance: favored side is boosted (up to maxBoost), other stays at unity.
 * Optional per-channel normalize multipliers apply on top.
 * Final gains are capped so measuredPeak × gain ≤ headroom (no overdrive).
 */
export function stereoBalanceGains(
  balance: number,
  opts?: {
    maxBoost?: number
    normL?: number
    normR?: number
    peakL?: number
    peakR?: number
    headroom?: number
  },
): { l: number; r: number } {
  const b = Math.max(-1, Math.min(1, balance))
  const maxBoost = opts?.maxBoost ?? BALANCE_MAX_BOOST
  const normL = opts?.normL ?? 1
  const normR = opts?.normR ?? 1
  const headroom = opts?.headroom ?? OUTPUT_HEADROOM
  const peakL = opts?.peakL ?? 0
  const peakR = opts?.peakR ?? 0

  let l = 1
  let r = 1
  if (b < 0) l = 1 + -b * (maxBoost - 1)
  else if (b > 0) r = 1 + b * (maxBoost - 1)
  l *= normL
  r *= normR

  // Cap so channel peak stays ≤ headroom (assume peak=1 until measured)
  const effPeakL = peakL > 1e-4 ? peakL : 1
  const effPeakR = peakR > 1e-4 ? peakR : 1
  l = Math.min(l, headroom / effPeakL)
  r = Math.min(r, headroom / effPeakR)
  return { l, r }
}

function channelPeak(data: Float32Array): number {
  let peak = 0
  // Stride long buffers — tags are short; still skip for multi-minute audio.
  const step = data.length > 500_000 ? 4 : 1
  for (let i = 0; i < data.length; i += step) {
    const a = Math.abs(data[i]!)
    if (a > peak) peak = a
  }
  return peak
}

export class TagAudioPlayer {
  private audio = new Audio()
  private solo: SoloMode = 'stereo'
  /** -1 = boost left, 0 = center, +1 = boost right */
  private balance = 0
  private pitchSemitones = 0
  private speed = 1
  private onUpdate: (() => void) | null = null
  private onEnded: (() => void) | null = null
  private ctx: AudioContext | null = null
  private mediaSource: MediaElementAudioSourceNode | null = null
  private stNode: SoundTouchNodeLike | null = null
  private splitter: ChannelSplitterNode | null = null
  private merger: ChannelMergerNode | null = null
  private gainL: GainNode | null = null
  private gainR: GainNode | null = null
  private workletActive = false
  private workletFailed = false
  private graphReady = false
  private channelCount = 2
  /** Measured peaks from last probe (0–1). */
  private peakL = 0
  private peakR = 0
  private normL = 1
  private normR = 1

  constructor() {
    this.audio.preload = 'auto'
    this.audio.addEventListener('timeupdate', () => this.onUpdate?.())
    this.audio.addEventListener('loadedmetadata', () => this.onUpdate?.())
    this.audio.addEventListener('play', () => this.onUpdate?.())
    this.audio.addEventListener('pause', () => this.onUpdate?.())
    this.audio.addEventListener('ended', () => {
      this.onUpdate?.()
      this.onEnded?.()
    })
  }

  setUpdateListener(fn: (() => void) | null): void {
    this.onUpdate = fn
  }

  setEndedListener(fn: (() => void) | null): void {
    this.onEnded = fn
  }

  get element(): HTMLAudioElement {
    return this.audio
  }

  get currentTime(): number {
    return this.audio.currentTime
  }

  get duration(): number {
    return Number.isFinite(this.audio.duration) ? this.audio.duration : 0
  }

  get paused(): boolean {
    return this.audio.paused
  }

  get usingWorklet(): boolean {
    return this.workletActive
  }

  /** 1 = mono (solo L/R will sound the same). */
  get channels(): number {
    return this.channelCount
  }

  getBalance(): number {
    return this.balance
  }

  /** True when channel peaks differ enough to auto-match levels. */
  private shouldAutoNormalizeChannels(): boolean {
    if (this.channelCount < 2) return false
    if (this.peakL < 1e-4 || this.peakR < 1e-4) return false
    const ratio = Math.max(this.peakL, this.peakR) / Math.min(this.peakL, this.peakR)
    return ratio > 1.08
  }

  private needsWorklet(): boolean {
    return Math.abs(this.pitchSemitones) >= 0.01 || Math.abs(this.speed - 1) >= 0.001
  }

  private needsGraph(): boolean {
    return (
      this.graphReady ||
      this.needsWorklet() ||
      this.solo !== 'stereo' ||
      Math.abs(this.balance) >= 0.001 ||
      this.shouldAutoNormalizeChannels()
    )
  }

  private applyFallbackRate(): void {
    const pitchRatio = 2 ** (this.pitchSemitones / 12)
    this.audio.playbackRate = Math.min(4, Math.max(0.25, this.speed * pitchRatio))
    this.audio.preservesPitch = Math.abs(this.pitchSemitones) < 0.01
  }

  private applyWorkletParams(): void {
    if (!this.stNode) return
    this.audio.preservesPitch = false
    this.audio.playbackRate = 1
    this.stNode.playbackRate.value = this.speed
    this.stNode.pitch.value = 1
    this.stNode.pitchSemitones.value = this.pitchSemitones
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

  private recomputeNormGains(): void {
    if (!this.shouldAutoNormalizeChannels()) {
      this.normL = 1
      this.normR = 1
      return
    }
    // Match quieter to louder, but never above digital full-scale headroom
    const target = Math.min(OUTPUT_HEADROOM, Math.max(this.peakL, this.peakR))
    this.normL = Math.min(CHANNEL_NORM_MAX, target / this.peakL)
    this.normR = Math.min(CHANNEL_NORM_MAX, target / this.peakR)
  }

  /**
   * Solo L/R: selected channel is played in mono on both speakers.
   * Stereo: apply balance (+ boost) and optional channel normalize.
   */
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

  private disconnectGraphTail(): void {
    try {
      this.stNode?.disconnect()
    } catch {
      /* ignore */
    }
    try {
      this.splitter?.disconnect()
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
    try {
      this.mediaSource?.disconnect()
    } catch {
      /* ignore */
    }
  }

  private async ensureGraph(): Promise<void> {
    if (!this.ctx) this.ctx = new AudioContext()
    if (this.ctx.state === 'suspended') await this.ctx.resume()
    if (!this.mediaSource) {
      this.mediaSource = this.ctx.createMediaElementSource(this.audio)
    }

    this.disconnectGraphTail()

    if (!this.splitter) this.splitter = this.ctx.createChannelSplitter(2)
    if (!this.gainL) this.gainL = this.ctx.createGain()
    if (!this.gainR) this.gainR = this.ctx.createGain()
    if (!this.merger) this.merger = this.ctx.createChannelMerger(2)

    let head: AudioNode = this.mediaSource

    if (this.needsWorklet() && !this.workletFailed) {
      if (!this.stNode) {
        const node = await createSoundTouchNode(this.ctx)
        if (!node) {
          this.workletFailed = true
        } else {
          this.stNode = node
        }
      }
      if (this.stNode) {
        this.mediaSource.connect(this.stNode as unknown as AudioNode)
        head = this.stNode as unknown as AudioNode
        this.workletActive = true
        this.applyWorkletParams()
      } else {
        this.workletActive = false
        this.applyFallbackRate()
      }
    } else {
      this.workletActive = false
      if (this.needsWorklet()) this.applyFallbackRate()
      else {
        this.audio.playbackRate = 1
        this.audio.preservesPitch = true
      }
    }

    head.connect(this.splitter)
    this.splitter.connect(this.gainL, 0)
    this.splitter.connect(this.gainR, 1)
    this.wireChannelOutputs()
    this.merger.connect(this.ctx.destination)
    this.graphReady = true
  }

  private async applyTransform(): Promise<void> {
    if (this.needsGraph()) {
      await this.ensureGraph()
      return
    }
    this.applyFallbackRate()
  }

  /** Wait until the element has duration/metadata (load() alone does not). */
  private waitForMetadata(timeoutMs = 4_000): Promise<void> {
    // HAVE_METADATA === 1 (avoid HTMLMediaElement.HAVE_METADATA — missing in some test envs)
    if (this.audio.readyState >= 1) return Promise.resolve()
    return new Promise((resolve, reject) => {
      let settled = false
      const finish = (fn: () => void) => {
        if (settled) return
        settled = true
        cleanup()
        fn()
      }
      const onMeta = () => finish(() => resolve())
      const onErr = () =>
        finish(() => reject(new Error(this.audio.error?.message || 'Media failed to load')))
      const timer = window.setTimeout(() => {
        // Don't block the UI forever — duration may still arrive via later events.
        finish(() => resolve())
      }, timeoutMs)
      const cleanup = () => {
        window.clearTimeout(timer)
        this.audio.removeEventListener('loadedmetadata', onMeta)
        this.audio.removeEventListener('loadeddata', onMeta)
        this.audio.removeEventListener('error', onErr)
      }
      this.audio.addEventListener('loadedmetadata', onMeta)
      this.audio.addEventListener('loadeddata', onMeta)
      this.audio.addEventListener('error', onErr)
    })
  }

  async load(url: string, solo: SoloMode = 'stereo'): Promise<void> {
    this.solo = solo
    this.peakL = 0
    this.peakR = 0
    this.normL = 1
    this.normR = 1
    // crossOrigin on blob: URLs breaks playback in Chromium; only needed for remote CORS.
    if (url.startsWith('http://') || url.startsWith('https://')) {
      this.audio.crossOrigin = 'anonymous'
    } else {
      this.audio.removeAttribute('crossorigin')
    }
    this.audio.src = url
    this.audio.load()
    // Metadata can stall on refresh (CORS / cache); never block callers indefinitely.
    await this.waitForMetadata()
    // Probe peaks in the background — never block first paint / waveform on a full decode.
    void this.probeChannels(url)
    if (this.needsGraph()) await this.ensureGraph()
    else await this.applyTransform()
  }

  /** Drop the current source so Play cannot resume a stale track. */
  clearSource(): void {
    this.pause()
    this.audio.removeAttribute('src')
    this.audio.load()
    this.peakL = 0
    this.peakR = 0
    this.normL = 1
    this.normR = 1
  }

  private async probeChannels(url: string): Promise<void> {
    try {
      // Decode on the playback context when available; otherwise a short-lived one we close.
      let ctx = this.ctx
      let owned = false
      if (!ctx) {
        ctx = new AudioContext()
        owned = true
      }
      try {
        const res = await fetch(url)
        if (!res.ok) return
        const buf = await res.arrayBuffer()
        const decoded = await ctx.decodeAudioData(buf.slice(0))
        this.channelCount = decoded.numberOfChannels
        this.peakL = channelPeak(decoded.getChannelData(0))
        this.peakR =
          decoded.numberOfChannels > 1 ? channelPeak(decoded.getChannelData(1)) : this.peakL
        this.recomputeNormGains()
        if (this.needsGraph()) await this.ensureGraph()
        else if (this.graphReady) this.wireChannelOutputs()
        this.onUpdate?.()
      } finally {
        if (owned) await ctx.close().catch(() => {})
      }
    } catch {
      this.channelCount = 2
      this.peakL = 0
      this.peakR = 0
      this.recomputeNormGains()
    }
  }

  async setSolo(solo: SoloMode): Promise<void> {
    this.solo = solo
    await this.ensureGraph()
    this.onUpdate?.()
  }

  async setBalance(value: number): Promise<void> {
    this.balance = Math.max(-1, Math.min(1, value))
    await this.ensureGraph()
    this.onUpdate?.()
  }

  async setPitchSemitones(n: number): Promise<void> {
    this.pitchSemitones = n
    await this.applyTransform()
  }

  async setSpeed(n: number): Promise<void> {
    this.speed = n
    await this.applyTransform()
  }

  getPitchSemitones(): number {
    return this.pitchSemitones
  }

  getSpeed(): number {
    return this.speed
  }

  getSolo(): SoloMode {
    return this.solo
  }

  async play(): Promise<void> {
    await this.ensureGraph()
    if (this.ctx?.state === 'suspended') await this.ctx.resume()
    await this.audio.play()
  }

  pause(): void {
    this.audio.pause()
  }

  seek(t: number): void {
    this.audio.currentTime = t
  }

  setLoop(loop: boolean): void {
    this.audio.loop = loop
  }

  dispose(): void {
    this.pause()
    this.disconnectGraphTail()
    this.stNode = null
    this.mediaSource = null
    this.splitter = null
    this.gainL = null
    this.gainR = null
    this.merger = null
    this.graphReady = false
    this.workletActive = false
    void this.ctx?.close()
    this.ctx = null
    this.audio.removeAttribute('src')
    this.audio.load()
  }
}
