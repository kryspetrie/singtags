import { describe, expect, it } from 'vitest'
import { createEmptyTagRollProject } from '../tagRoll/normalize'
import { noteIdsAtTick, noteIdsForPillarInspect, noteIdsInRange } from './selectNotesAtTick'

describe('noteIdsAtTick', () => {
  it('prefers exact startTick column', () => {
    const p = createEmptyTagRollProject({ title: 't' })
    const lead = p.parts.find((x) => x.name === 'Lead')!
    const tenor = p.parts.find((x) => x.name === 'Tenor')!
    p.notes = [
      { id: 'a', partId: lead.id, midi: 60, startTick: 480, durationTicks: 240 },
      { id: 'b', partId: tenor.id, midi: 67, startTick: 480, durationTicks: 240 },
      { id: 'c', partId: lead.id, midi: 62, startTick: 0, durationTicks: 960 },
    ]
    expect(noteIdsAtTick(p, 480).sort()).toEqual(['a', 'b'])
  })

  it('falls back to sounding notes', () => {
    const p = createEmptyTagRollProject({ title: 't' })
    const lead = p.parts.find((x) => x.name === 'Lead')!
    p.notes = [{ id: 'c', partId: lead.id, midi: 62, startTick: 0, durationTicks: 960 }]
    expect(noteIdsAtTick(p, 100)).toEqual(['c'])
  })

  it('noteIdsInRange selects overlapping notes', () => {
    const p = createEmptyTagRollProject({ title: 't' })
    const lead = p.parts.find((x) => x.name === 'Lead')!
    p.notes = [
      { id: 'a', partId: lead.id, midi: 60, startTick: 0, durationTicks: 240 },
      { id: 'b', partId: lead.id, midi: 62, startTick: 480, durationTicks: 240 },
      { id: 'c', partId: lead.id, midi: 64, startTick: 960, durationTicks: 240 },
    ]
    expect(noteIdsInRange(p, 0, 720).sort()).toEqual(['a', 'b'])
  })

  it('noteIdsForPillarInspect prefers first stack onset over held Lead', () => {
    const p = createEmptyTagRollProject({ title: 't' })
    const lead = p.parts.find((x) => x.name === 'Lead')!
    const tenor = p.parts.find((x) => x.name === 'Tenor')!
    const bari = p.parts.find((x) => x.name === 'Bari')!
    const bass = p.parts.find((x) => x.name === 'Bass')!
    // Lilly-style: held Lead through the pillar; TBB enter mid-span.
    p.notes = [
      { id: 'lead', partId: lead.id, midi: 60, startTick: 1920, durationTicks: 1920 },
      { id: 't', partId: tenor.id, midi: 65, startTick: 2880, durationTicks: 240 },
      { id: 'r', partId: bari.id, midi: 57, startTick: 2880, durationTicks: 240 },
      { id: 'b', partId: bass.id, midi: 53, startTick: 2880, durationTicks: 240 },
    ]
    expect(noteIdsForPillarInspect(p, 1920, 3840).sort()).toEqual(['b', 'r', 't'])
  })
})
