import { describe, expect, it } from 'vitest'
import {
  addPillarAtTick,
  extendPillarToCover,
  lockRemainingPillars,
  melodyGapsOutsidePillars,
  suggestionsToPillars,
  type PillarSuggestion,
} from './pillars'
import type { MelodyEvent, Pillar } from './types'

const mel = (id: string, start: number): MelodyEvent => ({
  id,
  midi: 60,
  startTick: start,
  durationTicks: 240,
  role: 'pmn',
})

describe('pillar ops', () => {
  it('suggestionsToPillars copies reason/confidence', () => {
    const s: PillarSuggestion[] = [
      { rootPc: 0, startTick: 0, endTick: 1920, confidence: 2, reason: 'strong coverage' },
    ]
    const p = suggestionsToPillars(s)
    expect(p[0]!.reason).toBe('strong coverage')
    expect(p[0]!.confidence).toBe(2)
  })

  it('melodyGapsOutsidePillars finds uncovered notes', () => {
    const pillars: Pillar[] = [
      {
        id: 'p1',
        rootPc: 0,
        startTick: 0,
        endTick: 480,
        source: 'inferred',
        confirmed: false,
      },
    ]
    const gaps = melodyGapsOutsidePillars([mel('a', 0), mel('b', 480), mel('c', 960)], pillars)
    expect(gaps.map((g) => g.id)).toEqual(['b', 'c'])
  })

  it('addPillarAtTick trims overlaps', () => {
    const pillars: Pillar[] = [
      {
        id: 'p1',
        rootPc: 0,
        startTick: 0,
        endTick: 1920,
        source: 'inferred',
        confirmed: false,
      },
    ]
    const next = addPillarAtTick(pillars, 480, { rootPc: 7, endTick: 960, id: 'p2' })
    expect(next).toHaveLength(3)
    expect(next[0]).toMatchObject({ id: 'p1', startTick: 0, endTick: 480 })
    expect(next[1]).toMatchObject({ id: 'p2', startTick: 480, endTick: 960, rootPc: 7 })
    expect(next[2]).toMatchObject({ startTick: 960, endTick: 1920 })
    expect(next[2]!.id).not.toBe('p1')
    expect(next[2]!.id).not.toBe('p2')
  })

  it('extendPillarToCover absorbs neighbors', () => {
    const pillars: Pillar[] = [
      { id: 'a', rootPc: 0, startTick: 0, endTick: 480, source: 'user', confirmed: true },
      { id: 'b', rootPc: 5, startTick: 480, endTick: 960, source: 'user', confirmed: false },
    ]
    const next = extendPillarToCover(pillars, 'a', 500)
    expect(next).toHaveLength(1)
    expect(next[0]).toMatchObject({ id: 'a', startTick: 0, endTick: 960 })
  })

  it('lockRemainingPillars no-ops until one locked', () => {
    const pillars: Pillar[] = [
      { id: 'a', rootPc: 0, startTick: 0, endTick: 480, source: 'inferred', confirmed: false },
    ]
    expect(lockRemainingPillars(pillars)[0]!.confirmed).toBe(false)
    const one = lockRemainingPillars([{ ...pillars[0]!, confirmed: true }, { ...pillars[0]!, id: 'b', confirmed: false }])
    expect(one.every((p) => p.confirmed)).toBe(true)
  })
})
