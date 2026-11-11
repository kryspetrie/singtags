import { describe, expect, it } from 'vitest'
import {
  classifyInTuneZone,
  createInTuneZoneAccumulator,
  holdInTuneProgress,
  inTuneZonePercents,
  pushInTuneZoneSample,
  resetInTuneZoneAccumulator,
} from './inTuneZones'

const opts = { windowCents: 10, nearMult: 2, clarityMin: 0.4, silenceResetMs: 2000 }

describe('inTuneZones', () => {
  it('classifies in / near / far / none', () => {
    expect(classifyInTuneZone(0, 0.8, opts)).toBe('in')
    expect(classifyInTuneZone(10, 0.8, opts)).toBe('in')
    expect(classifyInTuneZone(15, 0.8, opts)).toBe('near')
    expect(classifyInTuneZone(25, 0.8, opts)).toBe('far')
    expect(classifyInTuneZone(0, 0.2, opts)).toBe('none')
    expect(classifyInTuneZone(null, 0.9, opts)).toBe('none')
  })

  it('accumulates zone time and reports percents', () => {
    const acc = createInTuneZoneAccumulator()
    pushInTuneZoneSample(acc, { tMs: 0, cents: 0, clarity: 0.9 }, opts)
    pushInTuneZoneSample(acc, { tMs: 100, cents: 0, clarity: 0.9 }, opts)
    pushInTuneZoneSample(acc, { tMs: 200, cents: 15, clarity: 0.9 }, opts)
    pushInTuneZoneSample(acc, { tMs: 300, cents: 30, clarity: 0.9 }, opts)
    // dt attributed to previous zone: 100 in + 100 near + 100 far (pending) —
    // last sample sets zone but needs another tick to credit far.
    pushInTuneZoneSample(acc, { tMs: 400, cents: 30, clarity: 0.9 }, opts)
    const p = inTuneZonePercents(acc)
    expect(p.totalVoicedMs).toBe(400)
    expect(p.inPct + p.nearPct + p.farPct).toBe(100)
    expect(acc.inMs).toBe(100)
    expect(acc.nearMs).toBe(100)
    expect(acc.farMs).toBe(200)
  })

  it('resets after silence', () => {
    const acc = createInTuneZoneAccumulator()
    pushInTuneZoneSample(acc, { tMs: 0, cents: 0, clarity: 0.9 }, opts)
    pushInTuneZoneSample(acc, { tMs: 100, cents: 0, clarity: 0.9 }, opts)
    expect(acc.inMs).toBe(100)
    const reset = pushInTuneZoneSample(acc, { tMs: 2500, cents: null, clarity: 0 }, opts)
    expect(reset).toBe(true)
    expect(acc.inMs).toBe(0)
    expect(acc.lastZone).toBe('none')
  })

  it('tracks hold progress only while continuously in', () => {
    const acc = createInTuneZoneAccumulator()
    pushInTuneZoneSample(acc, { tMs: 0, cents: 0, clarity: 0.9 }, opts)
    pushInTuneZoneSample(acc, { tMs: 500, cents: 0, clarity: 0.9 }, opts)
    expect(holdInTuneProgress(acc, 1000)).toBe(0.5)
    pushInTuneZoneSample(acc, { tMs: 600, cents: 20, clarity: 0.9 }, opts)
    expect(acc.holdInMs).toBe(0)
  })

  it('reset clears all fields', () => {
    const acc = createInTuneZoneAccumulator()
    pushInTuneZoneSample(acc, { tMs: 0, cents: 0, clarity: 0.9 }, opts)
    pushInTuneZoneSample(acc, { tMs: 100, cents: 0, clarity: 0.9 }, opts)
    resetInTuneZoneAccumulator(acc)
    expect(inTuneZonePercents(acc).totalVoicedMs).toBe(0)
  })
})
