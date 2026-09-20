import { describe, expect, it } from 'vitest'
import { createTagRollDefaultProjects } from './seedDefaultProjects'

describe('createTagRollDefaultProjects', () => {
  it('materializes Lilly Marlene (v2) with a fresh id', () => {
    const list = createTagRollDefaultProjects(1_700_000_000_000)
    expect(list).toHaveLength(1)
    const p = list[0]!
    expect(p.title).toBe('Lilly Marlene (v2)')
    expect(p.id).not.toBe('seed-lilly-marlene-v2')
    expect(p.notes.length).toBeGreaterThan(0)
    expect(p.parts.map((x) => x.name)).toEqual(['Tenor', 'Lead', 'Bari', 'Bass', '5th'])
    expect(p.createdAt).toBe(1_700_000_000_000)
    expect(p.localEntryId).toBeNull()
  })
})
