/**
 * IndexedDB for Tag Roll projects.
 */
import { idbReq } from './offlineIndexedDb'
import { normalizeTagRollProject } from '../lib/tagRoll/normalize'
import { TAG_ROLL_SCHEMA, type TagRollProject } from '../lib/tagRoll/types'

export { normalizeTagRollProject }
export type { TagRollProject }

export const TAG_ROLL_DB_NAME = 'singtags-tag-roll'
export const TAG_ROLL_DB_VERSION = 1
export const TAG_ROLL_PROJECTS_STORE = 'projects'

export function openTagRollDb(): Promise<IDBDatabase> {
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
    }
  })
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
  if (!normalized) throw new Error('Invalid Tag Roll project')
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
    const tx = db.transaction(TAG_ROLL_PROJECTS_STORE, 'readwrite')
    await idbReq(tx.objectStore(TAG_ROLL_PROJECTS_STORE).delete(id))
  } finally {
    db.close()
  }
}
