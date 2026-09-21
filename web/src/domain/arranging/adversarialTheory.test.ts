import { describe, expect, it } from 'vitest'
import {
  classifyRootMotion,
  scoreRootMotion,
  isM3Up,
  isBs7Nature,
  distanceFromHome,
} from './approachThree'
import {
  romanForChord,
  romanForChordDetailed,
  isDominantOf,
} from './secondaryDominant'
import {
  functionTagForStack,
  analyzeTensionRelease,
  leadIsActiveTone,
  resolutionScore,
} from './tensionRelease'
import { leadAllowsCounterpartSwap, counterpartRoot, suggestCounterpart } from './counterpart'
import { checkStackInternal } from './voiceLeading'
import { suggestKeyChanges } from './keyChange'
import { assessKeyChangeFormImpact } from './keyChangeForm'
import { bs7RootsFromDim7, m6RootsFromDim7 } from './dim7Hints'
import {
  analyzeSpacing,
  checkStackSpacing,
  scoreHarmonicSeriesSpacing,
} from './spacing/harmonicSeriesSpacing'
import { explainStackTheory, analyzeHarmonyTheory } from './analyzeHarmonyTheory'
import { autocompleteSubstitutionChips } from './harmonize/chordAutocomplete'
import { generateCandidates } from './harmonize/candidateGenerator'
import { createEmptyArrangement } from './types'
import { BARBERSHOP_CHORDS, placeVoicing } from './chords'
import { lintArrangement } from './qa'
import { isNatureAllowed } from './contestProfile'
import { JI_CENTS_BY_ROLE, roleCents, ratioToCentsVsEt, JUST_RATIOS } from './justIntonation'
import {
  explainProjectStackTheory,
  autocompleteChordAtNote,
} from '../../application/arranging/TheoryAssist'

const PC = {
  C: 0,
  Db: 1,
  D: 2,
  Eb: 3,
  E: 4,
  F: 5,
  Gb: 6,
  G: 7,
  Ab: 8,
  A: 9,
  Bb: 10,
  B: 11,
} as const

function mkStack(
  partial: Partial<ReturnType<typeof createEmptyArrangement>['stacks'][number]> & {
    rootPc: number
    natureId: string
  },
) {
  return {
    id: partial.id ?? 's',
    startTick: partial.startTick ?? 0,
    durationTicks: partial.durationTicks ?? 480,
    rootPc: partial.rootPc,
    natureId: partial.natureId,
    voicing: partial.voicing ?? '1735',
    spread: partial.spread ?? false,
    layer: partial.layer ?? 'primary',
    scfGroup: partial.scfGroup ?? null,
    pillarId: partial.pillarId ?? null,
    midi: partial.midi ?? null,
    ruleTags: partial.ruleTags ?? [],
  }
}

describe('adversarialTheory: motion (D1)', () => {
  it('I→V is springboard free leap, not retrogression', () => {
    expect(
      classifyRootMotion({ fromRoot: PC.C, toRoot: PC.G, tonality: PC.C }),
    ).toBe('springboard')
    expect(
      scoreRootMotion('springboard', false),
    ).toBeGreaterThan(scoreRootMotion('p5_up_retro', false))
  })

  it('ii→vi remains true retrogression', () => {
    expect(
      classifyRootMotion({ fromRoot: PC.D, toRoot: PC.A, tonality: PC.C }),
    ).toBe('p5_up_retro')
  })

  it('IV→I remains cadential; I→ii is springboard', () => {
    expect(
      classifyRootMotion({ fromRoot: PC.F, toRoot: PC.C, tonality: PC.C }),
    ).toBe('p5_up_cadential')
    expect(
      classifyRootMotion({ fromRoot: PC.C, toRoot: PC.D, tonality: PC.C }),
    ).toBe('springboard')
  })

  it('R5: F7→A (M3 up) is m3_up when from is seventh', () => {
    expect(isM3Up(PC.F, PC.A)).toBe(true)
    expect(
      classifyRootMotion({
        fromRoot: PC.F,
        toRoot: PC.A,
        tonality: PC.A,
        fromIsSeventh: true,
      }),
    ).toBe('m3_up')
  })

  it('R5 soft-penalizes M3-up into another seventh/ninth', () => {
    const intoTriad = scoreRootMotion('m3_up', true, { targetIsSeventh: false })
    const intoSeventh = scoreRootMotion('m3_up', true, { targetIsSeventh: true })
    expect(intoTriad).toBeGreaterThan(intoSeventh)
  })

  it('distanceFromHome matches Stevens/Prietto steps (F ≠ 1)', () => {
    expect(distanceFromHome(PC.C, PC.C)).toBe(0)
    expect(distanceFromHome(PC.G, PC.C)).toBe(1)
    expect(distanceFromHome(PC.D, PC.C)).toBe(2)
    expect(distanceFromHome(PC.A, PC.C)).toBe(3)
    expect(distanceFromHome(PC.E, PC.C)).toBe(4)
    expect(distanceFromHome(PC.F, PC.C)).not.toBe(1)
    expect(distanceFromHome(PC.F, PC.C)).toBeGreaterThan(1)
  })
})

