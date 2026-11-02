/**
 * Polyphonic SF2 piano via SpessaSynth AudioWorklet.
 * One MIDI channel per voiceKey so Tag Studio part pan/gain still apply.
 *
 * Loading: AudioContext unlocks on warmUp (user gesture). The SF2 bank + worklet
 * load in the background — playhead must not wait on the multi‑MB download.
 */
import { WorkletSynthesizer } from 'spessasynth_lib'
import { MIDIControllers } from 'spessasynth_core'
import { noteToMidi } from './pianoSamples'
import {
  createInteractiveAudioContext,
  ensureAudioKeepalive,
  stopAudioKeepalive,
  type AudioKeepalive,
} from './interactiveAudioContext'
import {
  ensureSpessasynthWorklet,
  loadSoundfontBuffer,
  soundfontIsMultiInstrument,
  TAG_ROLL_DEFAULT_SOUNDFONT_ID,
  type TagRollSoundfontId,
} from './soundfonts'
import {
  patchesEqual,
  TAG_ROLL_DEFAULT_SOUNDFONT_PATCH,
  type TagRollSoundfontPatch,
} from './soundfontPresets'
import type { TagRollSoundEnvelope } from '../lib/tagRoll/soundEnvelope'

type NoteMixOpts = {
  voiceKey?: string
  gain?: number
  pan?: number
}

type ActiveVoice = {
  key: string
  note: string
  midi: number
  channel: number
}

const CHANNEL_COUNT = 16
/** MIDI channel 10 (0-based) — GM/GS/XG drum channel; melodic notes map to kit pieces. */
const GM_DRUM_CHANNEL = 9
const DEFAULT_VELOCITY = 100
/** XG drum kits use bank MSB 127 (see yamaha-xg catalog). */
function isXgDrumPatch(patch: TagRollSoundfontPatch): boolean {
  return (patch.bankMSB & 127) === 127
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n))
}

function panToCc(pan: number): number {
  return Math.round(clamp01((pan + 1) / 2) * 127)
}

function gainToCc(gain: number): number {
  return Math.round(clamp01(gain) * 127)
}

export class SoundFontPianoPlayer {
  private ctx: AudioContext | null = null
  private synth: WorkletSynthesizer | null = null
  private ready: Promise<void> | null = null
  private loadError: string | null = null
  private keepalive: AudioKeepalive | null = null
  private soundfontId: TagRollSoundfontId
  private patch: TagRollSoundfontPatch
  private voices = new Map<string, ActiveVoice>()
  private channelByKey = new Map<string, number>()
  private freeChannels: number[] = []
  private lastDetuneCents = 0
  private disposed = false
  private bootGen = 0

  constructor(
    soundfontId: TagRollSoundfontId = TAG_ROLL_DEFAULT_SOUNDFONT_ID,
    patch: TagRollSoundfontPatch = TAG_ROLL_DEFAULT_SOUNDFONT_PATCH,
  ) {
    this.soundfontId = soundfontId
    this.patch = { ...patch }
    this.resetChannels()
  }

  private resetChannels(): void {
    this.channelByKey.clear()
    const all = Array.from({ length: CHANNEL_COUNT }, (_, i) => i)
    if (isXgDrumPatch(this.patch)) {
      // Prefer the dedicated drum channel, then other channels with the drum bank.
      this.freeChannels = [
        GM_DRUM_CHANNEL,
        ...all.filter((ch) => ch !== GM_DRUM_CHANNEL),
      ]
    } else {
      // Skip ch.10 for melodic patches — otherwise pitches trigger kit samples.
      this.freeChannels = all.filter((ch) => ch !== GM_DRUM_CHANNEL)
    }
  }

  getLoadError(): string | null {
    return this.loadError
  }

  setEnvelope(_env: TagRollSoundEnvelope): void {
    // SF2 banks carry their own amp envelopes.
  }

  setSoundfontId(id: TagRollSoundfontId): void {
    if (id === this.soundfontId) return
    this.soundfontId = id
    void this.reloadBank()
  }

  setSoundfontPatch(patch: TagRollSoundfontPatch): void {
    const next = { ...patch }
    if (patchesEqual(this.patch, next)) return
    const wasDrum = isXgDrumPatch(this.patch)
    this.patch = next
    if (wasDrum !== isXgDrumPatch(this.patch)) {
      this.allNotesOff(false)
      this.resetChannels()
    }
    if (this.synth) this.applyPatchToAllChannels(this.synth)
  }

  activeNotes(): string[] {
    return [...this.voices.keys()]
  }

