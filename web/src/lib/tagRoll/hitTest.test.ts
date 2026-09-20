import { describe, expect, it } from 'vitest'
import { pickPreferredHit } from './hitTest'
import type { TagRollNote } from './types'

const notes: TagRollNote[] = [
  { id: 'a', partId: 'lead', midi: 60, startTick: 0, durationTicks: 480 },
  { id: 'b', partId: 'bass', midi: 48, startTick: 0, durationTicks: 240 },
  { id: 'c', partId: 'lead', midi: 64, startTick: 0, durationTicks: 120 },
]

describe('pickPreferredHit', () => {
  it('prefers the active part', () => {
    const hit = pickPreferredHit([notes[0]!, notes[1]!], notes, 'bass')
    expect(hit?.id).toBe('b')
  })

  it('prefers the shortest note when parts tie', () => {
    const hit = pickPreferredHit([notes[0]!, notes[2]!], notes, 'lead')
    expect(hit?.id).toBe('c')
  })

  it('prefers later notes when area ties', () => {
    const same: TagRollNote[] = [
      { id: 'x', partId: 'lead', midi: 60, startTick: 0, durationTicks: 240 },
      { id: 'y', partId: 'lead', midi: 62, startTick: 0, durationTicks: 240 },
    ]
    expect(pickPreferredHit(same, same, 'lead')?.id).toBe('y')
  })
})
