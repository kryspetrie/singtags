/**
 * Tag Roll project schema — beat-based piano-roll compositions.
 * @see docs/plans/tag-roll.md
 */

import type { PianoSoundEngineId } from '../../audio/pianoSamples'
import type { TagRollSoundEnvelope } from './soundEnvelope'
import { TAG_ROLL_DEFAULT_SOUND_ENVELOPE } from './soundEnvelope'

export const TAG_ROLL_SCHEMA = 'singtags.tagRoll.project.v1' as const

/** Pulses per quarter note. */
export const TAG_ROLL_PPQ = 480

/** Default snap = sixteenth note. */
export const TAG_ROLL_DEFAULT_SNAP_TICKS = TAG_ROLL_PPQ / 4

/** Default project length = 8 measures of 4/4. */
export const TAG_ROLL_DEFAULT_LENGTH_TICKS = TAG_ROLL_PPQ * 4 * 8

/** Default starting tempo. */
export const TAG_ROLL_DEFAULT_BPM = 104

/** Pitch range for the tote / grid (C2–B5). */
export const TAG_ROLL_MIDI_MIN = 36
export const TAG_ROLL_MIDI_MAX = 83

export type TagRollMidiGroup = 'upper' | 'lower' | 'solo'

/**
 * Barbershop clef family for sheet view:
 * - ttbb (men’s): treble-8va-bassa upper, normal bass lower
 * - ssaa (women’s): normal treble upper, bass-8va-alta lower
 */
export type TagRollClefFamily = 'ttbb' | 'ssaa'

export type TagRollPart = {
  id: string
  name: string
  color: string
  midiGroup: TagRollMidiGroup
  /** Single-letter hotkey to select this part (a–z). */
  hotkey?: string
}

export type TagRollNote = {
  id: string
  partId: string
  midi: number
  startTick: number
  durationTicks: number
  lyric?: string
}

/** Compose combines note add + edit; selection decides which. */
export type TagRollEditorMode = 'view' | 'compose' | 'lyrics'

/** View-mode surface: piano roll (default) or engraved sheet. */
export type TagRollScoreSurface = 'roll' | 'sheet'

/** Compose/Lyrics pointer: edit notes vs pan the grid (hand tool). */
export type TagRollPointerTool = 'edit' | 'pan'

export type TagRollTimeSignature = {
  /** Beats per measure (e.g. 3 or 4). */
  numerator: number
  /** Beat unit denominator (4 = quarter note). */
  denominator: number
}

export type TagRollTempoMarker = {
  id: string
  tick: number
  bpm: number
}

export type TagRollFermata = {
  id: string
  kind: 'fermata'
  tick: number
  /** How long to hold at this point (musical ticks). */
  holdTicks: number
  /** Silence after the hold before playback continues (musical ticks). */
  gapTicks: number
}

export type TagRollTempoRamp = {
  id: string
  kind: 'rit' | 'accel'
  startTick: number
  endTick: number
  startBpm: number
  endBpm: number
}

export type TagRollExpression = TagRollFermata | TagRollTempoRamp

export type TagRollExpressionTool = 'tempo' | 'fermata' | 'rit' | 'accel' | null

export type TagRollPartMix = {
  partId: string
  /** Linear gain 0…1.5 (1 = unity). */
  volume: number
  /** Stereo pan −1…+1. */
  pan: number
  mute: boolean
  solo: boolean
}

export type TagRollViewPrefs = {
  cellW: number
  cellH: number
  scrollX: number
  scrollY: number
  lockPiano: boolean
  mode: TagRollEditorMode
  activePartId: string | null
  /** Part the harmonizer treats as the melody / chord-tone anchor (default Lead). */
  melodyPartId: string | null
  /** Playhead position in ticks. */
  playheadTick: number
  /** When true, only the active part is editable; others are faded but still play. */
  focusActivePart: boolean
  /** Shade out-of-scale pitch rows from project tonality (major). */
  scaleHighlight: boolean
  /** View mode: piano roll (default) or sheet music. */
  scoreSurface: TagRollScoreSurface
  /** Sheet surface: pixels per beat (independent of piano-roll cellW). */
  sheetZoom: number
  /** Sheet surface: show stacked lyrics under each staff. */
  sheetShowLyrics: boolean
  /** Sheet surface pan (independent of piano-roll scrollX/Y). */
  sheetScrollX: number
  sheetScrollY: number
}

