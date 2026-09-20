/**
 * IndexedDB for Tag Studio projects + undo/redo history.
 */
import { idbReq } from './offlineIndexedDb'
import {
  type TagRollDocumentSnapshot,
  type TagRollHistoryRecord,
} from '../lib/tagRoll/history'
import {
  isLegacyTagRollProjectId,
  newTagRollProjectId,
} from '../lib/tagRoll/ids'
import { normalizeTagRollProject } from '../lib/tagRoll/normalize'
import { TAG_ROLL_SCHEMA, type TagRollProject } from '../lib/tagRoll/types'

export { normalizeTagRollProject }
export type { TagRollProject }

export const TAG_ROLL_DB_NAME = 'singtags-tag-roll'
export const TAG_ROLL_DB_VERSION = 2
export const TAG_ROLL_PROJECTS_STORE = 'projects'
export const TAG_ROLL_HISTORY_STORE = 'history'

function openTagRollDbRaw(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const idb =
      typeof indexedDB !== 'undefined'
        ? indexedDB
        : (globalThis as { indexedDB?: IDBFactory }).indexedDB
    if (!idb) {
      reject(new Error('IndexedDB unavailable'))
      return
    }
    const req = idb.open(TAG_ROLL_DB_NAME, TAG_ROLL_DB_VERSION)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'))
    req.onsuccess = () => resolve(req.result)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(TAG_ROLL_PROJECTS_STORE)) {
        db.createObjectStore(TAG_ROLL_PROJECTS_STORE, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(TAG_ROLL_HISTORY_STORE)) {
        db.createObjectStore(TAG_ROLL_HISTORY_STORE, { keyPath: 'projectId' })
      }
    }
  })
}

async function migrateLegacyProjectIds(db: IDBDatabase): Promise<void> {
  const readTx = db.transaction(
    [TAG_ROLL_PROJECTS_STORE, TAG_ROLL_HISTORY_STORE],
    'readonly',
  )
  const rows = (await idbReq(
    readTx.objectStore(TAG_ROLL_PROJECTS_STORE).getAll(),
  )) as unknown[]
  const projects = rows
    .map(normalizeTagRollProject)
    .filter((p): p is TagRollProject => !!p)
  const legacy = projects.filter((p) => isLegacyTagRollProjectId(p.id))
  if (!legacy.length) return

  const used = new Set(projects.map((p) => p.id))

  for (const project of legacy) {
    let nextId = newTagRollProjectId()
    while (used.has(nextId)) nextId = newTagRollProjectId()
    used.add(nextId)
    used.delete(project.id)

    const histRow = await idbReq(
      db
        .transaction(TAG_ROLL_HISTORY_STORE, 'readonly')
        .objectStore(TAG_ROLL_HISTORY_STORE)
        .get(project.id),
    )

    const writeTx = db.transaction(
      [TAG_ROLL_PROJECTS_STORE, TAG_ROLL_HISTORY_STORE],
      'readwrite',
    )
    const projectStore = writeTx.objectStore(TAG_ROLL_PROJECTS_STORE)
    const historyStore = writeTx.objectStore(TAG_ROLL_HISTORY_STORE)
    const nextProject = normalizeTagRollProject({
      ...project,
      id: nextId,
      schema: TAG_ROLL_SCHEMA,
      updatedAt: Date.now(),
    })
    if (!nextProject) continue
    await idbReq(projectStore.put(nextProject))
    await idbReq(projectStore.delete(project.id))
    if (histRow) {
      const hist = normalizeHistory(histRow, nextId)
      await idbReq(
        historyStore.put({ ...hist, projectId: nextId, updatedAt: Date.now() }),
      )
      await idbReq(historyStore.delete(project.id))
    } else {
      await idbReq(historyStore.delete(project.id))
    }
  }
}

