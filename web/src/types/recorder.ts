/**
 * Labs Audio Recorder: sessions with multi-take blobs stored on-device.
 */
import {
  normalizeRecorderTakeEdits,
  type RecorderTakeEdits,
} from '../audio/takeEdits'

/** Optional link from a recording session to a catalog SingTag. */
export type RecorderLinkedTag = {
  tagId: number
  title: string
}

/** Optional link from a recording session to a My Library song. */
export type RecorderLinkedLibrary = {
  entryId: string
  title: string
}

export type RecorderChannels = 1 | 2

/**
 * Mic processing for getUserMedia:
 * - music: raw / singing-friendly (AEC/NS off)
 * - voice: call-style echoCancellation + noiseSuppression
 */
export type RecorderProcessingMode = 'music' | 'voice'

/** Capture preferences for MediaRecorder / getUserMedia. */
export type RecorderCapturePrefs = {
  /** Preferred mime (may fall back at record time). */
  mimeType: string
  /** Target audioBitsPerSecond. */
  bitRate: number
  channels: RecorderChannels
  /** Optional MediaDeviceInfo.deviceId (empty = default). */
  deviceId: string
  processing: RecorderProcessingMode
}

export const RECORDER_BITRATE_PRESETS = [64_000, 96_000, 128_000, 192_000] as const

export const DEFAULT_RECORDER_CAPTURE: RecorderCapturePrefs = {
  mimeType: 'audio/webm;codecs=opus',
  bitRate: 128_000,
  channels: 1,
  deviceId: '',
  processing: 'music',
}

/** Defaults applied when using Quick Record from the session list. */
export type QuickRecordPrefs = {
  /** Labels auto-applied to sessions started via Quick Record. */
  autoLabels: string[]
  /** Optional notes seeded on Quick Record sessions. */
  autoNotes: string
}

export const DEFAULT_QUICK_RECORD: QuickRecordPrefs = {
  autoLabels: [],
  autoNotes: '',
}

export function normalizeQuickRecordPrefs(raw: unknown): QuickRecordPrefs {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const autoLabels = Array.isArray(o.autoLabels)
    ? o.autoLabels.filter((l): l is string => typeof l === 'string' && l.trim().length > 0).map((l) => l.trim())
    : typeof o.autoLabels === 'string'
      ? parseSessionLabels(o.autoLabels)
      : []
  const autoNotes = typeof o.autoNotes === 'string' ? o.autoNotes : ''
  return { autoLabels, autoNotes }
}

/** One rehearsal / practice recording session. */
export type RecorderSession = {
  id: string
  name: string
  /** Free-form notes (searchable). */
  notes: string
  /** User labels (“custom tags”), not catalog SingTags. */
  labels: string[]
  linkedTag: RecorderLinkedTag | null
  /** Link to a My Library entry (mutually exclusive with linkedTag in the UI). */
  linkedLibrary: RecorderLinkedLibrary | null
  createdAt: string
  updatedAt: string
  takeIds: string[]
  /** Snapshot of capture prefs used when the session was created (informational). */
  capture: RecorderCapturePrefs
}

export type RecorderSessionSort = 'newest' | 'oldest'

export type RecorderSessionListFilters = {
  /** Case-insensitive match against name, notes, and labels. */
  query?: string
  /** Inclusive local calendar start (YYYY-MM-DD), or empty. */
  dateFrom?: string
  /** Inclusive local calendar end (YYYY-MM-DD), or empty. */
  dateTo?: string
  sort?: RecorderSessionSort
}

/** One recorded take belonging to a session. */
export type RecorderTake = {
  id: string
  sessionId: string
  label: string
  /** Row create time (ISO). */
  createdAt: string
  /**
   * Wall-clock time this take was captured (ISO).
   * Set once at record time; preserved across crop / normalize / compress.
   */
  recordedAt: string
  durationSec: number
  mime: string
  sampleRate: number | null
  channels: RecorderChannels
  bitRate: number | null
  byteLength: number
  /**
   * Non-destructive edit recipe (pitch/speed/normalize/compress).
   * Applied on playback and baked on export; crop changes the blob.
   */
  edits: RecorderTakeEdits | null
}

/** Binary payload for a take (same id as take). */
export type RecorderBlob = {
  id: string
  mime: string
  data: ArrayBuffer
}

export function normalizeRecorderCapture(raw: unknown): RecorderCapturePrefs {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const bitRate = typeof o.bitRate === 'number' && Number.isFinite(o.bitRate) ? o.bitRate : DEFAULT_RECORDER_CAPTURE.bitRate
  const channels: RecorderChannels = o.channels === 2 ? 2 : 1
  const mimeType =
    typeof o.mimeType === 'string' && o.mimeType.trim() ? o.mimeType.trim() : DEFAULT_RECORDER_CAPTURE.mimeType
  const deviceId = typeof o.deviceId === 'string' ? o.deviceId : ''
  const processing: RecorderProcessingMode = o.processing === 'voice' ? 'voice' : 'music'
  return {
    mimeType,
    bitRate: Math.max(16_000, Math.min(320_000, Math.round(bitRate))),
    channels,
    deviceId,
    processing,
  }
}

