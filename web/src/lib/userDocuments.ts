/**
 * Tag Studio, arranging, My Library, and recordings live in IndexedDB.
 * The Drive app-state file stores the documents plus hashes of their files.
 * The bytes themselves are uploaded separately.
 */
import { idbReq } from '../offline/offlineIndexedDb'
import {
  deleteArrangingProject,
  listArrangingProjects,
  putArrangingProject,
} from '../offline/arrangingDb'
import type { ArrangementProject } from '../domain/arranging/types'
import {
  deleteLocalAsset,
  deleteLocalEntry,
  deleteLocalGroup,
  deleteLocalPlaylist,
  getLocalAsset,
  getLocalAssetBlob,
  getLocalLibraryPrefs,
  listAllLocalAssets,
  listAllLocalBlobs,
  listLocalEntries,
  listLocalGroups,
  listLocalPlaylists,
  putLocalAsset,
  putLocalEntry,
  putLocalGroup,
  putLocalLibraryPrefs,
  putLocalPlaylist,
} from '../offline/localLibraryDb'
import type {
  LocalAsset,
  LocalAssetBlob,
  LocalEntry,
  LocalGroup,
  LocalLibraryPrefs,
  LocalPlaylist,
} from '../types/localLibrary'
import {
  deleteRecorderSession,
  deleteRecorderTake,
  getRecorderBlob,
  getRecorderOriginal,
  listRecorderSessions,
  openRecorderDb,
  putRecorderSession,
  putRecorderTake,
  RECORDER_ORIGINALS_STORE,
  RECORDER_TAKES_STORE,
} from '../offline/recorderDb'
import type { RecorderSession, RecorderTake } from '../types/recorder'
import type { RecorderOriginal } from '../offline/recorderDb'
import {
  deleteTagRollProject,
  getTagRollProject,
  listTagRollProjects,
  openTagRollDb,
  TAG_ROLL_PROJECTS_STORE,
} from '../offline/tagRollDb'
import { normalizeTagRollProject } from '../lib/tagRoll/normalize'
import type { TagRollProject } from '../lib/tagRoll/types'
import { sha256Bytes } from './google/driveAppData'

export type UserBlobRef = {
  id: string
  sha256: string
  mime: string
  byteLength: number
  durationSec?: number
  sampleRate?: number | null
  channels?: 1 | 2
}

export type UserDocumentsFile = {
  tagStudio: { projects: TagRollProject[] }
  arranging: { projects: ArrangementProject[] }
  library: {
    prefs: LocalLibraryPrefs | null
    entries: LocalEntry[]
    assets: LocalAsset[]
    groups: LocalGroup[]
    playlists: LocalPlaylist[]
    blobs: UserBlobRef[]
  }
  recordings: {
    sessions: RecorderSession[]
    takes: RecorderTake[]
    blobs: UserBlobRef[]
    originals: UserBlobRef[]
  }
}

function emptyDocuments(): UserDocumentsFile {
  return {
    tagStudio: { projects: [] },
    arranging: { projects: [] },
    library: {
      prefs: null,
      entries: [],
      assets: [],
      groups: [],
      playlists: [],
      blobs: [],
    },
    recordings: { sessions: [], takes: [], blobs: [], originals: [] },
  }
}

function toBytes(data: ArrayBuffer | ArrayLike<number> | Uint8Array): Uint8Array {
  if (data instanceof Uint8Array) return data
  if (data instanceof ArrayBuffer) return new Uint8Array(data)
  return Uint8Array.from(data as ArrayLike<number>)
}

async function hashBytes(data: ArrayBuffer | ArrayLike<number> | Uint8Array): Promise<string> {
  return sha256Bytes(toBytes(data))
}

function stampOf(value: object): number {
  const record = value as { updatedAt?: unknown; createdAt?: unknown }
  if (typeof record.updatedAt === 'number') return record.updatedAt
  if (typeof record.updatedAt === 'string') {
    const n = Date.parse(record.updatedAt)
    if (Number.isFinite(n)) return n
  }
  if (typeof record.createdAt === 'number') return record.createdAt
  if (typeof record.createdAt === 'string') {
    const n = Date.parse(record.createdAt)
    if (Number.isFinite(n)) return n
  }
  return 0
}

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy.buffer
}

