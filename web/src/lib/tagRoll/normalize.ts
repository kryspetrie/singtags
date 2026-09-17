/**
 * Normalize / create Tag Roll projects.
 */
import { newLocalId } from '../../offline/localLibraryDb'
import { isPianoSoundEngineId } from '../../audio/pianoSamples'
import {
  TAG_ROLL_CELL_H_MAX,
  TAG_ROLL_CELL_H_MIN,
  TAG_ROLL_CELL_W_MAX,
  TAG_ROLL_CELL_W_MIN,
  TAG_ROLL_DEFAULT_BPM,
  TAG_ROLL_DEFAULT_LENGTH_TICKS,
  TAG_ROLL_DEFAULT_PARTS,
  TAG_ROLL_DEFAULT_SNAP_TICKS,
  TAG_ROLL_DEFAULT_VIEW,
  TAG_ROLL_MIDI_MAX,
  TAG_ROLL_MIDI_MIN,
  TAG_ROLL_PPQ,
  TAG_ROLL_SCHEMA,
  type TagRollEditorMode,
  type TagRollMidiGroup,
  type TagRollNote,
  type TagRollPart,
  type TagRollProject,
  type TagRollViewPrefs,
} from './types'

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo
  return Math.max(lo, Math.min(hi, n))
}

function isMidiGroup(v: unknown): v is TagRollMidiGroup {
  return v === 'upper' || v === 'lower' || v === 'solo'
}

function isEditorMode(v: unknown): v is TagRollEditorMode {
  return v === 'view' || v === 'add' || v === 'edit' || v === 'lyrics'
}

export function normalizeTagRollPart(raw: unknown, fallbackIndex = 0): TagRollPart {
  const d = TAG_ROLL_DEFAULT_PARTS[fallbackIndex % TAG_ROLL_DEFAULT_PARTS.length]!
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const id =
    typeof o.id === 'string' && o.id.trim() ? o.id.trim() : newLocalId('trp')
  const name =
    typeof o.name === 'string' && o.name.trim() ? o.name.trim() : d.name
  const color =
    typeof o.color === 'string' && o.color.trim() ? o.color.trim() : d.color
  const midiGroup = isMidiGroup(o.midiGroup) ? o.midiGroup : d.midiGroup
  return { id, name, color, midiGroup }
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
  return {
    cellW: clamp(Math.round(Number(o.cellW) || TAG_ROLL_DEFAULT_VIEW.cellW), TAG_ROLL_CELL_W_MIN, TAG_ROLL_CELL_W_MAX),
    cellH: clamp(Math.round(Number(o.cellH) || TAG_ROLL_DEFAULT_VIEW.cellH), TAG_ROLL_CELL_H_MIN, TAG_ROLL_CELL_H_MAX),
    scrollX: Math.max(0, Number(o.scrollX) || 0),
    scrollY: Math.max(0, Number(o.scrollY) || 0),
    lockPiano: Boolean(o.lockPiano),
    mode: isEditorMode(o.mode) ? o.mode : 'view',
    activePartId,
    playheadTick: Math.max(0, Math.round(Number(o.playheadTick)) || 0),
  }
}

export function createDefaultTagRollParts(): TagRollPart[] {
  return TAG_ROLL_DEFAULT_PARTS.map((p) => ({
    id: newLocalId('trp'),
    name: p.name,
    color: p.color,
    midiGroup: p.midiGroup,
  }))
}

export function createEmptyTagRollProject(opts?: { title?: string }): TagRollProject {
  const now = Date.now()
  const parts = createDefaultTagRollParts()
  const lead = parts.find((p) => p.name === 'Lead') ?? parts[0]!
  return {
    schema: TAG_ROLL_SCHEMA,
    id: newLocalId('tr'),
    title: (opts?.title?.trim() || 'Untitled tag').trim() || 'Untitled tag',
    bpm: TAG_ROLL_DEFAULT_BPM,
    ppq: TAG_ROLL_PPQ,
    snapTicks: TAG_ROLL_DEFAULT_SNAP_TICKS,
    lengthTicks: TAG_ROLL_DEFAULT_LENGTH_TICKS,
    soundEngine: 'synth',
    tonality: 0,
    preferFlats: false,
    parts,
    notes: [],
    localEntryId: null,
    view: {
      ...TAG_ROLL_DEFAULT_VIEW,
      // Start scrolled so middle C is near the vertical center of a typical viewport later.
      scrollY: (TAG_ROLL_MIDI_MAX - 60) * TAG_ROLL_DEFAULT_VIEW.cellH,
      activePartId: lead.id,
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
  const now = Date.now()

  return {
    schema: TAG_ROLL_SCHEMA,
    id,
    title:
      typeof o.title === 'string' && o.title.trim()
        ? o.title.trim()
        : 'Untitled tag',
    bpm: clamp(Math.round(Number(o.bpm) || TAG_ROLL_DEFAULT_BPM), 40, 240),
    ppq: TAG_ROLL_PPQ,
    snapTicks: Math.max(1, Math.round(Number(o.snapTicks) || TAG_ROLL_DEFAULT_SNAP_TICKS)),
    lengthTicks: Math.max(
      TAG_ROLL_PPQ * 4,
      Math.round(Number(o.lengthTicks) || TAG_ROLL_DEFAULT_LENGTH_TICKS),
    ),
    soundEngine,
    tonality: clamp(Math.round(Number(o.tonality) || 0), 0, 11),
    preferFlats: Boolean(o.preferFlats),
    parts,
    notes,
    localEntryId:
      typeof o.localEntryId === 'string' && o.localEntryId.trim()
        ? o.localEntryId.trim()
        : null,
    view: normalizeTagRollView(o.view, parts),
    createdAt: Number.isFinite(Number(o.createdAt)) ? Number(o.createdAt) : now,
    updatedAt: Number.isFinite(Number(o.updatedAt)) ? Number(o.updatedAt) : now,
  }
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
  return Math.round((px / cellW) * ppq)
}

/** Y offset from top of grid (MIDI_MAX at y=0). */
export function midiToY(midi: number, cellH: number, midiMax = TAG_ROLL_MIDI_MAX): number {
  return (midiMax - midi) * cellH
}

export function yToMidi(y: number, cellH: number, midiMax = TAG_ROLL_MIDI_MAX): number {
  if (!(cellH > 0)) return midiMax
  return clampTagRollMidi(Math.round(midiMax - y / cellH))
}
