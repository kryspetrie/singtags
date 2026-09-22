/**
 * Normalize / create Tag Roll projects.
 */
import { isPianoSoundEngineId } from '../../audio/pianoSamples'
import { loadPitchPipeSoundId } from '../../audio/pitchPipeVoice'
import { migratePartHotkey, normalizePartHotkey } from './partHotkeys'
import { syncProjectMix } from './mix'
import { allocatePrefixedId, newTagRollProjectId } from './ids'
import { normalizeSoundEnvelope } from './soundEnvelope'
import { TAG_ROLL_DEFAULT_SWING, normalizeSwing } from './swingMap'
import {
  TAG_ROLL_CELL_H_MAX,
  TAG_ROLL_CELL_H_MIN,
  TAG_ROLL_CELL_W_MAX,
  TAG_ROLL_CELL_W_MIN,
  TAG_ROLL_DEFAULT_BPM,
  TAG_ROLL_DEFAULT_CLEF_FAMILY,
  TAG_ROLL_DEFAULT_LENGTH_TICKS,
  TAG_ROLL_DEFAULT_PARTS,
  TAG_ROLL_DEFAULT_SNAP_TICKS,
  TAG_ROLL_DEFAULT_SOUND_ENVELOPE,
  TAG_ROLL_DEFAULT_TIME_SIGNATURE,
  TAG_ROLL_DEFAULT_VIEW,
  TAG_ROLL_MIDI_MAX,
  TAG_ROLL_MIDI_MIN,
  TAG_ROLL_PPQ,
  TAG_ROLL_SCHEMA,
  TAG_ROLL_SHEET_ZOOM_MAX,
  TAG_ROLL_SHEET_ZOOM_MIN,
  type TagRollClefFamily,
  type TagRollEditorMode,
  type TagRollExpression,
  type TagRollMelodyPass,
  type TagRollMidiGroup,
  type TagRollNote,
  type TagRollPart,
  type TagRollProject,
  type TagRollScoreSurface,
  type TagRollTempoMarker,
  type TagRollViewPrefs,
} from './types'
import {
  createDefaultTempoMarkers,
  normalizeExpression,
  normalizeTempoMarker,
  normalizeTimeSignature,
} from './tempoMap'

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo
  return Math.max(lo, Math.min(hi, n))
}

function isMidiGroup(v: unknown): v is TagRollMidiGroup {
  return v === 'upper' || v === 'lower' || v === 'solo'
}

function normalizeEditorMode(v: unknown): TagRollEditorMode {
  if (v === 'view' || v === 'compose' || v === 'lyrics') return v
  // Legacy add/edit modes → unified compose.
  if (v === 'add' || v === 'edit') return 'compose'
  return 'compose'
}

export function normalizeClefFamily(v: unknown): TagRollClefFamily {
  return v === 'ssaa' ? 'ssaa' : TAG_ROLL_DEFAULT_CLEF_FAMILY
}

export function normalizeScoreSurface(v: unknown): TagRollScoreSurface {
  return v === 'sheet' ? 'sheet' : 'roll'
}

export function normalizeTagRollPart(raw: unknown, fallbackIndex = 0): TagRollPart {
  const d = TAG_ROLL_DEFAULT_PARTS[fallbackIndex % TAG_ROLL_DEFAULT_PARTS.length]!
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const id =
    typeof o.id === 'string' && o.id.trim() ? o.id.trim() : allocatePrefixedId('trp')
  const name =
    typeof o.name === 'string' && o.name.trim() ? o.name.trim() : d.name
  const color =
    typeof o.color === 'string' && o.color.trim() ? o.color.trim() : d.color
  const midiGroup = isMidiGroup(o.midiGroup) ? o.midiGroup : d.midiGroup
  const rawHotkey = typeof o.hotkey === 'string' ? o.hotkey.trim().toLowerCase() : undefined
  const hotkey = normalizePartHotkey(migratePartHotkey(name, rawHotkey))
  return { id, name, color, midiGroup, ...(hotkey ? { hotkey } : {}) }
}