export function mergeById<T extends { id: string }>(local: T[], cloud: T[]): T[] {
  const byId = new Map<string, T>()
  for (const item of cloud) byId.set(item.id, item)
  for (const item of local) {
    const prev = byId.get(item.id)
    if (!prev || stampOf(item) >= stampOf(prev)) byId.set(item.id, item)
  }
  return [...byId.values()]
}

export function mergeUserDocuments(
  local: UserDocumentsFile | undefined,
  cloud: UserDocumentsFile | undefined,
): UserDocumentsFile | undefined {
  if (!local && !cloud) return undefined
  if (!local) return cloud
  if (!cloud) return local
  return {
    tagStudio: { projects: mergeById(local.tagStudio.projects, cloud.tagStudio.projects) },
    arranging: { projects: mergeById(local.arranging.projects, cloud.arranging.projects) },
    library: {
      prefs: local.library.prefs ?? cloud.library.prefs,
      entries: mergeById(local.library.entries, cloud.library.entries),
      assets: mergeById(local.library.assets, cloud.library.assets),
      groups: mergeById(local.library.groups, cloud.library.groups),
      playlists: mergeById(local.library.playlists, cloud.library.playlists),
      blobs: mergeById(local.library.blobs, cloud.library.blobs),
    },
    recordings: {
      sessions: mergeById(local.recordings.sessions, cloud.recordings.sessions),
      takes: mergeById(local.recordings.takes, cloud.recordings.takes),
      blobs: mergeById(local.recordings.blobs, cloud.recordings.blobs),
      originals: mergeById(local.recordings.originals, cloud.recordings.originals),
    },
  }
}

async function fullTagRollProjects(): Promise<TagRollProject[]> {
  const summaries = await listTagRollProjects()
  const projects: TagRollProject[] = []
  for (const summary of summaries) {
    const project = await getTagRollProject(summary.id)
    if (project) projects.push(project)
  }
  return projects
}

export async function snapshotUserDocuments(): Promise<UserDocumentsFile> {
  if (typeof indexedDB === 'undefined') return emptyDocuments()
  try {
    const [projects, arranging, entries, assets, groups, playlists, prefs, libraryBlobs, sessions] =
      await Promise.all([
        fullTagRollProjects(),
        listArrangingProjects(),
        listLocalEntries(),
        listAllLocalAssets(),
        listLocalGroups(),
        listLocalPlaylists(),
        getLocalLibraryPrefs().catch(() => null),
        listAllLocalBlobs(),
        listRecorderSessions(),
      ])
    const blobs: UserBlobRef[] = []
    for (const blob of libraryBlobs) {
      const bytes = toBytes(blob.data)
      blobs.push({
        id: blob.id,
        sha256: await hashBytes(bytes),
        mime: blob.mime,
        byteLength: bytes.byteLength,
      })
    }
    const takes: RecorderTake[] = []
    const recordingBlobs: UserBlobRef[] = []
    const originals: UserBlobRef[] = []
    for (const session of sessions) {
      const db = await openRecorderDb()
      try {
        const tx = db.transaction(RECORDER_TAKES_STORE, 'readonly')
        const rows = (await idbReq(tx.objectStore(RECORDER_TAKES_STORE).index('bySession').getAll(session.id))) as RecorderTake[]
        takes.push(...rows)
      } finally {
        db.close()
      }
    }
    for (const take of takes) {
      const blob = await getRecorderBlob(take.id)
      if (blob) {
        const bytes = toBytes(blob.data)
        recordingBlobs.push({
          id: blob.id,
          sha256: await hashBytes(bytes),
          mime: blob.mime,
          byteLength: bytes.byteLength,
        })
      }
      const original = await getRecorderOriginal(take.id)
      if (original) {
        const bytes = toBytes(original.data)
        originals.push({
          id: original.id,
          sha256: await hashBytes(bytes),
          mime: original.mime,
          byteLength: bytes.byteLength,
          durationSec: original.durationSec,
          sampleRate: original.sampleRate,
          channels: original.channels,
        })
      }
    }
    return {
      tagStudio: { projects },
      arranging: { projects: arranging },
      library: { prefs, entries, assets, groups, playlists, blobs },
      recordings: { sessions, takes, blobs: recordingBlobs, originals },
    }
  } catch (e) {
    throw e instanceof Error ? e : new Error('Could not read Tag Studio, library, or recordings.')
  }
}