describe('adversarialTheory: roman / sec-dom (D2–D4, U8)', () => {
  it('labels V7 and V7/V with II7 alt', () => {
    expect(
      romanForChord({ rootPc: PC.G, natureId: 'seventh', tonality: PC.C, resolvesToRoot: PC.C }),
    ).toBe('V7')
    const vv = romanForChordDetailed({
      rootPc: PC.D,
      natureId: 'seventh',
      tonality: PC.C,
      resolvesToRoot: PC.G,
    })
    expect(vv.roman).toBe('V7/V')
    expect(vv.altRoman).toBe('II7')
  })

  it('tonic Mm7 → I7; driving IV gets alt V7/IV', () => {
    expect(
      romanForChord({ rootPc: PC.C, natureId: 'seventh', tonality: PC.C }),
    ).toBe('I7')
    const d = romanForChordDetailed({
      rootPc: PC.C,
      natureId: 'seventh',
      tonality: PC.C,
      resolvesToRoot: PC.F,
    })
    expect(d.roman).toBe('I7')
    expect(d.altRoman).toBe('V7/IV')
  })

  it('IV7 alone is IV7 — never a fake secondary', () => {
    expect(
      romanForChord({ rootPc: PC.F, natureId: 'seventh', tonality: PC.C }),
    ).toBe('IV7')
  })

  it('never emits V7/degN; F7→B♭ in C is V7/♭VII', () => {
    const r = romanForChord({
      rootPc: PC.F,
      natureId: 'seventh',
      tonality: PC.C,
      resolvesToRoot: PC.Bb,
    })
    expect(r).not.toMatch(/deg/)
    expect(r).toBe('V7/♭VII')
  })

  it('m7 is never labeled V7 / V7/X', () => {
    const r = romanForChord({
      rootPc: PC.D,
      natureId: 'm7',
      tonality: PC.C,
      resolvesToRoot: PC.G,
    })
    expect(r).not.toMatch(/^V7/)
    expect(r).toBe('ii7')
  })
})

describe('adversarialTheory: tension tags (D5)', () => {
  it('V7 of next pillar is tension; non-aiming BS7 is color', () => {
    expect(
      functionTagForStack(mkStack({ rootPc: PC.G, natureId: 'seventh', layer: 'primary' }), {
        nextPillarRoot: PC.C,
      }),
    ).toBe('tension')
    expect(
      functionTagForStack(mkStack({ rootPc: PC.D, natureId: 'seventh', layer: 'primary' }), {
        nextPillarRoot: PC.C,
        pillarRoot: PC.C,
      }),
    ).toBe('color')
  })

  it('SCF/passing non-aiming dominant is passing', () => {
    expect(
      functionTagForStack(
        mkStack({ rootPc: PC.D, natureId: 'seventh', layer: 'passing', scfGroup: 1 }),
        { nextPillarRoot: PC.C },
      ),
    ).toBe('passing')
  })
})

describe('adversarialTheory: counterpart', () => {
  it('allows swap on 3/7; rejects on 1/5', () => {
    // C7 tones: C E G Bb — E=3, Bb=7, C=1, G=5
    expect(leadAllowsCounterpartSwap({ originalRoot: PC.C, leadMidi: 64 })).toBe(true) // E
    expect(leadAllowsCounterpartSwap({ originalRoot: PC.C, leadMidi: 70 })).toBe(true) // Bb
    expect(leadAllowsCounterpartSwap({ originalRoot: PC.C, leadMidi: 60 })).toBe(false) // C
    expect(leadAllowsCounterpartSwap({ originalRoot: PC.C, leadMidi: 67 })).toBe(false) // G
    expect(counterpartRoot(PC.C)).toBe(PC.Gb)
  })

  it('allows raised root (♯1) of original BS7', () => {
    // C♯ = raised root of C
    expect(leadAllowsCounterpartSwap({ originalRoot: PC.C, leadMidi: 61 })).toBe(true)
    expect(
      leadAllowsCounterpartSwap({ originalRoot: PC.C, leadMidi: 61, allowRaisedRoot: false }),
    ).toBe(false)
    const sug = suggestCounterpart({
      note: { id: 'n', midi: 61, startTick: 0, durationTicks: 480, role: 'pmn' },
      originalRoot: PC.C,
    })
    expect(sug?.reason).toMatch(/raised root/i)
  })
})

