/**
 * Tag Roll project schema — beat-based piano-roll compositions.
 * @see docs/plans/tag-roll.md
 */

import type { PianoSoundEngineId } from '../../audio/pianoSamples'

export const TAG_ROLL_SCHEMA = 'singtags.tagRoll.project.v1' as const

/** Pulses per quarter note. */
export const TAG_ROLL_PPQ = 480

/** Default snap = sixteenth note. */
export const TAG_ROLL_DEFAULT_SNAP_TICKS = TAG_ROLL_PPQ / 4

/** Default project length = 8 measures of 4/4. */
export const TAG_ROLL_DEFAULT_LENGTH_TICKS = TAG_ROLL_PPQ * 4 * 8

export const TAG_ROLL_DEFAULT_BPM = 120

/** Pitch range for the tote / grid (C2–B5). */
export const TAG_ROLL_MIDI_MIN = 36
export const TAG_ROLL_MIDI_MAX = 83

export type TagRollMidiGroup = 'upper' | 'lower' | 'solo'

export type TagRollPart = {
  id: string
  name: string
  color: string
  midiGroup: TagRollMidiGroup
}

export type TagRollNote = {
  id: string
  partId: string
  midi: number
  startTick: number
  durationTicks: number
  lyric?: string
}

export type TagRollEditorMode = 'view' | 'add' | 'edit' | 'lyrics'

export type TagRollViewPrefs = {
  cellW: number
  cellH: number
  scrollX: number
  scrollY: number
  lockPiano: boolean
  mode: TagRollEditorMode
  activePartId: string | null
  /** Playhead position in ticks. */
  playheadTick: number
}

export type TagRollProject = {
  schema: typeof TAG_ROLL_SCHEMA
  id: string
  title: string
  bpm: number
  ppq: typeof TAG_ROLL_PPQ
  snapTicks: number
  lengthTicks: number
  soundEngine: PianoSoundEngineId
  tonality: number
  preferFlats: boolean
  parts: TagRollPart[]
  notes: TagRollNote[]
  localEntryId: string | null
  view: TagRollViewPrefs
  createdAt: number
  updatedAt: number
}

/** Default TTBB palette (not shared with learning-track UI today). */
export const TAG_ROLL_DEFAULT_PARTS: readonly Omit<TagRollPart, 'id'>[] = [
  { name: 'Tenor', color: '#c45c26', midiGroup: 'upper' },
  { name: 'Lead', color: '#1d6a9f', midiGroup: 'upper' },
  { name: 'Bari', color: '#2f7d4a', midiGroup: 'lower' },
  { name: 'Bass', color: '#5b3d8f', midiGroup: 'lower' },
]

export const TAG_ROLL_DEFAULT_VIEW: TagRollViewPrefs = {
  cellW: 28,
  cellH: 14,
  scrollX: 0,
  scrollY: 0,
  lockPiano: false,
  mode: 'view',
  activePartId: null,
  playheadTick: 0,
}

export const TAG_ROLL_CELL_W_MIN = 8
export const TAG_ROLL_CELL_W_MAX = 64
export const TAG_ROLL_CELL_H_MIN = 8
export const TAG_ROLL_CELL_H_MAX = 32
