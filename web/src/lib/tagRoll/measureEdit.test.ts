import { describe, expect, it } from 'vitest'
import {
  canDeleteProjectMeasure,
  deleteProjectMeasure,
  extendProjectMeasures,
  insertMeasureAtTick,
  insertProjectMeasure,
  shrinkProjectMeasures,
} from './measureEdit'
import { createEmptyTagRollProject } from './normalize'
import { TAG_ROLL_PPQ } from './types'

describe('measureEdit', () => {
  it('extends length by whole measures', () => {
    const p = createEmptyTagRollProject({ title: 't' })
    const m = TAG_ROLL_PPQ * 4
    expect(extendProjectMeasures(p, 1).lengthTicks).toBe(p.lengthTicks + m)
    expect(extendProjectMeasures(p, 2).lengthTicks).toBe(p.lengthTicks + m * 2)
  })

  it('shrinks from the end and truncates / drops content', () => {
    let p = createEmptyTagRollProject({ title: 't' })
    const m = TAG_ROLL_PPQ * 4
    p = {
      ...p,
      lengthTicks: m * 3,
      notes: [
        {
          id: 'keep',
          partId: p.parts[0]!.id,
          midi: 60,
          startTick: 0,
          durationTicks: m,
        },
        {
          id: 'span',
          partId: p.parts[0]!.id,
          midi: 62,
          startTick: m * 2 - 100,
          durationTicks: 200,
        },
        {
          id: 'drop',
          partId: p.parts[0]!.id,
          midi: 64,
          startTick: m * 2,
          durationTicks: m,
        },
      ],
    }
    const next = shrinkProjectMeasures(p, 1)
    expect(next.lengthTicks).toBe(m * 2)
    expect(next.notes.map((n) => n.id)).toEqual(['keep', 'span'])
    expect(next.notes.find((n) => n.id === 'span')!.durationTicks).toBe(100)
  })

  it('refuses to shrink below one measure', () => {
    const p = {
      ...createEmptyTagRollProject({ title: 't' }),
      lengthTicks: TAG_ROLL_PPQ * 4,
    }
    expect(shrinkProjectMeasures(p, 5).lengthTicks).toBe(TAG_ROLL_PPQ * 4)
  })

  it('inserts before/after the cursor measure and shifts content', () => {
    let p = createEmptyTagRollProject({ title: 't' })
    const m = TAG_ROLL_PPQ * 4
    const partId = p.parts[0]!.id
    p = {
      ...p,
      lengthTicks: m * 2,
      notes: [
        { id: 'a', partId, midi: 60, startTick: 0, durationTicks: 100 },
        { id: 'b', partId, midi: 62, startTick: m, durationTicks: 100 },
      ],
      view: { ...p.view, playheadTick: m + 10 },
    }

    expect(insertMeasureAtTick(p, m + 10, 'before')).toBe(m)
    expect(insertMeasureAtTick(p, m + 10, 'after')).toBe(m * 2)

    const before = insertProjectMeasure(p, m + 10, 'before')
    expect(before.lengthTicks).toBe(m * 3)
    expect(before.notes.find((n) => n.id === 'a')!.startTick).toBe(0)
    expect(before.notes.find((n) => n.id === 'b')!.startTick).toBe(m * 2)
    expect(before.view.playheadTick).toBe(m * 2 + 10)

    const after = insertProjectMeasure(p, m + 10, 'after')
    expect(after.lengthTicks).toBe(m * 3)
    expect(after.notes.find((n) => n.id === 'b')!.startTick).toBe(m)
    expect(after.view.playheadTick).toBe(m + 10)
  })

  it('stretches notes that span an insert point', () => {
    let p = createEmptyTagRollProject({ title: 't' })
    const m = TAG_ROLL_PPQ * 4
    p = {
      ...p,
      lengthTicks: m * 2,
      notes: [
        {
          id: 'span',
          partId: p.parts[0]!.id,
          midi: 60,
          startTick: m - 50,
          durationTicks: 100,
        },
      ],
    }
    const next = insertProjectMeasure(p, m + 1, 'before')
    const n = next.notes[0]!
    expect(n.startTick).toBe(m - 50)
    expect(n.durationTicks).toBe(100 + m)
  })

  it('deletes before/after the cursor measure and shifts later content', () => {
    let p = createEmptyTagRollProject({ title: 't' })
    const m = TAG_ROLL_PPQ * 4
    const partId = p.parts[0]!.id
    p = {
      ...p,
      lengthTicks: m * 3,
      notes: [
        { id: 'a', partId, midi: 60, startTick: 0, durationTicks: 100 },
        { id: 'b', partId, midi: 62, startTick: m, durationTicks: 100 },
        { id: 'c', partId, midi: 64, startTick: m * 2, durationTicks: 100 },
      ],
      view: { ...p.view, playheadTick: m + 10 },
    }

    const delBefore = deleteProjectMeasure(p, m + 10, 'before')
    expect(delBefore.lengthTicks).toBe(m * 2)
    expect(delBefore.notes.map((n) => n.id)).toEqual(['a', 'c'])
    expect(delBefore.notes.find((n) => n.id === 'c')!.startTick).toBe(m)
    expect(delBefore.view.playheadTick).toBe(m)

    const delAfter = deleteProjectMeasure(p, m + 10, 'after')
    expect(delAfter.lengthTicks).toBe(m * 2)
    expect(delAfter.notes.map((n) => n.id)).toEqual(['a', 'b'])
    expect(delAfter.view.playheadTick).toBe(m + 10)
  })

  it('refuses delete when it would leave zero measures or past the end', () => {
    const p = {
      ...createEmptyTagRollProject({ title: 't' }),
      lengthTicks: TAG_ROLL_PPQ * 4,
    }
    expect(canDeleteProjectMeasure(p, 0, 'before')).toBe(false)
    expect(canDeleteProjectMeasure(p, 0, 'after')).toBe(false)
    expect(deleteProjectMeasure(p, 0, 'before')).toBe(p)
  })
})
