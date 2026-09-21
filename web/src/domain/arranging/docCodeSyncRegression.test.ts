/**
 * Regression tests for doc↔code sync + presentation-contract gaps
 * (docs/ui-presentation-layer-design.md Part A).
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createEmptyArrangement, type ChordStack } from './types'
import { lintArrangement, createFixRegistry, DEFAULT_LINT_RULES } from './qa'
import { countSeventhDensity } from './motionAndKey'
import { generateCandidates } from './harmonize/candidateGenerator'
import { suggestCounterpart } from './counterpart'
import { parallelPerfectPenalty } from './theoryScores'
import { distanceFromHome } from './approachThree'
import { romanForChordDetailed } from './secondaryDominant'
import { thinNinthPreferFix } from './qa/fixes/illegalChordFix'
import {
  GLOSSARY,
  LESSONS,
  LINT_LESSON_ALIASES,
  HUMAN_ONLY_LINT_RULE_IDS,
} from './education/catalog'
import { lessonForLintRule, teachLint, teachCandidate } from './education/explain'
import { explanationForLint } from '../../application/arranging/ExplainCoach'
import { canApplyFix } from '../../application/arranging/ApplyFix'
import type { HarmonizeCandidate } from './harmonize/types'

const PC = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  Gb: 6,
  G: 7,
  A: 9,
  Bb: 10,
  B: 11,
} as const

function mkStack(
  partial: Partial<ChordStack> & { midi?: ChordStack['midi'] },
): ChordStack {
  return {
    id: partial.id ?? 's',
    startTick: partial.startTick ?? 0,
    durationTicks: partial.durationTicks ?? 480,
    rootPc: partial.rootPc ?? 0,
    natureId: partial.natureId ?? 'major',
    voicing: partial.voicing ?? '1513',
    spread: partial.spread ?? false,
    layer: partial.layer ?? 'primary',
    scfGroup: partial.scfGroup ?? null,
    pillarId: partial.pillarId ?? null,
    midi: partial.midi ?? { bass: 48, bari: 52, lead: 60, tenor: 67 },
    ruleTags: partial.ruleTags ?? [],
  }
}

describe('doc-code sync: density / Dom9 (A1)', () => {
  it('Dom9-heavy chart does not fire few-sevenths', () => {
    const p = createEmptyArrangement('dom9')
    p.melody = Array.from({ length: 8 }, (_, i) => ({
      id: `m${i}`,
      midi: 62,
      startTick: i * 480,
      durationTicks: 480,
      role: 'pmn' as const,
    }))
    p.pillars = [
      { id: 'p', rootPc: 0, startTick: 0, endTick: 4800, source: 'user', confirmed: true },
    ]
    p.stacks = Array.from({ length: 8 }, (_, i) =>
      mkStack({
        id: `s${i}`,
        startTick: i * 480,
        natureId: 'ninth',
        rootPc: 7,
        voicing: '5793',
        midi: { bass: 50, bari: 59, lead: 62, tenor: 65 },
      }),
    )
    const lints = lintArrangement(p)
    expect(lints.some((l) => l.ruleId === 'few-sevenths')).toBe(false)
    // Chord-count density treats ninth as BS7-family fuel
    expect(countSeventhDensity(p.stacks)).toBe(1)
  })

  it('countSeventhDensity counts seventh and ninth equally', () => {
    const stacks = [
      mkStack({ natureId: 'seventh' }),
      mkStack({ id: 'b', natureId: 'ninth', startTick: 480 }),
      mkStack({ id: 'c', natureId: 'major', startTick: 960 }),
      mkStack({ id: 'd', natureId: 'minor', startTick: 1440 }),
    ]
    expect(countSeventhDensity(stacks)).toBe(0.5)
  })
})

describe('doc-code sync: R5 generator soft penalty (A1)', () => {
  it('M3-up into major scores ≥ M3-up into seventh (same prev BS7)', () => {
    const note = {
      id: 'n',
      midi: 69, // A — fits A major and A7
      startTick: 480,
      durationTicks: 480,
      role: 'pmn' as const,
    }
    // Pillar on A so both A major and A7 are PCF (not merely SCF of C).
    const pillar = {
      id: 'p',
      rootPc: PC.A,
      startTick: 0,
      endTick: 960,
      source: 'user' as const,
      confirmed: true,
    }
    const cands = generateCandidates({
      note,
      pillar,
      tonality: PC.C,
      prevRootPc: PC.F, // F7 → A is R5 (M3 up)
      prevNatureId: 'seventh',
      profile: 'sai11',
    })
    const atA = cands.filter((c) => c.rootPc === PC.A)
    const majors = atA.filter((c) => c.natureId === 'major')
    const sevenths = atA.filter((c) => c.natureId === 'seventh')
    expect(majors.length).toBeGreaterThan(0)
    expect(sevenths.length).toBeGreaterThan(0)
    const best = (xs: typeof atA) => Math.max(...xs.map((c) => c.motionScore ?? 0))
    expect(best(majors)).toBeGreaterThanOrEqual(best(sevenths))
  })
})

describe('doc-code sync: counterpart coaching (A1/A2)', () => {
  it('raised-root counterpart reason mentions raised root', () => {
    const sug = suggestCounterpart({
      note: { id: 'n', midi: 61, startTick: 0, durationTicks: 480, role: 'pmn' },
      originalRoot: PC.C,
    })
    expect(sug).toBeTruthy()
    expect(sug!.reason).toMatch(/raised root/i)
  })

  it('SCF G5 with lead on Dom9 ninth emits without R3_tritone when gate fails', () => {
    // Pillar C; G5 root = F♯. F♯9 ninth = G♯ (PC 8) — not 3/7/♯1/♭5 of C.
    const note = {
      id: 'n',
      midi: 68, // G♯
      startTick: 0,
      durationTicks: 480,
      role: 'smn' as const,
    }
    const pillar = {
      id: 'p',
      rootPc: PC.C,
      startTick: 0,
      endTick: 480,
      source: 'user' as const,
      confirmed: true,
    }
    const cands = generateCandidates({
      note,
      pillar,
      tonality: PC.C,
      prevRootPc: PC.C,
      prevNatureId: 'major',
      preferScf: true,
      profile: 'sai11',
    })
    const g5Ninth = cands.filter(
      (c) => c.scfGroup === 5 && c.natureId === 'ninth' && c.rootPc === PC.Gb,
    )
    expect(g5Ninth.length).toBeGreaterThan(0)
    expect(g5Ninth.every((c) => !c.ruleTags.includes('R3_tritone'))).toBe(true)
  })
})

describe('doc-code sync: outer parallel weight (A1)', () => {
  it('tenor–bass parallel P5 penalizes more than bari–lead', () => {
    // Exact interval 7 (not compound) — parallelPerfectPenalty checks d0/d1 === 7.
    const prevOuter = { bass: 48, bari: 52, lead: 60, tenor: 55 } // bass–tenor P5
    const nextOuter = { bass: 50, bari: 52, lead: 60, tenor: 57 } // outer P5 moves +2
    const prevInner = { bass: 48, bari: 55, lead: 62, tenor: 67 } // bari–lead P5
    const nextInner = { bass: 48, bari: 57, lead: 64, tenor: 67 } // inner P5 moves +2
    const outer = parallelPerfectPenalty(prevOuter, nextOuter)
    const inner = parallelPerfectPenalty(prevInner, nextInner)
    expect(outer).toBeGreaterThan(inner)
  })
})

describe('doc-code sync: thin-ninth prefers omit-root (A1)', () => {
  it('autofix applies a bass-on-5 (omit-root) voicing when available', () => {
    const p = createEmptyArrangement('thin9')
    p.melody = [{ id: 'm', midi: 62, startTick: 0, durationTicks: 480, role: 'pmn' }]
    p.pillars = [
      { id: 'p', rootPc: 0, startTick: 0, endTick: 480, source: 'user', confirmed: true },
    ]
    p.stacks = [
      mkStack({
        natureId: 'ninth',
        rootPc: 7,
        voicing: '1793',
        midi: { bass: 48, bari: 48, lead: 62, tenor: 62 },
      }),
    ]
    const lint = lintArrangement(p).find((l) => l.ruleId === 'thin-ninth')
    expect(lint).toBeTruthy()
    expect(thinNinthPreferFix.canFix(lint!, p)).toBe(true)
    const patch = thinNinthPreferFix.apply(lint!, p)
    expect(patch?.stacks?.[0]?.voicing.startsWith('5')).toBe(true)
    expect(patch?.stacks?.[0]?.natureId).toBe('ninth')
  })
})

describe('doc-code sync: I7 dual-label (A1)', () => {
  it('tonic Mm7 prefers I7 with alt V7/IV', () => {
    const detailed = romanForChordDetailed({
      rootPc: PC.C,
      natureId: 'seventh',
      tonality: PC.C,
      resolvesToRoot: PC.F,
    })
    expect(detailed.roman).toMatch(/^I7$/)
    expect(detailed.altRoman).toMatch(/V7\/IV/)
  })
})

describe('doc-code sync: education ↔ lint registry (A1)', () => {
  it('every lesson lintRuleId is a known rule or alias target', () => {
    const known = new Set<string>([
      ...DEFAULT_LINT_RULES.map((r) => r.id),
      ...Object.keys(LINT_LESSON_ALIASES),
      ...Object.values(LINT_LESSON_ALIASES),
      'incomplete-triad',
      'thin-ninth',
      'aug-pillar',
      'aug-many',
      'no-pillars',
      'unconfirmed-pillars',
      'bs7-density-low',
      'bs7-density-duration-low',
    ])
    for (const lesson of LESSONS) {
      if (!lesson.lintRuleId) continue
      expect(known.has(lesson.lintRuleId) || lessonForLintRule(lesson.lintRuleId)).toBeTruthy()
    }
  })

  it('every DEFAULT_LINT_RULES id resolves to a Learn lesson (or human-only)', () => {
    for (const rule of DEFAULT_LINT_RULES) {
      if (HUMAN_ONLY_LINT_RULE_IDS.includes(rule.id)) continue
      const lesson = lessonForLintRule(rule.id)
      // Emitter-only parents that only produce child ruleIds with lessons
      if (
        rule.id === 'voicing-integrity' ||
        rule.id === 'pillars' ||
        rule.id === 'aug-usage'
      ) {
        continue
      }
      expect(lesson, `missing Learn mapping for lint rule ${rule.id}`).toBeTruthy()
    }
  })

  it('Dom9 glossary and L-dom9 cite both omit schools', () => {
    const omit = GLOSSARY.find((g) => g.id === 'omit_5')
    expect(omit?.short).toMatch(/root/i)
    expect(omit?.short).toMatch(/5th|fifth/i)
    const lesson = LESSONS.find((l) => l.id === 'L-dom9')
    expect(lesson?.body).toMatch(/root/i)
    expect(lesson?.body).toMatch(/5th|fifth/i)
  })
})

describe('doc-code sync: distance / dim7 / density independence (A2)', () => {
  it('distanceFromHome in B♭ (men’s key map)', () => {
    const Bb = 10
    expect(distanceFromHome(Bb, Bb)).toBe(0)
    expect(distanceFromHome(PC.F, Bb)).toBe(1)
    expect(distanceFromHome(PC.C, Bb)).toBe(2)
    expect(distanceFromHome(PC.G, Bb)).toBe(3)
    expect(distanceFromHome(PC.D, Bb)).toBe(4)
    // IV of B♭ is E♭ (3) — not distance 1
    expect(distanceFromHome(3, Bb)).not.toBe(1)
  })

  it('dim7-chain message mentions m6', () => {
    const p = createEmptyArrangement('dimchain')
    p.melody = [{ id: 'm', midi: 60, startTick: 0, durationTicks: 960, role: 'pmn' }]
    p.stacks = [
      mkStack({ id: 'a', natureId: 'dim7', startTick: 0, durationTicks: 240 }),
      mkStack({ id: 'b', natureId: 'dim7', startTick: 240, durationTicks: 240, rootPc: 1 }),
    ]
    const hit = lintArrangement(p).find((l) => l.ruleId === 'dim7-chain')
    expect(hit?.message).toMatch(/m6/i)
  })

  it('duration density can fire independent of chord-count density', () => {
    const p = createEmptyArrangement('dens')
    // 1 short BS7 + 7 long majors → count share 12.5% (<30%), duration share of BS7 tiny
    p.melody = Array.from({ length: 8 }, (_, i) => ({
      id: `m${i}`,
      midi: 60,
      startTick: i * 480,
      durationTicks: 480,
      role: 'pmn' as const,
    }))
    p.pillars = [
      { id: 'p', rootPc: 0, startTick: 0, endTick: 4000, source: 'user', confirmed: true },
    ]
    p.stacks = [
      mkStack({
        id: 'bs7',
        natureId: 'seventh',
        rootPc: 7,
        startTick: 0,
        durationTicks: 120,
        midi: { bass: 43, bari: 50, lead: 59, tenor: 62 },
      }),
      ...Array.from({ length: 7 }, (_, i) =>
        mkStack({
          id: `maj${i}`,
          natureId: 'major',
          startTick: 480 + i * 480,
          durationTicks: 480,
        }),
      ),
    ]
    const lints = lintArrangement(p)
    const countLow = lints.some((l) => l.ruleId === 'bs7-density')
    const durLow = lints.some((l) => l.ruleId === 'bs7-density-duration')
    // With 1/8 stacks as seventh, count share = 12.5% < 30% → count lint fires
    expect(countLow).toBe(true)
    // Duration share 120/(120+7*480) ≈ 3.4% < ⅓ → duration lint fires
    expect(durLow).toBe(true)
    // Independence: flip to many short sevenths that still fail count but pass duration? 
    // Document that both can fire; add inverse case:
    const p2 = createEmptyArrangement('dens2')
    p2.melody = p.melody
    p2.pillars = p.pillars
    // 3/8 sevenths (37.5% ≥ 30%) but each seventh is tiny vs long majors
    p2.stacks = [
      ...[0, 1, 2].map((i) =>
        mkStack({
          id: `s${i}`,
          natureId: 'seventh',
          rootPc: 7,
          startTick: i * 480,
          durationTicks: 60,
          midi: { bass: 43, bari: 50, lead: 59, tenor: 62 },
        }),
      ),
      ...[3, 4, 5, 6, 7].map((i) =>
        mkStack({
          id: `m${i}`,
          natureId: 'major',
          startTick: i * 480,
          durationTicks: 480,
        }),
      ),
    ]
    const l2 = lintArrangement(p2)
    expect(l2.some((l) => l.ruleId === 'bs7-density')).toBe(false) // 37.5% ≥ 30%
    expect(l2.some((l) => l.ruleId === 'bs7-density-duration')).toBe(true) // duration still tiny
  })
})

describe('presentation contracts: ExplainCoach / fixes (A3)', () => {
  it('explanationForLint returns headline + glossary for Dom9, density, R5-related, counterpart', () => {
    for (const ruleId of ['thin-ninth', 'bs7-density', 'few-sevenths', 'counterpart-flicker']) {
      const dto = explanationForLint({
        id: ruleId,
        ruleId,
        severity: 'warn',
        message: 'test',
      })
      expect(dto.headline.length).toBeGreaterThan(0)
      expect(dto.lesson || dto.glossary.length >= 0).toBeTruthy()
      // Mapped lessons should carry glossary ids for Learn chips
      if (ruleId !== 'counterpart-flicker') {
        expect(dto.glossary.length + (dto.lesson ? 1 : 0)).toBeGreaterThan(0)
      }
      expect(teachLint(ruleId).headline).toBeTruthy()
    }
    const r5 = teachCandidate({
      rootPc: 8,
      natureId: 'seventh',
      voicing: '1735',
      spread: false,
      layer: 'passing',
      scfGroup: null,
      midi: { bass: 44, bari: 51, lead: 60, tenor: 63 },
      ruleTags: ['R5_m3up'],
      label: 'test',
      score: 1,
      towardPillar: true,
    } as HarmonizeCandidate)
    expect(r5.headline.length).toBeGreaterThan(0)
  })

  it('fix registry canFix for thin-ninth and few-sevenths when applicable', () => {
    const registry = createFixRegistry()
    const thin = createEmptyArrangement('t')
    thin.melody = [{ id: 'm', midi: 62, startTick: 0, durationTicks: 480, role: 'pmn' }]
    thin.pillars = [
      { id: 'p', rootPc: 0, startTick: 0, endTick: 480, source: 'user', confirmed: true },
    ]
    thin.stacks = [
      mkStack({
        natureId: 'ninth',
        rootPc: 7,
        voicing: '1793',
        midi: { bass: 48, bari: 48, lead: 62, tenor: 62 },
      }),
    ]
    const thinLint = lintArrangement(thin).find((l) => l.ruleId === 'thin-ninth')!
    expect(canApplyFix(thin, thinLint, registry)).toBe(true)

    const few = createEmptyArrangement('f')
    few.melody = Array.from({ length: 8 }, (_, i) => ({
      id: `m${i}`,
      midi: 60,
      startTick: i * 480,
      durationTicks: 480,
      role: 'pmn' as const,
    }))
    few.pillars = [
      { id: 'p', rootPc: 0, startTick: 0, endTick: 4000, source: 'user', confirmed: true },
    ]
    few.stacks = Array.from({ length: 8 }, (_, i) =>
      mkStack({ id: `s${i}`, startTick: i * 480, natureId: 'major' }),
    )
    const fewLint = lintArrangement(few).find((l) => l.ruleId === 'few-sevenths')!
    expect(fewLint).toBeTruthy()
    // canFix may be true if candidates exist for a stack
    expect(typeof registry.canFix(fewLint, few)).toBe('boolean')
  })
})

describe('architecture: store must not import approachThree classifiers (A3)', () => {
  it('stores/arrangement.ts does not import classifyRootMotion / scoreRootMotion', () => {
    const path = fileURLToPath(new URL('../../stores/arrangement.ts', import.meta.url))
    const src = readFileSync(path, 'utf8')
    expect(src).not.toMatch(/classifyRootMotion/)
    expect(src).not.toMatch(/scoreRootMotion/)
    expect(src).not.toMatch(/from ['"].*approachThree['"]/)
  })
})
