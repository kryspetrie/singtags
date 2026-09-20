import type {
  PitchPipeAHz,
  PitchPipeLayout,
  PitchPipePianoDefaultOctave,
  PitchPipeRange,
} from '../../audio/pitchPlayer'
import type { PitchPipeSoundId } from '../../audio/pitchPipeVoice'
import type { PianoSoundEngineId } from '../../audio/pianoSamples'

export type PartSide = 'left' | 'right'
export type { MixPanSetting } from '../../audio/multiPartMix'

/** Fullscreen multi-page navigation: discrete pages vs continuous scroll stack. */
export type SheetFsPageMode = 'paging' | 'scroll'

/** Pitch-pipe UI prefs (localStorage + offline cache zip). */
export type PitchPipePrefs = {
  range: PitchPipeRange
  layout: PitchPipeLayout
  /** Concert A preset, or null when the detune slider is off-preset ("—"). */
  aHz: PitchPipeAHz | null
  /** Absolute cents vs A440 (drives the slider and playback). */
  detuneCents: number
  /** When true, note labels include octave (E4); default off shows letter only (E). */
  showOctave: boolean
  /** Built-in pitch sound (Mellow default, Bright alternate). */
  sound: PitchPipeSoundId
  /** Grid layout key size (70–250%, step 5). */
  gridScale: number
  /** Piano layout: scrollable 66-key keyboard (C2–F7). */
  showFullKeyboard: boolean
  /** Horizontal piano: which C–C octave to open on (2 = C2–C3 … 6 = C6–C7). */
  pianoDefaultOctave: PitchPipePianoDefaultOctave
  /**
   * Piano layouts + sheet dock: synth (default pitch-pipe voice) or acoustic samples.
   * Grid/list always use synth.
   */
  pianoEngine: PianoSoundEngineId
  /** Horizontal piano / sheet dock: freeze scroll position (no drag-to-pan). */
  pianoLockPosition: boolean
  /**
   * When true, dim keys outside the computer-keyboard (A–' / S–L) window.
   * Default on; turn off on mobile if the highlight is distracting.
   */
  showPcKeyRange: boolean
}
