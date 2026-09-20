import { describe, expect, it } from 'vitest'
import { createEmptyTagRollProject } from './normalize'
import {
  parseTagRollProjectJson,
  parseTagRollProjectJsonText,
  serializeTagRollProjectJson,
  tagRollJsonFilename,
} from './projectJson'
import { TAG_ROLL_SCHEMA } from './types'
import lillyMarleneV2 from './defaultProjects/lillyMarleneV2.json'

describe('projectJson', () => {
  it('names downloads from the title', () => {
    expect(tagRollJsonFilename({ title: 'Lilly Marlene (v2)' })).toBe('Lilly_Marlene_v2.json')
  })

  it('round-trips a project and assigns a fresh id on import', () => {
    const p = createEmptyTagRollProject({ title: 'Round trip' })
    p.notes.push({
      id: 'n1',
      partId: p.parts[0]!.id,
      midi: 60,
      startTick: 0,
      durationTicks: 480,
    })
    const raw = serializeTagRollProjectJson(p)
    expect(raw.schema).toBe(TAG_ROLL_SCHEMA)
    expect(raw.localEntryId).toBeNull()

    const parsed = parseTagRollProjectJson(raw)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.project.id).not.toBe(p.id)
    expect(parsed.project.title).toBe('Round trip')
    expect(parsed.project.notes).toHaveLength(1)
  })

  it('accepts the checked-in Lilly Marlene seed', () => {
    const parsed = parseTagRollProjectJson(lillyMarleneV2)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.project.title).toBe('Lilly Marlene (v2)')
    expect(parsed.project.notes.length).toBeGreaterThan(0)
  })

  it('rejects bad JSON text and wrong schema', () => {
    expect(parseTagRollProjectJsonText('{').ok).toBe(false)
    expect(parseTagRollProjectJson({ schema: 'nope' }).ok).toBe(false)
  })
})
