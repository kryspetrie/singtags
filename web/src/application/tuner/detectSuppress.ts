/**
 * Pure detect-suppress gate — while a reference tone plays, live F0 should pause.
 */

export type DetectSuppressState = {
  /** True while any reference tone (pipe / piano / sine click) is sounding. */
  suppressed: boolean
  /** Optional reason for UI copy. */
  reason: 'tone' | 'manual' | null
}

export function createDetectSuppressState(): DetectSuppressState {
  return { suppressed: false, reason: null }
}

/** Begin suppressing detection (reference tone started). */
export function beginDetectSuppress(
  _state: DetectSuppressState,
  reason: DetectSuppressState['reason'] = 'tone',
): DetectSuppressState {
  return { suppressed: true, reason }
}

/** End suppressing detection (tone stopped). */
export function endDetectSuppress(state: DetectSuppressState): DetectSuppressState {
  if (!state.suppressed) return state
  return { suppressed: false, reason: null }
}
