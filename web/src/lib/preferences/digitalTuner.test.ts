/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, beforeEach } from 'vitest'
import {
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
    prefs.tuneDisplay = 'strobe'
    saveDigitalTunerPrefs(prefs)
    expect(localStorage.getItem(DIGITAL_TUNER_PREFS_KEY)).toBeTruthy()
    const loaded = loadDigitalTunerPrefs()
    expect(loaded.inTuneWindowCents).toBe(8)
    expect(loaded.tuneDisplay).toBe('strobe')
  })
})