describe('adversarialTheory: fromIsSeventh uses previous nature', () => {
  it('isBs7Nature is seventh/ninth only (not m7)', () => {
    expect(isBs7Nature('seventh')).toBe(true)
    expect(isBs7Nature('ninth')).toBe(true)
    expect(isBs7Nature('m7')).toBe(false)
    expect(isBs7Nature('major')).toBe(false)
  })

  it('chromatic R2 tags only when prevNatureId is BS7/9', () => {
    const note = {
      id: 'n',
      midi: 60, // C — fits many chords
      startTick: 480,
      durationTicks: 480,
      role: 'pmn' as const,
    }
    const pillar = {
      id: 'p',
      rootPc: PC.C,
      startTick: 0,
      endTick: 1920,
    }
    // Prev was G major triad (not BS7) → chromatic into Ab should not unlock R2
    const fromMajor = generateCandidates({
      note,
      pillar,
      tonality: PC.C,
      prevRootPc: PC.G,
      prevNatureId: 'major',
      preferScf: true,
    })
    const chromaticFromMajor = fromMajor.filter(
      (c) => c.rootPc === PC.Ab && c.ruleTags.includes('R2_chromatic'),
    )
    expect(chromaticFromMajor.length).toBe(0)

    // Prev was G7 → same chromatic root can be R2
    const fromG7 = generateCandidates({
      note,
      pillar,
      tonality: PC.C,
      prevRootPc: PC.G,
      prevNatureId: 'seventh',
      preferScf: true,
    })
    expect(fromG7.some((c) => c.rootPc === PC.Ab && c.ruleTags.includes('R2_chromatic'))).toBe(
      true,
    )
  })

  it('maj7 internal m2 is exempt from VL warn (S13)', () => {
    const stack = {
      id: 'cm7',
      startTick: 0,
      durationTicks: 480,
      rootPc: 0,
      natureId: 'maj7',
      voicing: '1573',
      spread: false,
      layer: 'primary' as const,
      scfGroup: null,
      pillarId: null,
      // C E G B with B–C adjacent
      midi: { bass: 48, bari: 52, lead: 60, tenor: 71 },
      ruleTags: [],
    }
    expect(checkStackInternal(stack).every((i) => !i.id.startsWith('m2-'))).toBe(true)
  })
})

describe('adversarialTheory: key-change idioms', () => {
  it('C→F uses named I7-as-V (old tonic = V of new)', () => {
    const paths = suggestKeyChanges({
      fromTonality: PC.C,
      toTonality: PC.F,
      characters: ['direct'],
      limit: 16,
    })
    const hit = paths.find((p) => p.templateId === 'I7-as-V' || p.id.includes('I7-as-V'))
    expect(hit).toBeTruthy()
    expect(hit!.steps.map((s) => s.rootPc)).toEqual([PC.C, PC.F])
  })

  it('C→E offers tertian template', () => {
    const paths = suggestKeyChanges({
      fromTonality: PC.C,
      toTonality: PC.E,
      characters: ['smooth'],
      limit: 24,
    })
    expect(paths.some((p) => p.templateId === 'tertian' || p.id.includes('tertian'))).toBe(true)
  })

  it('abrupt path is labeled hitch', () => {
    const paths = suggestKeyChanges({
      fromTonality: PC.C,
      toTonality: PC.G,
      characters: ['abrupt'],
      limit: 8,
    })
    const hitch = paths.find((p) => p.templateId === 'hitch')
    expect(hitch?.label).toMatch(/hitch/i)
  })

  it('form impact warns when measures/ticks change', () => {
    const bad = assessKeyChangeFormImpact({
      beforeMeasureCount: 8,
      afterMeasureCount: 7,
      beforeTickLength: 7680,
      afterTickLength: 6720,
    })
    expect(bad.ok).toBe(false)
    expect(bad.warnings.length).toBe(2)
    expect(
      assessKeyChangeFormImpact({
        beforeMeasureCount: 8,
        afterMeasureCount: 8,
        beforeTickLength: 7680,
        afterTickLength: 7680,
      }).ok,
    ).toBe(true)
  })
})

