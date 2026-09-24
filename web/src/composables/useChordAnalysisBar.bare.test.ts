/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { createEmptyTagRollProject } from '../lib/tagRoll/normalize'
import { bareMelodyMomentsFromTag } from './useChordAnalysisBar'

describe('bareMelodyMomentsFromTag', () => {
  it('clips held lead at the next TBB onset (analysis windows, not note splits)', () => {
    const p = createEmptyTagRollProject({ title: 'held' })
    const lead = p.parts.find((x) => x.name === 'Lead')!
    const bass = p.parts.find((x) => x.name === 'Bass')!
    p.notes = [
      { id: 'L', partId: lead.id, midi: 60, startTick: 0, durationTicks: 1920 },
      { id: 'B1', partId: bass.id, midi: 48, startTick: 960, durationTicks: 480 },
      { id: 'B2', partId: bass.id, midi: 50, startTick: 1440, durationTicks: 480 },
    ]
    const bare = bareMelodyMomentsFromTag(p)
    expect(bare).toEqual([{ startTick: 0, durationTicks: 960, midi: 60 }])
  })

  it('defers lead portamento so the destination defines the chord at source release', () => {
    const p = createEmptyTagRollProject({ title: 'porta' })
    const lead = p.parts.find((x) => x.name === 'Lead')!
    // Mar → lene bend: destination starts early; musical onset is at Mar’s end (1920 = M2).
    p.notes = [
      { id: 'mar', partId: lead.id, midi: 55, startTick: 1440, durationTicks: 480 },
      { id: 'lene', partId: lead.id, midi: 60, startTick: 1680, durationTicks: 2160 },
    ]
    const bare = bareMelodyMomentsFromTag(p)
    expect(bare).toEqual([
      { startTick: 1440, durationTicks: 480, midi: 55 },
      { startTick: 1920, durationTicks: 1920, midi: 60 },
    ])
  })
})
