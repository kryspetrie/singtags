/**
 * @vitest-environment happy-dom
 */
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import {
  createFixedClock,
  createSequentialIdGenerator,
} from '../adapters/system/systemServices'
import {
  createTagStudioServices,
  setTagStudioServicesForTests,
} from '../composition/tagStudio'
import { createEmptyTagRollProject } from '../lib/tagRoll/normalize'
import type { TagRollHistoryRecord } from '../lib/tagRoll/history'
import { TAG_ROLL_PPQ, type TagRollProject } from '../lib/tagRoll/types'
import type { TagRollRepository } from '../ports/TagRollRepository'
import { useTagRollStore } from './tagRoll'

function memoryRepository(): TagRollRepository & {
  projects: Map<string, TagRollProject>
} {
  const projects = new Map<string, TagRollProject>()
  const history = new Map<string, TagRollHistoryRecord>()
  return {
    projects,
    async list() {
      return [...projects.values()]
        .map((p) => ({
          id: p.id,
          title: p.title,
          updatedAt: p.updatedAt,
          noteCount: p.notes.length,
          bpm: p.bpm,
        }))
        .sort((a, b) => b.updatedAt - a.updatedAt)
    },
    async get(id) {
      return projects.get(id) ?? null
    },
    async put(project) {
      projects.set(project.id, project)
    },
    async remove(id) {
      projects.delete(id)
      history.delete(id)
    },
    async getHistory(projectId) {
      return (
        history.get(projectId) ?? {
          projectId,
          undo: [],
          redo: [],
          updatedAt: 0,
        }
      )
    },
    async putHistory(record) {
      history.set(record.projectId, record)
    },
  }
}

describe('tagRoll store via ports', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    setTagStudioServicesForTests(null)
    vi.restoreAllMocks()
  })

  it('create / open / persist round-trip through TagRollRepository', async () => {
    const repository = memoryRepository()
    const put = vi.spyOn(repository, 'put')
    setTagStudioServicesForTests(
      createTagStudioServices({
        repository,
        idGen: createSequentialIdGenerator(1),
        clock: createFixedClock(1_700_000_000_000),
      }),
    )
    // Skip default seed when list is empty.
    vi.spyOn(
      await import('../lib/tagRoll/seedDefaultProjects'),
      'createTagRollDefaultProjects',
    ).mockReturnValue([])

    const store = useTagRollStore()
    await store.refreshList()
    expect(store.summaries).toEqual([])

    const created = await store.createProject('Ported')
    expect(created.title).toBe('Ported')
    expect(put).toHaveBeenCalled()
    expect(repository.projects.has(created.id)).toBe(true)

    store.clearCurrent()
    const opened = await store.openProject(created.id)
    expect(opened?.title).toBe('Ported')
    expect(store.current?.id).toBe(created.id)
  })

  it('upsertHarmonyNotes allocates ids via IdGenerator port', async () => {
    const repository = memoryRepository()
    setTagStudioServicesForTests(
      createTagStudioServices({
        repository,
        idGen: createSequentialIdGenerator(100),
        clock: createFixedClock(1_700_000_000_100),
      }),
    )
    vi.spyOn(
      await import('../lib/tagRoll/seedDefaultProjects'),
      'createTagRollDefaultProjects',
    ).mockReturnValue([])

    const store = useTagRollStore()
    const p = createEmptyTagRollProject({ title: 'Harmony' })
    const lead = p.parts.find((x) => x.name === 'Lead')!
    p.notes = [
      {
        id: 'm1',
        partId: lead.id,
        midi: 60,
        startTick: 0,
        durationTicks: TAG_ROLL_PPQ,
      },
    ]
    await repository.put(p)
    await store.openProject(p.id)
    store.upsertHarmonyNotes({
      melodyNoteId: 'm1',
      pitches: { tenor: 67, bari: 57, bass: 48, lead: 60 },
    })
    const ids = (store.current?.notes ?? [])
      .map((n) => n.id)
      .filter((id) => id.startsWith('trn_'))
    expect(ids).toEqual(['trn_100', 'trn_101', 'trn_102'])
  })
})
