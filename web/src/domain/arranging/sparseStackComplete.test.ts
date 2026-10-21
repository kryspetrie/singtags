import { describe, expect, it } from 'vitest'
import { chooseSmoothVoicing, completeSparseStack } from './sparseStackComplete'

describe('completeSparseStack', () => {
  it('completes melody + bass toward a seventh that keeps bass locked', () => {
    // C melody (60) + G bass (43) — classic C7 (5th in bass)
    const result = completeSparseStack({
      midi: { lead: 60, bass: 43 },
      tonality: 0,
      profile: 'sai11',
      preferredNatureId: 'seventh',
      preferredRootPc: 0,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.natureId).toBe('seventh')
    expect(result.pitches.lead).toBe(60)
    expect(result.pitches.bass).toBe(43)
    expect(result.lockedRoles).toEqual(expect.arrayContaining(['lead', 'bass']))
    expect(result.filledRoles).toEqual(expect.arrayContaining(['tenor', 'bari']))
    expect(result.filledRoles).not.toContain('bass')
  })

  it('fills under a tenor sitting a step above the lead', () => {
    const result = completeSparseStack({
      midi: { lead: 64, tenor: 66 },
      tonality: 0,
      mode: 'major',
      profile: 'bhs_extended',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.pitches.tenor).toBe(66)
    expect(result.pitches.lead).toBe(64)
    expect(result.pitches.bari).toBeLessThan(64)
  })

  it('completes melody + tenor without moving tenor', () => {
    // Lead C4, Tenor E5 — major/seventh material
    const result = completeSparseStack({
      midi: { lead: 60, tenor: 76 },
      tonality: 0,
      profile: 'sai11',
      preferredNatureId: 'major',
      preferredRootPc: 0,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.pitches.tenor).toBe(76)
    expect(result.pitches.lead).toBe(60)
    expect(result.filledRoles).toContain('bari')
    expect(result.filledRoles).toContain('bass')
  })

  it('locks three sounding parts and fills the missing one', () => {
    const result = completeSparseStack({
      midi: { lead: 60, tenor: 67, bass: 48 },
      tonality: 0,
      profile: 'sai11',
      preferredNatureId: 'major',
      preferredRootPc: 0,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.pitches.tenor).toBe(67)
    expect(result.pitches.bass).toBe(48)
    expect(result.filledRoles).toEqual(['bari'])
  })

  it('skips unrecognized dissonant pairs', () => {
    // Lead C + Bass C# — low-confidence / weak ID → skip (do not invent a fill)
    const result = completeSparseStack({
      midi: { lead: 60, bass: 49 },
      tonality: 0,
      profile: 'sai11',
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('unrecognized')
  })

  it('skips preferred nature outside contest profile', () => {
    const result = completeSparseStack({
      midi: { lead: 60, bass: 48 },
      tonality: 0,
      profile: 'sai11',
      preferredNatureId: 'half-dim',
      preferredRootPc: 2,
    })
    expect(result).toEqual({ ok: false, reason: 'outside_vocab' })
  })

  it('fills G7 when lead sits a third above the bass', () => {
    const result = completeSparseStack({
      midi: { lead: 59, bass: 55 },
      tonality: 0,
      mode: 'major',
      profile: 'bhs_extended',
    })
    expect(result).toMatchObject({ ok: true })
    if (!result.ok) return
    expect(result.natureId).toBe('seventh')
    expect(result.rootPc).toBe(7)
    expect(result.pitches.lead).toBe(59)
    expect(result.pitches.bass).toBe(55)
    const pcs = [result.pitches.tenor, result.pitches.bari].map((m) => ((m % 12) + 12) % 12)
    expect(pcs.sort((a, b) => a - b)).toEqual([2, 5])
  })

  it('steps the tenor into the next chord instead of leaping an octave', () => {
    const first = completeSparseStack({
      midi: { lead: 65, bass: 55 },
      tonality: 0,
      mode: 'major',
      profile: 'bhs_extended',
    })
    expect(first.ok).toBe(true)
    if (!first.ok) return
    expect(first.pitches.tenor).toBeGreaterThan(first.pitches.lead)
    expect(first.pitches.tenor).toBeLessThanOrEqual(77)
    expect(first.pitches.bari).toBeLessThanOrEqual(69)
    expect(first.pitches.bari).toBeGreaterThanOrEqual(48)

    const second = completeSparseStack({
      midi: { lead: 60, bass: 48 },
      tonality: 0,
      mode: 'major',
      profile: 'bhs_extended',
      prevMidi: first.pitches,
    })
    expect(second.ok).toBe(true)
    if (!second.ok) return
    expect(second.pitches.tenor).toBeLessThanOrEqual(77)
    expect(Math.abs(second.pitches.tenor - first.pitches.tenor)).toBeLessThanOrEqual(7)
    expect(Math.abs(second.pitches.bari - first.pitches.bari)).toBeLessThanOrEqual(9)
    expect(second.pitches.bass).toBe(48)
  })

  it('keeps sung lead and bass and moves the filled tenor off a leap larger than a fifth', () => {
    // A7: lead E4, bass A3 sung. Previous tenor E5, next tenor F5.
    const chosen = chooseSmoothVoicing({
      natureId: 'seventh',
      rootPc: 9,
      lead: 64,
      locked: { bass: 57 },
      prev: { tenor: 76 },
      next: { tenor: 77 },
    })
    expect(chosen).not.toBeNull()
    if (!chosen) return
    expect(chosen.lead).toBe(64)
    expect(chosen.bass).toBe(57)
    expect(Math.abs(chosen.tenor - 76)).toBeLessThanOrEqual(7)
    expect(Math.abs(chosen.tenor - 77)).toBeLessThanOrEqual(7)
    expect(chosen.tenor).toBeLessThanOrEqual(77)
    expect(chosen.tenor).toBeGreaterThan(chosen.lead)
  })

  it('inverts a filled bass onto a common tone instead of leaping to the root', () => {
    // F major. Lead A4 and tenor C5 are sung. Neighbors sit on C3, the fifth.
    const chosen = chooseSmoothVoicing({
      natureId: 'major',
      rootPc: 5,
      lead: 69,
      locked: { tenor: 72 },
      prev: { bass: 48 },
      next: { bass: 48 },
    })
    expect(chosen).not.toBeNull()
    if (!chosen) return
    expect(chosen.lead).toBe(69)
    expect(chosen.tenor).toBe(72)
    expect(chosen.bass).toBe(48)
  })

  it('honors preferred Detected nature when allowed', () => {
    const result = completeSparseStack({
      midi: { lead: 60, bass: 48 },
      tonality: 0,
      profile: 'sai11',
      preferredNatureId: 'seventh',
      preferredRootPc: 0,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.natureId).toBe('seventh')
    expect(result.rootPc).toBe(0)
    expect(result.pitches.bass).toBe(48)
  })
})
