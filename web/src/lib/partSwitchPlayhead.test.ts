import { describe, expect, it } from 'vitest'
import {
  PART_SWITCH_DURATION_RESET_SEC,
  shouldResetPlayheadOnPartSwitch,
} from './partSwitchPlayhead'

describe('shouldResetPlayheadOnPartSwitch', () => {
  it('keeps playhead when durations are within the threshold', () => {
    expect(shouldResetPlayheadOnPartSwitch(30, 30.4)).toBe(false)
    expect(shouldResetPlayheadOnPartSwitch(30, 30)).toBe(false)
    expect(shouldResetPlayheadOnPartSwitch(30, 29.6)).toBe(false)
  })

  it('resets when durations differ by more than 0.5s', () => {
    expect(shouldResetPlayheadOnPartSwitch(30, 30.51)).toBe(true)
    expect(shouldResetPlayheadOnPartSwitch(12, 8)).toBe(true)
    expect(PART_SWITCH_DURATION_RESET_SEC).toBe(0.5)
  })

  it('does not reset when either duration is unknown', () => {
    expect(shouldResetPlayheadOnPartSwitch(0, 30)).toBe(false)
    expect(shouldResetPlayheadOnPartSwitch(30, 0)).toBe(false)
  })
})