export function normalizeTagRollNote(raw: unknown): TagRollNote | null {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null
  if (!o) return null
  const id = typeof o.id === 'string' && o.id.trim() ? o.id.trim() : null
  const partId = typeof o.partId === 'string' && o.partId.trim() ? o.partId.trim() : null
  if (!id || !partId) return null
  const midi = clamp(Math.round(Number(o.midi)), 0, 127)
  const startTick = Math.max(0, Math.round(Number(o.startTick)) || 0)
  const durationTicks = Math.max(1, Math.round(Number(o.durationTicks)) || TAG_ROLL_DEFAULT_SNAP_TICKS)
  const lyric =
    typeof o.lyric === 'string' && o.lyric.length ? o.lyric : undefined
  return { id, partId, midi, startTick, durationTicks, ...(lyric != null ? { lyric } : {}) }
}

export function normalizeTagRollView(raw: unknown, parts: TagRollPart[]): TagRollViewPrefs {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const activeRaw = typeof o.activePartId === 'string' ? o.activePartId : null
  const activePartId =
    activeRaw && parts.some((p) => p.id === activeRaw)
      ? activeRaw
      : (parts[1]?.id ?? parts[0]?.id ?? null)
  const melodyRaw = typeof o.melodyPartId === 'string' ? o.melodyPartId : null
  const lead = parts.find((p) => p.name === 'Lead')
  const melodyPartId =
    melodyRaw && parts.some((p) => p.id === melodyRaw)
      ? melodyRaw
      : (lead?.id ?? activePartId)
  return {
    cellW: clamp(Math.round(Number(o.cellW) || TAG_ROLL_DEFAULT_VIEW.cellW), TAG_ROLL_CELL_W_MIN, TAG_ROLL_CELL_W_MAX),
    cellH: clamp(Math.round(Number(o.cellH) || TAG_ROLL_DEFAULT_VIEW.cellH), TAG_ROLL_CELL_H_MIN, TAG_ROLL_CELL_H_MAX),
    scrollX: Math.max(0, Number(o.scrollX) || 0),
    scrollY: Math.max(0, Number(o.scrollY) || 0),
    lockPiano: Boolean(o.lockPiano),
    mode: normalizeEditorMode(o.mode),
    activePartId,
    melodyPartId,
    playheadTick: Math.max(0, Math.round(Number(o.playheadTick)) || 0),
    focusActivePart: Boolean(o.focusActivePart),
    scaleHighlight: o.scaleHighlight === undefined ? true : Boolean(o.scaleHighlight),
    scoreSurface: normalizeScoreSurface(o.scoreSurface),
    sheetZoom: clamp(
      Math.round(Number(o.sheetZoom) || TAG_ROLL_DEFAULT_VIEW.sheetZoom),
      TAG_ROLL_SHEET_ZOOM_MIN,
      TAG_ROLL_SHEET_ZOOM_MAX,
    ),
    sheetShowLyrics: o.sheetShowLyrics === undefined ? true : Boolean(o.sheetShowLyrics),
    sheetScrollX: Math.max(0, Number(o.sheetScrollX) || 0),
    sheetScrollY: Math.max(0, Number(o.sheetScrollY) || 0),
  }
}

export function createDefaultTagRollParts(): TagRollPart[] {
  return TAG_ROLL_DEFAULT_PARTS.map((p) => ({
    id: allocatePrefixedId('trp'),
    name: p.name,
    color: p.color,
    midiGroup: p.midiGroup,
    ...(p.hotkey ? { hotkey: p.hotkey } : {}),
  }))
}

