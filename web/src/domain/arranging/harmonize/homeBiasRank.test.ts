/**
 * Coach top picks should prefer clear diatonic homes over automatic I7 / color soup.
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { generateCandidates } from './candidateGenerator'
import { rankCandidates } from './candidateRanker'
import { autocompleteNextChord } from './chordAutocomplete'
import type { MelodyEvent, Pillar } from '../types'

function note(midi: number, role: MelodyEvent['role'] = 'pmn'): MelodyEvent {
  return { id: `n${midi}`, midi, startTick: 0, durationTicks: 480, role }
}

function pillar(rootPc: number): Pillar {
  return { id: 'p1', rootPc, startTick: 0, endTick: 4000, source: 'user', confirmed: true }
}

describe('coach home bias', () => {
  it('prefers I major over I7 when lead is the tonic root (Bonnie-style home)', () => {
    // C lead on C pillar; next pillar IV makes I7 look like a secondary dominant.
    const raw = generateCandidates({
      note: note(60),
      pillar: pillar(0),
      tonality: 0,
      prevRootPc: null,
      preferScf: true,
      nextPillarRoot: 5,
    })
    const ranked = rankCandidates(raw)
    const top = ranked[0]!
    expect(top.rootPc).toBe(0)
    expect(top.natureId).toBe('major')
    expect(top.layer).toBe('primary')
  })

  it('prefers IV major over IV6 / IV(add9) when lead is the IV root', () => {
    const raw = generateCandidates({
      note: note(65), // F
      pillar: pillar(5),
      tonality: 0,
      prevRootPc: 0,
      preferScf: true,
      nextPillarRoot: 0,
    })
    const ranked = rankCandidates(raw)
    const top = ranked[0]!
    expect(top.rootPc).toBe(5)
    expect(top.natureId).toBe('major')
  })

  it('still prefers V7 when lead sits on the dominant 3rd', () => {
    const raw = generateCandidates({
      note: note(71), // B = 3rd of G
      pillar: pillar(0),
      tonality: 0,
      prevRootPc: 0,
      preferScf: false,
      nextPillarRoot: 0,
    })
    const ranked = rankCandidates(raw)
    const top = ranked[0]!
    expect(top.rootPc).toBe(7)
    expect(top.natureId === 'seventh' || top.natureId === 'ninth').toBe(true)
  })

  it('autocomplete default does not flood SCF ahead of the primary home triad', () => {
    const sug = autocompleteNextChord({
      note: note(60),
      pillar: pillar(0),
      tonality: 0,
      prevRootPc: null,
      nextPillarRoot: 5,
      // omit preferScf — should not default to true
    })
    expect(sug[0]!.natureId).toBe('major')
    expect(sug[0]!.rootPc).toBe(0)
    // Odd SCF labels should not occupy the #1 slot for a tonic root.
    expect(sug[0]!.roman).not.toMatch(/bII|bVII|add9|\/b/)
  })
})
