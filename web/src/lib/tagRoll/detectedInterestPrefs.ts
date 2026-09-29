/**
 * Persist Detected-lane interest (Basic / Mild / Bold).
 */
export type DetectedInterestLevel = 'basic' | 'mild' | 'bold'

const KEY = 'singtags.tagRoll.detectedInterest.v1'

export function isDetectedInterestLevel(v: unknown): v is DetectedInterestLevel {
  return v === 'basic' || v === 'mild' || v === 'bold'
}

export function loadDetectedInterest(
  fallback: DetectedInterestLevel = 'mild',
): DetectedInterestLevel {
  try {
    const v = localStorage.getItem(KEY)
    if (isDetectedInterestLevel(v)) return v
  } catch {
    /* ignore — SSR / private mode */
  }
  return fallback
}

export function saveDetectedInterest(level: DetectedInterestLevel): void {
  try {
    localStorage.setItem(KEY, level)
  } catch {
    /* ignore */
  }
}
