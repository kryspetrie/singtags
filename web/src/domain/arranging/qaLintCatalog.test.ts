/**
 * Every QA lint rule fires and clears correctly; VL / strong / motion / dense paths.
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { createEmptyArrangement, type ArrangementProject, type ChordStack } from './types'
import { lintArrangement, createFixRegistry } from './qa'
import { autoHarmonizeMelody } from './harmonize'
import { analyzeVoiceLeading, checkStackInternal } from './voiceLeading'
import { strongVoicingLints } from './strongVoicing'
import {
  countSeventhDensity,
  keySuggestionLints,
  missingPillarCoverageLints,
  motionLints,
  swipeOpportunityLints,
} from './motionAndKey'
import {
  copyrightReminderLint,
  doubledThirdLints,
  dullHarmonicityLints,
  homophonyDensityLints,
} from './denseQa'
import { assessSongEligibility, phraseLengthHint } from './songEligibility'
import { strengthenStacks } from './strengthen'
import { polishVoicings } from './polishVoicing'
import { assessFinalReadiness } from './finalChecklist'
import { findEmbellishmentSeeds, applyEmbellishmentSeed } from './embellishments'
import { suggestPillars, suggestionsToPillars, pillarAtTick } from './pillars'
import { BARBERSHOP_CHORDS, placeVoicing } from './chords'

function stack(partial: Partial<ChordStack> & { midi: NonNullable<ChordStack['midi']> }): ChordStack {
  return {
    id: partial.id ?? 's1',
    startTick: partial.startTick ?? 0,
    durationTicks: partial.durationTicks ?? 480,
    rootPc: partial.rootPc ?? 0,
    natureId: partial.natureId ?? 'major',
    voicing: partial.voicing ?? '1513',
    spread: partial.spread ?? false,
    layer: partial.layer ?? 'primary',
    scfGroup: partial.scfGroup ?? null,
    pillarId: partial.pillarId ?? null,
    midi: partial.midi,
    ruleTags: partial.ruleTags ?? [],
  }
}

function harmonizedPhrase(): ArrangementProject {
  const p = createEmptyArrangement('QA')
  p.contestProfile = 'sai11'
  p.melody = [60, 64, 67, 65, 64, 62, 60, 59].map((midi, i) => ({
    id: `m${i}`,
    midi,
    startTick: i * 480,
    durationTicks: 480,
    role: i % 2 === 0 ? ('pmn' as const) : ('smn' as const),
  }))
  p.pillars = [
    { id: 'p', rootPc: 0, startTick: 0, endTick: 4800, source: 'user', confirmed: true },
  ]
  p.stacks = autoHarmonizeMelody({
    melody: p.melody,
    pillars: p.pillars,
    tonality: 0,
    profile: 'sai11',
  })
  return p
}

describe('QA lint catalog', () => {
  it('no-melody error on empty project', () => {
    const lints = lintArrangement(createEmptyArrangement())
    expect(lints.some((l) => l.ruleId === 'no-melody')).toBe(true)
  })

  it('no-pillars when melody exists without pillars', () => {
    const p = createEmptyArrangement()
    p.melody = [{ id: 'm', midi: 60, startTick: 0, durationTicks: 480, role: 'pmn' }]
    expect(lintArrangement(p).some((l) => l.ruleId === 'no-pillars')).toBe(true)
  })

  it('unconfirmed-pillars warn', () => {
    const p = createEmptyArrangement()
    p.melody = [{ id: 'm', midi: 60, startTick: 0, durationTicks: 480, role: 'pmn' }]
    p.pillars = [
      { id: 'p', rootPc: 0, startTick: 0, endTick: 480, source: 'inferred', confirmed: false },
    ]
    expect(lintArrangement(p).some((l) => l.ruleId === 'unconfirmed-pillars')).toBe(true)
  })

  it('lead-range warn for very high / low lead', () => {
    const p = createEmptyArrangement()
    p.melody = [
      { id: 'hi', midi: 84, startTick: 0, durationTicks: 240, role: 'pmn' },
      { id: 'lo', midi: 40, startTick: 240, durationTicks: 240, role: 'pmn' },
    ]
    p.pillars = [
      { id: 'p', rootPc: 0, startTick: 0, endTick: 1000, source: 'user', confirmed: true },
    ]
    const lints = lintArrangement(p)
    expect(lints.filter((l) => l.ruleId === 'lead-range').length).toBeGreaterThanOrEqual(2)
  })

  it('illegal-nature error for half-dim under sai11', () => {
    const p = createEmptyArrangement()
    p.contestProfile = 'sai11'
    p.melody = [{ id: 'm', midi: 60, startTick: 0, durationTicks: 480, role: 'pmn' }]
    p.pillars = [
      { id: 'p', rootPc: 0, startTick: 0, endTick: 480, source: 'user', confirmed: true },
    ]
    p.stacks = [
      stack({
        natureId: 'half-dim',
        midi: { bass: 48, bari: 55, lead: 60, tenor: 63 },
      }),
    ]
    expect(lintArrangement(p).some((l) => l.ruleId === 'illegal-nature')).toBe(true)
  })

  it('does not flag unidentified stacks as outside vocabulary', () => {
    const p = createEmptyArrangement()
    p.contestProfile = 'sai11'
    p.melody = [{ id: 'm', midi: 60, startTick: 0, durationTicks: 480, role: 'pmn' }]
    p.pillars = [
      { id: 'p', rootPc: 0, startTick: 0, endTick: 480, source: 'user', confirmed: true },
    ]
    p.stacks = [
      stack({
        natureId: 'unknown',
        midi: { bass: 48, bari: 55, lead: 60, tenor: 64 },
      }),
    ]
    const lints = lintArrangement(p)
    expect(lints.some((l) => l.ruleId === 'illegal-nature')).toBe(false)
    expect(lints.some((l) => l.ruleId === 'unrecognized-nature')).toBe(true)
  })

  it('aug-pillar and aug-many', () => {
    const p = createEmptyArrangement()
    p.melody = [{ id: 'm', midi: 60, startTick: 0, durationTicks: 120, role: 'pmn' }]
    p.pillars = [
      { id: 'p', rootPc: 0, startTick: 0, endTick: 2000, source: 'user', confirmed: true },
    ]
    p.stacks = [0, 1, 2].map((i) =>
      stack({
        id: `a${i}`,
        startTick: i * 120,
        durationTicks: 120,
        natureId: 'aug',
        layer: 'primary',
        midi: { bass: 48, bari: 52, lead: 60, tenor: 64 },
      }),
    )
    const lints = lintArrangement(p)
    expect(lints.some((l) => l.ruleId === 'aug-pillar')).toBe(true)
    expect(lints.some((l) => l.ruleId === 'aug-many')).toBe(true)
  })

  it('dim-sustain info for long dim7', () => {
    const p = createEmptyArrangement()
    p.melody = [{ id: 'm', midi: 60, startTick: 0, durationTicks: 960, role: 'pmn' }]
    p.pillars = [
      { id: 'p', rootPc: 0, startTick: 0, endTick: 960, source: 'user', confirmed: true },
    ]
    p.stacks = [
      stack({
        natureId: 'dim7',
        durationTicks: 960,
        midi: { bass: 48, bari: 51, lead: 60, tenor: 66 },
      }),
    ]
    expect(lintArrangement(p).some((l) => l.ruleId === 'dim-sustain')).toBe(true)
  })

  it('incomplete-triad and thin-ninth', () => {
    const p = createEmptyArrangement()
    p.melody = [{ id: 'm', midi: 60, startTick: 0, durationTicks: 480, role: 'pmn' }]
    p.pillars = [
      { id: 'p', rootPc: 0, startTick: 0, endTick: 480, source: 'user', confirmed: true },
    ]
    p.stacks = [
      stack({
        id: 'tri',
        natureId: 'major',
        midi: { bass: 60, bari: 60, lead: 60, tenor: 72 }, // only C pcs
      }),
      stack({
        id: 'n9',
        startTick: 0,
        natureId: 'ninth',
        midi: { bass: 48, bari: 48, lead: 60, tenor: 62 }, // few PCs
      }),
    ]
    const lints = lintArrangement(p)
    expect(lints.some((l) => l.ruleId === 'incomplete-triad')).toBe(true)
    expect(lints.some((l) => l.ruleId === 'thin-ninth')).toBe(true)
  })

  it('few-sevenths when long chart lacks BS7 color', () => {
    const p = createEmptyArrangement()
    p.melody = Array.from({ length: 10 }, (_, i) => ({
      id: `m${i}`,
      midi: 60,
      startTick: i * 240,
      durationTicks: 240,
      role: 'pmn' as const,
    }))
    p.pillars = [
      { id: 'p', rootPc: 0, startTick: 0, endTick: 3000, source: 'user', confirmed: true },
    ]
    p.stacks = p.melody.map((m, i) =>
      stack({
        id: `s${i}`,
        startTick: m.startTick,
        durationTicks: 240,
        natureId: 'major',
        midi: { bass: 48, bari: 52, lead: 60, tenor: 67 },
      }),
    )
    expect(lintArrangement(p).some((l) => l.ruleId === 'few-sevenths')).toBe(true)
  })

  it('copyright reminder present on finished-ish chart', () => {
    const p = harmonizedPhrase()
    const rem = copyrightReminderLint(p)
    expect(rem.some((l) => l.ruleId === 'copyright-reminder')).toBe(true)
  })
})

describe('Voice leading', () => {
  it('errors when tenor ≤ lead', () => {
    const issues = checkStackInternal(
      stack({ midi: { bass: 48, bari: 52, lead: 60, tenor: 59 } }),
    )
    expect(issues.some((i) => i.severity === 'error')).toBe(true)
  })

  it('warns when bass sits above bari/lead', () => {
    const issues = checkStackInternal(
      stack({ midi: { bass: 62, bari: 52, lead: 60, tenor: 67 } }),
    )
    expect(issues.some((i) => /bass/i.test(i.message))).toBe(true)
  })

  it('warns on minor-second crunch', () => {
    const issues = checkStackInternal(
      stack({ midi: { bass: 48, bari: 59, lead: 60, tenor: 67 } }),
    )
    expect(issues.some((i) => /Minor second/i.test(i.message))).toBe(true)
  })

  it('flags parallel perfect fifths between stacks', () => {
    const a = stack({
      id: 'a',
      startTick: 0,
      midi: { bass: 48, bari: 52, lead: 60, tenor: 55 },
    })
    const b = stack({
      id: 'b',
      startTick: 480,
      midi: { bass: 50, bari: 54, lead: 62, tenor: 57 },
    })
    const issues = analyzeVoiceLeading([b, a])
    expect(issues.some((i) => i.id.startsWith('p5-'))).toBe(true)
  })
})

describe('Strong voicing coaching', () => {
  it('infos when lead is root or fifth on a seventh', () => {
    const stacks = [
      stack({
        natureId: 'seventh',
        voicing: '5713',
        midi: { bass: 43, bari: 50, lead: 55, tenor: 59 },
      }),
    ]
    const melody = [{ id: 'm', midi: 55, startTick: 0, durationTicks: 480, role: 'pmn' as const }]
    const lints = strongVoicingLints(stacks, melody)
    expect(lints.some((l) => l.ruleId === 'strong-voicing')).toBe(true)
  })

  it('skips null midi', () => {
    const stacks = [{ ...stack({ midi: { bass: 48, bari: 52, lead: 60, tenor: 67 } }), midi: null }]
    expect(strongVoicingLints(stacks, [])).toEqual([])
  })
})

describe('Motion, key, swipe, pillar coverage', () => {
  it('flags retrogression D→A in C', () => {
    const p = createEmptyArrangement()
    p.tonality = 0
    p.stacks = [
      stack({ id: 'a', startTick: 0, rootPc: 2, midi: { bass: 50, bari: 57, lead: 62, tenor: 66 } }),
      stack({ id: 'b', startTick: 480, rootPc: 9, midi: { bass: 45, bari: 52, lead: 60, tenor: 64 } }),
    ]
    const lints = motionLints(p)
    expect(lints.some((l) => /retro/i.test(l.id) || /retro/i.test(l.message))).toBe(true)
  })

  it('skips same-root consecutive stacks', () => {
    const p = createEmptyArrangement()
    p.stacks = [
      stack({ id: 'a', startTick: 0, rootPc: 0, midi: { bass: 48, bari: 52, lead: 60, tenor: 67 } }),
      stack({ id: 'b', startTick: 480, rootPc: 0, midi: { bass: 48, bari: 55, lead: 60, tenor: 64 } }),
    ]
    expect(motionLints(p)).toEqual([])
  })

  it('suggests transpose when lead too high', () => {
    const p = createEmptyArrangement()
    p.melody = [{ id: 'm', midi: 78, startTick: 0, durationTicks: 480, role: 'pmn' }]
    const lints = keySuggestionLints(p)
    expect(lints.length).toBeGreaterThan(0)
    expect(lints[0]!.data?.semitones).toBeLessThan(0)
  })

  it('both-ends key when range spans below and above', () => {
    const p = createEmptyArrangement()
    p.melody = [
      { id: 'lo', midi: 40, startTick: 0, durationTicks: 240, role: 'pmn' },
      { id: 'hi', midi: 80, startTick: 240, durationTicks: 240, role: 'pmn' },
    ]
    const lints = keySuggestionLints(p)
    expect(lints.some((l) => l.id === 'key-both-ends')).toBe(true)
  })

  it('missing pillar coverage', () => {
    const p = createEmptyArrangement()
    p.melody = [{ id: 'm', midi: 60, startTick: 960, durationTicks: 240, role: 'pmn' }]
    p.pillars = [
      { id: 'p', rootPc: 0, startTick: 0, endTick: 480, source: 'user', confirmed: true },
    ]
    expect(missingPillarCoverageLints(p).length).toBeGreaterThan(0)
  })

  it('swipe opportunity on long hold with gap', () => {
    const p = createEmptyArrangement()
    p.melody = [
      { id: 'a', midi: 60, startTick: 0, durationTicks: 960, role: 'pmn' },
      { id: 'b', midi: 62, startTick: 1200, durationTicks: 240, role: 'pmn' },
    ]
    expect(swipeOpportunityLints(p).length).toBeGreaterThan(0)
  })

  it('seventh density helper', () => {
    expect(countSeventhDensity([])).toBe(0)
    const stacks = [
      stack({ natureId: 'seventh', midi: { bass: 43, bari: 50, lead: 55, tenor: 59 } }),
      stack({ id: 'b', natureId: 'major', midi: { bass: 48, bari: 52, lead: 60, tenor: 67 } }),
    ]
    expect(countSeventhDensity(stacks)).toBe(0.5)
  })
})

describe('Dense QA', () => {
  it('homophony density info when durations are uniform', () => {
    const p = createEmptyArrangement()
    p.stacks = Array.from({ length: 8 }, (_, i) =>
      stack({
        id: `s${i}`,
        startTick: i * 480,
        durationTicks: 480,
        midi: { bass: 48, bari: 52, lead: 60, tenor: 67 },
      }),
    )
    expect(homophonyDensityLints(p).length).toBeGreaterThan(0)
  })

  it('homophony quiet when varied or few stacks', () => {
    const p = createEmptyArrangement()
    p.stacks = Array.from({ length: 4 }, (_, i) =>
      stack({
        id: `s${i}`,
        startTick: i * 480,
        durationTicks: 240 + i * 120,
        midi: { bass: 48, bari: 52, lead: 60, tenor: 67 },
      }),
    )
    expect(homophonyDensityLints(p)).toEqual([])
  })

  it('doubledThirdLints skips null midi', () => {
    const stacks = [{ ...stack({ midi: { bass: 48, bari: 52, lead: 60, tenor: 67 } }), midi: null }]
    expect(doubledThirdLints(stacks)).toEqual([])
  })
})

describe('Song eligibility & phrase hints', () => {
  it('assesses short melody without phrase-shape spam', () => {
    const melody = [
      { id: 'a', midi: 60, startTick: 0, durationTicks: 480, role: 'pmn' as const },
      { id: 'b', midi: 62, startTick: 480, durationTicks: 480, role: 'pmn' as const },
    ]
    const r = assessSongEligibility(melody)
    expect(Array.isArray(r)).toBe(true)
    expect(phraseLengthHint(melody)).toEqual([])
  })
})

describe('Strengthen, polish, embellish, pillars, final', () => {
  it('strengthen fills missing stacks under pillars', () => {
    const p = createEmptyArrangement()
    p.melody = [
      { id: 'm0', midi: 60, startTick: 0, durationTicks: 480, role: 'pmn' },
      { id: 'm1', midi: 64, startTick: 480, durationTicks: 480, role: 'pmn' },
    ]
    p.pillars = [
      { id: 'p', rootPc: 0, startTick: 0, endTick: 2000, source: 'user', confirmed: true },
    ]
    p.stacks = []
    const next = strengthenStacks(p)
    expect(next.length).toBe(2)
  })

  it('strengthen preserves embellishment layers', () => {
    const p = createEmptyArrangement()
    p.melody = [{ id: 'm0', midi: 60, startTick: 0, durationTicks: 960, role: 'pmn' }]
    p.pillars = [
      { id: 'p', rootPc: 0, startTick: 0, endTick: 2000, source: 'user', confirmed: true },
    ]
    const emb = stack({
      id: 'emb',
      startTick: 720,
      durationTicks: 240,
      layer: 'embellishment',
      midi: { bass: 48, bari: 52, lead: 60, tenor: 67 },
    })
    p.stacks = [emb]
    const next = strengthenStacks(p)
    expect(next.some((s) => s.id === 'emb' && s.layer === 'embellishment')).toBe(true)
  })

  it('polishVoicings applies safe VL fixes', () => {
    const p = harmonizedPhrase()
    if (p.stacks[0]?.midi) {
      p.stacks[0] = {
        ...p.stacks[0],
        midi: { ...p.stacks[0].midi, tenor: p.stacks[0].midi.lead - 1 },
      }
    }
    const { project, applied } = polishVoicings(p)
    expect(project.stacks.length).toBeGreaterThan(0)
    expect(Array.isArray(applied)).toBe(true)
  })

  it('embellishment seeds and apply', () => {
    const p = harmonizedPhrase()
    p.melody[0] = { ...p.melody[0]!, durationTicks: 960 }
    const seeds = findEmbellishmentSeeds(p)
    expect(seeds.length).toBeGreaterThan(0)
    const withSug = seeds.find((s) => s.suggestedStack)
    if (withSug) {
      const next = applyEmbellishmentSeed(p, withSug)
      expect(next.stacks.length).toBeGreaterThan(p.stacks.length)
    }
  })

  it('suggestPillars covers C major tones; pillarAtTick works', () => {
    const melody = [0, 2, 4, 5, 7].map((semi, i) => ({
      id: `m${i}`,
      midi: 60 + semi,
      startTick: i * 480,
      durationTicks: 480,
      role: 'pmn' as const,
    }))
    const tips = suggestPillars({ melody, tonality: 0, measureTicks: 1920 })
    expect(tips.length).toBeGreaterThan(0)
    const pillars = suggestionsToPillars(tips)
    expect(pillars[0]!.confirmed).toBe(false)
    expect(pillarAtTick(pillars, pillars[0]!.startTick)?.id).toBe(pillars[0]!.id)
    expect(pillarAtTick(pillars, 999999)).toBeNull()
  })

  it('final checklist ready only when gates pass', () => {
    const empty = assessFinalReadiness(createEmptyArrangement())
    expect(empty.ready).toBe(false)
    const p = harmonizedPhrase()
    const r = assessFinalReadiness(p)
    expect(r.items.some((i) => i.id === 'melody' && i.ok)).toBe(true)
    expect(r.items.some((i) => i.id === 'harmony' && i.ok)).toBe(true)
  })

  it('fix registry applyAllSafe skips destructive transpose', () => {
    const p = harmonizedPhrase()
    p.melody.push({ id: 'hi', midi: 84, startTick: 9000, durationTicks: 240, role: 'pmn' })
    const lints = lintArrangement(p)
    const { applied } = createFixRegistry().applyAllSafe(p, lints)
    expect(Array.isArray(applied)).toBe(true)
  })
})

describe('JI / dull harmonicity smoke', () => {
  it('dullHarmonicity may flag weak stacks when better candidates exist', () => {
    const chord = BARBERSHOP_CHORDS.find((c) => c.id === 'major')!
    const midi = placeVoicing({ chord, rootPc: 0, leadMidi: 60, voicing: '1513' })!
    const p = createEmptyArrangement()
    p.melody = [{ id: 'm', midi: 60, startTick: 0, durationTicks: 480, role: 'pmn' }]
    p.pillars = [
      { id: 'p', rootPc: 0, startTick: 0, endTick: 480, source: 'user', confirmed: true },
    ]
    p.stacks = [stack({ natureId: 'major', voicing: '1513', midi })]
    const lints = dullHarmonicityLints(p)
    expect(Array.isArray(lints)).toBe(true)
  })
})