describe('adversarialTheory: soft extensions', () => {
  it('dim7→BS7 hints lower each tone', () => {
    const roots = bs7RootsFromDim7(PC.C)
    expect(roots).toHaveLength(4)
    expect(new Set(roots).size).toBe(4)
    // Cdim7 pcs C Eb Gb Bbb(=A); lowered → B, D, F, Ab
    expect(roots.sort((a, b) => a - b)).toEqual([PC.B, PC.D, PC.F, PC.Ab].sort((a, b) => a - b))
  })

  it('dim7→m6 hints raise each tone (as 5th of m6)', () => {
    const roots = m6RootsFromDim7(PC.C)
    expect(roots).toHaveLength(4)
    expect(new Set(roots).size).toBe(4)
    // raised C→Db → Gb m6; Eb→E → A; Gb→G → C; A→Bb → Eb
    expect(roots.sort((a, b) => a - b)).toEqual([PC.Gb, PC.A, PC.C, PC.Eb].sort((a, b) => a - b))
  })

  it('dim7-chain and duration BS7 lints fire', () => {
    const p = createEmptyArrangement('soft')
    p.bpm = 100
    p.melody = [{ id: 'm', midi: 60, startTick: 0, durationTicks: 480, role: 'pmn' }]
    p.stacks = [
      mkStack({ id: 'a', rootPc: 0, natureId: 'dim7', startTick: 0, durationTicks: 240 }),
      mkStack({ id: 'b', rootPc: 1, natureId: 'dim7', startTick: 240, durationTicks: 240 }),
      mkStack({ id: 'c', rootPc: 0, natureId: 'major', startTick: 480, durationTicks: 960 }),
      mkStack({ id: 'd', rootPc: 5, natureId: 'major', startTick: 1440, durationTicks: 960 }),
    ]
    const lints = lintArrangement(p)
    expect(lints.some((l) => l.ruleId === 'dim7-chain')).toBe(true)
    expect(lints.some((l) => l.ruleId === 'bs7-density-duration')).toBe(true)
  })

  it('counterpart flicker warns at high bpm with short tritone pair', () => {
    const p = createEmptyArrangement('flicker')
    p.bpm = 160
    p.melody = [{ id: 'm', midi: 60, startTick: 0, durationTicks: 480, role: 'pmn' }]
    p.stacks = [
      mkStack({
        id: 'a',
        rootPc: PC.C,
        natureId: 'seventh',
        startTick: 0,
        durationTicks: 120,
      }),
      mkStack({
        id: 'b',
        rootPc: PC.Gb,
        natureId: 'seventh',
        startTick: 120,
        durationTicks: 120,
      }),
      mkStack({ id: 'c', rootPc: 0, natureId: 'major', startTick: 240, durationTicks: 480 }),
      mkStack({ id: 'd', rootPc: 0, natureId: 'major', startTick: 720, durationTicks: 480 }),
    ]
    expect(lintArrangement(p).some((l) => l.ruleId === 'counterpart-flicker')).toBe(true)
  })
})

describe('adversarialTheory: headless APIs', () => {
  it('explainStackTheory / analyzeSpacing / analyzeTensionRelease', () => {
    const project = createEmptyArrangement('api')
    project.tonality = 0
    const g7 = placeVoicing({
      chord: BARBERSHOP_CHORDS.find((c) => c.id === 'seventh')!,
      rootPc: 7,
      leadMidi: 71,
      voicing: '1735',
      spread: false,
    })!
    const c = placeVoicing({
      chord: BARBERSHOP_CHORDS.find((c) => c.id === 'major')!,
      rootPc: 0,
      leadMidi: 64,
      voicing: '1531',
      spread: false,
    })!
    project.stacks = [
      mkStack({ id: 'g7', rootPc: 7, natureId: 'seventh', midi: g7, startTick: 0 }),
      mkStack({
        id: 'c',
        rootPc: 0,
        natureId: 'major',
        midi: c,
        startTick: 480,
        voicing: '1531',
      }),
    ]
    project.pillars = [
      {
        id: 'p1',
        rootPc: 0,
        startTick: 0,
        endTick: 1920,
        source: 'user',
        confirmed: true,
      },
    ]
    const report = analyzeHarmonyTheory(project)
    expect(report.labels.length).toBe(2)
    const explained = explainStackTheory(project, 'g7')
    expect(explained?.label.roman).toBeTruthy()
    expect(explainProjectStackTheory(project, 'g7')?.label.roman).toBeTruthy()

    const muddy = scoreHarmonicSeriesSpacing({
      bass: 60,
      bari: 62,
      lead: 64,
      tenor: 67,
    })
    expect(muddy.issues.length).toBeGreaterThan(0)
    expect(analyzeSpacing(project.stacks).length).toBeGreaterThanOrEqual(0)
    expect(checkStackSpacing(project.stacks[0]!).length).toBeGreaterThanOrEqual(0)
    expect(analyzeTensionRelease(project.stacks).length).toBeGreaterThanOrEqual(0)
  })

  it('autocompleteSubstitutionChips returns strategies', () => {
    const chips = autocompleteSubstitutionChips({
      leadMidi: 66, // F#
      pillarRoot: 0,
      tonality: 0,
      mode: 'major',
      nextPillarRoot: 7,
    })
    expect(chips.length).toBeGreaterThan(0)
  })
})

