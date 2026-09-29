/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, beforeEach } from 'vitest'
import {
  clearDetectedScoreTweaks,
  loadDetectedScoreTweaks,
  saveDetectedScoreTweaks,
} from './detectedScoreTweaksPrefs'
import { DEFAULT_DETECTED_SCORE_TWEAKS } from '../../domain/arranging/detectedScoreTweaks'

describe('detectedScoreTweaksPrefs', () => {
  beforeEach(() => {
    clearDetectedScoreTweaks()
  })

  it('returns defaults when empty', () => {
    expect(loadDetectedScoreTweaks().mild).toEqual(DEFAULT_DETECTED_SCORE_TWEAKS.mild)
  })

  it('round-trips saved tweaks', () => {
    const next = {
      ...DEFAULT_DETECTED_SCORE_TWEAKS,
      mild: { ...DEFAULT_DETECTED_SCORE_TWEAKS.mild, ii7CircleBoost: 99 },
    }
    saveDetectedScoreTweaks(next)
    expect(loadDetectedScoreTweaks().mild.ii7CircleBoost).toBe(99)
  })

  it('normalizes corrupt JSON to defaults', () => {
    localStorage.setItem('singtags.tagRoll.detectedScoreTweaks.v1', '{not-json')
    expect(loadDetectedScoreTweaks().mild.ii7CircleBoost).toBe(
      DEFAULT_DETECTED_SCORE_TWEAKS.mild.ii7CircleBoost,
    )
  })
})
