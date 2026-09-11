/**
 * Polyphonic partials synth — same voice graph as PitchPlayer, one voice per note.
 */
import { noteToFrequency } from './pitchPlayer'
import {
  clonePitchPipeVoice,
  DEFAULT_PITCH_PIPE_VOICE,
  getActivePitchPipeVoice,
  type PitchPipeVoiceConfig,
} from './pitchPipeVoice'

type SynthVoice = {
  note: string
  oscillators: OscillatorNode[]
  gains: GainNode[]
  startedAt: number
}

const VOICE_LIMIT = 16

export class PolySynthPlayer {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private filter: BiquadFilterNode | null = null
  private voices = new Map<string, SynthVoice>()
  private voice: PitchPipeVoiceConfig = clonePitchPipeVoice(DEFAULT_PITCH_PIPE_VOICE)
  private lastDetuneCents = 0

  constructor(voice?: PitchPipeVoiceConfig) {
    this.voice = clonePitchPipeVoice(voice ?? getActivePitchPipeVoice())
  }

  getVoice(): PitchPipeVoiceConfig {
    return clonePitchPipeVoice(this.voice)
  }

  setVoice(voice: PitchPipeVoiceConfig): void {
    this.voice = clonePitchPipeVoice(voice)
    if (this.master) this.master.gain.value = this.voice.masterGain
  }

  activeNotes(): string[] {
    return [...this.voices.keys()]
  }

  isNoteActive(note: string): boolean {
    return this.voices.has(note)
  }

  private ensure(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext()
      this.master = this.ctx.createGain()
      this.master.gain.value = this.voice.masterGain
      this.master.connect(this.ctx.destination)
    }
    return this.ctx
  }

  private mixBus(ctx: AudioContext): AudioNode {
    const cfg = this.voice.filter
    if (!cfg) {
      if (this.filter) {
        try {
          this.filter.disconnect()
        } catch {
          /* ignore */
        }
        this.filter = null
      }
      return this.master!
    }
    if (!this.filter) {
      this.filter = ctx.createBiquadFilter()
      this.filter.connect(this.master!)
    }
    this.filter.type = cfg.type
    this.filter.frequency.value = cfg.frequencyHz
    this.filter.Q.value = cfg.Q
    return this.filter
  }

  async noteOn(note: string, detuneCents = 0): Promise<void> {
    const ctx = this.ensure()
    if (ctx.state === 'suspended') await ctx.resume()
    this.lastDetuneCents = detuneCents
    this.noteOff(note, false)
    this.stealIfNeeded()
    if (this.master) this.master.gain.value = this.voice.masterGain

    const mixBus = this.mixBus(ctx)
    const base = noteToFrequency(note)
    const freq = base * 2 ** (detuneCents / 1200)
    const now = ctx.currentTime
    const attack = this.voice.attackSec
    const oscs: OscillatorNode[] = []
    const gains: GainNode[] = []
    for (const partial of this.voice.partials) {
      const osc = ctx.createOscillator()
      const g = ctx.createGain()
      osc.type = partial.type
      osc.frequency.value = freq * 2 ** (partial.semitones / 12)
      osc.detune.value = partial.detuneCents
      g.gain.value = 0
      osc.connect(g)
      g.connect(mixBus)
      g.gain.linearRampToValueAtTime(partial.gain, now + attack)
      osc.start()
      oscs.push(osc)
      gains.push(g)
    }
    this.voices.set(note, { note, oscillators: oscs, gains, startedAt: now })
  }

  /** Monophonic-compatible alias used by shared facade helpers. */
  async start(note: string, detuneCents = 0): Promise<void> {
    await this.noteOn(note, detuneCents)
  }

  async restartIfPlaying(): Promise<void> {
    const notes = this.activeNotes()
    if (!notes.length) return
    const detune = this.lastDetuneCents
    for (const n of notes) await this.noteOn(n, detune)
  }

  noteOff(note: string, fade = true): void {
    const voice = this.voices.get(note)
    if (!voice) return
    this.voices.delete(note)
    this.releaseVoice(voice, fade)
  }

  allNotesOff(fade = true): void {
    const all = [...this.voices.values()]
    this.voices.clear()
    for (const v of all) this.releaseVoice(v, fade)
  }

  stop(fade = true): void {
    this.allNotesOff(fade)
  }

  private releaseVoice(voice: SynthVoice, fade: boolean): void {
    const ctx = this.ctx
    if (!ctx) return
    const now = ctx.currentTime
    const { oscillators, gains } = voice
    if (!fade) {
      for (const o of oscillators) {
        try {
          o.stop()
          o.disconnect()
        } catch {
          /* ignore */
        }
      }
      return
    }
    const release = this.voice.releaseSec
    for (const g of gains) {
      g.gain.cancelScheduledValues(now)
      g.gain.setValueAtTime(g.gain.value, now)
      g.gain.linearRampToValueAtTime(0, now + release)
    }
    window.setTimeout(() => {
      for (const o of oscillators) {
        try {
          o.stop()
          o.disconnect()
        } catch {
          /* ignore */
        }
      }
    }, Math.round(release * 1000) + 100)
  }

  private stealIfNeeded(): void {
    if (this.voices.size < VOICE_LIMIT) return
    let oldest: SynthVoice | null = null
    for (const v of this.voices.values()) {
      if (!oldest || v.startedAt < oldest.startedAt) oldest = v
    }
    if (oldest) this.noteOff(oldest.note, true)
  }

  dispose(): void {
    this.allNotesOff(false)
    if (this.filter) {
      try {
        this.filter.disconnect()
      } catch {
        /* ignore */
      }
      this.filter = null
    }
    void this.ctx?.close()
    this.ctx = null
    this.master = null
  }
}
