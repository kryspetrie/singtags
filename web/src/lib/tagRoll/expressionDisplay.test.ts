import { describe, expect, it } from 'vitest'
import { fermataVisualCenterTick } from './expressionDisplay'
import { TAG_ROLL_PPQ } from './types'

describe('fermataVisualCenterTick', () => {
  it('centers over a note that starts at the fermata tick', () => {
    const notes = [{ startTick: 480, durationTicks: TAG_ROLL_PPQ }]
    expect(fermataVisualCenterTick(480, notes, TAG_ROLL_PPQ / 4)).toBe(480 + TAG_ROLL_PPQ / 2)
  })

  it('centers over the full held span when several start together', () => {
    const notes = [
      { startTick: 0, durationTicks: TAG_ROLL_PPQ * 2 },
      { startTick: 0, durationTicks: TAG_ROLL_PPQ / 2 },
    ]
    // Hold runs through the longest note — center of that span.
    expect(fermataVisualCenterTick(0, notes, TAG_ROLL_PPQ)).toBe(TAG_ROLL_PPQ)
  })

  it('centers over a spanning note when the mark is mid-note', () => {
    const notes = [{ startTick: 0, durationTicks: TAG_ROLL_PPQ * 4 }]
    expect(fermataVisualCenterTick(TAG_ROLL_PPQ, notes, TAG_ROLL_PPQ / 4)).toBe(
      TAG_ROLL_PPQ * 2,
    )
  })

  it('falls back to snap-cell center when no note is there', () => {
    const snap = TAG_ROLL_PPQ / 4
    expect(fermataVisualCenterTick(1000, [], snap)).toBe(1000 + snap / 2)
  })
})
