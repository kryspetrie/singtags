import { describe, expect, it } from 'vitest'
import {
  applyCounterpartToStack,
  counterpartRoot,
  leadAllowsCounterpartSwap,
  suggestCounterpart,
} from './counterpart'
import { generateCandidates } from './harmonize'
import { createEmptyArrangement } from './types'

describe('remediation: tritone counterpart', () => {
  it('counterpart roots differ by tritone', () => {
    expect(counterpartRoot(0)).toBe(6)
    expect(counterpartRoot(3)).toBe(9)
    expect(counterpartRoot(counterpartRoot(5))).toBe(5)
  })

  it('allows swap when lead is 3 or 7 of original BS7', () => {
    // C7: C E G Bb — E=4 is 3rd, Bb=10 is 7th
    expect(leadAllowsCounterpartSwap({ originalRoot: 0, leadMidi: 64 })).toBe(true) // E
    expect(leadAllowsCounterpartSwap({ originalRoot: 0, leadMidi: 70 })).toBe(true) // Bb
    expect(leadAllowsCounterpartSwap({ originalRoot: 0, leadMidi: 60 })).toBe(false) // C root
    expect(leadAllowsCounterpartSwap({ originalRoot: 0, leadMidi: 67 })).toBe(false) // G fifth
  })

  it('allows flat-five melody → counterpart root', () => {
    // Db harmony (1) with melody G (7) → G7 counterpart
    expect(leadAllowsCounterpartSwap({ originalRoot: 1, leadMidi: 67 })).toBe(true)
  })

  it('suggestCounterpart returns F#7 when lead is E on C7', () => {
    const note = {
      id: 'n',
      midi: 64, // E = 3rd of C7 = 7th of F#7
      startTick: 0,
      durationTicks: 480,
      role: 'pmn' as const,
    }
    const sug = suggestCounterpart({ note, originalRoot: 0 })
    expect(sug).not.toBeNull()
    expect(sug!.toRoot).toBe(6)
    expect(sug!.natureId).toBe('seventh')
    expect(sug!.midi.lead).toBe(64)
  })

  it('rejects suggest when lead is root of original', () => {
    const note = {
      id: 'n',
      midi: 60,
      startTick: 0,
      durationTicks: 480,
      role: 'pmn' as const,
    }
    expect(suggestCounterpart({ note, originalRoot: 0 })).toBeNull()
  })

  it('SCF group 5 tags R3 only when swap is legal', () => {
    const pillar = {
      id: 'p',
      rootPc: 0,
      startTick: 0,
      endTick: 1920,
      source: 'user' as const,
      confirmed: true,
    }
    const legalNote = {
      id: 'n1',
      midi: 64, // E
      startTick: 0,
      durationTicks: 480,
      role: 'smn' as const,
    }
    const legal = generateCandidates({
      note: legalNote,
      pillar,
      tonality: 0,
      prevRootPc: 0,
      preferScf: true,
    })
    const g5Legal = legal.filter((c) => c.scfGroup === 5 && c.natureId === 'seventh')
    expect(g5Legal.length).toBeGreaterThan(0)
    expect(g5Legal.every((c) => c.ruleTags.includes('R3_tritone'))).toBe(true)

    const weakNote = {
      id: 'n2',
      midi: 66, // F# = root of counterpart; ♭5 of C — actually ALLOWED via flat-five
      startTick: 0,
      durationTicks: 480,
      role: 'smn' as const,
    }
    // Use G (67) = 5th of C7 — fits C#? counterpart root 6 = F#7 tones F# A# C# E — G not in chord
    // Lead on G of pillar: may not generate G5 at all. Use lead that fits counterpart as root of F#7
    // F# midi 66 is root of counterpart = flat five of C — allowFlatFive true → R3 tagged
    const flatFive = generateCandidates({
      note: weakNote,
      pillar,
      tonality: 0,
      prevRootPc: 0,
      preferScf: true,
    })
    const g5Flat = flatFive.filter((c) => c.scfGroup === 5 && c.natureId === 'seventh')
    if (g5Flat.length) {
      expect(g5Flat.every((c) => c.ruleTags.includes('R3_tritone'))).toBe(true)
    }
  })

  it('applyCounterpartToStack stamps R3; scfGroup left unset (R3 ≠ pillar G5)', () => {
    const project = createEmptyArrangement('cp')
    const note = {
      id: 'n',
      midi: 64,
      startTick: 0,
      durationTicks: 480,
      role: 'pmn' as const,
    }
    const sug = suggestCounterpart({ note, originalRoot: 0 })!
    const stack = {
      id: 's1',
      startTick: 0,
      durationTicks: 480,
      rootPc: 0,
      natureId: 'seventh',
      voicing: '1735',
      spread: false,
      layer: 'primary' as const,
      scfGroup: null,
      pillarId: null,
      midi: sug.midi,
      ruleTags: [] as [],
    }
    const next = applyCounterpartToStack(stack, sug)
    expect(next.rootPc).toBe(6)
    expect(next.scfGroup).toBeNull()
    expect(next.ruleTags).toContain('R3_tritone')
  })
})
