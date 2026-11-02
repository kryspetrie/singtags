import { describe, expect, it } from 'vitest'
import { TAG_ROLL_PPQ } from '../types'
import {
  decomposeTicksToDurations,
  groupingSplitTicks,
  mapTicksToDuration,
} from './durationMap'

describe('durationMap', () => {
  it('maps dotted quarter exactly', () => {
    const d = mapTicksToDuration(Math.round(TAG_ROLL_PPQ * 1.5))
    expect(d.type).toBe('quarter')
    expect(d.dots).toBe(1)
  })

  it('decomposes five quarters into whole + quarter', () => {
    const parts = decomposeTicksToDurations(TAG_ROLL_PPQ * 5)
    expect(parts.map((p) => `${p.type}:${p.dots}`)).toEqual(['whole:0', 'quarter:0'])
    expect(parts.reduce((s, p) => s + p.ticks, 0)).toBe(TAG_ROLL_PPQ * 5)
  })

  it('keeps a dotted half as one value', () => {
    const parts = decomposeTicksToDurations(TAG_ROLL_PPQ * 3)
    expect(parts).toHaveLength(1)
    expect(parts[0]!.type).toBe('half')
    expect(parts[0]!.dots).toBe(1)
  })

  it('splits a half on beat 2 at the mid-bar into two quarters', () => {
    const mLen = TAG_ROLL_PPQ * 4
    const bLen = TAG_ROLL_PPQ
    const parts = decomposeTicksToDurations(TAG_ROLL_PPQ * 2, TAG_ROLL_PPQ, {
      startTick: TAG_ROLL_PPQ,
      measureTicks: mLen,
      beatTicks: bLen,
    })
    expect(parts.map((p) => `${p.type}:${p.dots}`)).toEqual(['quarter:0', 'quarter:0'])
    expect(groupingSplitTicks(TAG_ROLL_PPQ, TAG_ROLL_PPQ * 2, mLen, bLen)).toEqual([
      TAG_ROLL_PPQ,
      TAG_ROLL_PPQ,
    ])
  })

  it('keeps a quarter on beat 2 in 3/4 (no mid-bar bisect)', () => {
    const mLen = TAG_ROLL_PPQ * 3
    const bLen = TAG_ROLL_PPQ
    // Beat 2 → beat 3 crosses the geometric midpoint (1.5 beats) but must stay one quarter.
    expect(groupingSplitTicks(TAG_ROLL_PPQ, TAG_ROLL_PPQ, mLen, bLen)).toEqual([TAG_ROLL_PPQ])
    const parts = decomposeTicksToDurations(TAG_ROLL_PPQ, TAG_ROLL_PPQ, {
      startTick: TAG_ROLL_PPQ,
      measureTicks: mLen,
      beatTicks: bLen,
    })
    expect(parts).toHaveLength(1)
    expect(parts[0]).toMatchObject({ type: 'quarter', dots: 0 })
  })

  it('keeps a half from beat 1 in 3/4 as a half (not eighth+dotted-quarter)', () => {
    const mLen = TAG_ROLL_PPQ * 3
    const bLen = TAG_ROLL_PPQ
    expect(groupingSplitTicks(0, TAG_ROLL_PPQ * 2, mLen, bLen)).toEqual([TAG_ROLL_PPQ * 2])
  })

  it('keeps a dotted half from the downbeat as one value across mid-bar', () => {
    const parts = decomposeTicksToDurations(TAG_ROLL_PPQ * 3, TAG_ROLL_PPQ, {
      startTick: 0,
      measureTicks: TAG_ROLL_PPQ * 4,
      beatTicks: TAG_ROLL_PPQ,
    })
    expect(parts).toHaveLength(1)
    expect(parts[0]!.type).toBe('half')
    expect(parts[0]!.dots).toBe(1)
  })

  it('splits a quarter that starts off the beat and crosses the next beat', () => {
    const mLen = TAG_ROLL_PPQ * 4
    const bLen = TAG_ROLL_PPQ
    const parts = decomposeTicksToDurations(TAG_ROLL_PPQ, TAG_ROLL_PPQ, {
      startTick: TAG_ROLL_PPQ / 2,
      measureTicks: mLen,
      beatTicks: bLen,
    })
    expect(parts.map((p) => `${p.type}:${p.dots}`)).toEqual(['eighth:0', 'eighth:0'])
    expect(parts.reduce((s, p) => s + p.ticks, 0)).toBe(TAG_ROLL_PPQ)
  })

  it('splits a dotted quarter that starts on an off-beat', () => {
    const parts = decomposeTicksToDurations(Math.round(TAG_ROLL_PPQ * 1.5), TAG_ROLL_PPQ, {
      startTick: TAG_ROLL_PPQ / 2,
      measureTicks: TAG_ROLL_PPQ * 4,
      beatTicks: TAG_ROLL_PPQ,
    })
    // Eighth to beat 2, then quarter (or eighth+eighth) — never a single dotted quarter.
    expect(parts[0]!.type).toBe('eighth')
    expect(parts[0]!.dots).toBe(0)
    expect(parts.length).toBeGreaterThanOrEqual(2)
    expect(parts.reduce((s, p) => s + p.ticks, 0)).toBe(Math.round(TAG_ROLL_PPQ * 1.5))
  })

  it('never rounds a leftover up past the remaining ticks', () => {
    const odd = Math.round(TAG_ROLL_PPQ / 8) - 1 // just under a 32nd
    const parts = decomposeTicksToDurations(odd)
    expect(parts.reduce((s, p) => s + p.ticks, 0)).toBe(odd)
  })
})
