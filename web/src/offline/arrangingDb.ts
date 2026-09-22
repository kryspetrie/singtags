/**
 * IndexedDB persistence for arranging projects + undo history.
 * Pattern mirrored from SingTags `offline/tagRollDb.ts`.
 */
import { idbReq } from './idbReq'
import {
  createEmptyArrangement,
  type ArrangementProject,
} from '../domain/arranging/types'
import { normalizeQaConfig } from '../domain/arranging/coachConfig'
import { DEFAULT_CONTEST_PROFILE } from '../domain/arranging/contestProfile'
import type { ArrangementDocumentSnapshot } from '../domain/arranging/history'

export const ARRANGING_DB_NAME = 'arranging-projects'
export const ARRANGING_DB_VERSION = 1
export const ARRANGING_PROJECTS_STORE = 'projects'
export const ARRANGING_HISTORY_STORE = 'history'

export type ArrangementHistoryRecord = {
  projectId: string
  undo: ArrangementDocumentSnapshot[]
  redo: ArrangementDocumentSnapshot[]
}

export function openArrangingDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const idb =
      typeof indexedDB !== 'undefined'
        ? indexedDB
        : (globalThis as { indexedDB?: IDBFactory }).indexedDB
    if (!idb) {
      reject(new Error('IndexedDB unavailable'))
      return
    }
    const req = idb.open(ARRANGING_DB_NAME, ARRANGING_DB_VERSION)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'))
    req.onsuccess = () => resolve(req.result)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(ARRANGING_PROJECTS_STORE)) {
        db.createObjectStore(ARRANGING_PROJECTS_STORE, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(ARRANGING_HISTORY_STORE)) {
        db.createObjectStore(ARRANGING_HISTORY_STORE, { keyPath: 'projectId' })
      }
    }
  })
}

function migrate(p: ArrangementProject): ArrangementProject {
  return {
    ...createEmptyArrangement(p.title, { id: p.id, now: p.createdAt }),
    ...p,
    contestProfile: p.contestProfile ?? DEFAULT_CONTEST_PROFILE,
    tuningMode: p.tuningMode ?? 'equal',
    tonalityMode: p.tonalityMode ?? 'major',
    qaConfig: normalizeQaConfig(p.qaConfig),
  }
}

export async function listArrangingProjects(): Promise<ArrangementProject[]> {
  const db = await openArrangingDb()
  try {
    const tx = db.transaction(ARRANGING_PROJECTS_STORE, 'readonly')
    const rows = await idbReq(tx.objectStore(ARRANGING_PROJECTS_STORE).getAll())
    return (rows as ArrangementProject[]).map(migrate).sort((a, b) => b.updatedAt - a.updatedAt)
  } finally {
    db.close()
  }
}

export async function putArrangingProject(project: ArrangementProject): Promise<void> {
  const db = await openArrangingDb()
  try {
    const tx = db.transaction(ARRANGING_PROJECTS_STORE, 'readwrite')
    await idbReq(tx.objectStore(ARRANGING_PROJECTS_STORE).put(migrate(project)))
  } finally {
    db.close()
  }
}

export async function putAllArrangingProjects(
  projects: readonly ArrangementProject[],
): Promise<void> {
  const db = await openArrangingDb()
  try {
    const tx = db.transaction(ARRANGING_PROJECTS_STORE, 'readwrite')
    const store = tx.objectStore(ARRANGING_PROJECTS_STORE)
    await idbReq(store.clear())
    for (const p of projects) {
      await idbReq(store.put(migrate(p)))
    }
  } finally {
    db.close()
  }
}

export async function deleteArrangingProject(id: string): Promise<void> {
  const db = await openArrangingDb()
  try {
    const tx = db.transaction(
      [ARRANGING_PROJECTS_STORE, ARRANGING_HISTORY_STORE],
      'readwrite',
    )
    await idbReq(tx.objectStore(ARRANGING_PROJECTS_STORE).delete(id))
    await idbReq(tx.objectStore(ARRANGING_HISTORY_STORE).delete(id))
  } finally {
    db.close()
  }
}

export async function getHistory(projectId: string): Promise<ArrangementHistoryRecord> {
  const db = await openArrangingDb()
  try {
    const tx = db.transaction(ARRANGING_HISTORY_STORE, 'readonly')
    const row = await idbReq(tx.objectStore(ARRANGING_HISTORY_STORE).get(projectId))
    const o = row && typeof row === 'object' ? (row as ArrangementHistoryRecord) : null
    return {
      projectId,
      undo: Array.isArray(o?.undo) ? o!.undo : [],
      redo: Array.isArray(o?.redo) ? o!.redo : [],
    }
  } finally {
    db.close()
  }
}

export async function putHistory(record: ArrangementHistoryRecord): Promise<void> {
  const db = await openArrangingDb()
  try {
    const tx = db.transaction(ARRANGING_HISTORY_STORE, 'readwrite')
    await idbReq(tx.objectStore(ARRANGING_HISTORY_STORE).put(record))
  } finally {
    db.close()
  }
}
