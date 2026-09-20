/**
 * Polyphonic sample piano: one AudioBufferSourceNode voice per sounding note.
 */
import {
  ensurePianoOctavesAroundNote,
  getCachedPianoSample,
  noteToMidi,
} from './pianoSamples'
import { midiToHz, playbackRateEaseInOutCurve } from '../lib/tagRoll/portamento'
import type { TagRollSoundEnvelope } from '../lib/tagRoll/soundEnvelope'
import { TAG_ROLL_DEFAULT_SOUND_ENVELOPE } from '../lib/tagRoll/soundEnvelope'

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
  panner: AudioNode
  startedAt: number
}

const VOICE_LIMIT = 16

export class SamplePianoPlayer {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private voices = new Map<string, SampleVoice>()
  private lastDetuneCents = 0
  private masterGain = 0.85
  private envelope: TagRollSoundEnvelope = { ...TAG_ROLL_DEFAULT_SOUND_ENVELOPE }
  private loadError: string | null = null

  getLoadError(): string | null {
    return this.loadError
  }

  setEnvelope(env: TagRollSoundEnvelope): void {
    this.envelope = { ...env }
  }

  activeNotes(): string[] {
    return [...this.voices.keys()]
  }

  isNoteActive(noteOrKey: string): boolean {
    return this.voices.has(noteOrKey)
  }

  private ensure(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext()
      this.master = this.ctx.createGain()
      this.master.gain.value = this.masterGain
      this.master.connect(this.ctx.destination)
    }
    return this.ctx
  }

  async preloadForNote(note: string): Promise<void> {
    try {
      await ensurePianoOctavesAroundNote(note)
      this.loadError = null
    } catch (err) {
      this.loadError = err instanceof Error ? err.message : String(err)
      throw err
    }
  }

  async start(note: string, detuneCents = 0): Promise<void> {
    await this.noteOn(note, detuneCents)
  }

  async noteOn(
    note: string,
    detuneCents = 0,
    mix?: NoteMixOpts,
  ): Promise<void> {
    const ctx = this.ensure()
    if (ctx.state === 'suspended') await ctx.resume()
    this.lastDetuneCents = detuneCents
    const key = mix?.voiceKey ?? note

    try {
      await ensurePianoOctavesAroundNote(note)
      this.loadError = null
    } catch (err) {
      this.loadError = err instanceof Error ? err.message : String(err)
      throw err
    }

    const midi = noteToMidi(note)
    const buf = getCachedPianoSample(midi)
    if (!buf) {
      this.loadError = `No sample for ${note}`
      throw new Error(this.loadError)
    }

    this.noteOff(key, false)
    this.stealIfNeeded()

    const src = ctx.createBufferSource()
    const g = ctx.createGain()
    const panner = createPanner(ctx, mix?.pan ?? 0)
    src.buffer = buf
    const detuneRate = 2 ** (detuneCents / 1200)
    src.playbackRate.value = detuneRate
    const targetGain = mix?.gain ?? 1
    const now = ctx.currentTime
    const attack = this.envelope.attackSec
    g.gain.value = 0
    g.gain.linearRampToValueAtTime(targetGain, now + attack)
    src.connect(g)
    g.connect(panner.node)
    panner.node.connect(this.master!)
    src.start()
    const voice: SampleVoice = {
      key,
      note,
      baseMidi: midi,
      midi,
      source: src,
      gain: g,
      panner: panner.node,
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
        voice.panner.disconnect()
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

function createPanner(ctx: AudioContext, pan: number): { node: AudioNode } {
  if (typeof ctx.createStereoPanner === 'function') {
    const panner = ctx.createStereoPanner()
    panner.pan.value = clampPan(pan)
    return { node: panner }
  }
  const g = ctx.createGain()
  g.gain.value = 1
  return { node: g }
}
