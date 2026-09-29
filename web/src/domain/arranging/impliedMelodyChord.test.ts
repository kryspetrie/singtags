/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  expandHeldMomentsForCadences,
  inferImpliedChordsFromMelody,
  impliedStacksForBareMelody,
  melodyOnsetCoveredByStack,
  reorderImpliedByMelodyRole,
} from './impliedMelodyChord'
import type { ChordStack } from './types'

function stack(
  startTick: number,
  durationTicks: number,
  midi: ChordStack['midi'],
  natureId = 'major',
): ChordStack {
  return {
    id: `s${startTick}`,
    startTick,
    durationTicks,
    rootPc: 0,
    natureId,
    voicing: '1513',
    spread: false,
    layer: 'primary',
    scfGroup: null,
    pillarId: null,
    midi,
    ruleTags: [],
  }
}

describe('impliedMelodyChord', () => {
  it('implies I major (not I7) for tonic melody in C major', () => {
    const cands = inferImpliedChordsFromMelody({
      melodyMidi: 60, // C
      tonality: 0,
      mode: 'major',
      limit: 3,
    })
    expect(cands.length).toBeGreaterThanOrEqual(1)
    expect(cands[0]!.rootPc).toBe(0)
    expect(cands[0]!.natureId).toBe('major')
    expect(cands[0]!.roman).toBe('I')
  })

  it('implies V or V7 for B (leading tone) in C major', () => {
    const cands = inferImpliedChordsFromMelody({
      melodyMidi: 59, // B
      tonality: 0,
      mode: 'major',
      limit: 3,
    })
    expect(cands.some((c) => c.rootPc === 7 && (c.natureId === 'major' || c.natureId === 'seventh'))).toBe(
      true,
    )
    expect(cands[0]!.roman === 'V' || cands[0]!.roman === 'V7' || cands[0]!.roman.includes('vii')).toBe(
      true,
    )
  })

  it('implies i for tonic melody in A minor', () => {
    const cands = inferImpliedChordsFromMelody({
      melodyMidi: 57, // A
      tonality: 9,
      mode: 'minor',
      limit: 2,
    })
    expect(cands[0]!.rootPc).toBe(9)
    expect(cands[0]!.roman === 'i' || cands[0]!.roman === 'i7').toBe(true)
  })

  it('implies V7 (not I) when melody is ^5 resolving to ^1', () => {
    const cands = inferImpliedChordsFromMelody({
      melodyMidi: 67, // G = ^5 in C
      tonality: 0,
      mode: 'major',
      nextMelodyMidi: 60, // C = ^1
      limit: 3,
    })
    expect(cands[0]!.rootPc).toBe(7)
    expect(cands[0]!.natureId).toBe('seventh')
    expect(cands[0]!.roman).toBe('V7')
    expect(cands[0]!.cadenceHint?.id).toBe('auth_v7_i')
  })

  it('implies V7 when melody is ^7 resolving to ^1', () => {
    const cands = inferImpliedChordsFromMelody({
      melodyMidi: 59, // B
      tonality: 0,
      mode: 'major',
      nextMelodyMidi: 60,
      limit: 3,
    })
    expect(cands[0]!.rootPc).toBe(7)
    expect(cands[0]!.natureId === 'seventh' || cands[0]!.natureId === 'major').toBe(true)
    expect(cands[0]!.cadenceHint?.id).toBe('lead_tone_v7')
  })

  it('implies I7 when tonic melody aims at ^4 (I7→IV)', () => {
    const cands = inferImpliedChordsFromMelody({
      melodyMidi: 60,
      tonality: 0,
      mode: 'major',
      nextMelodyMidi: 65,
      phraseRole: 'mid',
      limit: 3,
    })
    expect(cands[0]!.rootPc).toBe(0)
    expect(cands[0]!.natureId).toBe('seventh')
    expect(cands[0]!.cadenceHint?.id).toBe('primary_dom7')
  })

  it('does not springboard I7 at phrase end when next note is ^4 across a rest', () => {
    // Bonnie-style: phrase lands on ^1; next phrase starts on ^4 — want I, not I7→IV.
    const cands = inferImpliedChordsFromMelody({
      melodyMidi: 60,
      tonality: 0,
      mode: 'major',
      nextMelodyMidi: 65,
      phraseRole: 'cadence',
      limit: 3,
    })
    expect(cands[0]!.rootPc).toBe(0)
    expect(cands[0]!.natureId).toBe('major')
    expect(cands[0]!.cadenceHint?.id).not.toBe('primary_dom7')
  })

  it('implies I (not I7) when Lead ^3 lands after V7', () => {
    const cands = inferImpliedChordsFromMelody({
      melodyMidi: 64, // E = ^3
      tonality: 0,
      mode: 'major',
      prevRootPc: 7,
      prevNatureId: 'seventh',
      limit: 4,
    })
    expect(cands[0]!.rootPc).toBe(0)
    expect(cands[0]!.natureId).toBe('major')
    expect(cands[0]!.cadenceHint?.id).toBe('auth_v7_i')
  })

  it('keeps V7 under Strong when ^5→^1 (Bonnie opening)', () => {
    const pool = inferImpliedChordsFromMelody({
      melodyMidi: 67, // G = ^5
      tonality: 0,
      mode: 'major',
      nextMelodyMidi: 60,
      phraseRole: 'open',
      limit: 4,
    })
    expect(pool[0]!.natureId).toBe('seventh')
    expect(pool[0]!.rootPc).toBe(7)
    const ranked = reorderImpliedByMelodyRole(pool, 'pmn')
    expect(ranked[0]!.natureId).toBe('seventh')
    expect(ranked[0]!.cadenceHint?.id).toBe('auth_v7_i')
  })

  it('Bonnie-style phrase: opening V7 then closing I (not I7)', () => {
    // "My"(^5) "Bon"(^1) … gap … land(^1) then next phrase ^4
    const moments = [
      { startTick: 0, durationTicks: 240, midi: 67, melodyRole: 'pmn' as const },
      { startTick: 240, durationTicks: 480, midi: 60, melodyRole: 'pmn' as const },
      { startTick: 1920, durationTicks: 480, midi: 60, melodyRole: 'pmn' as const },
      { startTick: 2880, durationTicks: 240, midi: 65, melodyRole: 'pmn' as const },
    ]
    const implied = impliedStacksForBareMelody({
      moments,
      existingStacks: [],
      tonality: 0,
      mode: 'major',
      songEndTick: 3840,
    })
    const byTick = new Map(implied.map((s) => [s.startTick, s]))
    expect(byTick.get(0)?.rootPc).toBe(7)
    expect(byTick.get(0)?.natureId).toBe('seventh')
    expect(byTick.get(1920)?.rootPc).toBe(0)
    expect(byTick.get(1920)?.natureId).toBe('major')
  })

  it('reorders implied natures for Strong vs Passing roles', () => {
    const pool = [
      { natureId: 'seventh', rootPc: 7 },
      { natureId: 'major', rootPc: 0 },
      { natureId: 'm7', rootPc: 2 },
    ]
    expect(reorderImpliedByMelodyRole(pool, 'pmn')[0]!.natureId).toBe('major')
    expect(reorderImpliedByMelodyRole(pool, 'smn')[0]!.natureId).toBe('seventh')
  })

  it('biases Detected top pick toward home triads on Strong notes', () => {
    const moments = [
      { startTick: 0, durationTicks: 480, midi: 64, melodyRole: 'pmn' as const },
    ]
    const implied = impliedStacksForBareMelody({
      moments,
      existingStacks: [],
      tonality: 0,
      mode: 'major',
    })
    expect(implied[0]?.natureId).toMatch(/major|minor|sixth/)
  })

  it('builds analysis stacks only for uncovered bare moments', () => {
    const existing = [
      stack(0, 480, { tenor: 67, lead: 64, bari: 60, bass: 48 }, 'major'),
    ]
    const implied = impliedStacksForBareMelody({
      moments: [
        { startTick: 0, durationTicks: 480, midi: 64 },
        { startTick: 480, durationTicks: 480, midi: 65 },
      ],
      existingStacks: existing,
      tonality: 0,
      mode: 'major',
    })
    expect(implied.every((s) => s.startTick !== 0)).toBe(true)
    expect(melodyOnsetCoveredByStack(0, existing)).toBe(true)
  })
})

