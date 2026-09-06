/**
 * IndexedDB for Local Library entries + per-file assets.
 */
import type {
  LocalAsset,
  LocalAssetBlob,
  LocalDocMeta,
  LocalEntry,
  LocalGroup,
  LocalLibraryPrefs,
  LocalPlaylist,
} from '../types/localLibrary'
import { normalizeLocalEntry, normalizeLocalGroup, normalizeLocalPlaylist } from '../types/localLibrary'
import { idbReq } from './offlineIndexedDb'

export const LOCAL_LIBRARY_DB_NAME = 'singtags-local-library'
export const LOCAL_LIBRARY_DB_VERSION = 5
export const LOCAL_ENTRIES_STORE = 'entries'
export const LOCAL_ASSETS_STORE = 'assets'
export const LOCAL_BLOBS_STORE = 'blobs'
export const LOCAL_GROUPS_STORE = 'groups'
export const LOCAL_META_STORE = 'meta'
export const LOCAL_PLAYLISTS_STORE = 'playlists'
/** Legacy v1 store — removed after migration. */
export const LOCAL_DOCS_STORE = 'docs'

const LIBRARY_PREFS_ID = 'prefs' as const

function copyBlobData(data: ArrayBuffer | ArrayLike<number>): ArrayBuffer {
  if (data instanceof ArrayBuffer) return data.slice(0)
  return Uint8Array.from(data as ArrayLike<number>).buffer
}

