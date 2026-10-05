/**
 * Persist Sketch / Detected “include Lead note in voicing” toggles.
 * When off, audition uses closed catalog inversions (synthetic lead) instead of
 * forcing the melody pitch into the lead slot.
 */
const SKETCH_KEY = 'singtags.tagRoll.sketchLockLeadVoicing.v1'
const DETECTED_KEY = 'singtags.tagRoll.detectedLockLeadVoicing.v1'

function loadBool(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key)
    if (v === '0' || v === 'false') return false
    if (v === '1' || v === 'true') return true
  } catch {
    /* ignore — SSR / private mode */
  }
  return fallback
}

function saveBool(key: string, on: boolean): void {
  try {
    localStorage.setItem(key, on ? '1' : '0')
  } catch {
    /* ignore */
  }
}

/** Default on — match prior Sketch/Detected hear behavior. */
export function loadSketchLockLeadVoicing(fallback = true): boolean {
  return loadBool(SKETCH_KEY, fallback)
}

export function saveSketchLockLeadVoicing(on: boolean): void {
  saveBool(SKETCH_KEY, on)
}

export function loadDetectedLockLeadVoicing(fallback = true): boolean {
  return loadBool(DETECTED_KEY, fallback)
}

export function saveDetectedLockLeadVoicing(on: boolean): void {
  saveBool(DETECTED_KEY, on)
}