export async function readLibraryBlob(id: string): Promise<Uint8Array | null> {
  const blob = await getLocalAssetBlob(id)
  return blob ? toBytes(blob.data) : null
}

export async function readRecordingBlob(id: string): Promise<Uint8Array | null> {
  const blob = await getRecorderBlob(id)
  return blob ? toBytes(blob.data) : null
}

export async function readRecordingOriginal(id: string): Promise<Uint8Array | null> {
  const blob = await getRecorderOriginal(id)
  return blob ? toBytes(blob.data) : null
}

function asArray<T>(raw: unknown): T[] {
  return Array.isArray(raw) ? (raw as T[]) : []
}

export function parseUserDocuments(raw: unknown): UserDocumentsFile | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const record = raw as Record<string, unknown>
  if (
    !('tagStudio' in record) &&
    !('arranging' in record) &&
    !('library' in record) &&
    !('recordings' in record)
  ) {
    return undefined
  }
  const o = raw as Partial<UserDocumentsFile>
  const empty = emptyDocuments()
  const library = o.library ?? empty.library
  const recordings = o.recordings ?? empty.recordings
  return {
    tagStudio: { projects: asArray(o.tagStudio?.projects) },
    arranging: { projects: asArray(o.arranging?.projects) },
    library: {
      prefs: library.prefs ?? null,
      entries: asArray(library.entries),
      assets: asArray(library.assets),
      groups: asArray(library.groups),
      playlists: asArray(library.playlists),
      blobs: asArray(library.blobs),
    },
    recordings: {
      sessions: asArray(recordings.sessions),
      takes: asArray(recordings.takes),
      blobs: asArray(recordings.blobs),
      originals: asArray(recordings.originals),
    },
  }
}

async function deleteMissing(ids: string[], keep: Set<string>, remove: (id: string) => Promise<void>): Promise<void> {
  for (const id of ids) {
    if (!keep.has(id)) await remove(id)
  }
}

