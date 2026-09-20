/**
 * Unified tone player for pitch pipe / sheet piano.
 * Piano layouts use polyphony ({@link noteOn}/{@link noteOff}); grid/list can stay monophonic via start/stop.
 */
import { PitchPlayer } from './pitchPlayer'
import { getActivePitchPipeVoice, type PitchPipeVoiceConfig } from './pitchPipeVoice'
import type { PianoSoundEngineId } from './pianoSamples'
import { SamplePianoPlayer } from './samplePianoPlayer'
import { PolySynthPlayer } from './polySynthPlayer'
import type { TagRollSoundEnvelope } from '../lib/tagRoll/soundEnvelope'

/** Optional per-voice mix for Tag Studio (same pitch on multiple parts). */
export type PitchNoteMixOpts = {
  /** Map key; defaults to note name. Use note id when parts share pitch. */
  voiceKey?: string
  /** Linear gain (1 = unity). */
  gain?: number
  /** Stereo pan −1…+1. */
  pan?: number
}

export type PitchTonePlayer = {
  /** Start or retrigger a note (polyphonic — does not silence other notes). */
  noteOn(note: string, detuneCents?: number, mix?: PitchNoteMixOpts): Promise<void>
  /** Release one note (pass voiceKey when used at noteOn).
   * `fade`: true → envelope decaySec; false → cut; number → custom release seconds. */
  noteOff(noteOrKey: string, fade?: boolean | number): void
  /** Release every sounding note (`fade` same as noteOff). */
  allNotesOff(fade?: boolean | number): void
  activeNotes(): string[]
  isNoteActive(noteOrKey: string): boolean
  /** Monophonic convenience: allNotesOff then noteOn. */
  start(note: string, detuneCents?: number): Promise<void>
  /** Monophonic convenience: allNotesOff. */
  stop(fade?: boolean | number): void
  setVoice(voice: PitchPipeVoiceConfig): void
  /** Tag Studio project envelope (attack + note-off decay). */
  setEnvelope?(env: TagRollSoundEnvelope): void
  /** Ease-in-out pitch glide without re-attack (synth / samples). */
  glideTo?(voiceKey: string, targetNote: string, durationSec: number): void
  restartIfPlaying(): Promise<void>
  dispose(): void
  preloadForNote?(note: string): Promise<void>
  getLoadError?(): string | null
  ensureOctave?(oct: number): Promise<void>
}

function wrapPolySynth(synth: PolySynthPlayer): PitchTonePlayer {
  return {
    noteOn: (note, detune, mix) => synth.noteOn(note, detune, mix),
    noteOff: (note, fade) => synth.noteOff(note, fade),
    allNotesOff: (fade) => synth.allNotesOff(fade),
    activeNotes: () => synth.activeNotes(),
    isNoteActive: (note) => synth.isNoteActive(note),
    start: async (note, detune) => {
      synth.allNotesOff(false)
      await synth.noteOn(note, detune)
    },
    stop: (fade) => synth.allNotesOff(fade),
    setVoice: (voice) => synth.setVoice(voice),
    setEnvelope: (env) => synth.setEnvelope(env),
    glideTo: (key, note, dur) => synth.glideTo(key, note, dur),
    restartIfPlaying: () => synth.restartIfPlaying(),
    dispose: () => synth.dispose(),
  }
}

function wrapSamples(sample: SamplePianoPlayer): PitchTonePlayer {
  return {
    noteOn: (note, detune, mix) => sample.noteOn(note, detune, mix),
    noteOff: (note, fade) => sample.noteOff(note, fade),
    allNotesOff: (fade) => sample.allNotesOff(fade),
    activeNotes: () => sample.activeNotes(),
    isNoteActive: (note) => sample.isNoteActive(note),
    start: async (note, detune) => {
      sample.allNotesOff(false)
      await sample.noteOn(note, detune)
    },
    stop: (fade) => sample.allNotesOff(fade),
    setVoice: () => undefined,
    setEnvelope: (env) => sample.setEnvelope(env),
    glideTo: (key, note, dur) => sample.glideTo(key, note, dur),
    restartIfPlaying: () => sample.restartIfPlaying(),
    dispose: () => sample.dispose(),
    preloadForNote: (note) => sample.preloadForNote(note),
    getLoadError: () => sample.getLoadError(),
    ensureOctave: (oct) => sample.ensureOctave(oct),
  }
}

/** Wrap monophonic PitchPlayer for grid/list (one note at a time). */
function wrapMono(synth: PitchPlayer): PitchTonePlayer {
  let current: string | null = null
  return {
    noteOn: async (note, detune) => {
      current = note
      await synth.start(note, detune)
    },
    noteOff: (note, fade) => {
      if (current === note) {
        current = null
        synth.stop(fade !== false)
      }
    },
    allNotesOff: (fade) => {
      current = null
      synth.stop(fade !== false)
    },
    activeNotes: () => (current ? [current] : []),
    isNoteActive: (note) => current === note,
    start: async (note, detune) => {
      current = note
      await synth.start(note, detune)
    },
    stop: (fade) => {
      current = null
      synth.stop(fade !== false)
    },
    setVoice: (voice) => synth.setVoice(voice),
    restartIfPlaying: () => synth.restartIfPlaying(),
    dispose: () => synth.dispose(),
  }
}

/**
 * @param engine synth | samples
 * @param opts.polyphony When true (piano layouts), use poly synth/sample engines.
 */
export function createPitchTonePlayer(
  engine: PianoSoundEngineId,
  opts?: { polyphony?: boolean },
): PitchTonePlayer {
  const poly = opts?.polyphony !== false
  if (engine === 'samples') {
    return wrapSamples(new SamplePianoPlayer())
  }
  if (poly) {
    return wrapPolySynth(new PolySynthPlayer(getActivePitchPipeVoice()))
  }
  return wrapMono(new PitchPlayer(getActivePitchPipeVoice()))
}
