/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it } from 'vitest'
import {
  loadDetectedLockLeadVoicing,
  loadSketchLockLeadVoicing,
  saveDetectedLockLeadVoicing,
  saveSketchLockLeadVoicing,
} from './leadLockVoicingPrefs'

describe('leadLockVoicingPrefs', () => {
  afterEach(() => {
    localStorage.removeItem('singtags.tagRoll.sketchLockLeadVoicing.v1')
    localStorage.removeItem('singtags.tagRoll.detectedLockLeadVoicing.v1')
  })

  it('defaults Sketch and Detected Lead-lock to on', () => {
    expect(loadSketchLockLeadVoicing()).toBe(true)
    expect(loadDetectedLockLeadVoicing()).toBe(true)
  })

  it('persists Sketch and Detected independently', () => {
    saveSketchLockLeadVoicing(false)
    saveDetectedLockLeadVoicing(true)
    expect(loadSketchLockLeadVoicing()).toBe(false)
    expect(loadDetectedLockLeadVoicing()).toBe(true)
    saveDetectedLockLeadVoicing(false)
    expect(loadSketchLockLeadVoicing()).toBe(false)
    expect(loadDetectedLockLeadVoicing()).toBe(false)
  })
})
