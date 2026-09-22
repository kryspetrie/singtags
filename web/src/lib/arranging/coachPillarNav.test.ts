/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { nextPillarIndex, sortPillarsByTime } from './coachPillarNav'

describe('coachPillarNav', () => {
  const pillars = [
    { id: 'b', startTick: 1920, endTick: 3840 },
    { id: 'a', startTick: 0, endTick: 1920 },
  ]

  it('sorts by startTick', () => {
    expect(sortPillarsByTime(pillars).map((p) => p.id)).toEqual(['a', 'b'])
  })

  it('steps forward and wraps', () => {
    const sorted = sortPillarsByTime(pillars)
    expect(nextPillarIndex(sorted, 'a', 1)).toBe(1)
    expect(nextPillarIndex(sorted, 'b', 1)).toBe(0)
  })

  it('uses playhead when nothing selected', () => {
    const sorted = sortPillarsByTime(pillars)
    expect(nextPillarIndex(sorted, null, 1, 2000)).toBe(0) // at b → next wraps to a
    expect(nextPillarIndex(sorted, null, -1, 100)).toBe(1) // at a → prev wraps to b
  })
})
