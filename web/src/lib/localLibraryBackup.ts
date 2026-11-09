/**
 * Zip backup / restore for My Library (entries, assets, blobs, groups, playlists).
 */
import { unzipSync } from 'fflate'
import { buildZip, downloadBlob } from '../download/zip'
import type { LocalLibraryArchiveStore } from '../ports/LocalLibraryArchive'
import type {
  LocalAsset,
  LocalAssetBlob,
  LocalEntry,
  LocalGroup,
  LocalLibraryPrefs,
  LocalPlaylist,
} from '../types/localLibrary'
import { normalizeLocalGroup, normalizeLocalPlaylist } from '../types/localLibrary'

type BackupProgress = (p: LocalLibraryBackupProgress) => void

function isArchiveStore(value: unknown): value is LocalLibraryArchiveStore {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as LocalLibraryArchiveStore).listAssets === 'function'
  )
}

async function productionArchive(): Promise<LocalLibraryArchiveStore> {
  const { createIndexedDbLocalLibraryArchive } = await import('../adapters/localLibrary/archiveStore')
  return createIndexedDbLocalLibraryArchive()
}

export const LOCAL_LIBRARY_BACKUP_KIND = 'singtags-local-library' as const
export const LOCAL_LIBRARY_BACKUP_VERSION = 1 as const

export type LocalLibraryBackupManifest = {
  kind: typeof LOCAL_LIBRARY_BACKUP_KIND
  version: typeof LOCAL_LIBRARY_BACKUP_VERSION
  exportedAt: string
  entryCount: number
  assetCount: number
  blobCount: number
}

export type LocalLibraryBackupProgress = {
  label: string
  done: number
  total: number
}

function enc(obj: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(obj))
}

function decJson<T>(bytes: Uint8Array): T {
  return JSON.parse(new TextDecoder().decode(bytes)) as T
}

function report(
  onProgress: ((p: LocalLibraryBackupProgress) => void) | undefined,
  label: string,
  done: number,
  total: number,
): void {
  onProgress?.({ label, done, total })
}

function toArrayBuffer(data: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(data.byteLength)
  copy.set(data)
  return copy.buffer
}

/** Sum of asset byteLength fields (on-device library size estimate). */
export async function estimateLocalLibraryBytes(store?: LocalLibraryArchiveStore): Promise<number> {
  const resolved = store ?? (await productionArchive())
  const assets = await resolved.listAssets()
  return assets.reduce((sum, a) => sum + (a.byteLength || 0), 0)
}

/**
 * Build and download a My Library backup zip.
 */
export async function exportLocalLibraryZip(
  storeOrProgress: LocalLibraryArchiveStore | BackupProgress,
  onProgress?: BackupProgress,
): Promise<{ fileCount: number; bytes: number }> {
  const store = isArchiveStore(storeOrProgress) ? storeOrProgress : await productionArchive()
  const progress = isArchiveStore(storeOrProgress) ? onProgress : storeOrProgress
  report(progress, 'Reading library…', 0, 1)
  const [entries, assets, blobs, groups, playlists, prefs] = await Promise.all([
    store.listEntries(),
    store.listAssets(),
    store.listBlobs(),
    store.listGroups(),
    store.listPlaylists(),
    store.getPrefs(),
  ])

  const files: Array<{ name: string; data: Uint8Array }> = []
  const manifest: LocalLibraryBackupManifest = {
    kind: LOCAL_LIBRARY_BACKUP_KIND,
    version: LOCAL_LIBRARY_BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    entryCount: entries.length,
    assetCount: assets.length,
    blobCount: blobs.length,
  }
  files.push({ name: 'manifest.json', data: enc(manifest) })
  files.push({ name: 'entries.json', data: enc(entries) })
  files.push({ name: 'assets.json', data: enc(assets) })
  files.push({ name: 'groups.json', data: enc(groups) })
  files.push({ name: 'playlists.json', data: enc(playlists) })
  files.push({ name: 'prefs.json', data: enc(prefs) })

  const total = Math.max(1, blobs.length)
  let done = 0
  for (const blob of blobs) {
    report(progress, `Packing ${blob.id}…`, done, total)
    files.push({
      name: `blobs/${blob.id}`,
      data: new Uint8Array(blob.data.slice(0)),
    })
    files.push({
      name: `blobs/${blob.id}.meta.json`,
      data: enc({ id: blob.id, mime: blob.mime }),
    })
    done += 1
  }

  report(progress, 'Building zip…', total, total)
  const zipped = buildZip(files)
  const stamp = new Date().toISOString().slice(0, 10)
  downloadBlob(zipped, `singtags-local-library-${stamp}.zip`, 'application/zip')
  return { fileCount: files.length, bytes: zipped.byteLength }
}

export type LocalLibraryRestoreResult = {
  entries: number
  assets: number
  blobs: number
  groups: number
  playlists: number
}

/**
 * Restore a My Library backup zip (merge by id — overwrites matching ids).
 */
