/**
 * Polyphonic sample piano: one AudioBufferSourceNode voice per sounding note.
 *
 * Live strikes must stay synchronous on the cache-hit path — the WAV/Opus
 * samples already contain their attack transient, so we do not gain-ramp on.
 */
import {
  ensurePianoOctavesAroundNote,
  ensurePianoSample,
  getCachedPianoSample,
  noteToMidi,
} from './pianoSamples'
import {
  createInteractiveAudioContext,
  ensureAudioKeepalive,
  stopAudioKeepalive,
  type AudioKeepalive,
} from './interactiveAudioContext'
import { midiToHz, playbackRateEaseInOutCurve } from '../lib/tagRoll/portamento'
import type { TagRollSoundEnvelope } from '../lib/tagRoll/soundEnvelope'

/** Release only — attack is in the sample file (never ramp on note-on). */
const PIANO_PLAY_ENVELOPE = {
  attackSec: 0,
  decaySec: 0.04,
  phraseDecaySec: 0.3,
} as const

type NoteMixOpts = {
  voiceKey?: string
  gain?: number
  pan?: number
}

type SampleVoice = {
  key: string
  note: string
  /** MIDI of the sample buffer (rate=1). */
  baseMidi: number
  /** Current sounding MIDI after glides. */
  midi: number
  source: AudioBufferSourceNode
  gain: GainNode
  panner: AudioNode | null
  startedAt: number
}

const VOICE_LIMIT = 16

export class SamplePianoPlayer {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private keepalive: AudioKeepalive | null = null
  private voices = new Map<string, SampleVoice>()
  private lastDetuneCents = 0
  private masterGain = 0.85
  private envelope: TagRollSoundEnvelope = { ...PIANO_PLAY_ENVELOPE }
  private loadError: string | null = null

  getLoadError(): string | null {
    return this.loadError
  }

  setEnvelope(env: TagRollSoundEnvelope): void {
    // Keep attack at 0 for samples — callers may pass Tag Studio phrase envelopes.
    this.envelope = { ...env, attackSec: 0 }
  }

  activeNotes(): string[] {
    return [...this.voices.keys()]
  }

  isNoteActive(noteOrKey: string): boolean {
    return this.voices.has(noteOrKey)
  }

  private ensure(): AudioContext {
    if (!this.ctx || this.ctx.state === 'closed') {
      this.ctx = createInteractiveAudioContext()
      this.master = this.ctx.createGain()
      this.master.gain.value = this.masterGain
      this.master.connect(this.ctx.destination)
    }
    return this.ctx
  }

  /** Create/resume context on a user gesture (Tag Studio Play before blow-pitch await). */
  async warmUp(): Promise<void> {
    const ctx = this.ensure()
    if (ctx.state === 'suspended') await ctx.resume()
    this.keepalive = ensureAudioKeepalive(ctx, this.keepalive)
  }

  async preloadForNote(note: string): Promise<void> {
    try {
      await ensurePianoSample(noteToMidi(note))
      this.loadError = null
      void ensurePianoOctavesAroundNote(note).catch(() => undefined)
    } catch (err) {
      this.loadError = err instanceof Error ? err.message : String(err)
      throw err
    }
  }

  async start(note: string, detuneCents = 0): Promise<void> {
    await this.noteOn(note, detuneCents)
  }

  /**
   * Cache-hit + running context: no `await` before `src.start()` — same turn as
   * the pointer/key handler (required for “instant” piano feel).
   */
  async noteOn(
    note: string,
    detuneCents = 0,
    mix?: NoteMixOpts,
  ): Promise<void> {
    const ctx = this.ensure()
    this.lastDetuneCents = detuneCents
    const key = mix?.voiceKey ?? note
    const midi = noteToMidi(note)
    const pan = mix?.pan ?? 0
    const targetGain = mix?.gain ?? 1
    const cached = getCachedPianoSample(midi)

    if (cached && ctx.state === 'running') {
      this.keepalive = ensureAudioKeepalive(ctx, this.keepalive)
      this.strike(ctx, key, note, midi, cached.buffer, cached.onsetSec, detuneCents, targetGain, pan)
      return
    }

    if (ctx.state === 'suspended') await ctx.resume()
    this.keepalive = ensureAudioKeepalive(ctx, this.keepalive)

    let sample = cached ?? getCachedPianoSample(midi)
    if (!sample) {
      try {
        sample = await ensurePianoSample(midi, { priority: true })
        this.loadError = null
        // Background only — never steal the decode lock from the next key.
        void ensurePianoOctavesAroundNote(note).catch(() => undefined)
      } catch (err) {
        this.loadError = err instanceof Error ? err.message : String(err)
        throw err
      }
    }
    this.strike(
      ctx,
      key,
      note,
      midi,
      sample.buffer,
      sample.onsetSec,
      detuneCents,
      targetGain,
      pan,
    )
  }

