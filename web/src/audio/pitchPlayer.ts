/** Web Audio pitch pipe / pay-the-key (configurable voice; default 40% saw + 60% sine). */

import {
  clonePitchPipeVoice,
  DEFAULT_PITCH_PIPE_VOICE,
  getActivePitchPipeVoice,
  PITCH_PIPE_ATTACK_START_GAIN,
  type PitchPipeVoiceConfig,
} from './pitchPipeVoice'
import {
  createInteractiveAudioContext,
  ensureAudioKeepalive,
  stopAudioKeepalive,
  type AudioKeepalive,
} from './interactiveAudioContext'
import { noteToFrequency } from './pitchUiLabels'

export * from './pitchUiLabels'

export class PitchPlayer {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private filter: BiquadFilterNode | null = null
  private keepalive: AudioKeepalive | null = null
  private oscillators: OscillatorNode[] = []
  private gains: GainNode[] = []
  private playing = false
  private voice: PitchPipeVoiceConfig = clonePitchPipeVoice(DEFAULT_PITCH_PIPE_VOICE)
  /** Last note started (for live voice restarts in the lab). */
  private lastNote: string | null = null
  private lastDetuneCents = 0

  constructor(voice?: PitchPipeVoiceConfig) {
    this.voice = clonePitchPipeVoice(voice ?? getActivePitchPipeVoice())
  }

  /** Current voice config (clone). */
  getVoice(): PitchPipeVoiceConfig {
    return clonePitchPipeVoice(this.voice)
  }

  /** Replace the voice. Does not restart playback by itself. */
  setVoice(voice: PitchPipeVoiceConfig): void {
    this.voice = clonePitchPipeVoice(voice)
    if (this.master) this.master.gain.value = this.voice.masterGain
  }

  private ensure(): AudioContext {
    if (!this.ctx || this.ctx.state === 'closed') {
      this.ctx = createInteractiveAudioContext()
      this.master = this.ctx.createGain()
      this.master.gain.value = this.voice.masterGain
      this.master.connect(this.ctx.destination)
      this.filter = null
    }
    return this.ctx
  }

  /** Create/resume context on a user gesture (Tag Studio Play before blow-pitch await). */
  async warmUp(): Promise<void> {
    const ctx = this.ensure()
    if (ctx.state === 'suspended') await ctx.resume()
    this.keepalive = ensureAudioKeepalive(ctx, this.keepalive)
  }

  private syncFilter(ctx: AudioContext): AudioNode {
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

  async start(note: string, detuneCents = 0): Promise<void> {
    const ctx = this.ensure()
    if (ctx.state === 'suspended') await ctx.resume()
    this.keepalive = ensureAudioKeepalive(ctx, this.keepalive)
    this.stop(false)
    this.lastNote = note
    this.lastDetuneCents = detuneCents
    if (this.master) this.master.gain.value = this.voice.masterGain
    const mixBus = this.syncFilter(ctx)
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
      // Soft attack: start at 25% then fade in; 0 = instant full level.
      if (attack > 0.002) {
        g.gain.setValueAtTime(partial.gain * PITCH_PIPE_ATTACK_START_GAIN, now)
        g.gain.linearRampToValueAtTime(partial.gain, now + attack)
      } else {
        g.gain.value = partial.gain
      }
      osc.connect(g)
      g.connect(mixBus)
      osc.start(now)
      oscs.push(osc)
      gains.push(g)
    }
    this.oscillators = oscs
    this.gains = gains
    this.playing = true
  }

  /** Restart the current note with the latest voice (lab live-tweak). */
  async restartIfPlaying(): Promise<void> {
    if (!this.playing || !this.lastNote) return
    await this.start(this.lastNote, this.lastDetuneCents)
  }

  stop(fade = true): void {
    if (!this.ctx || !this.playing) {
      this.cleanupOsc()
      return
    }
    const ctx = this.ctx
    const now = ctx.currentTime
    const osc = [...this.oscillators]
    const gains = [...this.gains]
    this.oscillators = []
    this.gains = []
    this.playing = false
    if (!fade) {
      for (const o of osc) {
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
      for (const o of osc) {
        try {
          o.stop()
          o.disconnect()
        } catch {
          /* ignore */
        }
      }
    }, Math.round(release * 1000) + 100)
  }

  private cleanupOsc(): void {
    for (const o of this.oscillators) {
      try {
        o.stop()
        o.disconnect()
      } catch {
        /* ignore */
      }
    }
    this.oscillators = []
    this.gains = []
    this.playing = false
  }

  dispose(): void {
    this.stop(false)
    stopAudioKeepalive(this.keepalive)
    this.keepalive = null
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
