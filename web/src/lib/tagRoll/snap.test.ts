import { describe, expect, it } from 'vitest'
import {
  dottedDurationTicks,
  durationTicksForId,
  ensureLengthForNote,
  nearestDurationId,
  snapTick,
  stepDurationTicks,
  TAG_ROLL_DURATION_PRESETS,
  TAG_ROLL_HANDLE_CELL_W,
} from './snap'
import { TAG_ROLL_PPQ } from './types'

describe('tagRoll snap', () => {
  it('snaps ticks down into the containing grid cell', () => {
    expect(snapTick(0, 120)).toBe(0)
    expect(snapTick(59, 120)).toBe(0)
    expect(snapTick(60, 120)).toBe(0)
    expect(snapTick(119, 120)).toBe(0)
    expect(snapTick(120, 120)).toBe(120)
    expect(snapTick(130, 120)).toBe(120)
    expect(snapTick(-10, 120)).toBe(0)
  })

  it('maps duration presets including 32nd', () => {
    expect(durationTicksForId('quarter')).toBe(TAG_ROLL_PPQ)
    expect(durationTicksForId('sixteenth')).toBe(TAG_ROLL_PPQ / 4)
    expect(durationTicksForId('thirty-second')).toBe(TAG_ROLL_PPQ / 8)
    expect(nearestDurationId(TAG_ROLL_PPQ)).toBe('quarter')
    expect(nearestDurationId(TAG_ROLL_PPQ * 2 + 10)).toBe('half')
    expect(TAG_ROLL_DURATION_PRESETS).toHaveLength(6)
    expect(TAG_ROLL_HANDLE_CELL_W).toBe(24)
  })

  it('steps longer/shorter across presets', () => {
    expect(stepDurationTicks(TAG_ROLL_PPQ, 1)).toBe(TAG_ROLL_PPQ * 2) // quarter → half
    expect(stepDurationTicks(TAG_ROLL_PPQ, -1)).toBe(TAG_ROLL_PPQ / 2) // quarter → eighth
    expect(stepDurationTicks(TAG_ROLL_PPQ * 4, 1)).toBe(TAG_ROLL_PPQ * 4) // clamp at whole
    expect(stepDurationTicks(TAG_ROLL_PPQ / 8, -1)).toBe(TAG_ROLL_PPQ / 8) // clamp at 32nd
  })

  it('dots a duration by adding half its value', () => {
    expect(dottedDurationTicks(TAG_ROLL_PPQ * 2)).toBe(TAG_ROLL_PPQ * 3) // dotted half
    expect(dottedDurationTicks(TAG_ROLL_PPQ)).toBe(TAG_ROLL_PPQ + TAG_ROLL_PPQ / 2)
  })

  it('extends length by whole measures with padding', () => {
    const measure = TAG_ROLL_PPQ * 4
    expect(ensureLengthForNote(measure * 2, 0, TAG_ROLL_PPQ)).toBe(measure * 2)
    expect(ensureLengthForNote(measure, measure - 10, TAG_ROLL_PPQ)).toBeGreaterThan(measure)
    expect(ensureLengthForNote(measure, measure - 10, TAG_ROLL_PPQ) % measure).toBe(0)
  })
})