export function normalizeRecorderSession(raw: RecorderSession): RecorderSession {
  const name = String(raw.name || '').trim() || 'Untitled session'
  const notes = typeof (raw as { notes?: unknown }).notes === 'string' ? (raw as { notes: string }).notes : ''
  const libRaw = (raw as { linkedLibrary?: unknown }).linkedLibrary
  let linkedLibrary: RecorderLinkedLibrary | null = null
  if (libRaw && typeof libRaw === 'object') {
    const o = libRaw as Record<string, unknown>
    const entryId = typeof o.entryId === 'string' ? o.entryId.trim() : ''
    if (entryId) {
      linkedLibrary = {
        entryId,
        title: typeof o.title === 'string' && o.title.trim() ? o.title.trim() : 'Library song',
      }
    }
  }
  return {
    id: String(raw.id),
    name,
    notes,
    labels: Array.isArray(raw.labels)
      ? raw.labels.filter((l): l is string => typeof l === 'string' && l.trim().length > 0).map((l) => l.trim())
      : [],
    linkedTag:
      raw.linkedTag &&
      typeof raw.linkedTag.tagId === 'number' &&
      Number.isFinite(raw.linkedTag.tagId)
        ? {
            tagId: Math.trunc(raw.linkedTag.tagId),
            title: String(raw.linkedTag.title || `Tag ${raw.linkedTag.tagId}`),
          }
        : null,
    linkedLibrary,
    createdAt: String(raw.createdAt || new Date().toISOString()),
    updatedAt: String(raw.updatedAt || raw.createdAt || new Date().toISOString()),
    takeIds: Array.isArray(raw.takeIds) ? raw.takeIds.filter((id) => typeof id === 'string') : [],
    capture: normalizeRecorderCapture(raw.capture),
  }
}

export function normalizeRecorderTake(raw: RecorderTake): RecorderTake {
  const createdAt = String(raw.createdAt || new Date().toISOString())
  const recordedAt = String(
    (raw as { recordedAt?: unknown }).recordedAt || createdAt || new Date().toISOString(),
  )
  const editsRaw = (raw as { edits?: unknown }).edits
  const edits =
    editsRaw == null
      ? null
      : normalizeRecorderTakeEdits(editsRaw)
  const identity =
    edits &&
    edits.pitchSemitones === 0 &&
    edits.speed === 1 &&
    !edits.normalize &&
    !edits.compress
  return {
    id: String(raw.id),
    sessionId: String(raw.sessionId),
    label: String(raw.label || 'Take'),
    createdAt,
    recordedAt,
    durationSec: Number.isFinite(raw.durationSec) ? Math.max(0, raw.durationSec) : 0,
    mime: String(raw.mime || 'application/octet-stream'),
    sampleRate:
      typeof raw.sampleRate === 'number' && Number.isFinite(raw.sampleRate) ? raw.sampleRate : null,
    channels: raw.channels === 2 ? 2 : 1,
    bitRate: typeof raw.bitRate === 'number' && Number.isFinite(raw.bitRate) ? raw.bitRate : null,
    byteLength: Number.isFinite(raw.byteLength) ? Math.max(0, Math.trunc(raw.byteLength)) : 0,
    edits: identity ? null : edits,
  }
}

export function parseSessionLabels(input: string): string[] {
  return input
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/** Human-readable default session title (ASCII only: no interpuncts / fancy spaces). */
export function defaultRecorderSessionName(when: Date = new Date()): string {
  const y = when.getFullYear()
  const mo = when.getMonth() + 1
  const d = when.getDate()
  let h = when.getHours()
  const min = when.getMinutes()
  const ampm = h >= 12 ? 'PM' : 'AM'
  h = h % 12
  if (h === 0) h = 12
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ] as const
  const month = months[mo - 1] ?? 'Jan'
  const mm = min.toString().padStart(2, '0')
  return `${month} ${d}, ${y} - ${h}:${mm} ${ampm}`
}

/** Local calendar YYYY-MM-DD for an ISO timestamp. */
export function sessionLocalDateKey(iso: string): string {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return ''
  const d = new Date(t)
  const y = d.getFullYear()
  const m = (d.getMonth() + 1).toString().padStart(2, '0')
  const day = d.getDate().toString().padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Filter + sort sessions for the recorder list UI. */
export function filterRecorderSessions(
  sessions: readonly RecorderSession[],
  filters: RecorderSessionListFilters = {},
): RecorderSession[] {
  const needle = (filters.query ?? '').trim().toLowerCase()
  const from = (filters.dateFrom ?? '').trim()
  const to = (filters.dateTo ?? '').trim()
  const sort = filters.sort === 'oldest' ? 'oldest' : 'newest'

  let out = sessions.filter((s) => {
    if (needle) {
      const hay = `${s.name}\n${s.notes}\n${s.labels.join('\n')}\n${s.linkedTag?.title ?? ''}\n${s.linkedLibrary?.title ?? ''}`.toLowerCase()
      if (!hay.includes(needle)) return false
    }
    if (from || to) {
      const key = sessionLocalDateKey(s.createdAt)
      if (!key) return false
      if (from && key < from) return false
      if (to && key > to) return false
    }
    return true
  })

  out = [...out].sort((a, b) => {
    const cmp = a.createdAt.localeCompare(b.createdAt)
    return sort === 'oldest' ? cmp : -cmp
  })
  return out
}
