/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  SKETCH_HEAR_BASS_MIN,
  SKETCH_HEAR_TENOR_MAX,
  optimizeSketchHearPath,
  sketchHearMidis,
  sketchHearVoicing,
} from './sketchHearVoicing'

function pcs(midis: number[]): number[] {
  return [...new Set(midis.map((m) => ((m % 12) + 12) % 12))].sort((a, b) => a - b)
}

describe('sketchHearMidis', () => {
  it('returns four TTBB notes in ascending order for a major triad', () => {
    const midis = sketchHearMidis({ rootPc: 0, quality: 'major', leadMidi: 60 })
    expect(midis).toHaveLength(4)
    expect(new Set(midis).size).toBe(4)
    expect(midis[0]!).toBeGreaterThanOrEqual(SKETCH_HEAR_BASS_MIN - 5)
    expect(midis[3]!).toBeLessThanOrEqual(SKETCH_HEAR_TENOR_MAX + 5)
    expect(pcs(midis)).toEqual([0, 4, 7])
  })

  it('keeps dominant sevenths as 1-3-5-b7 without mud', () => {
    const midis = sketchHearMidis({ rootPc: 0, quality: 'seventh', leadMidi: 60 })
    expect(midis).toHaveLength(4)
    expect(new Set(midis).size).toBe(4)
    expect(pcs(midis)).toEqual([0, 4, 7, 10])
    expect(midis[0]!).toBeLessThanOrEqual(midis[1]!)
    expect(midis[3]!).toBeGreaterThan(midis[2]!)
  })

  it('voices Dom9 without a root+9 major-second cluster', () => {
    const midis = sketchHearMidis({ rootPc: 0, quality: 'ninth', leadMidi: 64 }) // E lead = 3rd
    expect(midis).toHaveLength(4)
    expect(new Set(midis).size).toBe(4)
    const set = new Set(pcs(midis))
    // Must include the 9 (D=2) and b7 (Bb=10); must omit either root or 5th
    expect(set.has(2)).toBe(true)
    expect(set.has(10)).toBe(true)
    const hasRoot = set.has(0)
    const hasFifth = set.has(7)
    expect(hasRoot && hasFifth).toBe(false)
    // No adjacent m2 cluster of C+D in the sounding stack
    const sorted = [...midis].sort((a, b) => a - b)
    for (let i = 0; i < sorted.length - 1; i++) {
      expect(sorted[i + 1]! - sorted[i]!).not.toBe(1)
    }
  })

  it('handles half-dim and dim7 with four distinct tones', () => {
    const hdim = sketchHearMidis({ rootPc: 2, quality: 'half-dim', leadMidi: 62 })
    expect(hdim).toHaveLength(4)
    expect(new Set(hdim).size).toBe(4)
    expect(pcs(hdim).length).toBeGreaterThanOrEqual(3)

    const dim7 = sketchHearMidis({ rootPc: 0, quality: 'dim7', leadMidi: 60 })
    expect(dim7).toHaveLength(4)
    expect(pcs(dim7)).toEqual([0, 3, 6, 9])
  })

  it('works without a lead (synthetic mid-range lead)', () => {
    const midis = sketchHearMidis({ rootPc: 7, quality: 'seventh', leadMidi: null })
    expect(midis).toHaveLength(4)
    expect(new Set(midis).size).toBe(4)
    expect(midis[0]!).toBeGreaterThanOrEqual(SKETCH_HEAR_BASS_MIN - 5)
    expect(midis[3]!).toBeLessThanOrEqual(SKETCH_HEAR_TENOR_MAX + 5)
  })

  it('does not force a non-chord lead MIDI into the stab', () => {
    // Lead on D (2) over C major — not a chord tone; preview uses synthetic lead
    const midis = sketchHearMidis({ rootPc: 0, quality: 'major', leadMidi: 62 })
    expect(midis).toHaveLength(4)
    expect(pcs(midis)).toEqual([0, 4, 7])
    expect(midis.includes(62)).toBe(false)
  })

  it('locks chord-tone melody MIDI into the sounding lead', () => {
    const midis = sketchHearMidis({ rootPc: 0, quality: 'major', leadMidi: 64 }) // E4 = 3rd
    expect(midis).toHaveLength(4)
    expect(midis[2]).toBe(64)
    expect(midis[3]!).toBeGreaterThan(64)
  })

  it('path optimize keeps chord-tone leads locked to melody MIDI', () => {
    const path = optimizeSketchHearPath(
      [
        { rootPc: 0, quality: 'major', leadMidi: 60 },
        { rootPc: 7, quality: 'seventh', leadMidi: 67 },
        { rootPc: 0, quality: 'major', leadMidi: 64 },
      ],
      { tonality: 0 },
    )
    expect(path).toHaveLength(3)
    expect(path[0]!.lead).toBe(60)
    expect(path[1]!.lead).toBe(67)
    expect(path[2]!.lead).toBe(64)
  })

  it('picks a smoother inversion given the previous chord (VL rules)', () => {
    const c = sketchHearVoicing({ rootPc: 0, quality: 'major', leadMidi: 60 })
    expect(c).toBeTruthy()
    const gCtx = sketchHearVoicing({
      rootPc: 7,
      quality: 'seventh',
      leadMidi: 62,
      prev: c!,
    })!
    const gCold = sketchHearVoicing({
      rootPc: 7,
      quality: 'seventh',
      leadMidi: 62,
    })!
    // Context-aware bass should not leap farther than a cold pick relative to C
    expect(Math.abs(gCtx.bass - c!.bass)).toBeLessThanOrEqual(
      Math.abs(gCold.bass - c!.bass) + 2,
    )
    // Common tones / small motion: total harmony motion stays modest
    const motion =
      Math.abs(gCtx.bass - c!.bass) +
      Math.abs(gCtx.bari - c!.bari) +
      Math.abs(gCtx.tenor - c!.tenor)
    expect(motion).toBeLessThanOrEqual(24)
  })

  it('lookahead prefers a voicing that also connects to the next chord', () => {
    const mid = sketchHearVoicing({
      rootPc: 0,
      quality: 'major',
      leadMidi: 60,
      next: { rootPc: 7, quality: 'seventh', leadMidi: 62 },
    })
    expect(mid).toBeTruthy()
    expect([mid!.bass, mid!.bari, mid!.lead, mid!.tenor]).toHaveLength(4)
  })
})