  private strike(
    ctx: AudioContext,
    key: string,
    note: string,
    midi: number,
    buf: AudioBuffer,
    onsetSec: number,
    detuneCents: number,
    targetGain: number,
    pan: number,
  ): void {
    this.noteOff(key, false)
    this.stealIfNeeded()

    const src = ctx.createBufferSource()
    const g = ctx.createGain()
    src.buffer = buf
    src.playbackRate.value = 2 ** (detuneCents / 1200)
    // Samples already include the hammer attack — full gain immediately.
    g.gain.value = targetGain
    src.connect(g)
    let panner: AudioNode | null = null
    if (Math.abs(pan) > 0.001 && typeof ctx.createStereoPanner === 'function') {
      panner = ctx.createStereoPanner()
      ;(panner as StereoPannerNode).pan.value = clampPan(pan)
      g.connect(panner)
      panner.connect(this.master!)
    } else {
      g.connect(this.master!)
    }
    const now = ctx.currentTime
    // Skip file pre-roll (~50ms silence in Leethring samples).
    src.start(now, Math.max(0, onsetSec))
    const voice: SampleVoice = {
      key,
      note,
      baseMidi: midi,
      midi,
      source: src,
      gain: g,
      panner,
      startedAt: now,
    }
    this.voices.set(key, voice)
    src.onended = () => {
      if (this.voices.get(key)?.source === src) this.voices.delete(key)
    }
  }

  glideTo(voiceKey: string, targetNote: string, durationSec: number): void {
    const voice = this.voices.get(voiceKey)
    const ctx = this.ctx
    if (!voice || !ctx || durationSec <= 0) {
      if (voice) {
        voice.note = targetNote
        voice.midi = noteToMidi(targetNote)
      }
      return
    }
    const now = ctx.currentTime
    const toMidi = noteToMidi(targetNote)
    const baseHz = midiToHz(voice.baseMidi)
    const fromHz = midiToHz(voice.midi)
    const toHz = midiToHz(toMidi)
    const dur = Math.max(0.001, durationSec)
    const curve = playbackRateEaseInOutCurve(baseHz, fromHz, toHz, 64)
    try {
      voice.source.playbackRate.cancelScheduledValues(now)
      voice.source.playbackRate.setValueAtTime(curve[0]!, now)
      voice.source.playbackRate.setValueCurveAtTime(curve, now, dur)
    } catch {
      voice.source.playbackRate.setValueAtTime(toHz / baseHz, now + dur)
    }
    voice.note = targetNote
    voice.midi = toMidi
  }

  async restartIfPlaying(): Promise<void> {
    const notes = [...this.voices.values()]
    if (!notes.length) return
    const detune = this.lastDetuneCents
    for (const v of notes) {
      await this.noteOn(v.note, detune, { voiceKey: v.key })
    }
  }

  stop(fade = true): void {
    this.allNotesOff(fade)
  }

  noteOff(noteOrKey: string, fade: boolean | number = true): void {
    const voice = this.voices.get(noteOrKey)
    if (!voice) return
    this.voices.delete(noteOrKey)
    this.releaseVoice(voice, fade)
  }

  allNotesOff(fade: boolean | number = true): void {
    const all = [...this.voices.values()]
    this.voices.clear()
    for (const v of all) this.releaseVoice(v, fade)
  }

  private releaseVoice(voice: SampleVoice, fade: boolean | number): void {
    const ctx = this.ctx
    if (!ctx) return
    const release =
      fade === false
        ? 0
        : typeof fade === 'number'
          ? Math.max(0, fade)
          : this.envelope.decaySec
    try {
      if (fade !== false) {
        const now = ctx.currentTime
        voice.gain.gain.cancelScheduledValues(now)
        voice.gain.gain.setValueAtTime(voice.gain.gain.value, now)
        voice.gain.gain.linearRampToValueAtTime(0, now + release)
        voice.source.stop(now + release + 0.02)
      } else {
        voice.source.stop()
      }
    } catch {
      /* already stopped */
    }
    window.setTimeout(() => {
      try {
        voice.gain.disconnect()
        voice.panner?.disconnect()
      } catch {
        /* ignore */
      }
    }, fade !== false ? Math.round(release * 1000) + 80 : 0)
  }

  private stealIfNeeded(): void {
    if (this.voices.size < VOICE_LIMIT) return
    let oldest: SampleVoice | null = null
    for (const v of this.voices.values()) {
      if (!oldest || v.startedAt < oldest.startedAt) oldest = v
    }
    if (oldest) this.noteOff(oldest.key, true)
  }

  async ensureOctave(oct: number): Promise<void> {
    const { ensurePianoOctave } = await import('./pianoSamples')
    await ensurePianoOctave(oct)
  }

  dispose(): void {
    this.allNotesOff(false)
    stopAudioKeepalive(this.keepalive)
    this.keepalive = null
    const ctx = this.ctx
    this.ctx = null
    this.master = null
    if (ctx) {
      void ctx.close().catch(() => undefined)
    }
  }
}

function clampPan(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.max(-1, Math.min(1, n))
}
