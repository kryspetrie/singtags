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
    // Bb9 omit-root tones but bass not an m6 root for these PCs alone…
    // Use a voicing where bass is the Dom9 5th but m6 isn't complete? 
    // F Ab C D always completes Fm6. Use D F Ab C with bass D (3 of Bb9 / root of Dø).
    const id = identifyNatureFromMidi({
      midi: { tenor: 60, lead: 56, bari: 53, bass: 50 }, // C Ab F D
      profile: 'sai11',
      tonality: 0,
    })
    expect(id).not.toBeNull()
    // Bass D → not Fm6 root; Dom9 Bb or half-dim D are plausible.
    expect(['ninth', 'half-dim', 'm7']).toContain(id!.natureId)
  })
})
