/**
 * Polyphonic partials synth — same voice graph as PitchPlayer, one voice per note.
 */
import { noteToFrequency } from './pitchPlayer'
import { noteToMidi } from './pianoSamples'
import {
  clonePitchPipeVoice,
  DEFAULT_PITCH_PIPE_VOICE,
  getActivePitchPipeVoice,
  type PitchPipeVoiceConfig,
} from './pitchPipeVoice'
import { frequencyEaseInOutCurve, midiToHz } from '../lib/tagRoll/portamento'
import type { TagRollSoundEnvelope } from '../lib/tagRoll/soundEnvelope'
import { TAG_ROLL_DEFAULT_SOUND_ENVELOPE } from '../lib/tagRoll/soundEnvelope'

type NoteMixOpts = {
  voiceKey?: string
  gain?: number
  pan?: number
}

type SynthVoice = {
  key: string
  note: string
  midi: number
  oscillators: OscillatorNode[]
  gains: GainNode[]
  partialSemitones: number[]
  voiceGain: GainNode
  panner: AudioNode
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
  private envelope: TagRollSoundEnvelope = { ...TAG_ROLL_DEFAULT_SOUND_ENVELOPE }
  private envelopeOverride = false

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

  /** Project-level attack / note-off decay (overrides pitch-pipe voice AR while set). */
  setEnvelope(env: TagRollSoundEnvelope): void {
    this.envelope = { ...env }
    this.envelopeOverride = true
  }

  private attackSec(): number {
    return this.envelopeOverride ? this.envelope.attackSec : this.voice.attackSec
  }

  private releaseSec(): number {
    return this.envelopeOverride ? this.envelope.decaySec : this.voice.releaseSec
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

  async noteOn(
    note: string,
    detuneCents = 0,
    mix?: NoteMixOpts,
  ): Promise<void> {
    const ctx = this.ensure()
    if (ctx.state === 'suspended') await ctx.resume()
    this.lastDetuneCents = detuneCents
    const key = mix?.voiceKey ?? note
    this.noteOff(key, false)
    this.stealIfNeeded()
    if (this.master) this.master.gain.value = this.voice.masterGain

    const mixBus = this.mixBus(ctx)
    const voiceGain = ctx.createGain()
    voiceGain.gain.value = mix?.gain ?? 1
    const panner = createPanner(ctx, mix?.pan ?? 0)
    voiceGain.connect(panner.node)
    panner.node.connect(mixBus)

    const base = noteToFrequency(note)
    const freq = base * 2 ** (detuneCents / 1200)
    const now = ctx.currentTime
    const attack = this.attackSec()
    const oscs: OscillatorNode[] = []
    const gains: GainNode[] = []
    const partialSemitones: number[] = []
    for (const partial of this.voice.partials) {
      const osc = ctx.createOscillator()
      const g = ctx.createGain()
      osc.type = partial.type
      osc.frequency.value = freq * 2 ** (partial.semitones / 12)
      osc.detune.value = partial.detuneCents
      g.gain.value = 0
      osc.connect(g)
      g.connect(voiceGain)
      g.gain.linearRampToValueAtTime(partial.gain, now + attack)
      osc.start()
      oscs.push(osc)
      gains.push(g)
      partialSemitones.push(partial.semitones)
    }
    this.voices.set(key, {
      key,
      note,
      midi: noteToMidi(note),
      oscillators: oscs,
      gains,
      partialSemitones,
      voiceGain,
      panner: panner.node,
      startedAt: now,
    })
  }

  /** Ease-in-out portamento to `targetNote` over `durationSec` without re-attacking. */
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
    const fromMidi = voice.midi
    const toMidi = noteToMidi(targetNote)
    const fromHz = midiToHz(fromMidi)
    const toHz = midiToHz(toMidi)
    const dur = Math.max(0.001, durationSec)
    for (let i = 0; i < voice.oscillators.length; i++) {
      const osc = voice.oscillators[i]!
      const sem = voice.partialSemitones[i] ?? 0
      const mul = 2 ** (sem / 12)
      const curve = frequencyEaseInOutCurve(fromHz * mul, toHz * mul, 64)
      try {
        osc.frequency.cancelScheduledValues(now)
        osc.frequency.setValueAtTime(curve[0]!, now)
        osc.frequency.setValueCurveAtTime(curve, now, dur)
      } catch {
        osc.frequency.setValueAtTime(toHz * mul, now + dur)
      }
    }
    voice.note = targetNote
    voice.midi = toMidi
  }

  async start(note: string, detuneCents = 0): Promise<void> {
    await this.noteOn(note, detuneCents)
  }

  async restartIfPlaying(): Promise<void> {
    const notes = [...this.voices.values()]
    if (!notes.length) return
    const detune = this.lastDetuneCents
    for (const v of notes) await this.noteOn(v.note, detune, { voiceKey: v.key })
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

  stop(fade: boolean | number = true): void {
    this.allNotesOff(fade)
  }

  private releaseVoice(voice: SynthVoice, fade: boolean | number): void {
    const ctx = this.ctx
    if (!ctx) return
    const now = ctx.currentTime
    const { oscillators, gains, voiceGain, panner } = voice
    const teardown = () => {
      for (const o of oscillators) {
        try {
          o.stop()
          o.disconnect()
        } catch {
          /* ignore */
        }
      }
      try {
        voiceGain.disconnect()
        panner.disconnect()
      } catch {
        /* ignore */
      }
    }
    if (fade === false) {
      teardown()
      return
    }
    const release = typeof fade === 'number' ? Math.max(0, fade) : this.releaseSec()
    for (const g of gains) {
      g.gain.cancelScheduledValues(now)
      g.gain.setValueAtTime(g.gain.value, now)
      g.gain.linearRampToValueAtTime(0, now + release)
    }
    window.setTimeout(teardown, Math.round(release * 1000) + 100)
  }

  private stealIfNeeded(): void {
    if (this.voices.size < VOICE_LIMIT) return
    let oldest: SynthVoice | null = null
    for (const v of this.voices.values()) {
      if (!oldest || v.startedAt < oldest.startedAt) oldest = v
    }
    if (oldest) this.noteOff(oldest.key, true)
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