export async function importLocalLibraryZip(
  storeOrFile: LocalLibraryArchiveStore | File | ArrayBuffer | Uint8Array,
  fileOrProgress?: File | ArrayBuffer | Uint8Array | BackupProgress,
  onProgress?: BackupProgress,
): Promise<LocalLibraryRestoreResult> {
  const store = isArchiveStore(storeOrFile) ? storeOrFile : await productionArchive()
  const file = (isArchiveStore(storeOrFile) ? fileOrProgress : storeOrFile) as
    | File
    | ArrayBuffer
    | Uint8Array
  const progress =
    isArchiveStore(storeOrFile)
      ? onProgress
      : typeof fileOrProgress === 'function'
        ? fileOrProgress
        : undefined
  report(progress, 'Reading zip…', 0, 1)
  const bytes =
    file instanceof Uint8Array
      ? file
      : file instanceof ArrayBuffer
        ? new Uint8Array(file)
        : new Uint8Array(await file.arrayBuffer())

  let tree: Record<string, Uint8Array>
  try {
    tree = unzipSync(bytes) as Record<string, Uint8Array>
  } catch {
    throw new Error('Could not read zip — is this a My Library backup?')
  }

  const manifestBytes = tree['manifest.json']
  if (!manifestBytes) throw new Error('Not a My Library backup (missing manifest.json)')
  const manifest = decJson<Partial<LocalLibraryBackupManifest>>(manifestBytes)
  if (manifest.kind !== LOCAL_LIBRARY_BACKUP_KIND) {
    throw new Error('Not a SingTags My Library backup')
  }
  if (manifest.version !== LOCAL_LIBRARY_BACKUP_VERSION) {
    throw new Error(`Unsupported My Library backup version (${String(manifest.version)})`)
  }

  const entries = tree['entries.json'] ? decJson<LocalEntry[]>(tree['entries.json']) : []
  const assets = tree['assets.json'] ? decJson<LocalAsset[]>(tree['assets.json']) : []
  const groups = tree['groups.json'] ? decJson<LocalGroup[]>(tree['groups.json']) : []
  const playlists = tree['playlists.json']
    ? decJson<LocalPlaylist[]>(tree['playlists.json'])
    : []
  const prefs = tree['prefs.json']
    ? decJson<LocalLibraryPrefs>(tree['prefs.json'])
    : null

  const blobIds = new Set<string>()
  for (const name of Object.keys(tree)) {
    const m = /^blobs\/([^/]+)$/.exec(name)
    if (m?.[1] && !m[1].endsWith('.meta.json')) blobIds.add(m[1])
  }

  const total = Math.max(
    1,
    entries.length + assets.length + blobIds.size + groups.length + playlists.length,
  )
  let done = 0

  for (const entry of entries) {
    if (!entry?.id) continue
    await store.putEntry(entry)
    done += 1
    report(progress, 'Restoring songs…', done, total)
  }

  let blobCount = 0
  for (const asset of assets) {
    if (!asset?.id) continue
    const data = tree[`blobs/${asset.id}`]
    let blob: LocalAssetBlob | undefined
    if (data) {
      const mimeMeta = tree[`blobs/${asset.id}.meta.json`]
      const mime =
        (mimeMeta ? decJson<{ mime?: string }>(mimeMeta).mime : null) ||
        asset.mime ||
        'application/octet-stream'
      blob = { id: asset.id, mime, data: toArrayBuffer(data) }
      blobIds.delete(asset.id)
      blobCount += 1
    }
    await store.putAsset(asset, blob)
    done += 1
    report(progress, 'Restoring files…', done, total)
  }

  for (const id of [...blobIds]) {
    const data = tree[`blobs/${id}`]
    if (!data) continue
    const mimeMeta = tree[`blobs/${id}.meta.json`]
    const mime =
      (mimeMeta ? decJson<{ mime?: string }>(mimeMeta).mime : null) || 'application/octet-stream'
    await store.putAsset(
      {
        id,
        entryId: '',
        role: 'other',
        label: id,
        mime,
        filename: id,
        byteLength: data.byteLength,
        sortIndex: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      { id, mime, data: toArrayBuffer(data) },
    )
    blobCount += 1
    done += 1
    report(progress, 'Restoring blobs…', done, total)
  }

  for (const group of groups) {
    if (!group?.id) continue
    await store.putGroup(normalizeLocalGroup(group))
    done += 1
    report(progress, 'Restoring groups…', done, total)
  }

  for (const playlist of playlists) {
    if (!playlist?.id) continue
    await store.putPlaylist(normalizeLocalPlaylist({
      ...playlist,
      openFullscreen: playlist.openFullscreen !== false,
      items: Array.isArray(playlist.items) ? playlist.items : [],
    }))
    done += 1
    report(progress, 'Restoring set lists…', done, total)
  }

  if (prefs && prefs.id === 'prefs') {
    await store.putPrefs(prefs)
  }
  report(progress, 'Done', total, total)

  return {
    entries: entries.length,
    assets: assets.length,
    blobs: blobCount,
    groups: groups.length,
    playlists: playlists.length,
  }
}