  isNoteActive(noteOrKey: string): boolean {
    return this.voices.has(noteOrKey)
  }

  private ensureContext(): AudioContext {
    if (!this.ctx || this.ctx.state === 'closed') {
      this.ctx = createInteractiveAudioContext()
    }
    return this.ctx
  }

  /** Kick off worklet + SF2 load; reusable across warmUp / noteOn. */
  private ensureSynth(): Promise<WorkletSynthesizer> {
    if (this.synth) return Promise.resolve(this.synth)
    if (!this.ready) this.ready = this.boot()
    return this.ready.then(() => {
      if (!this.synth) throw new Error(this.loadError || 'SoundFont synth failed to start')
      return this.synth
    })
  }

  private async boot(): Promise<void> {
    const gen = ++this.bootGen
    try {
      const ctx = this.ensureContext()
      if (ctx.state === 'suspended') {
        try {
          await ctx.resume()
        } catch {
          /* gesture may already have resumed */
        }
      }
      await ensureSpessasynthWorklet(ctx)
      if (this.disposed || gen !== this.bootGen) return

      const synth = new WorkletSynthesizer(ctx)
      synth.connect(ctx.destination)

      // Handshake with the worklet before pushing a large bank.
      await synth.isReady
      if (this.disposed || gen !== this.bootGen) {
        try {
          synth.destroy()
        } catch {
          /* ignore */
        }
        return
      }

      const bank = await loadSoundfontBuffer(this.soundfontId)
      if (this.disposed || gen !== this.bootGen) {
        try {
          synth.destroy()
        } catch {
          /* ignore */
        }
        return
      }

      await synth.soundBankManager.addSoundBank(bank, this.soundfontId)
      // Yamaha XG bank select (MSB variations / drum kits) needs XG system mode.
      if (soundfontIsMultiInstrument(this.soundfontId)) {
        try {
          // XG System ON
          synth.systemExclusive([0x43, 0x10, 0x4c, 0x00, 0x00, 0x7e, 0x00, 0xf7])
        } catch {
          /* older builds may ignore */
        }
      }
      for (let ch = 0; ch < CHANNEL_COUNT; ch++) {
        this.applyPatch(synth, ch)
        synth.controllerChange(ch, MIDIControllers.mainVolume, 100)
        synth.controllerChange(ch, MIDIControllers.pan, 64)
        synth.controllerChange(ch, MIDIControllers.expression, 127)
      }
      if (this.disposed || gen !== this.bootGen) {
        try {
          synth.destroy()
        } catch {
          /* ignore */
        }
        return
      }
      this.synth = synth
      this.loadError = null
    } catch (err) {
      this.loadError = err instanceof Error ? err.message : String(err)
      this.synth = null
      this.ready = null
      console.error('[SoundFontPianoPlayer]', this.loadError)
      throw err
    }
  }

  private async reloadBank(): Promise<void> {
    this.allNotesOff(false)
    this.bootGen++
    if (this.synth) {
      try {
        this.synth.destroy()
      } catch {
        /* ignore */
      }
      this.synth = null
    }
    this.ready = null
    this.resetChannels()
    try {
      await this.ensureSynth()
    } catch {
      /* loadError set */
    }
  }

  /**
   * Unlock AudioContext on the user gesture and start loading the bank in the
   * background. Does **not** wait for the SF2 download — transport can start.
   */
  async warmUp(): Promise<void> {
    const ctx = this.ensureContext()
    if (ctx.state === 'suspended') await ctx.resume()
    this.keepalive = ensureAudioKeepalive(ctx, this.keepalive)
    void this.ensureSynth().catch(() => undefined)
  }

  /** Await full synth readiness (optional; used after prefetch on select). */
  async whenReady(): Promise<void> {
    await this.ensureSynth()
  }

  async preloadForNote(_note: string): Promise<void> {
    await this.warmUp()
    await this.ensureSynth().catch(() => undefined)
  }

  async ensureOctave(_oct: number): Promise<void> {
    await this.warmUp()
  }

  private applyPatch(synth: WorkletSynthesizer, channel: number): void {
    const { bankMSB, bankLSB, program } = this.patch
    try {
      synth.controllerChange(channel, MIDIControllers.bankSelect, bankMSB & 127)
      synth.controllerChange(channel, MIDIControllers.bankSelectLSB, bankLSB & 127)
      synth.programChange(channel, program & 127)
    } catch {
      /* ignore */
    }
  }

