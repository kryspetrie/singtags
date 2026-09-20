/**
 * @vitest-environment happy-dom
 */
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { createEmptyTagRollProject } from '../lib/tagRoll/normalize'
import { isLegacyTagRollProjectId } from '../lib/tagRoll/ids'
import {
  getTagRollProject,
  listTagRollProjects,
  putTagRollHistory,
  putTagRollProject,
  TAG_ROLL_DB_NAME,
} from '../offline/tagRollDb'

async function deleteDb(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(TAG_ROLL_DB_NAME)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error ?? new Error('deleteDatabase failed'))
    req.onblocked = () => resolve()
  })
}

describe('tagRollDb project id migration', () => {
  beforeEach(async () => {
    await deleteDb()
  })

  it('migrates legacy UUID project ids to nanoid', async () => {
    const legacyId = 'tr_550e8400-e29b-41d4-a716-446655440000'
    expect(isLegacyTagRollProjectId(legacyId)).toBe(true)

    const project = {
      ...createEmptyTagRollProject({ title: 'Legacy' }),
      id: legacyId,
    }
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open(TAG_ROLL_DB_NAME, 2)
      req.onerror = () => reject(req.error ?? new Error('open failed'))
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains('projects')) {
          db.createObjectStore('projects', { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains('history')) {
          db.createObjectStore('history', { keyPath: 'projectId' })
        }
      }
      req.onsuccess = () => {
        const db = req.result
        const tx = db.transaction(['projects', 'history'], 'readwrite')
        tx.objectStore('projects').put(project)
        tx.objectStore('history').put({
          projectId: legacyId,
          undo: [],
          redo: [],
          updatedAt: Date.now(),
        })
        tx.oncomplete = () => {
          db.close()
          resolve()
        }
        tx.onerror = () => reject(tx.error ?? new Error('seed failed'))
      }
    })

    const listed = await listTagRollProjects()
    expect(listed).toHaveLength(1)
    expect(listed[0]!.title).toBe('Legacy')
    expect(isLegacyTagRollProjectId(listed[0]!.id)).toBe(false)
    expect(listed[0]!.id).toMatch(/^[0-9A-Za-z]{10}$/)

    // Old UUID slug is gone — no alias map.
    expect(await getTagRollProject(legacyId)).toBeNull()
    expect(await getTagRollProject(listed[0]!.id)).toMatchObject({ title: 'Legacy' })
  })

  it('creates new projects with nanoid ids', async () => {
    const p = createEmptyTagRollProject({ title: 'Fresh' })
    await putTagRollProject(p)
    await putTagRollHistory({ projectId: p.id, undo: [], redo: [], updatedAt: Date.now() })
    expect(p.id).toMatch(/^[0-9A-Za-z]{10}$/)
    const got = await getTagRollProject(p.id)
    expect(got?.title).toBe('Fresh')
  })
})
