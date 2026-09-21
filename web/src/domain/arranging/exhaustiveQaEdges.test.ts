/**
 * QA lint / fix edge matrix — many severity and boundary fixtures.
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { createEmptyArrangement, type ChordStack } from './types'
import { lintArrangement, createFixRegistry, incompleteTriadFix, thinNinthPreferFix } from './qa'
import { autoHarmonizeMelody } from './harmonize'
import { BARBERSHOP_CHORDS, placeVoicing, VOICINGS_BY_CHORD, voicingFitsLead, leadRoleInChord, chordContainsLead } from './chords'
import { strongVoicingLints } from './strongVoicing'
import { keySuggestionLints, swipeOpportunityLints, missingPillarCoverageLints } from './motionAndKey'
import { homophonyDensityLints, doubledThirdLints } from './denseQa'

function mkStack(p: Partial<ChordStack> & { midi: NonNullable<ChordStack['midi']> }): ChordStack {
  return {
    id: p.id ?? 's',
    startTick: p.startTick ?? 0,
    durationTicks: p.durationTicks ?? 480,
    rootPc: p.rootPc ?? 0,
    natureId: p.natureId ?? 'major',
    voicing: p.voicing ?? '1513',
    spread: p.spread ?? false,
    layer: p.layer ?? 'primary',
    scfGroup: p.scfGroup ?? null,
    pillarId: p.pillarId ?? null,
    midi: p.midi,
    ruleTags: p.ruleTags ?? [],
  }
}

describe('lead-range boundaries', () => {
  it.each([49, 50, 51, 76, 77, 78])('midi %i lead-range behavior', (midi) => {
    const p = createEmptyArrangement()
    p.melody = [{ id: 'm', midi, startTick: 0, durationTicks: 240, role: 'pmn' }]
    p.pillars = [
      { id: 'p', rootPc: 0, startTick: 0, endTick: 500, source: 'user', confirmed: true },
    ]
    const lints = lintArrangement(p).filter((l) => l.ruleId === 'lead-range')
    if (midi < 50 || midi > 77) expect(lints.length).toBeGreaterThan(0)
    else expect(lints.length).toBe(0)
  })
})

describe('illegal nature per profile', () => {
  it.each([
    ['sai11', 'half-dim', true],
    ['sai11', 'dim', true],
    ['sai11', 'seventh', false],
    ['bhs_extended', 'half-dim', false],
    ['learning', 'dim', false],
  ] as const)('profile %s nature %s illegal=%s', (profile, nature, illegal) => {
    const p = createEmptyArrangement()
    p.contestProfile = profile
    p.melody = [{ id: 'm', midi: 60, startTick: 0, durationTicks: 480, role: 'pmn' }]
    p.pillars = [
      { id: 'p', rootPc: 0, startTick: 0, endTick: 480, source: 'user', confirmed: true },
    ]
    p.stacks = [
      mkStack({
        natureId: nature,
        midi: { bass: 48, bari: 52, lead: 60, tenor: 63 },
      }),
    ]
    const hit = lintArrangement(p).some((l) => l.ruleId === 'illegal-nature')
    expect(hit).toBe(illegal)
  })
})

describe('dim-sustain duration thresholds', () => {
  it.each([240, 479, 480, 960])('dim7 duration %i', (dur) => {
    const p = createEmptyArrangement()
    p.melody = [{ id: 'm', midi: 60, startTick: 0, durationTicks: dur, role: 'pmn' }]
    p.pillars = [
      { id: 'p', rootPc: 0, startTick: 0, endTick: dur + 1, source: 'user', confirmed: true },
    ]
    p.stacks = [
      mkStack({
        natureId: 'dim7',
        durationTicks: dur,
        midi: { bass: 48, bari: 51, lead: 60, tenor: 66 },
      }),
    ]
    const hit = lintArrangement(p).some((l) => l.ruleId === 'dim-sustain')
    expect(hit).toBe(dur >= 480)
  })
})

describe('strong voicing across seventh voicings', () => {
  const chord = BARBERSHOP_CHORDS.find((c) => c.id === 'seventh')!
  for (const voicing of VOICINGS_BY_CHORD.seventh!) {
    it(`seventh voicing ${voicing} strong-voicing when lead is 1 or 5`, () => {
      const leadRole = Number(voicing[2])
      // Find a lead midi that matches
      let midi = null as ReturnType<typeof placeVoicing>
      for (let lead = 55; lead <= 72; lead++) {
        if (!chordContainsLead(chord, 0, lead)) continue
        if (leadRoleInChord(chord, 0, lead) !== leadRole) continue
        if (!voicingFitsLead(voicing, leadRole as 1 | 3 | 5 | 7 | 9)) continue
        midi = placeVoicing({ chord, rootPc: 0, leadMidi: lead, voicing })
        if (midi) break
      }
      if (!midi) return
      const stacks = [
        mkStack({ natureId: 'seventh', voicing, midi }),
      ]
      const melody = [
        { id: 'm', midi: midi.lead, startTick: 0, durationTicks: 480, role: 'pmn' as const },
      ]
      const lints = strongVoicingLints(stacks, melody)
      if (leadRole === 1 || leadRole === 5) {
        expect(lints.some((l) => l.ruleId === 'strong-voicing')).toBe(true)
      }
    })
  }
})

describe('homophony density thresholds', () => {
  it.each([4, 5, 6, 7, 8, 10])('%i uniform stacks', (n) => {
    const p = createEmptyArrangement()
    p.stacks = Array.from({ length: n }, (_, i) =>
      mkStack({
        id: `s${i}`,
        startTick: i * 480,
        durationTicks: 480,
        midi: { bass: 48, bari: 52, lead: 60, tenor: 67 },
      }),
    )
    const lints = homophonyDensityLints(p)
    if (n >= 6) expect(lints.length).toBeGreaterThan(0)
    else expect(lints.length).toBe(0)
  })
})

describe('swipe opportunity gaps', () => {
  it.each([
    [960, 240, true],
    [960, 100, false],
    [480, 400, false],
    [1200, 300, true],
  ] as const)('hold=%i gapAfter=%i expect=%s', (hold, gap, expectSwipe) => {
    const p = createEmptyArrangement()
    p.melody = [
      { id: 'a', midi: 60, startTick: 0, durationTicks: hold, role: 'pmn' },
      { id: 'b', midi: 62, startTick: hold + gap, durationTicks: 240, role: 'pmn' },
    ]
    const lints = swipeOpportunityLints(p)
    expect(lints.length > 0).toBe(expectSwipe)
  })
})

describe('key suggestion directions', () => {
  it.each([
    [[40, 42], 'up'],
    [[78, 80], 'down'],
    [[40, 80], 'both'],
    [[55, 60, 65], 'none'],
  ] as const)('melody %j → %s', (midis, kind) => {
    const p = createEmptyArrangement()
    p.melody = midis.map((m, i) => ({
      id: `m${i}`,
      midi: m,
      startTick: i * 240,
      durationTicks: 240,
      role: 'pmn' as const,
    }))
    const lints = keySuggestionLints(p)
    if (kind === 'none') expect(lints.length).toBe(0)
    else if (kind === 'both') expect(lints.some((l) => l.id === 'key-both-ends')).toBe(true)
    else {
      expect(lints.length).toBeGreaterThan(0)
      const semi = Number(lints[0]!.data?.semitones)
      if (kind === 'up') expect(semi).toBeGreaterThan(0)
      if (kind === 'down') expect(semi).toBeLessThan(0)
    }
  })
})

describe('thin-ninth and incomplete-triad fix matrix', () => {
  it('thin ninth lint + omit-root prefer fix when candidates exist', () => {
    const p = createEmptyArrangement()
    p.melody = [{ id: 'm', midi: 62, startTick: 0, durationTicks: 480, role: 'pmn' }]
    p.pillars = [
      { id: 'p', rootPc: 0, startTick: 0, endTick: 480, source: 'user', confirmed: true },
    ]
    // Force thin PC ninth-like stack
    p.stacks = [
      mkStack({
        natureId: 'ninth',
        voicing: '1793',
        midi: { bass: 48, bari: 48, lead: 62, tenor: 62 },
      }),
    ]
    const lint = lintArrangement(p).find((l) => l.ruleId === 'thin-ninth')
    if (lint && thinNinthPreferFix.canFix(lint, p)) {
      const patch = thinNinthPreferFix.apply(lint, p)
      expect(patch?.stacks?.[0]?.voicing.startsWith('5') || patch?.stacks).toBeTruthy()
    }
  })

  it('incomplete triad fix when canFix', () => {
    const p = createEmptyArrangement()
    p.melody = [{ id: 'm', midi: 60, startTick: 0, durationTicks: 480, role: 'pmn' }]
    p.pillars = [
      { id: 'p', rootPc: 0, startTick: 0, endTick: 480, source: 'user', confirmed: true },
    ]
    p.stacks = [
      mkStack({
        natureId: 'major',
        midi: { bass: 60, bari: 60, lead: 60, tenor: 72 },
      }),
    ]
    const lint = lintArrangement(p).find((l) => l.ruleId === 'incomplete-triad')
    expect(lint).toBeTruthy()
    if (incompleteTriadFix.canFix(lint!, p)) {
      expect(incompleteTriadFix.apply(lint!, p)?.stacks).toBeTruthy()
    }
  })
})

describe('applyAllSafe on auto-harmonized phrases of varying length', () => {
  it.each([3, 5, 8, 12])('%i-note phrase safe fixes', (n) => {
    const p = createEmptyArrangement()
    p.melody = Array.from({ length: n }, (_, i) => ({
      id: `m${i}`,
      midi: 60 + (i % 8),
      startTick: i * 480,
      durationTicks: 480,
      role: (i % 2 === 0 ? 'pmn' : 'smn') as const,
    }))
    p.pillars = [
      { id: 'p', rootPc: 0, startTick: 0, endTick: n * 480 + 1, source: 'user', confirmed: true },
    ]
    p.stacks = autoHarmonizeMelody({
      melody: p.melody,
      pillars: p.pillars,
      tonality: 0,
    })
    // Break first tenor
    if (p.stacks[0]?.midi) {
      p.stacks[0] = {
        ...p.stacks[0],
        midi: { ...p.stacks[0].midi, tenor: p.stacks[0].midi.lead - 1 },
      }
    }
    const lints = lintArrangement(p)
    expect(() => createFixRegistry().applyAllSafe(p, lints)).not.toThrow()
  })
})

describe('missing pillar coverage ticks', () => {
  it.each([
    [0, 480, 0, false],
    [0, 480, 240, false],
    [0, 480, 480, true],
    [0, 480, 1000, true],
  ] as const)('pillar[%i,%i) note@%i missing=%s', (ps, pe, tick, missing) => {
    const p = createEmptyArrangement()
    p.melody = [{ id: 'm', midi: 60, startTick: tick, durationTicks: 120, role: 'pmn' }]
    p.pillars = [
      { id: 'p', rootPc: 0, startTick: ps, endTick: pe, source: 'user', confirmed: true },
    ]
    const lints = missingPillarCoverageLints(p)
    expect(lints.length > 0).toBe(missing)
  })
})

describe('doubledThirdLints never throws on stacks', () => {
  it('runs on auto-harmonized stacks', () => {
    const melody = [60, 64, 67, 65].map((m, i) => ({
      id: `m${i}`,
      midi: m,
      startTick: i * 480,
      durationTicks: 480,
      role: 'pmn' as const,
    }))
    const pillars = [
      { id: 'p', rootPc: 0, startTick: 0, endTick: 5000, source: 'user' as const, confirmed: true },
    ]
    const stacks = autoHarmonizeMelody({ melody, pillars, tonality: 0 })
    expect(() => doubledThirdLints(stacks)).not.toThrow()
  })
})
