import { describe, expect, it } from 'vitest'
import { createEmptyTagRollProject } from '../../lib/tagRoll/normalize'
import { TAG_ROLL_PPQ } from '../../lib/tagRoll/types'
import { createSequentialIdGenerator } from '../../adapters/arranging/persistence/systemServices'
import {
  mergeArrangementIntoTagRoll,
  tagStudioToArrangement,
} from './syncTagRoll'

describe('syncTagRoll bridge', () => {
  it('merges TTBB stack notes onto an existing Tag Studio project', () => {
    const tag = createEmptyTagRollProject({ title: 'Bridge Demo' })
    const lead = tag.parts.find((p) => p.name === 'Lead')!
    tag.notes = [
      { id: 'n1', partId: lead.id, midi: 60, startTick: 0, durationTicks: TAG_ROLL_PPQ },
    ]
    const idGen = createSequentialIdGenerator(1)
    const arr = tagStudioToArrangement(tag, idGen)
    arr.stacks = [
      {
        id: 's1',
        startTick: 0,
        durationTicks: TAG_ROLL_PPQ,
        natureId: 'major',
        rootPc: 0,
        voicing: 'root',
        spread: false,
        layer: 'primary',
        scfGroup: null,
        pillarId: null,
        midi: { tenor: 67, lead: 60, bari: 55, bass: 48 },
        ruleTags: [],
      },
    ]
    const merged = mergeArrangementIntoTagRoll(tag, arr, createSequentialIdGenerator(100))
    const byPart = new Map(merged.parts.map((p) => [p.id, p.name]))
    const names = merged.notes.map((n) => byPart.get(n.partId))
    expect(names?.sort()).toEqual(['Bari', 'Bass', 'Lead', 'Tenor'])
    expect(merged.expressions).toEqual(tag.expressions)
    expect(merged.swing).toEqual(tag.swing)
  })

  it('tagStudioToArrangement extracts lead melody', () => {
    const tag = createEmptyTagRollProject({ title: 'Mel' })
    const lead = tag.parts.find((p) => p.name === 'Lead')!
    tag.notes = [
      { id: 'a', partId: lead.id, midi: 64, startTick: 0, durationTicks: 240 },
    ]
    const arr = tagStudioToArrangement(tag, createSequentialIdGenerator(1))
    expect(arr.melody).toEqual([
      expect.objectContaining({ midi: 64, startTick: 0, durationTicks: 240 }),
    ])
  })

  it('seeds pillars from locked harmony sketch and writes them back', () => {
    const tag = createEmptyTagRollProject({ title: 'Sketch' })
    tag.harmonySketch = [
      {
        id: 'hs1',
        startTick: 0,
        endTick: 480,
        rootPc: 7,
        quality: 'seventh',
        source: 'user',
        locked: true,
      },
    ]
    const arr = tagStudioToArrangement(tag, createSequentialIdGenerator(1))
    expect(arr.pillars).toEqual([
      expect.objectContaining({ rootPc: 7, startTick: 0, endTick: 480, confirmed: true }),
    ])
    arr.pillars = [
      {
        id: 'pil_new',
        rootPc: 0,
        startTick: 480,
        endTick: 960,
        source: 'user',
        confirmed: true,
      },
    ]
    const merged = mergeArrangementIntoTagRoll(tag, arr, createSequentialIdGenerator(50))
    // Replace from pillars drops the old G7 span — coach list is authoritative after push.
    expect(merged.harmonySketch).toEqual([
      expect.objectContaining({ rootPc: 0, locked: true }),
    ])
  })

  it('merge keeps a held lead post intact when mid-hold stacks are applied', () => {
    const tag = createEmptyTagRollProject({ title: 'Post' })
    const lead = tag.parts.find((p) => p.name === 'Lead')!
    tag.notes = [
      { id: 'post', partId: lead.id, midi: 67, startTick: 0, durationTicks: 1920 },
    ]
    const arr = tagStudioToArrangement(tag, createSequentialIdGenerator(1))
    arr.stacks = [
      {
        id: 's1',
        startTick: 0,
        durationTicks: 480,
        natureId: 'major',
        rootPc: 0,
        voicing: '1513',
        spread: false,
        layer: 'primary',
        scfGroup: null,
        pillarId: null,
        midi: { tenor: 72, lead: 67, bari: 55, bass: 48 },
        ruleTags: [],
      },
      {
        id: 's2',
        startTick: 480,
        durationTicks: 480,
        natureId: 'seventh',
        rootPc: 7,
        voicing: '1513',
        spread: false,
        layer: 'primary',
        scfGroup: null,
        pillarId: null,
        midi: { tenor: 74, lead: 67, bari: 57, bass: 50 },
        ruleTags: [],
      },
    ]
    const merged = mergeArrangementIntoTagRoll(tag, arr, createSequentialIdGenerator(50))
    const leadNotes = merged.notes.filter((n) => n.partId === lead.id)
    expect(leadNotes).toHaveLength(1)
    expect(leadNotes[0]).toMatchObject({
      id: 'post',
      midi: 67,
      startTick: 0,
      durationTicks: 1920,
    })
    const tenor = merged.parts.find((p) => p.name === 'Tenor')!
    expect(merged.notes.filter((n) => n.partId === tenor.id)).toHaveLength(2)
  })

  it('apply-style merge writes missing TBB parts without rewriting lead', () => {
    const tag = createEmptyTagRollProject({ title: 'Lead only' })
    const lead = tag.parts.find((p) => p.name === 'Lead')!
    tag.notes = [
      { id: 'n1', partId: lead.id, midi: 60, startTick: 0, durationTicks: TAG_ROLL_PPQ },
    ]
    const arr = tagStudioToArrangement(tag, createSequentialIdGenerator(1))
    expect(arr.stacks).toHaveLength(0)
    arr.stacks = [
      {
        id: 's1',
        startTick: 0,
        durationTicks: TAG_ROLL_PPQ,
        natureId: 'seventh',
        rootPc: 0,
        voicing: '1735',
        spread: false,
        layer: 'primary',
        scfGroup: null,
        pillarId: null,
        midi: { tenor: 67, lead: 60, bari: 55, bass: 48 },
        ruleTags: [],
      },
    ]
    const merged = mergeArrangementIntoTagRoll(tag, arr, createSequentialIdGenerator(20))
    const byName = new Map(merged.parts.map((p) => [p.id, p.name]))
    const counts = { Lead: 0, Tenor: 0, Bari: 0, Bass: 0 }
    for (const n of merged.notes) {
      const name = byName.get(n.partId)
      if (name && name in counts) counts[name as keyof typeof counts]++
    }
    expect(counts).toEqual({ Lead: 1, Tenor: 1, Bari: 1, Bass: 1 })
    expect(merged.notes.find((n) => n.id === 'n1')).toBeTruthy()
  })
})