export function openLocalLibraryDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const idb =
      typeof indexedDB !== 'undefined'
        ? indexedDB
        : (globalThis as { indexedDB?: IDBFactory }).indexedDB
    if (!idb) {
      reject(new Error('IndexedDB unavailable'))
      return
    }
    const req = idb.open(LOCAL_LIBRARY_DB_NAME, LOCAL_LIBRARY_DB_VERSION)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'))
    req.onsuccess = () => resolve(req.result)
    req.onupgradeneeded = (event) => {
      const db = req.result
      const tx = req.transaction
      if (!tx) return
      const oldVersion = event.oldVersion

      if (!db.objectStoreNames.contains(LOCAL_ENTRIES_STORE)) {
        db.createObjectStore(LOCAL_ENTRIES_STORE, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(LOCAL_ASSETS_STORE)) {
        const assets = db.createObjectStore(LOCAL_ASSETS_STORE, { keyPath: 'id' })
        assets.createIndex('byEntry', 'entryId', { unique: false })
      }
      if (!db.objectStoreNames.contains(LOCAL_BLOBS_STORE)) {
        db.createObjectStore(LOCAL_BLOBS_STORE, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(LOCAL_GROUPS_STORE)) {
        db.createObjectStore(LOCAL_GROUPS_STORE, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(LOCAL_META_STORE)) {
        db.createObjectStore(LOCAL_META_STORE, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(LOCAL_PLAYLISTS_STORE)) {
        db.createObjectStore(LOCAL_PLAYLISTS_STORE, { keyPath: 'id' })
      }

      if (oldVersion < 2 && db.objectStoreNames.contains(LOCAL_DOCS_STORE)) {
        migrateDocsToEntries(tx)
      }
      if (oldVersion < 3) {
        migrateGroupsEntryIds(tx)
      }
      // Drop legacy store only after a prior version already migrated it (avoid racing async copy).
      if (oldVersion >= 2 && oldVersion < 4 && db.objectStoreNames.contains(LOCAL_DOCS_STORE)) {
        db.deleteObjectStore(LOCAL_DOCS_STORE)
      }
      if (oldVersion < 5 && !db.objectStoreNames.contains(LOCAL_PLAYLISTS_STORE)) {
        db.createObjectStore(LOCAL_PLAYLISTS_STORE, { keyPath: 'id' })
      }
    }
  })
}

function migrateDocsToEntries(tx: IDBTransaction): void {
  const docsStore = tx.objectStore(LOCAL_DOCS_STORE)
  const entriesStore = tx.objectStore(LOCAL_ENTRIES_STORE)
  const assetsStore = tx.objectStore(LOCAL_ASSETS_STORE)
  const blobsStore = tx.objectStore(LOCAL_BLOBS_STORE)

  const getAllReq = docsStore.getAll()
  getAllReq.onsuccess = () => {
    const docs = (getAllReq.result as LocalDocMeta[]) || []
    for (const doc of docs) {
      const entry: LocalEntry = {
        id: doc.id,
        title: doc.title,
        arranger: doc.arranger,
        notes: doc.notes,
        lyricsHint: '',
        key: doc.key,
        detuneCents: doc.detuneCents,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
        groupIds: doc.groupIds ?? [],
      }
      entriesStore.put(entry)

      const assetId = newLocalId('la')
      const asset: LocalAsset = {
        id: assetId,
        entryId: doc.id,
        role: 'sheet',
        label: doc.filename || doc.title || 'Sheet',
        mime: doc.mime,
        filename: doc.filename,
        byteLength: doc.byteLength,
        sortIndex: 0,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      }
      assetsStore.put(asset)

      const blobGet = blobsStore.get(doc.id)
      blobGet.onsuccess = () => {
        const row = blobGet.result as LocalAssetBlob | undefined
        if (row) {
          blobsStore.put({
            id: assetId,
            mime: row.mime || doc.mime,
            data: copyBlobData(row.data),
          })
          blobsStore.delete(doc.id)
        }
        docsStore.delete(doc.id)
      }
    }
  }

  tx.oncomplete = () => {
    // Drop legacy store on a later open if still present — deleteObjectStore only in versionchange.
  }
}

function migrateGroupsEntryIds(tx: IDBTransaction): void {
  if (!tx.objectStoreNames.contains(LOCAL_GROUPS_STORE)) return
  const groupsStore = tx.objectStore(LOCAL_GROUPS_STORE)
  const entriesStore = tx.objectStoreNames.contains(LOCAL_ENTRIES_STORE)
    ? tx.objectStore(LOCAL_ENTRIES_STORE)
    : null
  const getGroups = groupsStore.getAll()
  getGroups.onsuccess = () => {
    const groups = (getGroups.result as LocalGroup[]) || []
    if (!entriesStore) {
      for (const g of groups) groupsStore.put(normalizeLocalGroup(g))
      return
    }
    const getEntries = entriesStore.getAll()
    getEntries.onsuccess = () => {
      const entries = (getEntries.result as LocalEntry[]) || []
      for (const g of groups) {
        const next = normalizeLocalGroup(g)
        if (!next.entryIds.length) {
          next.entryIds = entries
            .filter((e) => (e.groupIds ?? []).includes(g.id))
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
            .map((e) => e.id)
        }
        groupsStore.put(next)
      }
    }
  }
}

/** Open DB so pending upgrades (e.g. drop legacy `docs` store at v4) can run. */
export async function finalizeLocalLibraryMigration(): Promise<void> {
  const db = await openLocalLibraryDb()
  db.close()
}

export async function getLocalLibraryPrefs(): Promise<LocalLibraryPrefs> {
  const db = await openLocalLibraryDb()
  try {
    const tx = db.transaction(LOCAL_META_STORE, 'readonly')
    const row = await idbReq(tx.objectStore(LOCAL_META_STORE).get(LIBRARY_PREFS_ID))
    const prefs = row as LocalLibraryPrefs | undefined
    if (prefs && Array.isArray(prefs.entryOrder)) {
      return { id: LIBRARY_PREFS_ID, entryOrder: prefs.entryOrder }
    }
    return { id: LIBRARY_PREFS_ID, entryOrder: [] }
  } finally {
    db.close()
  }
}

export async function putLocalLibraryPrefs(prefs: LocalLibraryPrefs): Promise<void> {
  const plain = JSON.parse(JSON.stringify(prefs)) as LocalLibraryPrefs
  const db = await openLocalLibraryDb()
  try {
    const tx = db.transaction(LOCAL_META_STORE, 'readwrite')
    tx.objectStore(LOCAL_META_STORE).put(plain)
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error('putLocalLibraryPrefs failed'))
    })
  } finally {
    db.close()
  }
}