describe('optimizeSketchHearPath', () => {
  it('keeps Bonnie-style home I out of first inversion (bass on 3)', () => {
    // Prior chord in 1st inv must not drag tonic Bb into bass-on-D.
    const path = optimizeSketchHearPath(
      [
        { rootPc: 5, quality: 'seventh', leadMidi: 57 }, // F7
        { rootPc: 10, quality: 'major', leadMidi: 55 }, // Bb (Lead G ∉ chord)
        { rootPc: 10, quality: 'major', leadMidi: 58 }, // Bb home, Lead on root
      ],
      { tonality: 10 },
    )
    expect(path).toHaveLength(3)
    const home = path[2]!
    expect(home.lead).toBe(58)
    const bassRel = (((home.bass % 12) - 10) % 12 + 12) % 12
    expect([0, 7]).toContain(bassRel) // root or 5th — not 3rd (4)
  })

  it('voices Bonnie-style V7(9)/V with Lead on the 5th without non-chord tones', () => {
    // Bb major: C7(9) = V7(9)/V, Lead on G (5th) — previously lockVoicingLeadToMelody
    // invented an A in the tenor (m2 above lead) which is not a C9 chord tone.
    const path = optimizeSketchHearPath(
      [
        { rootPc: 10, quality: 'major', leadMidi: 58 }, // Bb
        { rootPc: 0, quality: 'ninth', leadMidi: 55 }, // C7(9), Lead G3
        { rootPc: 5, quality: 'seventh', leadMidi: 60 }, // F7
      ],
      { tonality: 10 },
    )
    expect(path).toHaveLength(3)
    const c9 = path[1]!
    expect(c9.lead).toBe(55)
    const set = new Set(
      [c9.bass, c9.bari, c9.lead, c9.tenor].map((m) => ((m % 12) + 12) % 12),
    )
    // Chord tones of C9: C E G Bb D — no A (9), no B (11), etc.
    for (const pc of set) {
      expect([0, 2, 4, 7, 10]).toContain(pc)
    }
    expect(set.has(2) || set.has(10)).toBe(true) // keep 9 and/or b7 character
    const bassRole = ((c9.bass % 12) + 12) % 12
    // Prefer root or 5th in bass — never 7th or 9th inversion.
    expect([0, 7]).toContain(bassRole)
    // No m2 cluster against the locked lead.
    for (const m of [c9.bass, c9.bari, c9.tenor]) {
      expect(Math.abs(m - c9.lead)).not.toBe(1)
    }
  })

  it('returns one voicing per chord', () => {
    const path = optimizeSketchHearPath(
      [
        { rootPc: 0, quality: 'major', leadMidi: 60 },
        { rootPc: 7, quality: 'seventh', leadMidi: 62 },
        { rootPc: 0, quality: 'major', leadMidi: 60 },
      ],
      { tonality: 0 },
    )
    expect(path).toHaveLength(3)
    for (const v of path) {
      expect(v.tenor).toBeGreaterThan(v.lead)
      expect(v.bass).toBeLessThanOrEqual(Math.min(v.bari, v.lead))
    }
  })

  it('prefers opening I with bass on root or fifth', () => {
    const path = optimizeSketchHearPath(
      [
        { rootPc: 0, quality: 'major', leadMidi: 60 },
        { rootPc: 5, quality: 'major', leadMidi: 65 },
        { rootPc: 7, quality: 'seventh', leadMidi: 67 },
        { rootPc: 0, quality: 'major', leadMidi: 60 },
      ],
      { tonality: 0 },
    )
    expect(path.length).toBe(4)
    const bassPc = ((path[0]!.bass % 12) + 12) % 12
    expect([0, 7]).toContain(bassPc)
  })

  it('reduces total harmony motion vs independent cold picks', () => {
    const chords = [
      { rootPc: 0, quality: 'major' as const, leadMidi: 60 },
      { rootPc: 7, quality: 'seventh' as const, leadMidi: 62 },
      { rootPc: 5, quality: 'major' as const, leadMidi: 65 },
      { rootPc: 0, quality: 'major' as const, leadMidi: 64 },
    ]
    const path = optimizeSketchHearPath(chords, { tonality: 0 })
    const cold = chords.map((c) => sketchHearVoicing(c)!)
    const motion = (seq: typeof path) => {
      let m = 0
      for (let i = 1; i < seq.length; i++) {
        const a = seq[i - 1]!
        const b = seq[i]!
        m += Math.abs(b.bass - a.bass) + Math.abs(b.bari - a.bari) + Math.abs(b.tenor - a.tenor)
      }
      return m
    }
    expect(motion(path)).toBeLessThanOrEqual(motion(cold))
  })

  it('with seedPitches prefers staying near the existing register', () => {
    const chords = [
      { rootPc: 0, quality: 'major' as const, leadMidi: 67 },
      { rootPc: 7, quality: 'seventh' as const, leadMidi: 65 },
      { rootPc: 0, quality: 'major' as const, leadMidi: 64 },
    ]
    const seeds = [
      { bass: 48, bari: 55, lead: 67, tenor: 72 },
      { bass: 43, bari: 53, lead: 65, tenor: 71 },
      { bass: 48, bari: 52, lead: 64, tenor: 67 },
    ]
    const cold = optimizeSketchHearPath(chords, { tonality: 0 })
    const seeded = optimizeSketchHearPath(chords, { tonality: 0, seedPitches: seeds })
    // Seeded path should not leap the opening bass up into G3+ territory.
    expect(Math.abs(seeded[0]!.bass - seeds[0]!.bass)).toBeLessThanOrEqual(5)
    expect(Math.abs(seeded[0]!.bass - seeds[0]!.bass)).toBeLessThanOrEqual(
      Math.abs(cold[0]!.bass - seeds[0]!.bass),
    )
  })
})
