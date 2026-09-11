/**
 * Unified tone player for pitch pipe / sheet piano.
 * Piano layouts use polyphony ({@link noteOn}/{@link noteOff}); grid/list can stay monophonic via start/stop.
 */
import { PitchPlayer } from './pitchPlayer'
import { getActivePitchPipeVoice, type PitchPipeVoiceConfig } from './pitchPipeVoice'
import type { PianoSoundEngineId } from './pianoSamples'
import { SamplePianoPlayer } from './samplePianoPlayer'
import { PolySynthPlayer } from './polySynthPlayer'

export type PitchTonePlayer = {
  /** Start or retrigger a note (polyphonic — does not silence other notes). */
  noteOn(note: string, detuneCents?: number): Promise<void>
  /** Release one note. */
  noteOff(note: string, fade?: boolean): void
  /** Release every sounding note. */
  allNotesOff(fade?: boolean): void
  activeNotes(): string[]
  isNoteActive(note: string): boolean
  /** Monophonic convenience: allNotesOff then noteOn. */
  start(note: string, detuneCents?: number): Promise<void>
  /** Monophonic convenience: allNotesOff. */
  stop(fade?: boolean): void
  setVoice(voice: PitchPipeVoiceConfig): void
  restartIfPlaying(): Promise<void>
  dispose(): void
  preloadForNote?(note: string): Promise<void>
  getLoadError?(): string | null
  ensureOctave?(oct: number): Promise<void>
}

function wrapPolySynth(synth: PolySynthPlayer): PitchTonePlayer {
  return {
    noteOn: (note, detune) => synth.noteOn(note, detune),
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
    restartIfPlaying: () => synth.restartIfPlaying(),
    dispose: () => synth.dispose(),
  }
}

function wrapSamples(sample: SamplePianoPlayer): PitchTonePlayer {
  return {
    noteOn: (note, detune) => sample.noteOn(note, detune),
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
        synth.stop(fade)
      }
    },
    allNotesOff: (fade) => {
      current = null
      synth.stop(fade)
    },
    activeNotes: () => (current ? [current] : []),
    isNoteActive: (note) => current === note,
    start: async (note, detune) => {
      current = note
      await synth.start(note, detune)
    },
    stop: (fade) => {
      current = null
      synth.stop(fade)
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
