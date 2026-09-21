/**
 * Portable Tag Studio document subset for bridge I/O.
 * Matches `singtags.tagRoll.project.v1` fields we need; SingTags may add extras on normalize.
 */
export const TAG_ROLL_SCHEMA = 'singtags.tagRoll.project.v1' as const
export const TAG_ROLL_PPQ = 480 as const
export const TAG_ROLL_DEFAULT_BPM = 104
export const TAG_ROLL_DEFAULT_SNAP_TICKS = TAG_ROLL_PPQ / 4
export const TAG_ROLL_DEFAULT_LENGTH_TICKS = TAG_ROLL_PPQ * 4 * 8

export type TagRollMidiGroup = 'upper' | 'lower' | 'solo'

export type TagRollPart = {
  id: string
  name: string
  color: string
  midiGroup: TagRollMidiGroup
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

export type TagRollTimeSignature = {
  numerator: number
  denominator: number
}

export type TagRollPartMix = {
  partId: string
  volume: number
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
  mode: 'view' | 'compose' | 'lyrics'
  activePartId: string | null
  melodyPartId: string | null
  playheadTick: number
  focusActivePart: boolean
  scaleHighlight: boolean
}

export type TagRollTempoMarker = {
  id: string
  tick: number
  bpm: number
}

/** Minimal TagRoll project for interchange (expressions optional). */
export type TagRollProject = {
  schema: typeof TAG_ROLL_SCHEMA
  id: string
  title: string
  bpm: number
  ppq: typeof TAG_ROLL_PPQ
  snapTicks: number
  lengthTicks: number
  timeSignature: TagRollTimeSignature
  tempoMarkers: TagRollTempoMarker[]
  expressions: unknown[]
  soundEngine: string
  pitchPipeSoundId: string
  soundEnvelope: { attackMs: number; releaseMs: number }
  tonality: number
  preferFlats: boolean
  parts: TagRollPart[]
  mix: TagRollPartMix[]
  notes: TagRollNote[]
  localEntryId: string | null
  view: TagRollViewPrefs
  createdAt: number
  updatedAt: number
}

export const TTBB_PART_DEFS: readonly Omit<TagRollPart, 'id'>[] = [
  { name: 'Tenor', color: '#c45c26', midiGroup: 'upper', hotkey: 't' },
  { name: 'Lead', color: '#1d6a9f', midiGroup: 'upper', hotkey: 'l' },
  { name: 'Bari', color: '#2f7d4a', midiGroup: 'lower', hotkey: 'r' },
  { name: 'Bass', color: '#5b3d8f', midiGroup: 'lower', hotkey: 'b' },
]
