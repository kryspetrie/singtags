/**
 * Local Library: parallel tag-like entries with per-file assets.
 * 1 file = 1 asset; an Entry (song) may own many assets.
 */

/** Concert pitch for pay-the-key (written key label + optional fine detune). */
export type LocalDocPitch = {
  key: string | null
  detuneCents: number
}

/** How an asset participates on the Tag-like entry page. */
export type LocalAssetRole = 'sheet' | 'alternateSheet' | 'image' | 'track' | 'other'

export const LOCAL_ASSET_ROLES: LocalAssetRole[] = [
  'sheet',
  'alternateSheet',
  'image',
  'track',
  'other',
]

export function localAssetRoleLabel(role: LocalAssetRole): string {
  switch (role) {
    case 'sheet':
      return 'Sheet'
    case 'alternateSheet':
      return 'Alternate sheet'
    case 'image':
      return 'Image'
    case 'track':
      return 'Track'
    default:
      return 'Other'
  }
}

/** Song-like library item (list row / Tag parallel). */
export type LocalEntry = {
  id: string
  title: string
  arranger: string
  notes: string
  key: string | null
  detuneCents: number
  createdAt: string
  updatedAt: string
  groupIds: string[]
}

/** One imported file attached to an entry. */
export type LocalAsset = {
  id: string
  entryId: string
  role: LocalAssetRole
  label: string
  mime: string
  filename: string
  byteLength: number
  sortIndex: number
  createdAt: string
  updatedAt: string
}

/** Blob payload for an asset (same id as asset). */
export type LocalAssetBlob = {
  id: string
  mime: string
  data: ArrayBuffer
}

/** Named folder for grouping entries (membership + display order). */
export type LocalGroup = {
  id: string
  name: string
  createdAt: string
  /** Ordered entry ids in this group (Favorites collection–style). */
  entryIds: string[]
}

/** Library-wide prefs (custom list order for “All”). */
export type LocalLibraryPrefs = {
  id: 'prefs'
  entryOrder: string[]
}

export function normalizeLocalGroup(
  group: LocalGroup | (Omit<LocalGroup, 'entryIds'> & { entryIds?: string[] }),
): LocalGroup {
  return {
    id: group.id,
    name: group.name,
    createdAt: group.createdAt,
    entryIds: Array.isArray(group.entryIds) ? [...group.entryIds] : [],
  }
}

/** Case-insensitive substring match for library search. */
export function matchLocalLibraryQuery(
  entry: LocalEntry,
  query: string,
  opts?: { includeNotes?: boolean },
): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const hay = [
    entry.title,
    entry.arranger,
    entry.key ?? '',
    opts?.includeNotes ? entry.notes : '',
  ]
    .join('\n')
    .toLowerCase()
  return hay.includes(q)
}

/** Order `items` by `ids`, appending any missing at the end. */
export function orderEntriesByIds(items: LocalEntry[], ids: string[]): LocalEntry[] {
  const byId = new Map(items.map((e) => [e.id, e]))
  const out: LocalEntry[] = []
  for (const id of ids) {
    const e = byId.get(id)
    if (!e) continue
    out.push(e)
    byId.delete(id)
  }
  for (const e of byId.values()) out.push(e)
  return out
}

/** @deprecated Legacy single-blob doc shape (IDB v1). */
export type LocalDocMeta = {
  id: string
  title: string
  arranger: string
  notes: string
  key: string | null
  detuneCents: number
  mime: string
  filename: string
  byteLength: number
  createdAt: string
  updatedAt: string
  groupIds: string[]
}

/** @deprecated Use LocalAssetBlob. */
export type LocalDocBlobRecord = LocalAssetBlob

/** MIME types accepted into Local Library. */
export const LOCAL_LIBRARY_ACCEPT_MIME = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/mp4',
  'audio/aac',
  'audio/ogg',
  'audio/webm',
] as const

const AUDIO_EXT = ['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.oga', '.webm'] as const
const IMAGE_EXT = ['.jpg', '.jpeg', '.png', '.webp', '.gif'] as const

export function isLocalLibraryMime(mime: string, filename = ''): boolean {
  const m = mime.toLowerCase().trim()
  if ((LOCAL_LIBRARY_ACCEPT_MIME as readonly string[]).includes(m)) return true
  if (m === 'image/jpg') return true
  if (m.startsWith('audio/')) return true
  const lower = filename.toLowerCase()
  return (
    lower.endsWith('.pdf') ||
    IMAGE_EXT.some((e) => lower.endsWith(e)) ||
    AUDIO_EXT.some((e) => lower.endsWith(e))
  )
}

export function guessLocalMime(file: File): string {
  if (file.type) return file.type
  const n = file.name.toLowerCase()
  if (n.endsWith('.pdf')) return 'application/pdf'
  if (n.endsWith('.png')) return 'image/png'
  if (n.endsWith('.webp')) return 'image/webp'
  if (n.endsWith('.gif')) return 'image/gif'
  if (n.endsWith('.jpg') || n.endsWith('.jpeg')) return 'image/jpeg'
  if (n.endsWith('.mp3')) return 'audio/mpeg'
  if (n.endsWith('.wav')) return 'audio/wav'
  if (n.endsWith('.m4a')) return 'audio/mp4'
  if (n.endsWith('.aac')) return 'audio/aac'
  if (n.endsWith('.ogg') || n.endsWith('.oga')) return 'audio/ogg'
  if (n.endsWith('.webm')) return 'audio/webm'
  return 'application/octet-stream'
}

