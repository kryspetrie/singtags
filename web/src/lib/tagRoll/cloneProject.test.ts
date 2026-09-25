import { describe, expect, it } from 'vitest'
import { cloneTagRollProject } from './cloneProject'
import { createEmptyTagRollProject } from './normalize'

describe('cloneTagRollProject', () => {
  it('assigns a new id and copy title', () => {
    const src = createEmptyTagRollProject({ title: 'Demo' })
    src.id = 'tr_orig'
    const copy = cloneTagRollProject(src, { now: 1000 })
    expect(copy).not.toBeNull()
    expect(copy!.id).not.toBe(src.id)
    expect(copy!.title).toBe('Demo (copy)')
    expect(copy!.createdAt).toBe(1000)
    expect(copy!.updatedAt).toBe(1000)
    expect(copy!.localEntryId).toBeNull()
  })
})