describe('detected interest levels', () => {
  const BB = 10 // Bb major

  it('Basic keeps V7 (or V) for Lead A→Bb; Mild prefers F7', () => {
    const basic = inferImpliedChordsFromMelody({
      melodyMidi: 69, // A = ^7 in Bb
      tonality: BB,
      mode: 'major',
      nextMelodyMidi: 70, // Bb
      interest: 'basic',
      limit: 3,
    })
    expect(basic[0]!.rootPc).toBe(5) // F
    expect(['seventh', 'major']).toContain(basic[0]!.natureId)

    const mild = inferImpliedChordsFromMelody({
      melodyMidi: 69,
      tonality: BB,
      mode: 'major',
      nextMelodyMidi: 70,
      interest: 'mild',
      limit: 3,
    })
    expect(mild[0]!.rootPc).toBe(5)
    expect(mild[0]!.natureId).toBe('seventh')
  })

  it('Mild prefers ii7 (Cm7) on Lead C Strong when next leans V', () => {
    const basic = inferImpliedChordsFromMelody({
      melodyMidi: 60, // C = ^2
      tonality: BB,
      mode: 'major',
      nextMelodyMidi: 65, // F = ^5
      interest: 'basic',
      limit: 4,
    })
    const mildPool = inferImpliedChordsFromMelody({
      melodyMidi: 60,
      tonality: BB,
      mode: 'major',
      nextMelodyMidi: 65,
      interest: 'mild',
      limit: 4,
    })
    const mild = reorderImpliedByMelodyRole(mildPool, 'pmn', 'mild')
    // Basic often lands on F; Mild should surface Cm7 (ii7) at or near top.
    expect(basic.some((c) => c.rootPc === 5)).toBe(true)
    expect(mild[0]!.rootPc).toBe(0)
    expect(mild[0]!.natureId).toBe('m7')
  })

  it('Bold includes V7/V (C7) in the pool for Lead G', () => {
    const basic = inferImpliedChordsFromMelody({
      melodyMidi: 67, // G
      tonality: BB,
      mode: 'major',
      nextMelodyMidi: 65, // F
      interest: 'basic',
      limit: 6,
    })
    const bold = inferImpliedChordsFromMelody({
      melodyMidi: 67,
      tonality: BB,
      mode: 'major',
      nextMelodyMidi: 65,
      interest: 'bold',
      limit: 6,
    })
    expect(basic.some((c) => c.rootPc === 0 && c.natureId === 'seventh')).toBe(false)
    expect(bold.some((c) => c.rootPc === 0 && c.natureId === 'seventh')).toBe(true)
    expect(bold.some((c) => c.roman === 'V7/V' || c.roman.includes('II'))).toBe(true)
  })

  it('Bold keeps Mild ★ ii7 on Lead C→F but offers V7/V as an alt', () => {
    const mild = reorderImpliedByMelodyRole(
      inferImpliedChordsFromMelody({
        melodyMidi: 60, // C = ^2
        tonality: BB,
        mode: 'major',
        nextMelodyMidi: 65, // F
        interest: 'mild',
        limit: 4,
      }),
      'pmn',
      'mild',
    )
    const bold = reorderImpliedByMelodyRole(
      inferImpliedChordsFromMelody({
        melodyMidi: 60,
        tonality: BB,
        mode: 'major',
        nextMelodyMidi: 65,
        interest: 'bold',
        limit: 4,
      }),
      'pmn',
      'bold',
    )
    expect(mild[0]!.rootPc).toBe(0)
    expect(mild[0]!.natureId).toBe('m7')
    // Bold ★ stays Mild-like — secondary lives as alt, not a ★ theft.
    expect(bold[0]!.rootPc).toBe(0)
    expect(bold[0]!.natureId).toBe('m7')
    expect(bold.some((c) => c.rootPc === 0 && c.natureId === 'seventh')).toBe(true)
  })

  it('Bold does not demote Mild ii7 into IV on Lead G→F', () => {
    const mild = reorderImpliedByMelodyRole(
      inferImpliedChordsFromMelody({
        melodyMidi: 67, // G
        tonality: BB,
        mode: 'major',
        nextMelodyMidi: 65, // F
        interest: 'mild',
        limit: 4,
      }),
      'pmn',
      'mild',
    )
    const bold = reorderImpliedByMelodyRole(
      inferImpliedChordsFromMelody({
        melodyMidi: 67,
        tonality: BB,
        mode: 'major',
        nextMelodyMidi: 65,
        interest: 'bold',
        limit: 4,
      }),
      'pmn',
      'bold',
    )
    expect(mild[0]!.natureId).toBe('m7')
    expect(mild[0]!.rootPc).toBe(0)
    expect(bold[0]!.natureId).toBe('m7')
    expect(bold[0]!.rootPc).toBe(0)
  })

  it('Mild splits a held ^5 into V7 then I', () => {
    const moments = [
      { startTick: 0, durationTicks: 1920, midi: 65, melodyRole: 'smn' as const }, // F held 4 beats
    ]
    const basic = impliedStacksForBareMelody({
      moments,
      existingStacks: [],
      tonality: BB,
      mode: 'major',
      interest: 'basic',
      ppq: 480,
      timeSignature: { numerator: 4, denominator: 4 },
    })
    expect(basic).toHaveLength(1)

    const mild = impliedStacksForBareMelody({
      moments,
      existingStacks: [],
      tonality: BB,
      mode: 'major',
      interest: 'mild',
      ppq: 480,
      timeSignature: { numerator: 4, denominator: 4 },
    })
    expect(mild.length).toBeGreaterThanOrEqual(2)
    expect(mild[0]!.rootPc).toBe(5)
    expect(mild[0]!.natureId).toBe('seventh')
    expect(mild[1]!.rootPc).toBe(BB)
    expect(mild[1]!.natureId).toBe('major')
  })

  it('Bold splits held ^2 into V7/V then V7 (not Mild ii7→V7)', () => {
    const moments = [
      { startTick: 0, durationTicks: 1920, midi: 60, melodyRole: 'smn' as const }, // C held
    ]
    const mild = impliedStacksForBareMelody({
      moments,
      existingStacks: [],
      tonality: BB,
      mode: 'major',
      interest: 'mild',
      ppq: 480,
      timeSignature: { numerator: 4, denominator: 4 },
    })
    const bold = impliedStacksForBareMelody({
      moments,
      existingStacks: [],
      tonality: BB,
      mode: 'major',
      interest: 'bold',
      ppq: 480,
      timeSignature: { numerator: 4, denominator: 4 },
    })
    expect(mild.length).toBeGreaterThanOrEqual(2)
    expect(mild[0]!.natureId).toBe('m7')
    expect(mild[0]!.rootPc).toBe(0)
    expect(mild[1]!.natureId).toBe('seventh')
    expect(mild[1]!.rootPc).toBe(5)

    expect(bold.length).toBeGreaterThanOrEqual(2)
    expect(bold[0]!.natureId).toBe('seventh')
    expect(bold[0]!.rootPc).toBe(0) // C7 = V7/V
    expect(bold[1]!.natureId).toBe('seventh')
    expect(bold[1]!.rootPc).toBe(5) // F7
  })

  it('Mild/Bold rewrite first of I–I under ^5→^3 as V7→I', () => {
    // Bb: F (^5) then D (^3) — both would greedily pick I without cadence widen / look-ahead.
    const moments = [
      { startTick: 0, durationTicks: 480, midi: 65, melodyRole: 'pmn' as const },
      { startTick: 480, durationTicks: 480, midi: 62, melodyRole: 'pmn' as const },
    ]
    const mild = impliedStacksForBareMelody({
      moments,
      existingStacks: [],
      tonality: BB,
      mode: 'major',
      interest: 'mild',
      ppq: 480,
      timeSignature: { numerator: 4, denominator: 4 },
    })
    expect(mild[0]!.rootPc).toBe(5)
    expect(mild[0]!.natureId).toBe('seventh')
    expect(mild[1]!.rootPc).toBe(BB)
    expect(mild[1]!.natureId).toBe('major')
  })

  it('does not invent a held I split when Lead G fails common-tone for V7→I', () => {
    // G is not a tone of Bb major (no 6th) nor of F7 (F A C Eb) — wait G is not in F7.
    // G is 5 of C7 and 9 of … ; Mild should not force V7→I.
    const expanded = expandHeldMomentsForCadences(
      [{ startTick: 0, durationTicks: 1920, midi: 67 }],
      {
        interest: 'mild',
        tonality: BB,
        mode: 'major',
        ppq: 480,
        timeSignature: { numerator: 4, denominator: 4 },
      },
    )
    expect(expanded).toHaveLength(1)
    expect(expanded[0]!.forceImplied).toBeUndefined()
  })
})
