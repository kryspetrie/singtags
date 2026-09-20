import { describe, expect, it } from 'vitest'
import { hitExpressionAtX, hitTempoMarkerAtX } from './expressionLaneHitTest'
import { beatsToTicks, ticksToBeats, ticksToBeatsDisplay } from './expressionBeats'
import { TAG_ROLL_PPQ } from './types'

describe('expressionLaneHitTest', () => {
  const xAtTick = (tick: number) => tick / 10

  it('hits nearest tempo marker within slop', () => {
    const markers = [
      { id: 'a', tick: 0, bpm: 104 },
      { id: 'b', tick: 480, bpm: 120 },
    ]
    expect(hitTempoMarkerAtX(markers, 48, xAtTick)?.id).toBe('b')
    expect(hitTempoMarkerAtX(markers, 100, xAtTick)).toBeNull()
  })

  it('prefers later expressions and fermata body hits', () => {
    const exprs = [
      { id: 'r', kind: 'rit' as const, startTick: 0, endTick: 480, startBpm: 120, endBpm: 90 },
      { id: 'f', kind: 'fermata' as const, tick: 240, holdTicks: 480, gapTicks: 0 },
    ]
    expect(hitExpressionAtX(exprs, 24, xAtTick)?.expr.id).toBe('f')
    expect(hitExpressionAtX(exprs, 0, xAtTick)?.edge).toBe('start')
    expect(hitExpressionAtX(exprs, 48, xAtTick)?.edge).toBe('end')
  })
})

describe('expressionBeats', () => {
  it('converts ticks and beats', () => {
    expect(ticksToBeats(TAG_ROLL_PPQ)).toBe(1)
    expect(beatsToTicks(1.5)).toBe(Math.round(1.5 * TAG_ROLL_PPQ))
    expect(ticksToBeatsDisplay(TAG_ROLL_PPQ / 2)).toBe(0.5)
  })
})
