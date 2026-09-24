import { describe, expect, it } from 'vitest'
import {
  addPillarAtTick,
  extendPillarToCover,
  lockRemainingPillars,
  melodyGapsOutsidePillars,
  suggestPillars,
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

  it('melodyGapsOutsidePillars uses portamento-deferred onsets', () => {
    // Destination starts early for the bend; musical onset is at predecessor release (480).
    const pillars: Pillar[] = [
      {
        id: 'p1',
        rootPc: 0,
        startTick: 0,
        endTick: 960,
        source: 'user',
        confirmed: true,
      },
    ]
    const gaps = melodyGapsOutsidePillars(
      [
        { ...mel('a', 0), durationTicks: 480 },
        { ...mel('b', 240), durationTicks: 720 }, // overlaps a; deferred start = 480
      ],
      pillars,
    )
    expect(gaps.map((g) => g.id)).toEqual([])
    const gaps2 = melodyGapsOutsidePillars(
      [
        { ...mel('a', 0), durationTicks: 480 },
        { ...mel('b', 240), durationTicks: 720 },
      ],
      [
        {
          id: 'p1',
          rootPc: 0,
          startTick: 0,
          endTick: 240,
          source: 'user',
          confirmed: true,
        },
      ],
    )
    expect(gaps2.map((g) => ({ id: g.id, start: g.startTick }))).toEqual([
      { id: 'b', start: 480 },
    ])
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

  it('suggestPillars keeps one span per measure (no whole-chart merge)', () => {
    const melody: MelodyEvent[] = [mel('a', 0), mel('b', 1920), mel('c', 3840)]
    // All C (tonic) — previously merged into one 0→5760 pillar.
    const tips = suggestPillars({
      melody: melody.map((m) => ({ ...m, midi: 60 })),
      tonality: 0,
      measureTicks: 1920,
    })
    expect(tips.length).toBeGreaterThanOrEqual(3)
    expect(tips.every((t) => t.endTick - t.startTick === 1920)).toBe(true)
  })
})
