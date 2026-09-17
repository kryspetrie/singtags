import { describe, expect, it } from 'vitest'
import {
  durationTicksForId,
  ensureLengthForNote,
  nearestDurationId,
  snapTick,
  TAG_ROLL_DURATION_PRESETS,
  TAG_ROLL_HANDLE_CELL_W,
} from './snap'
import { TAG_ROLL_PPQ } from './types'

describe('tagRoll snap', () => {
  it('snaps ticks to the grid', () => {
    expect(snapTick(0, 120)).toBe(0)
    expect(snapTick(59, 120)).toBe(0)
    expect(snapTick(60, 120)).toBe(120)
    expect(snapTick(130, 120)).toBe(120)
    expect(snapTick(-10, 120)).toBe(0)
  })

  it('maps duration presets', () => {
    expect(durationTicksForId('quarter')).toBe(TAG_ROLL_PPQ)
    expect(durationTicksForId('sixteenth')).toBe(TAG_ROLL_PPQ / 4)
    expect(nearestDurationId(TAG_ROLL_PPQ)).toBe('quarter')
    expect(nearestDurationId(TAG_ROLL_PPQ * 2 + 10)).toBe('half')
    expect(TAG_ROLL_DURATION_PRESETS).toHaveLength(5)
    expect(TAG_ROLL_HANDLE_CELL_W).toBe(24)
  })

  it('extends length by whole measures with padding', () => {
    const measure = TAG_ROLL_PPQ * 4
    expect(ensureLengthForNote(measure * 2, 0, TAG_ROLL_PPQ)).toBe(measure * 2)
    // note near end needs another measure of padding
    expect(ensureLengthForNote(measure, measure - 10, TAG_ROLL_PPQ)).toBeGreaterThan(measure)
    expect(ensureLengthForNote(measure, measure - 10, TAG_ROLL_PPQ) % measure).toBe(0)
  })
})
