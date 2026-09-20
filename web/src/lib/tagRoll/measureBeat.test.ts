import { describe, expect, it } from 'vitest'
import {
  formatDurationBeats,
  formatMeasureBeat,
  nextMeasureTick,
  prevMeasureTick,
  tickToMeasureBeat,
} from './measureBeat'
import { TAG_ROLL_PPQ } from './types'

const fourFour = { numerator: 4, denominator: 4 }

describe('measureBeat', () => {
  it('maps tick 0 to 1:1', () => {
    expect(tickToMeasureBeat(0, fourFour)).toEqual({ measure: 1, beat: 1 })
    expect(formatMeasureBeat(0, fourFour)).toBe('1:1')
  })

  it('advances beats and measures in 4/4', () => {
    expect(tickToMeasureBeat(TAG_ROLL_PPQ, fourFour)).toEqual({ measure: 1, beat: 2 })
    expect(tickToMeasureBeat(TAG_ROLL_PPQ * 4, fourFour)).toEqual({ measure: 2, beat: 1 })
    expect(formatMeasureBeat(TAG_ROLL_PPQ * 5, fourFour)).toBe('2:2')
  })

  it('formats duration in beats', () => {
    expect(formatDurationBeats(TAG_ROLL_PPQ, fourFour)).toBe('1')
    expect(formatDurationBeats(TAG_ROLL_PPQ / 2, fourFour)).toBe('0.5')
  })

  it('jumps measure boundaries', () => {
    const bar = TAG_ROLL_PPQ * 4
    expect(prevMeasureTick(bar + 10, fourFour)).toBe(bar)
    expect(prevMeasureTick(bar, fourFour)).toBe(0)
    expect(nextMeasureTick(0, fourFour, bar * 8)).toBe(bar)
    expect(nextMeasureTick(bar - 1, fourFour, bar * 8)).toBe(bar)
    expect(nextMeasureTick(bar * 8, fourFour, bar * 8)).toBe(bar * 8)
  })
})
