/**
 * Smooth-jumps switch for Fill parts, which parts a manual pass locks,
 * and whether the melody line stays put.
 * Missing storage means Fill smoothing stays on and the melody stays locked.
 */
const ON_KEY = 'singtags.tagRoll.medianJumpOnFill.v1'
const HOLD_KEY = 'singtags.tagRoll.medianJumpHold.v1'
const MELODY_KEY = 'singtags.tagRoll.medianJumpLockMelody.v1'

export function medianJumpOnFill(): boolean {
  try {
    return localStorage.getItem(ON_KEY) !== '0'
  } catch {
    return true
  }
}

export function setMedianJumpOnFill(on: boolean): void {
  try {
    localStorage.setItem(ON_KEY, on ? '1' : '0')
  } catch {
    /* private mode */
  }
}

/** null = no saved part locks. Melody locking is separate. */
export function loadHeldPartNames(): string[] | null {
  try {
    const raw = localStorage.getItem(HOLD_KEY)
    if (raw == null) return null
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return null
    return parsed.filter((name): name is string => typeof name === 'string')
  } catch {
    return null
  }
}

export function saveHeldPartNames(names: readonly string[]): void {
  try {
    localStorage.setItem(HOLD_KEY, JSON.stringify([...names]))
  } catch {
    /* private mode */
  }
}

/** Missing key locks the melody. A stored "0" leaves the tune free to move. */
export function loadLockMelody(): boolean {
  try {
    return localStorage.getItem(MELODY_KEY) !== '0'
  } catch {
    return true
  }
}

export function saveLockMelody(on: boolean): void {
  try {
    localStorage.setItem(MELODY_KEY, on ? '1' : '0')
  } catch {
    /* private mode */
  }
}
