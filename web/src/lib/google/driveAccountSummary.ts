/**
 * Read-only snapshot of SingTags files in the user's private Drive app folder.
 * Does not create folders or upload anything.
 */
import { parseAppStateBackup } from '../appStateBackup'
import { isSingTagsOffline } from '../appOffline'
import {
  coerceDriveCacheManifest,
  DRIVE_CACHE_MANIFEST_FILE,
  tagIdsInCachePaths,
  type DriveCacheManifest,
} from './driveCacheSync'
import { DRIVE_APP_STATE_FILE, DRIVE_APP_STATE_META_FILE } from './driveAppStateSync'
import {
  downloadJsonFile,
  listAppDataFiles,
  type DriveAppDataFile,
} from './driveAppData'
import { getAccessToken, hasUsableAccessToken, restoreGoogleConnection } from './googleAuth'

const FOLDER_MIME = 'application/vnd.google-apps.folder'
const OBJECT_NAME = /^[a-f0-9]{64}$/i

export type DrivePackSummary = {
  present: boolean
  files: number
  tags: number
  bytes: number
}

export type DriveAccountSummary = {
  totalBytes: number
  fileCount: number
  settingsBytes: number
  settingsPresent: boolean
  favoriteCount: number | null
  collectionCount: number | null
  settingsUpdatedAt: string | null
  sheets: DrivePackSummary
  audio: DrivePackSummary
  /** Sum of sheet and track sizes named in the Drive manifest. */
  catalogBytes: number
  /** Content-addressed song files when a manifest is missing. */
  objectBytes: number
  objectCount: number
}

export function emptyDrivePackSummary(): DrivePackSummary {
  return { present: false, files: 0, tags: 0, bytes: 0 }
}

function packSummary(paths: { path: string; bytes?: number }[]): DrivePackSummary {
  let bytes = 0
  for (const entry of paths) bytes += entry.bytes || 0
  return {
    present: paths.length > 0,
    files: paths.length,
    tags: tagIdsInCachePaths(paths.map((entry) => entry.path)).filter((id) => id !== 0).length,
    bytes,
  }
}

/** Turn a Drive listing plus optional manifest/settings JSON into display totals. */
export function summarizeDriveListing(opts: {
  files: readonly DriveAppDataFile[]
  manifest?: DriveCacheManifest | null
  settings?: unknown
}): DriveAccountSummary {
  let totalBytes = 0
  let fileCount = 0
  let settingsBytes = 0
  let settingsPresent = false
  let objectBytes = 0
  let objectCount = 0
  for (const file of opts.files) {
    if (file.mimeType === FOLDER_MIME) continue
    fileCount += 1
    totalBytes += file.size
    if (file.name === DRIVE_APP_STATE_FILE || file.name === DRIVE_APP_STATE_META_FILE) {
      settingsBytes += file.size
      if (file.name === DRIVE_APP_STATE_FILE) settingsPresent = true
    } else if (OBJECT_NAME.test(file.name)) {
      objectBytes += file.size
      objectCount += 1
    }
  }

  let favoriteCount: number | null = null
  let collectionCount: number | null = null
  let settingsUpdatedAt: string | null = null
  if (opts.settings) {
    try {
      const parsed = parseAppStateBackup(opts.settings)
      favoriteCount = parsed.favorites.starred.tags.length
      collectionCount = parsed.favorites.collections.length
      settingsUpdatedAt = parsed.exportedAt
      settingsPresent = true
    } catch {
      /* size still counts */
    }
  }

  const manifest = opts.manifest ?? null
  const sheets = manifest ? packSummary(manifest.packs.sheets) : emptyDrivePackSummary()
  const audio = manifest ? packSummary(manifest.packs.audio) : emptyDrivePackSummary()
  return {
    totalBytes,
    fileCount,
    settingsBytes,
    settingsPresent,
    favoriteCount,
    collectionCount,
    settingsUpdatedAt,
    sheets,
    audio,
    catalogBytes: sheets.bytes + audio.bytes,
    objectBytes,
    objectCount,
  }
}

/** List the private app folder and describe what SingTags has stored there. */
export async function loadDriveAccountSummary(): Promise<DriveAccountSummary> {
  if (isSingTagsOffline()) throw new Error('Offline — can’t read Google Drive right now.')
  restoreGoogleConnection()
  if (!hasUsableAccessToken()) await getAccessToken({ interactive: true })
  const files = await listAppDataFiles()
  const manifestFile = files.find((file) => file.name === DRIVE_CACHE_MANIFEST_FILE)
  const settingsFile = files.find((file) => file.name === DRIVE_APP_STATE_FILE)
  const [manifestRaw, settingsRaw] = await Promise.all([
    manifestFile ? downloadJsonFile(manifestFile.id).catch(() => null) : Promise.resolve(null),
    settingsFile ? downloadJsonFile(settingsFile.id).catch(() => null) : Promise.resolve(null),
  ])
  return summarizeDriveListing({
    files,
    manifest: coerceDriveCacheManifest(manifestRaw),
    settings: settingsRaw,
  })
}