export function isLocalPdfMime(mime: string): boolean {
  return mime.toLowerCase() === 'application/pdf'
}

export function isLocalImageMime(mime: string, filename = ''): boolean {
  const m = mime.toLowerCase()
  if (m.startsWith('image/')) return true
  const lower = filename.toLowerCase()
  return IMAGE_EXT.some((e) => lower.endsWith(e))
}

export function isLocalAudioMime(mime: string, filename = ''): boolean {
  const m = mime.toLowerCase()
  if (m.startsWith('audio/')) return true
  const lower = filename.toLowerCase()
  return AUDIO_EXT.some((e) => lower.endsWith(e))
}

export function titleFromFilename(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, '').trim()
  return base || filename || 'Untitled'
}

/** Guess asset roles for a batch (first PDF = sheet, later PDFs = alternate, etc.). */
export function guessAssetRoles(
  files: { mime: string; filename: string }[],
): LocalAssetRole[] {
  let sheetTaken = false
  return files.map((f) => {
    if (isLocalAudioMime(f.mime, f.filename)) return 'track'
    if (isLocalPdfMime(f.mime) || f.filename.toLowerCase().endsWith('.pdf')) {
      if (!sheetTaken) {
        sheetTaken = true
        return 'sheet'
      }
      return 'alternateSheet'
    }
    if (isLocalImageMime(f.mime, f.filename)) {
      if (!sheetTaken) {
        sheetTaken = true
        return 'sheet'
      }
      return 'image'
    }
    return 'other'
  })
}

export function entryAssetSummary(assets: LocalAsset[]): string {
  if (!assets.length) return 'Empty'
  const sheets = assets.filter((a) => a.role === 'sheet' || a.role === 'alternateSheet').length
  const images = assets.filter((a) => a.role === 'image').length
  const tracks = assets.filter((a) => a.role === 'track').length
  const parts: string[] = []
  if (sheets) parts.push(sheets === 1 ? 'Sheet' : `${sheets} sheets`)
  if (images) parts.push(images === 1 ? 'Image' : `${images} images`)
  if (tracks) parts.push(tracks === 1 ? '1 track' : `${tracks} tracks`)
  const other = assets.length - sheets - images - tracks
  if (other > 0) parts.push(other === 1 ? '1 file' : `${other} files`)
  return parts.join(' · ') || 'Files'
}

/**
 * Default optical-transfer selection: primary sheet only (PDF/image).
 * Skips audio/tracks — they’re usually too large for fountain QR.
 */
export function defaultOpticalTransferAssets(assets: LocalAsset[]): LocalAsset[] {
  const sorted = [...assets].sort((a, b) => a.sortIndex - b.sortIndex)
  const sheet = sorted.find((a) => a.role === 'sheet')
  if (sheet) return [sheet]
  const pdf = sorted.find(
    (a) => isLocalPdfMime(a.mime) || a.filename.toLowerCase().endsWith('.pdf'),
  )
  if (pdf) return [pdf]
  const imageSheet = sorted.find(
    (a) =>
      (a.role === 'image' || a.role === 'alternateSheet') &&
      isLocalImageMime(a.mime, a.filename),
  )
  if (imageSheet) return [imageSheet]
  const anyImage = sorted.find((a) => isLocalImageMime(a.mime, a.filename))
  if (anyImage) return [anyImage]
  return []
}

/** Encode per-entry asset picks: `entryId:asset1+asset2,entryId2:asset3`. */
export function encodeLocalTransferAssetQuery(
  picks: Record<string, string[]>,
): string {
  return Object.entries(picks)
    .filter(([, ids]) => ids.length > 0)
    .map(([entryId, ids]) => `${entryId}:${[...new Set(ids)].join('+')}`)
    .join(',')
}

/** Decode `localAssets` query into entryId → assetId[]. */
export function decodeLocalTransferAssetQuery(
  raw: string | null | undefined,
): Record<string, string[]> {
  if (!raw?.trim()) return {}
  const out: Record<string, string[]> = {}
  for (const part of raw.split(',')) {
    const trimmed = part.trim()
    if (!trimmed) continue
    const colon = trimmed.indexOf(':')
    if (colon <= 0) continue
    const entryId = trimmed.slice(0, colon).trim()
    const assets = trimmed
      .slice(colon + 1)
      .split('+')
      .map((s) => s.trim())
      .filter(Boolean)
    if (!entryId || !assets.length) continue
    out[entryId] = [...new Set([...(out[entryId] ?? []), ...assets])]
  }
  return out
}

/** Concert keys for Local Library metadata (pay-the-key compatible). */
export const LOCAL_LIBRARY_KEY_OPTIONS = [
  '',
  'C Major',
  'Db Major',
  'D Major',
  'Eb Major',
  'E Major',
  'F Major',
  'F# Major',
  'Gb Major',
  'G Major',
  'Ab Major',
  'A Major',
  'Bb Major',
  'B Major',
  'C Minor',
  'C# Minor',
  'D Minor',
  'Eb Minor',
  'E Minor',
  'F Minor',
  'F# Minor',
  'G Minor',
  'G# Minor',
  'A Minor',
  'Bb Minor',
  'B Minor',
] as const

export function localLibraryKeyLabel(key: string): string {
  return key.trim() ? key : 'Unknown / none'
}
