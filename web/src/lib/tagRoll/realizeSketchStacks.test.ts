/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { createSequentialIdGenerator } from '../../adapters/system/systemServices'
import { realizeSketchStacksToNotes } from './realizeSketchStacks'
import { TAG_ROLL_PPQ, type HarmonySketchSpan, type TagRollNote } from './types'

const parts = [
  { id: 'tenor', name: 'Tenor', color: '#c', midiGroup: 'upper' as const },
  { id: 'lead', name: 'Lead', color: '#l', midiGroup: 'upper' as const },
  { id: 'bari', name: 'Bari', color: '#b', midiGroup: 'lower' as const },
  { id: 'bass', name: 'Bass', color: '#s', midiGroup: 'lower' as const },
]

function idGen() {
  return createSequentialIdGenerator(1)
}

describe('realizeSketchStacksToNotes', () => {
  it('writes TTBB under melody notes covered by locked sketch', () => {
    const sketch: HarmonySketchSpan[] = [
      {
        id: 's1',
        startTick: 0,
        endTick: TAG_ROLL_PPQ * 2,
        rootPc: 0,
        quality: 'major',
        source: 'user',
        locked: true,
      },
    ]
    const melody: TagRollNote = {
      id: 'm1',
      partId: 'lead',
      midi: 60,
      startTick: 0,
      durationTicks: TAG_ROLL_PPQ,
    }
    const result = realizeSketchStacksToNotes({
      notes: [melody],
      parts,
      sketch,
      melodyPartId: 'lead',
      idGen: idGen(),
    })
    expect(result.applied).toBe(1)
    expect(result.spansUsed).toBe(1)
    const byPart = new Map(result.notes.map((n) => [n.partId, n]))
    expect(byPart.has('tenor')).toBe(true)
    expect(byPart.has('bari')).toBe(true)
    expect(byPart.has('bass')).toBe(true)
    expect(byPart.get('lead')!.midi).toBe(60)
    expect(byPart.get('bass')!.startTick).toBe(0)
    expect(byPart.get('bass')!.durationTicks).toBe(TAG_ROLL_PPQ)
  })

  it('skips unlocked / out-of-range sketch and respects spanIds filter', () => {
    const sketch: HarmonySketchSpan[] = [
      {
        id: 'draft',
        startTick: 0,
        endTick: TAG_ROLL_PPQ,
        rootPc: 0,
        quality: 'major',
        source: 'coach',
        locked: false,
      },
      {
        id: 'keep',
        startTick: TAG_ROLL_PPQ,
        endTick: TAG_ROLL_PPQ * 2,
        rootPc: 7,
        quality: 'seventh',
        source: 'user',
        locked: true,
      },
      {
        id: 'other',
        startTick: TAG_ROLL_PPQ * 2,
        endTick: TAG_ROLL_PPQ * 3,
        rootPc: 5,
        quality: 'major',
        source: 'user',
        locked: true,
      },
    ]
    const notes: TagRollNote[] = [
      {
        id: 'm0',
        partId: 'lead',
        midi: 60,
        startTick: 0,
        durationTicks: TAG_ROLL_PPQ / 2,
      },
      {
        id: 'm1',
        partId: 'lead',
        midi: 62,
        startTick: TAG_ROLL_PPQ,
        durationTicks: TAG_ROLL_PPQ / 2,
      },
      {
        id: 'm2',
        partId: 'lead',
        midi: 64,
        startTick: TAG_ROLL_PPQ * 2,
        durationTicks: TAG_ROLL_PPQ / 2,
      },
    ]
    const result = realizeSketchStacksToNotes({
      notes,
      parts,
      sketch,
      melodyPartId: 'lead',
      spanIds: ['keep'],
      idGen: idGen(),
    })
    expect(result.applied).toBe(1)
    expect(result.spansUsed).toBe(1)
    expect(result.notes.filter((n) => n.partId === 'bass')).toHaveLength(1)
    expect(result.notes.find((n) => n.partId === 'bass')!.startTick).toBe(TAG_ROLL_PPQ)
  })
})
