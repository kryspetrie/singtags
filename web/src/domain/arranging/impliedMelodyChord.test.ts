/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
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