export function newLocalId(prefix = 'le'): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}_${crypto.randomUUID()}`
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export async function listLocalEntries(): Promise<LocalEntry[]> {
  const db = await openLocalLibraryDb()
  try {
    const tx = db.transaction(LOCAL_ENTRIES_STORE, 'readonly')
    const rows = await idbReq(tx.objectStore(LOCAL_ENTRIES_STORE).getAll())
    return (rows as LocalEntry[]).map(normalizeLocalEntry).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  } finally {
    db.close()
  }
}

export async function getLocalEntry(id: string): Promise<LocalEntry | null> {
  const db = await openLocalLibraryDb()
  try {
    const tx = db.transaction(LOCAL_ENTRIES_STORE, 'readonly')
    const row = await idbReq(tx.objectStore(LOCAL_ENTRIES_STORE).get(id))
    return row ? normalizeLocalEntry(row as LocalEntry) : null
  } finally {
    db.close()
  }
}

export async function putLocalEntry(entry: LocalEntry): Promise<void> {
  const plain = JSON.parse(JSON.stringify(entry)) as LocalEntry
  const db = await openLocalLibraryDb()
  try {
    const tx = db.transaction(LOCAL_ENTRIES_STORE, 'readwrite')
    tx.objectStore(LOCAL_ENTRIES_STORE).put(plain)
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error('putLocalEntry failed'))
    })
  } finally {
    db.close()
  }
}

export async function listAssetsForEntry(entryId: string): Promise<LocalAsset[]> {
  const db = await openLocalLibraryDb()
  try {
    const tx = db.transaction(LOCAL_ASSETS_STORE, 'readonly')
    const store = tx.objectStore(LOCAL_ASSETS_STORE)
    const index = store.index('byEntry')
    const rows = await idbReq(index.getAll(entryId))
    return (rows as LocalAsset[]).sort((a, b) => a.sortIndex - b.sortIndex || a.createdAt.localeCompare(b.createdAt))
  } finally {
    db.close()
  }
}

export async function listAllLocalAssets(): Promise<LocalAsset[]> {
  const db = await openLocalLibraryDb()
  try {
    const tx = db.transaction(LOCAL_ASSETS_STORE, 'readonly')
    const rows = await idbReq(tx.objectStore(LOCAL_ASSETS_STORE).getAll())
    return rows as LocalAsset[]
  } finally {
    db.close()
  }
}

export async function getLocalAsset(id: string): Promise<LocalAsset | null> {
  const db = await openLocalLibraryDb()
  try {
    const tx = db.transaction(LOCAL_ASSETS_STORE, 'readonly')
    const row = await idbReq(tx.objectStore(LOCAL_ASSETS_STORE).get(id))
    return (row as LocalAsset | undefined) ?? null
  } finally {
    db.close()
  }
}

export async function putLocalAsset(asset: LocalAsset, blob?: LocalAssetBlob): Promise<void> {
  const plain = JSON.parse(JSON.stringify(asset)) as LocalAsset
  const db = await openLocalLibraryDb()
  try {
    const storeNames = blob
      ? [LOCAL_ASSETS_STORE, LOCAL_BLOBS_STORE]
      : [LOCAL_ASSETS_STORE]
    const tx = db.transaction(storeNames, 'readwrite')
    tx.objectStore(LOCAL_ASSETS_STORE).put(plain)
    if (blob) {
      tx.objectStore(LOCAL_BLOBS_STORE).put({
        id: String(blob.id),
        mime: String(blob.mime),
        data: copyBlobData(blob.data),
      })
    }
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error('putLocalAsset failed'))
    })
  } finally {
    db.close()
  }
}

export async function getLocalAssetBlob(id: string): Promise<LocalAssetBlob | null> {
  const db = await openLocalLibraryDb()
  try {
    const tx = db.transaction(LOCAL_BLOBS_STORE, 'readonly')
    const row = await idbReq(tx.objectStore(LOCAL_BLOBS_STORE).get(id))
    return (row as LocalAssetBlob | undefined) ?? null
  } finally {
    db.close()
  }
}

export async function deleteLocalAsset(id: string): Promise<void> {
  const db = await openLocalLibraryDb()
  try {
    const tx = db.transaction([LOCAL_ASSETS_STORE, LOCAL_BLOBS_STORE], 'readwrite')
    tx.objectStore(LOCAL_ASSETS_STORE).delete(id)
    tx.objectStore(LOCAL_BLOBS_STORE).delete(id)
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error('deleteLocalAsset failed'))
    })
  } finally {
    db.close()
  }
}

export async function deleteLocalEntry(id: string): Promise<void> {
  const assets = await listAssetsForEntry(id)
  const db = await openLocalLibraryDb()
  try {
    const tx = db.transaction(
      [LOCAL_ENTRIES_STORE, LOCAL_ASSETS_STORE, LOCAL_BLOBS_STORE],
      'readwrite',
    )
    tx.objectStore(LOCAL_ENTRIES_STORE).delete(id)
    for (const a of assets) {
      tx.objectStore(LOCAL_ASSETS_STORE).delete(a.id)
      tx.objectStore(LOCAL_BLOBS_STORE).delete(a.id)
    }
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error('deleteLocalEntry failed'))
    })
  } finally {
    db.close()
  }
}

export async function listLocalGroups(): Promise<LocalGroup[]> {
  const db = await openLocalLibraryDb()
  try {
    const tx = db.transaction(LOCAL_GROUPS_STORE, 'readonly')
    const rows = await idbReq(tx.objectStore(LOCAL_GROUPS_STORE).getAll())
    return (rows as LocalGroup[])
      .map((g) => normalizeLocalGroup(g))
      .sort((a, b) => a.name.localeCompare(b.name))
  } finally {
    db.close()
  }
}

export async function putLocalGroup(group: LocalGroup): Promise<void> {
  const plain = JSON.parse(JSON.stringify(normalizeLocalGroup(group))) as LocalGroup
  const db = await openLocalLibraryDb()
  try {
    const tx = db.transaction(LOCAL_GROUPS_STORE, 'readwrite')
    tx.objectStore(LOCAL_GROUPS_STORE).put(plain)
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error('putLocalGroup failed'))
    })
  } finally {
    db.close()
  }
}

export async function deleteLocalGroup(id: string): Promise<void> {
  const entries = await listLocalEntries()
  const db = await openLocalLibraryDb()
  try {
    const tx = db.transaction([LOCAL_GROUPS_STORE, LOCAL_ENTRIES_STORE], 'readwrite')
    tx.objectStore(LOCAL_GROUPS_STORE).delete(id)
    for (const entry of entries) {
      if (!entry.groupIds.includes(id)) continue
      const next = {
        ...entry,
        groupIds: entry.groupIds.filter((g) => g !== id),
        updatedAt: new Date().toISOString(),
      }
      tx.objectStore(LOCAL_ENTRIES_STORE).put(next)
    }
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error('deleteLocalGroup failed'))
    })
  } finally {
    db.close()
  }
}

/** Put entry + assets (+ blobs) in one transaction. */
export async function putLocalEntryBundle(
  entry: LocalEntry,
  assets: LocalAsset[],
  blobs: LocalAssetBlob[],
): Promise<void> {
  const plainEntry = JSON.parse(JSON.stringify(entry)) as LocalEntry
  const db = await openLocalLibraryDb()
  try {
    const tx = db.transaction(
      [LOCAL_ENTRIES_STORE, LOCAL_ASSETS_STORE, LOCAL_BLOBS_STORE],
      'readwrite',
    )
    tx.objectStore(LOCAL_ENTRIES_STORE).put(plainEntry)
    for (const asset of assets) {
      tx.objectStore(LOCAL_ASSETS_STORE).put(JSON.parse(JSON.stringify(asset)) as LocalAsset)
    }
    for (const blob of blobs) {
      tx.objectStore(LOCAL_BLOBS_STORE).put({
        id: String(blob.id),
        mime: String(blob.mime),
        data: copyBlobData(blob.data),
      })
    }
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error('putLocalEntryBundle failed'))
    })
  } finally {
    db.close()
  }
}


export async function listLocalPlaylists(): Promise<LocalPlaylist[]> {
  const db = await openLocalLibraryDb()
  try {
    const tx = db.transaction(LOCAL_PLAYLISTS_STORE, 'readonly')
    const rows = await idbReq(tx.objectStore(LOCAL_PLAYLISTS_STORE).getAll())
    return (rows as LocalPlaylist[])
      .map(normalizeLocalPlaylist)
      .sort((a, b) => a.name.localeCompare(b.name))
  } finally {
    db.close()
  }
}

export async function getLocalPlaylist(id: string): Promise<LocalPlaylist | null> {
  const db = await openLocalLibraryDb()
  try {
    const tx = db.transaction(LOCAL_PLAYLISTS_STORE, 'readonly')
    const row = await idbReq(tx.objectStore(LOCAL_PLAYLISTS_STORE).get(id))
    return row ? normalizeLocalPlaylist(row as LocalPlaylist) : null
  } finally {
    db.close()
  }
}

export async function putLocalPlaylist(playlist: LocalPlaylist): Promise<void> {
  const plain = JSON.parse(JSON.stringify(playlist)) as LocalPlaylist
  const db = await openLocalLibraryDb()
  try {
    const tx = db.transaction(LOCAL_PLAYLISTS_STORE, 'readwrite')
    tx.objectStore(LOCAL_PLAYLISTS_STORE).put(plain)
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error('putLocalPlaylist failed'))
    })
  } finally {
    db.close()
  }
}

export async function deleteLocalPlaylist(id: string): Promise<void> {
  const db = await openLocalLibraryDb()
  try {
    const tx = db.transaction(LOCAL_PLAYLISTS_STORE, 'readwrite')
    tx.objectStore(LOCAL_PLAYLISTS_STORE).delete(id)
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error('deleteLocalPlaylist failed'))
    })
  } finally {
    db.close()
  }
}

export async function listAllLocalBlobs(): Promise<LocalAssetBlob[]> {
  const db = await openLocalLibraryDb()
  try {
    const tx = db.transaction(LOCAL_BLOBS_STORE, 'readonly')
    const rows = await idbReq(tx.objectStore(LOCAL_BLOBS_STORE).getAll())
    return (rows as LocalAssetBlob[]) || []
  } finally {
    db.close()
  }
}
