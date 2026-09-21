import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { createEmptyArrangement } from '../domain/arranging/types'
import {
  deleteArrangingProject,
  listArrangingProjects,
  putAllArrangingProjects,
  putArrangingProject,
} from './arrangingDb'

describe('arrangingDb IndexedDB', () => {
  it('round-trips projects', async () => {
    const a = createEmptyArrangement('A', { id: 'arr_a', now: 1 })
    const b = createEmptyArrangement('B', { id: 'arr_b', now: 2 })
    await putAllArrangingProjects([a, b])
    const listed = await listArrangingProjects()
    expect(listed.map((p) => p.id).sort()).toEqual(['arr_a', 'arr_b'])
    a.title = 'A2'
    await putArrangingProject(a)
    const again = await listArrangingProjects()
    expect(again.find((p) => p.id === 'arr_a')?.title).toBe('A2')
    await deleteArrangingProject('arr_a')
    const left = await listArrangingProjects()
    expect(left.map((p) => p.id)).toEqual(['arr_b'])
  })
})