export function createEmptyTagRollProject(opts?: { title?: string }): TagRollProject {
  const now = Date.now()
  const parts = createDefaultTagRollParts()
  const lead = parts.find((p) => p.name === 'Lead') ?? parts[0]!
  const bpm = TAG_ROLL_DEFAULT_BPM
  return {
    schema: TAG_ROLL_SCHEMA,
    id: newTagRollProjectId(),
    title: (opts?.title?.trim() || 'Untitled tag').trim() || 'Untitled tag',
    bpm,
    ppq: TAG_ROLL_PPQ,
    snapTicks: TAG_ROLL_DEFAULT_SNAP_TICKS,
    lengthTicks: TAG_ROLL_DEFAULT_LENGTH_TICKS,
    timeSignature: { ...TAG_ROLL_DEFAULT_TIME_SIGNATURE },
    tempoMarkers: createDefaultTempoMarkers(bpm),
    expressions: [],
    soundEngine: 'synth',
    pitchPipeSoundId: loadPitchPipeSoundId(),
    blowPitchEnabled: false,
    metronomeEnabled: false,
    metronomeSwing: true,
    swing: { ...TAG_ROLL_DEFAULT_SWING },
    midiBakeSwing: true,
    soundEnvelope: { ...TAG_ROLL_DEFAULT_SOUND_ENVELOPE },
    tonality: 0,
    tonalityMode: 'major',
    preferFlats: false,
    clefFamily: TAG_ROLL_DEFAULT_CLEF_FAMILY,
    parts,
    mix: syncProjectMix(parts, null),
    notes: [],
    melodyPasses: [],
    localEntryId: null,
    view: {
      ...TAG_ROLL_DEFAULT_VIEW,
      // Start scrolled so middle C is near the vertical center of a typical viewport later.
      scrollY: (TAG_ROLL_MIDI_MAX - 60) * TAG_ROLL_DEFAULT_VIEW.cellH,
      activePartId: lead.id,
      melodyPartId: lead.id,
    },
    createdAt: now,
    updatedAt: now,
  }
}

export function normalizeTagRollProject(raw: unknown): TagRollProject | null {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null
  if (!o) return null
  const id = typeof o.id === 'string' && o.id.trim() ? o.id.trim() : null
  if (!id) return null

  const partsIn = Array.isArray(o.parts) ? o.parts : []
  let parts = partsIn.map((p, i) => normalizeTagRollPart(p, i))
  if (!parts.length) parts = createDefaultTagRollParts()

  const partIds = new Set(parts.map((p) => p.id))
  const notes = (Array.isArray(o.notes) ? o.notes : [])
    .map(normalizeTagRollNote)
    .filter((n): n is TagRollNote => !!n && partIds.has(n.partId))

  const soundEngine = isPianoSoundEngineId(o.soundEngine) ? o.soundEngine : 'synth'
  const pitchPipeSoundId =
    typeof o.pitchPipeSoundId === 'string' && o.pitchPipeSoundId.trim()
      ? o.pitchPipeSoundId.trim().slice(0, 64)
      : 'mellow'
  const now = Date.now()
  const bpm = clamp(Math.round(Number(o.bpm) || TAG_ROLL_DEFAULT_BPM), 20, 320)
  const timeSignature = normalizeTimeSignature(o.timeSignature)
  let tempoMarkers = (Array.isArray(o.tempoMarkers) ? o.tempoMarkers : [])
    .map(normalizeTempoMarker)
    .filter((m): m is TagRollTempoMarker => !!m)
  if (!tempoMarkers.length) {
    tempoMarkers = createDefaultTempoMarkers(bpm)
  } else if (!tempoMarkers.some((m) => m.tick === 0)) {
    tempoMarkers = [{ id: allocatePrefixedId('trt'), tick: 0, bpm }, ...tempoMarkers]
  }
  tempoMarkers.sort((a, b) => a.tick - b.tick)
  const expressions = (Array.isArray(o.expressions) ? o.expressions : [])
    .map(normalizeExpression)
    .filter((e): e is TagRollExpression => !!e)
  const melodyPasses = normalizeMelodyPasses(o.melodyPasses, notes)

  return {
    schema: TAG_ROLL_SCHEMA,
    id,
    title:
      typeof o.title === 'string' && o.title.trim()
        ? o.title.trim()
        : 'Untitled tag',
    bpm: tempoMarkers.find((m) => m.tick === 0)?.bpm ?? bpm,
    ppq: TAG_ROLL_PPQ,
    snapTicks: Math.max(1, Math.round(Number(o.snapTicks) || TAG_ROLL_DEFAULT_SNAP_TICKS)),
    lengthTicks: Math.max(
      TAG_ROLL_PPQ * 4,
      Math.round(Number(o.lengthTicks) || TAG_ROLL_DEFAULT_LENGTH_TICKS),
    ),
    timeSignature,
    tempoMarkers,
    expressions,
    soundEngine,
    pitchPipeSoundId,
    blowPitchEnabled: Boolean(o.blowPitchEnabled),
    metronomeEnabled: Boolean(o.metronomeEnabled),
    metronomeSwing: o.metronomeSwing === false ? false : true,
    swing: normalizeSwing(o.swing),
    midiBakeSwing: o.midiBakeSwing === false ? false : true,
    soundEnvelope: normalizeSoundEnvelope(o.soundEnvelope),
    tonality: clamp(Math.round(Number(o.tonality) || 0), 0, 11),
    tonalityMode: o.tonalityMode === 'minor' ? 'minor' : 'major',
    preferFlats: Boolean(o.preferFlats),
    clefFamily: normalizeClefFamily(o.clefFamily),
    parts,
    mix: syncProjectMix(parts, Array.isArray(o.mix) ? (o.mix as never) : null),
    notes,
    melodyPasses,
    localEntryId:
      typeof o.localEntryId === 'string' && o.localEntryId.trim()
        ? o.localEntryId.trim()
        : null,
    view: normalizeTagRollView(o.view, parts),
    createdAt: Number.isFinite(Number(o.createdAt)) ? Number(o.createdAt) : now,
    updatedAt: Number.isFinite(Number(o.updatedAt)) ? Number(o.updatedAt) : now,
  }
}