  private applyPatchToAllChannels(synth: WorkletSynthesizer): void {
    for (let ch = 0; ch < CHANNEL_COUNT; ch++) this.applyPatch(synth, ch)
  }

  private allocChannel(key: string): number {
    const existing = this.channelByKey.get(key)
    if (existing != null) return existing
    if (!this.freeChannels.length) {
      const oldest = this.voices.values().next().value
      if (oldest) {
        this.noteOff(oldest.key, false)
        return this.allocChannel(key)
      }
      return 0
    }
    const ch = this.freeChannels.shift()!
    this.channelByKey.set(key, ch)
    return ch
  }

  private releaseChannel(key: string): void {
    const ch = this.channelByKey.get(key)
    if (ch == null) return
    this.channelByKey.delete(key)
    if (!this.freeChannels.includes(ch)) this.freeChannels.push(ch)
  }

  async noteOn(note: string, detuneCents = 0, mix?: NoteMixOpts): Promise<void> {
    let synth: WorkletSynthesizer
    try {
      synth = await this.ensureSynth()
    } catch {
      return
    }
    const ctx = this.ctx
    if (!ctx) return
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume()
      } catch {
        return
      }
    }
    this.keepalive = ensureAudioKeepalive(ctx, this.keepalive)
    this.lastDetuneCents = detuneCents

    const key = mix?.voiceKey ?? note
    const midi = Math.max(0, Math.min(127, noteToMidi(note)))
    const channel = this.allocChannel(key)
    const gain = mix?.gain ?? 1
    const pan = mix?.pan ?? 0

    const prev = this.voices.get(key)
    if (prev) {
      try {
        synth.noteOff(prev.channel, prev.midi)
      } catch {
        /* ignore */
      }
      this.voices.delete(key)
    }

    try {
      this.applyPatch(synth, channel)
      synth.controllerChange(channel, MIDIControllers.mainVolume, gainToCc(gain))
      synth.controllerChange(channel, MIDIControllers.pan, panToCc(pan))
      if (detuneCents) {
        const bend = Math.round(8192 + (detuneCents / 200) * 8192)
        synth.pitchWheel(channel, Math.max(0, Math.min(16383, bend)))
      } else {
        synth.pitchWheel(channel, 8192)
      }
      synth.noteOn(channel, midi, DEFAULT_VELOCITY)
      this.voices.set(key, { key, note, midi, channel })
    } catch (err) {
      console.error('[SoundFontPianoPlayer] noteOn', err)
    }
  }

  noteOff(noteOrKey: string, _fade?: boolean | number): void {
    const voice = this.voices.get(noteOrKey)
    const synth = this.synth
    if (!voice || !synth) return
    try {
      synth.noteOff(voice.channel, voice.midi)
    } catch {
      /* ignore */
    }
    this.voices.delete(noteOrKey)
    this.releaseChannel(noteOrKey)
  }

  allNotesOff(_fade?: boolean | number): void {
    const synth = this.synth
    if (synth) {
      try {
        synth.stopAll(true)
      } catch {
        for (const v of this.voices.values()) {
          try {
            synth.noteOff(v.channel, v.midi)
          } catch {
            /* ignore */
          }
        }
      }
    }
    this.voices.clear()
    this.resetChannels()
  }

  glideTo(voiceKey: string, targetNote: string, _durationSec: number): void {
    const voice = this.voices.get(voiceKey)
    if (!voice || !this.synth) return
    try {
      this.synth.noteOff(voice.channel, voice.midi)
    } catch {
      /* ignore */
    }
    const midi = Math.max(0, Math.min(127, noteToMidi(targetNote)))
    try {
      this.synth.noteOn(voice.channel, midi, DEFAULT_VELOCITY)
      voice.note = targetNote
      voice.midi = midi
    } catch {
      /* ignore */
    }
  }

  async restartIfPlaying(): Promise<void> {
    const snap = [...this.voices.values()]
    if (!snap.length) return
    const detune = this.lastDetuneCents
    this.allNotesOff(false)
    for (const v of snap) {
      await this.noteOn(v.note, detune, { voiceKey: v.key })
    }
  }

  dispose(): void {
    this.disposed = true
    this.bootGen++
    this.allNotesOff(false)
    stopAudioKeepalive(this.keepalive)
    this.keepalive = null
    if (this.synth) {
      try {
        this.synth.destroy()
      } catch {
        /* ignore */
      }
      this.synth = null
    }
    if (this.ctx && this.ctx.state !== 'closed') {
      void this.ctx.close().catch(() => undefined)
    }
    this.ctx = null
    this.ready = null
  }
}
