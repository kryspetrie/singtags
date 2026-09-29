/**
 * Persist Detected scoring Tweaks (JSON) in localStorage.
 */
import {
  DEFAULT_DETECTED_SCORE_TWEAKS,
  normalizeDetectedScoreTweaks,
  type DetectedScoreTweaks,
} from '../../domain/arranging/detectedScoreTweaks'

const KEY = 'singtags.tagRoll.detectedScoreTweaks.v1'

export function loadDetectedScoreTweaks(
  fallback: DetectedScoreTweaks = DEFAULT_DETECTED_SCORE_TWEAKS,
): DetectedScoreTweaks {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...fallback, mild: { ...fallback.mild }, bold: { ...fallback.bold }, held: { ...fallback.held } }
    return normalizeDetectedScoreTweaks(JSON.parse(raw))
  } catch {
    return {
      ...fallback,
      mild: { ...fallback.mild },
      bold: { ...fallback.bold },
      held: { ...fallback.held },
    }
  }
}

export function saveDetectedScoreTweaks(tweaks: DetectedScoreTweaks): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(normalizeDetectedScoreTweaks(tweaks)))
  } catch {
    /* ignore */
  }
}

export function clearDetectedScoreTweaks(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}