export async function applyUserDocuments(
  docs: UserDocumentsFile | undefined,
  readBlob: (sha256: string) => Promise<Uint8Array | null>,
): Promise<void> {
  if (!docs || typeof indexedDB === 'undefined') return

  for (const project of docs.tagStudio.projects) {
    const normalized = normalizeTagRollProject(project)
    if (!normalized) continue
    const db = await openTagRollDb()
    try {
      const tx = db.transaction(TAG_ROLL_PROJECTS_STORE, 'readwrite')
      await idbReq(tx.objectStore(TAG_ROLL_PROJECTS_STORE).put(normalized))
    } finally {
      db.close()
    }
  }
  const localProjects = await listTagRollProjects()
  await deleteMissing(
    localProjects.map((p) => p.id),
    new Set(docs.tagStudio.projects.map((p) => p.id)),
    deleteTagRollProject,
  )

  for (const project of docs.arranging.projects) await putArrangingProject(project)
  const localArranging = await listArrangingProjects()
  await deleteMissing(
    localArranging.map((p) => p.id),
    new Set(docs.arranging.projects.map((p) => p.id)),
    deleteArrangingProject,
  )
  try {
    localStorage.setItem('arranging:idb-legacy-migrated', '1')
  } catch {
    /* ignore */
  }

  if (docs.library.prefs) await putLocalLibraryPrefs(docs.library.prefs)
  for (const entry of docs.library.entries) await putLocalEntry(entry)
  for (const group of docs.library.groups) await putLocalGroup(group)
  for (const playlist of docs.library.playlists) await putLocalPlaylist(playlist)
  for (const asset of docs.library.assets) {
    const ref = docs.library.blobs.find((b) => b.id === asset.id)
    let blob: LocalAssetBlob | undefined
    if (ref) {
      const bytes = await readBlob(ref.sha256)
      if (!bytes) throw new Error(`My Library file “${asset.filename || asset.id}” is missing from Drive.`)
      blob = { id: asset.id, mime: ref.mime, data: asArrayBuffer(bytes) }
    }
    await putLocalAsset(asset, blob)
  }
  const [entries, groups, playlists, assets] = await Promise.all([
    listLocalEntries(),
    listLocalGroups(),
    listLocalPlaylists(),
    listAllLocalAssets(),
  ])
  await deleteMissing(
    entries.map((e) => e.id),
    new Set(docs.library.entries.map((e) => e.id)),
    deleteLocalEntry,
  )
  await deleteMissing(
    groups.map((g) => g.id),
    new Set(docs.library.groups.map((g) => g.id)),
    deleteLocalGroup,
  )
  await deleteMissing(
    playlists.map((p) => p.id),
    new Set(docs.library.playlists.map((p) => p.id)),
    deleteLocalPlaylist,
  )
  await deleteMissing(
    assets.map((a) => a.id),
    new Set(docs.library.assets.map((a) => a.id)),
    deleteLocalAsset,
  )

  for (const session of docs.recordings.sessions) await putRecorderSession(session)
  for (const take of docs.recordings.takes) {
    const ref = docs.recordings.blobs.find((b) => b.id === take.id)
    if (!ref) continue
    const bytes = await readBlob(ref.sha256)
    if (!bytes) throw new Error(`Recording “${take.id}” is missing from Drive.`)
    await putRecorderTake(take, { id: take.id, mime: ref.mime, data: asArrayBuffer(bytes) })
  }
  for (const ref of docs.recordings.originals) {
    const bytes = await readBlob(ref.sha256)
    if (!bytes) throw new Error(`Recording original “${ref.id}” is missing from Drive.`)
    const db = await openRecorderDb()
    try {
      if (!db.objectStoreNames.contains(RECORDER_ORIGINALS_STORE)) continue
      const tx = db.transaction(RECORDER_ORIGINALS_STORE, 'readwrite')
      const original: RecorderOriginal = {
        id: ref.id,
        mime: ref.mime,
        data: asArrayBuffer(bytes),
        durationSec: ref.durationSec ?? 0,
        sampleRate: ref.sampleRate ?? null,
        channels: ref.channels === 2 ? 2 : 1,
      }
      await idbReq(tx.objectStore(RECORDER_ORIGINALS_STORE).put(original))
    } finally {
      db.close()
    }
  }
  const localSessions = await listRecorderSessions()
  await deleteMissing(
    localSessions.map((s) => s.id),
    new Set(docs.recordings.sessions.map((s) => s.id)),
    deleteRecorderSession,
  )
  for (const session of docs.recordings.sessions) {
    const db = await openRecorderDb()
    let ids: string[] = []
    try {
      const tx = db.transaction(RECORDER_TAKES_STORE, 'readonly')
      const rows = (await idbReq(
        tx.objectStore(RECORDER_TAKES_STORE).index('bySession').getAll(session.id),
      )) as RecorderTake[]
      ids = rows.map((t) => t.id)
    } finally {
      db.close()
    }
    const keep = new Set(docs.recordings.takes.filter((t) => t.sessionId === session.id).map((t) => t.id))
    await deleteMissing(ids, keep, deleteRecorderTake)
  }
}

/**
 * Copy Drive documents and files this device does not have yet.
 * Local-only projects, library rows, and recordings stay put.
 */
