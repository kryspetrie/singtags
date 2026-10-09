/**
 * Ades-inspired part-writing soft costs.
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  hazardousLeapPenalty,
  postLeapDirectionPenalty,
  upperTrioCloseBias,
  upperTrioSpan,
} from './partWritingCosts'
import type { VoicingPitches } from './chords'

const close: VoicingPitches = { bass: 48, bari: 55, lead: 60, tenor: 64 } // upper span 9
const openUpper: VoicingPitches = { bass: 48, bari: 52, lead: 60, tenor: 72 } // upper span 20

describe('partWritingCosts (Ades)', () => {
  it('upperTrioSpan / close bias prefer upper three within an octave', () => {
    expect(upperTrioSpan(close)).toBe(9)
    expect(upperTrioSpan(openUpper)).toBe(20)
    expect(upperTrioCloseBias(close)).toBeGreaterThan(upperTrioCloseBias(openUpper))
    expect(upperTrioCloseBias(close)).toBeGreaterThan(0)
    expect(upperTrioCloseBias(openUpper)).toBeLessThan(0)
  })

  it('hazardousLeapPenalty flags ↑A4 / ↓d5 in harmony parts', () => {
    const prev: VoicingPitches = { bass: 48, bari: 55, lead: 60, tenor: 64 }
    const a4Up: VoicingPitches = { ...prev, tenor: 64 + 6 }
    const d5Down: VoicingPitches = { ...prev, bari: 55 - 6 }
    expect(hazardousLeapPenalty(prev, a4Up)).toBeGreaterThan(0)
    expect(hazardousLeapPenalty(prev, d5Down)).toBeGreaterThan(0)
    // Stepwise motion is fine.
    expect(hazardousLeapPenalty(prev, { ...prev, tenor: 65 })).toBe(0)
  })

  it('hazardousLeapPenalty softens when target PC already sounds', () => {
    const prev: VoicingPitches = { bass: 48, bari: 55, lead: 60, tenor: 64 }
    const bareTritone: VoicingPitches = { ...prev, bari: 55 + 6 }
    const withTenorHolding: VoicingPitches = {
      bass: 48,
      bari: 55 + 6,
      lead: 60,
      tenor: 61, // same PC as bari arrival
    }
    expect(hazardousLeapPenalty(prev, withTenorHolding)).toBeLessThan(
      hazardousLeapPenalty(prev, bareTritone),
    )
  })

  it('postLeapDirectionPenalty demotes same-direction continuation after a wide leap', () => {
    const a: VoicingPitches = { bass: 48, bari: 55, lead: 60, tenor: 64 }
    const b: VoicingPitches = { ...a, tenor: 64 + 5 } // leap in +5
    const continueUp: VoicingPitches = { ...b, tenor: b.tenor + 4 }
    const turnDown: VoicingPitches = { ...b, tenor: b.tenor - 2 }
    const stepUp: VoicingPitches = { ...b, tenor: b.tenor + 1 }
    expect(postLeapDirectionPenalty(a, b, continueUp)).toBeGreaterThan(0)
    expect(postLeapDirectionPenalty(a, b, turnDown)).toBe(0)
    expect(postLeapDirectionPenalty(a, b, stepUp)).toBe(0)
    expect(postLeapDirectionPenalty(a, b, continueUp, { sameChord: true })).toBe(0)
  })
})
