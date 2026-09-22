/**
 * Document snapshots for Tag Studio undo/redo.
 * View prefs (scroll, playhead, mode) are excluded so undoing does not jump the viewport.
 */
import type {
  PianoSoundEngineId,
} from '../../audio/pianoSamples'
import type {
  TagRollClefFamily,
  TagRollExpression,
  TagRollMelodyPass,
  TagRollNote,
  TagRollPart,
  TagRollPartMix,
  TagRollProject,
  TagRollSoundEnvelope,
  TagRollSwing,
  TagRollTempoMarker,
  TagRollTimeSignature,
} from './types'
import { TAG_ROLL_DEFAULT_CLEF_FAMILY, TAG_ROLL_DEFAULT_SOUND_ENVELOPE } from './types'
import { TAG_ROLL_DEFAULT_SWING } from './swingMap'
import { syncProjectMix } from './mix'

export const TAG_ROLL_HISTORY_LIMIT = 80

export type TagRollDocumentSnapshot = {
  title: string
  bpm: number
  snapTicks: number
  lengthTicks: number
  timeSignature: TagRollTimeSignature
  tempoMarkers: TagRollTempoMarker[]
  expressions: TagRollExpression[]
  soundEngine: PianoSoundEngineId
  pitchPipeSoundId: string
  blowPitchEnabled: boolean
  metronomeEnabled: boolean
  metronomeSwing: boolean
  swing: TagRollSwing
  midiBakeSwing: boolean
  soundEnvelope: TagRollSoundEnvelope
  tonality: number
  tonalityMode: 'major' | 'minor'
  preferFlats: boolean
  clefFamily: TagRollClefFamily
  parts: TagRollPart[]
  mix: TagRollPartMix[]
  notes: TagRollNote[]
  melodyPasses: TagRollMelodyPass[]
  localEntryId: string | null
}

export function captureDocumentSnapshot(p: TagRollProject): TagRollDocumentSnapshot {
  return {
    title: p.title,
    bpm: p.bpm,
    snapTicks: p.snapTicks,
    lengthTicks: p.lengthTicks,
    timeSignature: { ...p.timeSignature },
    tempoMarkers: p.tempoMarkers.map((m) => ({ ...m })),
    expressions: p.expressions.map((e) => ({ ...e })),
    soundEngine: p.soundEngine,
    pitchPipeSoundId: p.pitchPipeSoundId,
    blowPitchEnabled: !!p.blowPitchEnabled,
    metronomeEnabled: !!p.metronomeEnabled,
    metronomeSwing: p.metronomeSwing !== false,
    swing: { ...(p.swing ?? TAG_ROLL_DEFAULT_SWING) },
    midiBakeSwing: p.midiBakeSwing !== false,
    soundEnvelope: { ...p.soundEnvelope },
    tonality: p.tonality,
    tonalityMode: p.tonalityMode ?? 'major',
    preferFlats: p.preferFlats,
    clefFamily: p.clefFamily ?? TAG_ROLL_DEFAULT_CLEF_FAMILY,
    parts: p.parts.map((x) => ({ ...x })),
    mix: (p.mix ?? []).map((m) => ({ ...m })),
    notes: p.notes.map((n) => ({ ...n })),
    melodyPasses: (p.melodyPasses ?? []).map((l) => ({ ...l })),
    localEntryId: p.localEntryId,
  }
}

export function applyDocumentSnapshot(
  p: TagRollProject,
  snap: TagRollDocumentSnapshot,
): TagRollProject {
  const bpm = snap.bpm
  const timeSignature = snap.timeSignature
    ? { ...snap.timeSignature }
    : { numerator: 4, denominator: 4 }
  const tempoMarkers =
    snap.tempoMarkers?.length
      ? snap.tempoMarkers.map((m) => ({ ...m }))
      : [{ id: 'trt-legacy', tick: 0, bpm }]
  const expressions = snap.expressions?.map((e) => ({ ...e })) ?? []
  const parts = snap.parts.map((x) => ({ ...x }))
  return {
    ...p,
    title: snap.title,
    bpm,
    snapTicks: snap.snapTicks,
    lengthTicks: snap.lengthTicks,
    timeSignature,
    tempoMarkers,
    expressions,
    soundEngine: snap.soundEngine,
    pitchPipeSoundId: snap.pitchPipeSoundId || 'mellow',
    blowPitchEnabled: !!snap.blowPitchEnabled,
    metronomeEnabled: !!snap.metronomeEnabled,
    metronomeSwing: snap.metronomeSwing !== false,
    swing: snap.swing ? { ...snap.swing } : { ...TAG_ROLL_DEFAULT_SWING },
    midiBakeSwing: snap.midiBakeSwing !== false,
    soundEnvelope: snap.soundEnvelope
      ? { ...snap.soundEnvelope }
      : { ...TAG_ROLL_DEFAULT_SOUND_ENVELOPE },
    tonality: snap.tonality,
    tonalityMode: snap.tonalityMode ?? 'major',
    preferFlats: snap.preferFlats,
    clefFamily: snap.clefFamily ?? TAG_ROLL_DEFAULT_CLEF_FAMILY,
    parts,
    mix: syncProjectMix(parts, snap.mix),
    notes: snap.notes.map((n) => ({ ...n })),
    melodyPasses: (snap.melodyPasses ?? []).map((l) => ({ ...l })),
    localEntryId: snap.localEntryId,
    updatedAt: Date.now(),
  }
}

export function snapshotsEqual(
  a: TagRollDocumentSnapshot,
  b: TagRollDocumentSnapshot,
): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

export type TagRollHistoryRecord = {
  projectId: string
  undo: TagRollDocumentSnapshot[]
  redo: TagRollDocumentSnapshot[]
  updatedAt: number
}

export function pushUndoStack(
  undo: TagRollDocumentSnapshot[],
  snap: TagRollDocumentSnapshot,
  limit = TAG_ROLL_HISTORY_LIMIT,
): TagRollDocumentSnapshot[] {
  const last = undo[undo.length - 1]
  if (last && snapshotsEqual(last, snap)) return undo
  const next = [...undo, snap]
  if (next.length > limit) return next.slice(next.length - limit)
  return next
}