export async function openTagRollDb(): Promise<IDBDatabase> {
  const db = await openTagRollDbRaw()
  try {
    await migrateLegacyProjectIds(db)
    try {
      localStorage?.removeItem('singtags.tagRoll.idAliases')
    } catch {
      /* ignore */
    }
  } catch (err) {
    db.close()
    throw err
  }
  return db
}

export type TagRollProjectSummary = {
  id: string
  title: string
  updatedAt: number
  noteCount: number
  bpm: number
}

export async function listTagRollProjects(): Promise<TagRollProjectSummary[]> {
  const db = await openTagRollDb()
  try {
    const tx = db.transaction(TAG_ROLL_PROJECTS_STORE, 'readonly')
    const rows = await idbReq(tx.objectStore(TAG_ROLL_PROJECTS_STORE).getAll())
    return (rows as unknown[])
      .map(normalizeTagRollProject)
      .filter((p): p is TagRollProject => !!p)
      .map((p) => ({
        id: p.id,
        title: p.title,
        updatedAt: p.updatedAt,
        noteCount: p.notes.length,
        bpm: p.bpm,
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt)
  } finally {
    db.close()
  }
}

export async function getTagRollProject(id: string): Promise<TagRollProject | null> {
  const db = await openTagRollDb()
  try {
    const tx = db.transaction(TAG_ROLL_PROJECTS_STORE, 'readonly')
    const row = await idbReq(tx.objectStore(TAG_ROLL_PROJECTS_STORE).get(id))
    return normalizeTagRollProject(row)
  } finally {
    db.close()
  }
}

export async function putTagRollProject(project: TagRollProject): Promise<void> {
  const normalized = normalizeTagRollProject({
    ...project,
    schema: TAG_ROLL_SCHEMA,
    updatedAt: Date.now(),
  })
  if (!normalized) throw new Error('Invalid Tag Studio project')
  const db = await openTagRollDb()
  try {
    const tx = db.transaction(TAG_ROLL_PROJECTS_STORE, 'readwrite')
    await idbReq(tx.objectStore(TAG_ROLL_PROJECTS_STORE).put(normalized))
  } finally {
    db.close()
  }
}

export async function deleteTagRollProject(id: string): Promise<void> {
  const db = await openTagRollDb()
  try {
    const tx = db.transaction(
      [TAG_ROLL_PROJECTS_STORE, TAG_ROLL_HISTORY_STORE],
      'readwrite',
    )
    await idbReq(tx.objectStore(TAG_ROLL_PROJECTS_STORE).delete(id))
    await idbReq(tx.objectStore(TAG_ROLL_HISTORY_STORE).delete(id))
  } finally {
    db.close()
  }
}

function normalizeHistory(raw: unknown, projectId: string): TagRollHistoryRecord {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const undo = Array.isArray(o.undo) ? (o.undo as TagRollDocumentSnapshot[]) : []
  const redo = Array.isArray(o.redo) ? (o.redo as TagRollDocumentSnapshot[]) : []
  return {
    projectId,
    undo,
    redo,
    updatedAt: Number.isFinite(Number(o.updatedAt)) ? Number(o.updatedAt) : Date.now(),
  }
}

export async function getTagRollHistory(projectId: string): Promise<TagRollHistoryRecord> {
  const db = await openTagRollDb()
  try {
    const tx = db.transaction(TAG_ROLL_HISTORY_STORE, 'readonly')
    const row = await idbReq(tx.objectStore(TAG_ROLL_HISTORY_STORE).get(projectId))
    return normalizeHistory(row, projectId)
  } finally {
    db.close()
  }
}

export async function putTagRollHistory(record: TagRollHistoryRecord): Promise<void> {
  const db = await openTagRollDb()
  try {
    const tx = db.transaction(TAG_ROLL_HISTORY_STORE, 'readwrite')
    await idbReq(
      tx.objectStore(TAG_ROLL_HISTORY_STORE).put({
        ...record,
        updatedAt: Date.now(),
      }),
    )
  } finally {
    db.close()
  }
}
