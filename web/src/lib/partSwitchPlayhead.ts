/**
 * Playhead behavior when switching between learning tracks of different length.
 */

/** Reset playhead when switching parts whose lengths differ by more than this (seconds). */
export const PART_SWITCH_DURATION_RESET_SEC = 0.5

/**
 * When learning tracks differ in length (common on non-recombinable / stereo_fallback
 * tags), keeping the prior playhead clamps oddly on the shorter file. Reset instead.
 */
export function shouldResetPlayheadOnPartSwitch(
  previousDurationSec: number,
  nextDurationSec: number,
  thresholdSec: number = PART_SWITCH_DURATION_RESET_SEC,
): boolean {
  if (!(previousDurationSec > 0) || !(nextDurationSec > 0)) return false
  return Math.abs(nextDurationSec - previousDurationSec) > thresholdSec
}