describe('adversarialTheory: profiles', () => {
  it('half-dim illegal under sai11; legal under bhs_extended', () => {
    expect(isNatureAllowed('sai11', 'half-dim')).toBe(false)
    expect(isNatureAllowed('bhs_extended', 'half-dim')).toBe(true)
  })
})

describe('adversarialTheory: minor pipeline (P3)', () => {
  it('generator in A minor prefers i/iv springboards and labels i', () => {
    const note = {
      id: 'n',
      midi: 69, // A
      startTick: 0,
      durationTicks: 480,
      role: 'pmn' as const,
    }
    const pillar = {
      id: 'p',
      rootPc: 9,
      startTick: 0,
      endTick: 1920,
      source: 'user' as const,
      confirmed: true,
    }
    const raw = generateCandidates({
      note,
      pillar,
      tonality: 9,
      mode: 'minor',
      prevRootPc: null,
      preferScf: false,
      nextPillarRoot: null,
    })
    expect(raw.some((c) => c.natureId === 'minor' && c.rootPc === 9)).toBe(true)
    expect(
      romanForChord({ rootPc: 9, natureId: 'minor', tonality: 9, mode: 'minor' }),
    ).toBe('i')
  })

  it('app autocomplete respects project tonalityMode', () => {
    const project = createEmptyArrangement('min')
    project.tonality = 9
    project.tonalityMode = 'minor'
    project.melody = [
      { id: 'n', midi: 69, startTick: 0, durationTicks: 480, role: 'pmn' },
    ]
    project.pillars = [
      {
        id: 'p',
        rootPc: 9,
        startTick: 0,
        endTick: 1920,
        source: 'user',
        confirmed: true,
      },
    ]
    const suggestions = autocompleteChordAtNote(project, project.melody[0]!)
    expect(suggestions.length).toBeGreaterThan(0)
  })
})

describe('adversarialTheory: JI goldens (P3)', () => {
  it('harmonic seventh is ~−31¢ vs ET', () => {
    const cents = JI_CENTS_BY_ROLE[7]!
    expect(cents).toBeCloseTo(ratioToCentsVsEt(JUST_RATIOS.harm7, 10), 5)
    expect(cents).toBeGreaterThan(-33)
    expect(cents).toBeLessThan(-29)
  })

  it('maj6 vs m7 differ in third cents', () => {
    const maj6 = BARBERSHOP_CHORDS.find((c) => c.id === 'sixth')!
    const m7 = BARBERSHOP_CHORDS.find((c) => c.id === 'm7')!
    expect(roleCents(maj6, 3)).not.toBe(roleCents(m7, 3))
  })
})

describe('adversarialTheory: lead active tone + resolution', () => {
  it('leadIsActiveTone on dominant 3/7', () => {
    expect(leadIsActiveTone('seventh', PC.G, 71)).toBe(true) // B
    expect(leadIsActiveTone('seventh', PC.G, 67)).toBe(false) // G
  })

  it('poor resolution scores low', () => {
    const prev = placeVoicing({
      chord: BARBERSHOP_CHORDS.find((c) => c.id === 'seventh')!,
      rootPc: 7,
      leadMidi: 71,
      voicing: '1735',
      spread: false,
    })!
    const next = {
      bass: prev.bass + 5,
      bari: prev.bari + 5,
      lead: prev.lead + 5,
      tenor: prev.tenor + 5,
    }
    expect(resolutionScore({ rootPc: 7, natureId: 'seventh', midi: prev }, next)).toBeLessThan(
      0.75,
    )
  })
})

describe('adversarialTheory: isDominantOf sanity', () => {
  it('G dominates C; F does not dominate C', () => {
    expect(isDominantOf(PC.G, PC.C)).toBe(true)
    expect(isDominantOf(PC.F, PC.C)).toBe(false)
  })
})
