/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, beforeEach } from 'vitest'
import {
  clampDetectionThreshold,
  defaultDigitalTunerPrefs,
  normalizeDigitalTunerPrefs,
  saveDigitalTunerPrefs,
  loadDigitalTunerPrefs,
} from './digitalTuner'
import { DIGITAL_TUNER_PREFS_KEY } from './keys'

describe('digitalTuner prefs', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('normalizes corrupt values to safe defaults', () => {
    const n = normalizeDigitalTunerPrefs({
      fftSize: 999,
      historyCapSec: 99,
      inTuneWindowCents: -3,
      customOffsetsCents: [1, 2],
      a4Hz: 'nope',
      keyPc: 15,
    })
    expect(n.fftSize).toBe(4096)
    expect(n.historyCapSec).toBe(30)
    expect(n.inTuneWindowCents).toBe(1)
    expect(n.customOffsetsCents).toHaveLength(12)
    expect(n.a4Hz).toBe('followPitchPipe')
    expect(n.keyPc).toBe(3)
  })

  it('round-trips through localStorage', () => {
    const prefs = defaultDigitalTunerPrefs()
    prefs.inTuneWindowCents = 8
    prefs.tuneDisplay = 'scope'
    prefs.detectionThreshold = 0.7
    saveDigitalTunerPrefs(prefs)
    expect(localStorage.getItem(DIGITAL_TUNER_PREFS_KEY)).toBeTruthy()
    const loaded = loadDigitalTunerPrefs()
    expect(loaded.inTuneWindowCents).toBe(8)
    expect(loaded.tuneDisplay).toBe('scope')
    expect(loaded.detectionThreshold).toBe(0.7)
  })

  it('clamps detection threshold', () => {
    expect(clampDetectionThreshold(0.01)).toBe(0.15)
    expect(clampDetectionThreshold(2)).toBe(0.9)
    expect(normalizeDigitalTunerPrefs({ detectionThreshold: 0.62 }).detectionThreshold).toBe(0.62)
  })

  it('defaults multi-F0 salience independently of clarity', () => {
    const n = normalizeDigitalTunerPrefs({ detectionThreshold: 0.8 })
    expect(n.detectionThreshold).toBe(0.8)
    expect(n.multiF0SalienceFloor).toBe(0.35)
    expect(
      normalizeDigitalTunerPrefs({ multiF0SalienceFloor: 0.5 }).multiF0SalienceFloor,
    ).toBe(0.5)
  })

  it('normalizes session / strobe / staff prefs', () => {
    const n = normalizeDigitalTunerPrefs({
      strobeStyle: 'radial',
      sessionStripEnabled: false,
      staffClef: 'bass',
      analyzeSurface: 'harmonics',
    })
    expect(n.strobeStyle).toBe('radial')
    expect(n.sessionStripEnabled).toBe(false)
    expect(n.staffClef).toBe('bass')
    expect(n.analyzeSurface).toBe('harmonics')
  })

  it('accepts full hearing pitch range and syncs Spec band', () => {
    const n = normalizeDigitalTunerPrefs({
      pitchRangeId: 'hearing',
      pitchFMinHz: 20,
      pitchFMaxHz: 20_000,
    })
    expect(n.pitchRangeId).toBe('hearing')
    expect(n.pitchFMinHz).toBe(20)
    expect(n.pitchFMaxHz).toBe(20_000)
    expect(n.specFMinHz).toBe(20)
    expect(n.specFMaxHz).toBe(20_000)
  })
})
