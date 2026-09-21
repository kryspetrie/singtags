import { describe, expect, it } from 'vitest'
import {
  bakeSwingIntoNotes,
  swingPairTicks,
  swingPerformanceTick,
  swingScoreTickRate,
  swingSplitRatio,
  swingUnitTicks,
  TAG_ROLL_DEFAULT_SWING,
  TAG_ROLL_SWING_SHUFFLE_AMOUNT,
  wallSecondsAtScoreTick,
} from './swingMap'
import { TAG_ROLL_PPQ, type TagRollNote, type TagRollSwing } from './types'

const ts = { numerator: 4, denominator: 4 }

function swing(partial: Partial<TagRollSwing>): TagRollSwing {
  return { ...TAG_ROLL_DEFAULT_SWING, ...partial }
}

describe('swingMap', () => {
  it('amount 0 / disabled is identity', () => {
    const s = swing({ enabled: true, amount: 0 })
    expect(swingPerformanceTick(240, s, ts)).toBe(240)
    expect(swingPerformanceTick(240, TAG_ROLL_DEFAULT_SWING, ts)).toBe(240)
  })

  it('eighth pair is one quarter; sixteenth pair is one eighth', () => {
    expect(swingUnitTicks('eighth', ts)).toBe(TAG_ROLL_PPQ / 2)
    expect(swingPairTicks('eighth', ts)).toBe(TAG_ROLL_PPQ)
    expect(swingUnitTicks('sixteenth', ts)).toBe(TAG_ROLL_PPQ / 4)
    expect(swingPairTicks('sixteenth', ts)).toBe(TAG_ROLL_PPQ / 2)
  })

  it('full triplet shuffle places the offbeat at 2/3 of the pair', () => {
    const s = swing({ enabled: true, style: 'triplet', amount: 1, unit: 'eighth' })
    expect(swingSplitRatio(s)).toBeCloseTo(2 / 3, 6)
    const off = TAG_ROLL_PPQ / 2
    expect(swingPerformanceTick(off, s, ts)).toBeCloseTo((2 / 3) * TAG_ROLL_PPQ, 5)
  })

  it('shuffle notch matches classic amount', () => {
    const s = swing({
      enabled: true,
      style: 'triplet',
      amount: TAG_ROLL_SWING_SHUFFLE_AMOUNT,
      unit: 'eighth',
    })
    const r = swingSplitRatio(s)
    expect(r).toBeGreaterThan(0.5)
    expect(r).toBeLessThan(2 / 3)
  })

  it('wall-clock at pair endpoints matches straight seconds', () => {
    const s = swing({ enabled: true, style: 'triplet', amount: 1, unit: 'eighth' })
    const straight = (t: number) => t / TAG_ROLL_PPQ // 1 beat per second @ 60bpm-ish units
    expect(wallSecondsAtScoreTick(0, s, straight, ts)).toBe(0)
    expect(wallSecondsAtScoreTick(TAG_ROLL_PPQ, s, straight, ts)).toBe(1)
    const mid = wallSecondsAtScoreTick(TAG_ROLL_PPQ / 2, s, straight, ts)
    expect(mid).toBeCloseTo(2 / 3, 5)
  })

  it('bake moves even 8th later and keeps duration coherent', () => {
    const s = swing({ enabled: true, style: 'triplet', amount: 1, unit: 'eighth' })
    const notes: TagRollNote[] = [
      {
        id: 'a',
        partId: 'p',
        midi: 60,
        startTick: 0,
        durationTicks: TAG_ROLL_PPQ / 2,
      },
      {
        id: 'b',
        partId: 'p',
        midi: 62,
        startTick: TAG_ROLL_PPQ / 2,
        durationTicks: TAG_ROLL_PPQ / 2,
      },
    ]
    const baked = bakeSwingIntoNotes(notes, s, ts)
    expect(baked[0]!.startTick).toBe(0)
    expect(baked[0]!.durationTicks).toBe(Math.round((2 / 3) * TAG_ROLL_PPQ))
    expect(baked[1]!.startTick).toBe(Math.round((2 / 3) * TAG_ROLL_PPQ))
    expect(baked[1]!.startTick + baked[1]!.durationTicks).toBe(TAG_ROLL_PPQ)
  })

  it('score tick rate slows in the long half and speeds in the short', () => {
    const s = swing({ enabled: true, style: 'triplet', amount: 1, unit: 'eighth' })
    const first = swingScoreTickRate(0, s, ts)
    const second = swingScoreTickRate(TAG_ROLL_PPQ / 2, s, ts)
    expect(first).toBeLessThan(1)
    expect(second).toBeGreaterThan(1)
    // Over one pair, rates should average to ~1 in tick-space proportions.
    expect(1 / first + 1 / second).toBeCloseTo(2, 5)
  })
})
