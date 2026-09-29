import { describe, expect, it } from 'vitest'
import {
  melodyPartIdOf,
  noteRoleOf,
  noteRolesMapFromProject,
  applyMelodyRolesToTagNotes,
} from './melodyNoteRoles'
import { createEmptyTagRollProject } from './normalize'
import type { MelodyEvent } from '../../domain/arranging/types'

describe('melodyNoteRoles', () => {
  it('reads melody part and note roles from the project', () => {
    const p = createEmptyTagRollProject({ title: 'T' })
    const lead = p.parts.find((x) => x.name === 'Lead')!
    p.view.melodyPartId = lead.id
    p.notes = [
      { id: 'n1', partId: lead.id, midi: 60, startTick: 0, durationTicks: 480, role: 'pmn' },
      { id: 'n2', partId: lead.id, midi: 62, startTick: 480, durationTicks: 480 },
    ]
    expect(melodyPartIdOf(p)).toBe(lead.id)
    expect(noteRoleOf(p.notes[0]!)).toBe('pmn')
    expect(noteRoleOf(p.notes[1]!)).toBe('unknown')
    expect(noteRolesMapFromProject(p)?.get('n1')).toBe('pmn')
  })

  it('applies arrangement melody roles onto Tag Roll notes', () => {
    const p = createEmptyTagRollProject({ title: 'T' })
    const lead = p.parts.find((x) => x.name === 'Lead')!
    p.view.melodyPartId = lead.id
    p.notes = [
      { id: 'n1', partId: lead.id, midi: 60, startTick: 0, durationTicks: 480 },
      { id: 'n2', partId: lead.id, midi: 62, startTick: 480, durationTicks: 480 },
    ]
    const melody: MelodyEvent[] = [
      {
        id: 'm1',
        midi: 60,
        startTick: 0,
        durationTicks: 480,
        role: 'smn',
      },
    ]
    const next = applyMelodyRolesToTagNotes(p, melody)
    expect(next[0]?.role).toBe('smn')
    expect(next[1]?.role).toBeUndefined()
  })
})
