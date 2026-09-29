/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { identifyNatureFromMidi } from './chordCompletion'
import { absoluteChordLabel } from './chordAnalysisBar'
import { romanForChord } from './secondaryDominant'

describe('Dom9 omit-root vs minor-sixth dual', () => {
  it('prefers Fm6 over omit-root Bb9 for F–Ab–C–D (Lilly Marlene shape)', () => {
    // Catalogue voicing 5793 on Bb matches, but bass is F = Fm6 root.
    const id = identifyNatureFromMidi({
      midi: { tenor: 62, lead: 60, bari: 56, bass: 53 }, // D C Ab F
      profile: 'sai11',
      tonality: 0,
    })
    expect(id).not.toBeNull()
    expect(id!.natureId).toBe('madd6')
    expect(id!.rootPc).toBe(5) // F
    expect(absoluteChordLabel(id!.rootPc, id!.natureId, true, { tonality: 0 })).toBe('Fm6')
    expect(
      romanForChord({
        rootPc: id!.rootPc,
        natureId: id!.natureId,
        tonality: 0,
        mode: 'major',
      }),
    ).toBe('iv6')
  })

  it('still IDs omit-root Dom9 when no complete bass-rooted m6 exists', () => {
    // D F Ab C — PCs complete Fm6 (F–Ab–C–D) even with bass on D; completeness
    // beats omit-root Dom9. Half-dim on D is also plausible.
    const id = identifyNatureFromMidi({
      midi: { tenor: 60, lead: 56, bari: 53, bass: 50 }, // C Ab F D
      profile: 'sai11',
      tonality: 0,
    })
    expect(id).not.toBeNull()
    expect(['madd6', 'ninth', 'half-dim', 'm7', 'sixth']).toContain(id!.natureId)
  })

  it('maps incomplete ^5 stack to V7 (Bonnie opening, not IV7(9))', () => {
    // Bb–Db–F under Lead F in Bb: PC-complete Bbm/Db6, but Lead ^5 + incomplete
    // TTBB should Detect as functional F7 (V7).
    const id = identifyNatureFromMidi({
      midi: { tenor: 73, lead: 53, bari: 70 }, // Db F Bb
      profile: 'sai11',
      tonality: 10, // Bb
    })
    expect(id).not.toBeNull()
    expect(id!.natureId).toBe('seventh')
    expect(id!.rootPc).toBe(5) // F7 = V7 of Bb
    expect(absoluteChordLabel(id!.rootPc, id!.natureId, true, { tonality: 10 })).toBe('F7')
  })

  it('maps incomplete tonic Mm7 with Lead ^3 to I (Bonnie authentic land, not I7)', () => {
    // Bb–D–Ab under Lead D in Bb: PC-complete Bb7, but Lead ^3 + incomplete
    // TTBB after V7 should Detect as I (V7→I), not I7.
    const id = identifyNatureFromMidi({
      midi: { tenor: 70, lead: 62, bari: 68 }, // Bb D Ab
      profile: 'sai11',
      tonality: 10, // Bb
    })
    expect(id).not.toBeNull()
    expect(id!.natureId).toBe('major')
    expect(id!.rootPc).toBe(10) // Bb
    expect(absoluteChordLabel(id!.rootPc, id!.natureId, true, { tonality: 10 })).toBe('Bb')
  })
})
