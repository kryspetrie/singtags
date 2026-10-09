/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  isBassOctaveLeap,
  leapCapsForRisk,
  leapsWithinCaps,
  outlierJumpPenalty,
  partJumpCost,
} from './partLeaps'
import type { VoicingPitches } from '../chords'

const base: VoicingPitches = { bass: 48, bari: 55, lead: 60, tenor: 67 }

describe('partLeaps', () => {
  it('weights tenor jumps above bari jumps', () => {
    const tenorJump = partJumpCost(base, { ...base, tenor: base.tenor + 8 })
    const bariJump = partJumpCost(base, { ...base, bari: base.bari + 8 })
    expect(tenorJump).toBeGreaterThan(bariJump * 2)
  })

  it('treats bass octave as cheap vs a 10-semitone bass leap', () => {
    const octave = partJumpCost(base, { ...base, bass: base.bass + 12 })
    const tenth = partJumpCost(base, { ...base, bass: base.bass + 10 })
    expect(octave).toBeLessThan(tenth)
    expect(isBassOctaveLeap(base.bass, base.bass + 12)).toBe(true)
  })

  it('Basic caps block large tenor leaps; bass octave still allowed', () => {
    const caps = leapCapsForRisk(0)
    expect(caps.tenor).toBeLessThanOrEqual(7)
    expect(
      leapsWithinCaps(base, { ...base, tenor: base.tenor + 8 }, 0),
    ).toBe(false)
    expect(
      leapsWithinCaps(base, { ...base, bass: base.bass + 12 }, 0),
    ).toBe(true)
  })

  it('penalizes a single spiked jump in an otherwise smooth path', () => {
    const smooth: VoicingPitches[] = [
      base,
      { bass: 49, bari: 55, lead: 60, tenor: 68 }, // +1
      { bass: 50, bari: 56, lead: 62, tenor: 69 }, // +1
      { bass: 51, bari: 55, lead: 60, tenor: 70 }, // +1
      { bass: 48, bari: 55, lead: 60, tenor: 79 }, // tenor +9 spike
      { bass: 49, bari: 55, lead: 62, tenor: 68 }, // back
    ]
    expect(outlierJumpPenalty(smooth)).toBeGreaterThan(4)
  })
})
