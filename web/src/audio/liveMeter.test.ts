/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi } from 'vitest'
import {
  advancePeakHold,
  dbToLinear,
  dbToMeterRatio,
  linearToDb,
  LIVE_METER_CLIP_LINEAR,
  LIVE_METER_FLOOR_DB,
} from './liveMeter'

describe('liveMeter dB helpers', () => {
  it('maps linear peak to dBFS', () => {
    expect(linearToDb(1)).toBeCloseTo(0, 5)
    expect(linearToDb(0.5)).toBeCloseTo(-6.02, 1)
    expect(linearToDb(0)).toBe(LIVE_METER_FLOOR_DB)
  })

  it('maps meter fill so 0 dBFS is full and floor is empty', () => {
    expect(dbToMeterRatio(0)).toBeCloseTo(1, 5)
    expect(dbToMeterRatio(LIVE_METER_FLOOR_DB)).toBeCloseTo(0, 5)
    expect(dbToMeterRatio(-30)).toBeGreaterThan(0.4)
    expect(dbToMeterRatio(-30)).toBeLessThan(0.6)
  })

  it('round-trips linear near clip threshold', () => {
    const lin = LIVE_METER_CLIP_LINEAR
    expect(dbToLinear(linearToDb(lin))).toBeCloseTo(lin, 4)
  })
})

describe('advancePeakHold', () => {
  it('jumps up immediately on louder peaks', () => {
    const next = advancePeakHold({
      holdLinear: 0.2,
      peakLinear: 0.8,
      holdMsRemaining: 0,
      dtMs: 16,
    })
    expect(next.holdLinear).toBe(0.8)
    expect(next.holdMsRemaining).toBeGreaterThan(0)
  })

  it('stays sticky then decays', () => {
    const held = advancePeakHold({
      holdLinear: 1,
      peakLinear: 0.1,
      holdMsRemaining: 500,
      dtMs: 100,
    })
    expect(held.holdLinear).toBe(1)
    expect(held.holdMsRemaining).toBe(400)

    const decayed = advancePeakHold({
      holdLinear: 1,
      peakLinear: 0.1,
      holdMsRemaining: 0,
      dtMs: 100,
      decayDbPerSec: 20,
    })
    expect(decayed.holdLinear).toBeLessThan(1)
    expect(decayed.holdLinear).toBeGreaterThan(0.1)
  })
})