export type TagRollProject = {
  schema: typeof TAG_ROLL_SCHEMA
  id: string
  title: string
  /** Starting / legacy BPM; kept in sync with the tempo marker at tick 0. */
  bpm: number
  ppq: typeof TAG_ROLL_PPQ
  snapTicks: number
  lengthTicks: number
  timeSignature: TagRollTimeSignature
  tempoMarkers: TagRollTempoMarker[]
  expressions: TagRollExpression[]
  soundEngine: PianoSoundEngineId
  /**
   * Pitch-pipe synth voice: built-in `mellow` / `bright`, or a Sound Lab library id.
   * Also used for the blow-pitch intro (even when `soundEngine` is `samples`).
   */
  pitchPipeSoundId: string
  /**
   * When true, play/export a one-measure centered pitch-pipe tonic immediately
   * before the first measure that contains notes. Decay finishes before notes.
   */
  blowPitchEnabled: boolean
  /** Click the arrangement meter during live playback (downbeat vs other beats). */
  metronomeEnabled: boolean
  /** Attack / note-off decay for built-in synth & samples. */
  soundEnvelope: TagRollSoundEnvelope
  /** Pitch-class root (0=C … 11=B) — scale highlight + blow-pitch tonic. */
  tonality: number
  preferFlats: boolean
  /** Men’s (ttbb) or women’s (ssaa) barbershop clefs for sheet view. Default ttbb. */
  clefFamily: TagRollClefFamily
  parts: TagRollPart[]
  /** Per-part mute/solo/pan/volume. */
  mix: TagRollPartMix[]
  notes: TagRollNote[]
  localEntryId: string | null
  view: TagRollViewPrefs
  createdAt: number
  updatedAt: number
}

export { TAG_ROLL_DEFAULT_SOUND_ENVELOPE }
export type { TagRollSoundEnvelope }

/** Default TTBB palette (not shared with learning-track UI today). */
export const TAG_ROLL_DEFAULT_PARTS: readonly Omit<TagRollPart, 'id'>[] = [
  { name: 'Tenor', color: '#c45c26', midiGroup: 'upper', hotkey: 't' },
  { name: 'Lead', color: '#1d6a9f', midiGroup: 'upper', hotkey: 'l' },
  { name: 'Bari', color: '#2f7d4a', midiGroup: 'lower', hotkey: 'r' },
  { name: 'Bass', color: '#5b3d8f', midiGroup: 'lower', hotkey: 'b' },
]

export const TAG_ROLL_DEFAULT_TIME_SIGNATURE: TagRollTimeSignature = {
  numerator: 4,
  denominator: 4,
}

export const TAG_ROLL_DEFAULT_CLEF_FAMILY: TagRollClefFamily = 'ttbb'

export const TAG_ROLL_DEFAULT_VIEW: TagRollViewPrefs = {
  cellW: 28,
  cellH: 14,
  scrollX: 0,
  scrollY: 0,
  lockPiano: false,
  mode: 'compose',
  activePartId: null,
  melodyPartId: null,
  playheadTick: 0,
  focusActivePart: false,
  scaleHighlight: true,
  scoreSurface: 'roll',
  sheetZoom: 40,
  sheetShowLyrics: true,
  sheetScrollX: 0,
  sheetScrollY: 0,
}

export const TAG_ROLL_CELL_W_MIN = 20
/** High enough that fill-width floors never pin zoom at the ceiling. */
export const TAG_ROLL_CELL_W_MAX = 640
export const TAG_ROLL_CELL_H_MIN = 8
export const TAG_ROLL_CELL_H_MAX = 32

export const TAG_ROLL_SHEET_ZOOM_MIN = 16
export const TAG_ROLL_SHEET_ZOOM_MAX = 160

/** Ruler height (px) — taller in compose so playhead scrubbing is easier. */
export const TAG_ROLL_RULER_H = 16
export const TAG_ROLL_RULER_H_COMPOSE = 28

export const TAG_ROLL_TIME_SIGNATURE_PRESETS: readonly TagRollTimeSignature[] = [
  { numerator: 4, denominator: 4 },
  { numerator: 3, denominator: 4 },
  { numerator: 2, denominator: 4 },
  { numerator: 6, denominator: 8 },
  { numerator: 5, denominator: 4 },
]