function normalizeMelodyPasses(raw: unknown, notes: readonly TagRollNote[]): TagRollMelodyPass[] {
  if (!Array.isArray(raw)) return []
  const ids = new Set(notes.map((n) => n.id))
  const out: TagRollMelodyPass[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const fromNoteId = typeof o.fromNoteId === 'string' ? o.fromNoteId : ''
    const toNoteId = typeof o.toNoteId === 'string' ? o.toNoteId : ''
    if (!fromNoteId || !toNoteId || fromNoteId === toNoteId) continue
    if (!ids.has(fromNoteId) || !ids.has(toNoteId)) continue
    const key = [fromNoteId, toNoteId].sort().join('|')
    if (seen.has(key)) continue
    seen.add(key)
    out.push({
      id: typeof o.id === 'string' && o.id.trim() ? o.id.trim() : allocatePrefixedId('mp'),
      fromNoteId,
      toNoteId,
    })
  }
  return out
}

export function clampTagRollMidi(midi: number): number {
  return clamp(Math.round(midi), TAG_ROLL_MIDI_MIN, TAG_ROLL_MIDI_MAX)
}

/** Pixels per beat from cellW (cellW is px per beat). */
export function ticksToPx(ticks: number, cellW: number, ppq = TAG_ROLL_PPQ): number {
  return (ticks / ppq) * cellW
}

export function pxToTicks(px: number, cellW: number, ppq = TAG_ROLL_PPQ): number {
  if (!(cellW > 0)) return 0
  // Continuous ticks — callers snap with snapTick (floor-to-cell).
  return (px / cellW) * ppq
}

/** Y offset from top of grid (MIDI_MAX at y=0). */
export function midiToY(midi: number, cellH: number, midiMax = TAG_ROLL_MIDI_MAX): number {
  return (midiMax - midi) * cellH
}

/** Pitch for a grid Y: each row owns [midiToY(m), midiToY(m-1)). */
export function yToMidi(y: number, cellH: number, midiMax = TAG_ROLL_MIDI_MAX): number {
  if (!(cellH > 0)) return midiMax
  return clampTagRollMidi(midiMax - Math.floor(Math.max(0, y) / cellH))
}