export async function restoreMissingUserBlobs(
  docs: UserDocumentsFile | undefined,
  readBlob: (sha256: string) => Promise<Uint8Array | null>,
): Promise<number> {
  if (!docs || typeof indexedDB === 'undefined') return 0
  let restored = 0

  for (const project of docs.tagStudio.projects) {
    const normalized = normalizeTagRollProject(project)
    if (!normalized || (await getTagRollProject(normalized.id))) continue
    const db = await openTagRollDb()
    try {
      const tx = db.transaction(TAG_ROLL_PROJECTS_STORE, 'readwrite')
      await idbReq(tx.objectStore(TAG_ROLL_PROJECTS_STORE).put(normalized))
    } finally {
      db.close()
    }
    restored += 1
  }

  const arrangingIds = new Set((await listArrangingProjects()).map((project) => project.id))
  for (const project of docs.arranging.projects) {
    if (arrangingIds.has(project.id)) continue
    await putArrangingProject(project)
    restored += 1
  }

  if (docs.library.prefs && !(await getLocalLibraryPrefs().catch(() => null))) {
    await putLocalLibraryPrefs(docs.library.prefs)
    restored += 1
  }

  const entryIds = new Set((await listLocalEntries()).map((entry) => entry.id))
  for (const entry of docs.library.entries) {
    if (entryIds.has(entry.id)) continue
    await putLocalEntry(entry)
    restored += 1
  }
  const groupIds = new Set((await listLocalGroups()).map((group) => group.id))
  for (const group of docs.library.groups) {
    if (groupIds.has(group.id)) continue
    await putLocalGroup(group)
    restored += 1
  }
  const playlistIds = new Set((await listLocalPlaylists()).map((playlist) => playlist.id))
  for (const playlist of docs.library.playlists) {
    if (playlistIds.has(playlist.id)) continue
    await putLocalPlaylist(playlist)
    restored += 1
  }

  for (const asset of docs.library.assets) {
    const ref = docs.library.blobs.find((blob) => blob.id === asset.id)
    const haveBlob = ref ? await getLocalAssetBlob(asset.id) : null
    const haveAsset = await getLocalAsset(asset.id)
    if (haveAsset && (!ref || haveBlob)) continue
    let blob: LocalAssetBlob | undefined
    if (ref && !haveBlob) {
      const bytes = await readBlob(ref.sha256)
      if (!bytes) throw new Error(`My Library file “${asset.filename || asset.id}” is missing from Drive.`)
      blob = { id: asset.id, mime: ref.mime, data: asArrayBuffer(bytes) }
    }
    await putLocalAsset(asset, blob)
    restored += 1
  }

  const sessionIds = new Set((await listRecorderSessions()).map((session) => session.id))
  for (const session of docs.recordings.sessions) {
    if (sessionIds.has(session.id)) continue
    await putRecorderSession(session)
    restored += 1
  }
  for (const take of docs.recordings.takes) {
    if (await getRecorderBlob(take.id)) continue
    const ref = docs.recordings.blobs.find((blob) => blob.id === take.id)
    if (!ref) continue
    const bytes = await readBlob(ref.sha256)
    if (!bytes) throw new Error(`Recording “${take.id}” is missing from Drive.`)
    await putRecorderTake(take, { id: take.id, mime: ref.mime, data: asArrayBuffer(bytes) })
    restored += 1
  }
  for (const ref of docs.recordings.originals) {
    if (await getRecorderOriginal(ref.id)) continue
    const bytes = await readBlob(ref.sha256)
    if (!bytes) throw new Error(`Recording original “${ref.id}” is missing from Drive.`)
    const db = await openRecorderDb()
    try {
      if (!db.objectStoreNames.contains(RECORDER_ORIGINALS_STORE)) continue
      const tx = db.transaction(RECORDER_ORIGINALS_STORE, 'readwrite')
      const original: RecorderOriginal = {
        id: ref.id,
        mime: ref.mime,
        data: asArrayBuffer(bytes),
        durationSec: ref.durationSec ?? 0,
        sampleRate: ref.sampleRate ?? null,
        channels: ref.channels === 2 ? 2 : 1,
      }
      await idbReq(tx.objectStore(RECORDER_ORIGINALS_STORE).put(original))
    } finally {
      db.close()
    }
    restored += 1
  }

  return restored
}
