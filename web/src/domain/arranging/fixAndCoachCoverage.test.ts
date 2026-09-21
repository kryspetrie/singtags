/**
 * Destructive transpose fixes, coach tips, syncStacks, strengthen replace paths.
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { createEmptyArrangement } from './types'
import { lintArrangement, createFixRegistry, keySuggestionFix, leadRangeFix } from './qa'
import { tipForStep, allCoachTips } from './coachTips'
import { syncStackAfterMelodyEdit } from './syncStacks'
import { strengthenStacks } from './strengthen'
import { autoHarmonizeMelody } from './harmonize'
import { orphanStackFix, illegalChordFix, doubledThirdFix, dullHarmonicityFix, fewSeventhsFix } from './qa'
import { WIZARD_ORDER } from './types'

import { incompleteTriadFix } from './qa'
import { explainCandidate } from './coachCopy'
import type { HarmonizeCandidate } from './harmonize/types'
import { createSequentialIdGenerator } from '../../adapters/arranging/persistence/systemServices'


describe('transpose Fixes (destructive)', () => {
  it('keySuggestionFix requires confirmDestructive and shifts chart', () => {
    const p = createEmptyArrangement()
    p.melody = [{ id: 'm', midi: 78, startTick: 0, durationTicks: 480, role: 'pmn' }]
    p.pillars = [
      { id: 'p', rootPc: 0, startTick: 0, endTick: 480, source: 'user', confirmed: true },
    ]
    const lint = lintArrangement(p).find((l) => l.ruleId === 'key-suggestion')
    expect(lint).toBeTruthy()
    expect(keySuggestionFix.canFix(lint!, p)).toBe(true)
    expect(keySuggestionFix.apply(lint!, p)).toBeNull()
    const patch = keySuggestionFix.apply(lint!, p, { confirmDestructive: true })
    expect(patch?.melody?.[0]!.midi).toBeLessThan(78)
    expect(patch?.tonality).not.toBeUndefined()
  })

  it('leadRangeFix transpose high note down with confirm', () => {
    const p = createEmptyArrangement()
    p.melody = [{ id: 'hi', midi: 84, startTick: 0, durationTicks: 240, role: 'pmn' }]
    p.pillars = [
      { id: 'p', rootPc: 0, startTick: 0, endTick: 480, source: 'user', confirmed: true },
    ]
    const lint = lintArrangement(p).find((l) => l.ruleId === 'lead-range' && l.noteId === 'hi')
    expect(lint).toBeTruthy()
    expect(leadRangeFix.apply(lint!, p)).toBeNull()
    const patch = leadRangeFix.apply(lint!, p, { confirmDestructive: true })
    expect(patch?.melody?.[0]!.midi).toBeLessThanOrEqual(77)
  })

  it('leadRangeFix transpose low note up with confirm', () => {
    const p = createEmptyArrangement()
    p.melody = [{ id: 'lo', midi: 40, startTick: 0, durationTicks: 240, role: 'pmn' }]
    p.pillars = [
      { id: 'p', rootPc: 0, startTick: 0, endTick: 480, source: 'user', confirmed: true },
    ]
    const lint = lintArrangement(p).find((l) => l.noteId === 'lo')
    expect(lint).toBeTruthy()
    const patch = leadRangeFix.apply(lint!, p, { confirmDestructive: true })
    expect(patch?.melody?.[0]!.midi).toBeGreaterThanOrEqual(50)
  })
})

describe('orphan / illegal / doubled-third / dull fixes', () => {
  it('orphanStackFix removes linted stack only', () => {
    const p = createEmptyArrangement()
    p.melody = [{ id: 'm', midi: 60, startTick: 0, durationTicks: 480, role: 'pmn' }]
    p.pillars = [
      { id: 'p', rootPc: 0, startTick: 0, endTick: 480, source: 'user', confirmed: true },
    ]
    p.stacks = [
      {
        id: 'keep',
        startTick: 0,
        durationTicks: 480,
        rootPc: 0,
        natureId: 'major',
        voicing: '1513',
        spread: false,
        layer: 'primary',
        scfGroup: null,
        pillarId: 'p',
        midi: { bass: 48, bari: 52, lead: 60, tenor: 67 },
        ruleTags: [],
      },
      {
        id: 'gone',
        startTick: 9999,
        durationTicks: 120,
        rootPc: 0,
        natureId: 'major',
        voicing: '1513',
        spread: false,
        layer: 'primary',
        scfGroup: null,
        pillarId: null,
        midi: { bass: 48, bari: 52, lead: 60, tenor: 67 },
        ruleTags: [],
      },
    ]
    const lint = lintArrangement(p).find((l) => l.ruleId === 'orphan-stack' && l.stackId === 'gone')
    expect(lint).toBeTruthy()
    expect(orphanStackFix.canFix(lint!, p)).toBe(true)
    const patch = orphanStackFix.apply(lint!, p)
    expect(patch?.stacks?.map((s) => s.id)).toEqual(['keep'])
  })

  it('illegalChordFix canFix false without stackId', () => {
    const p = createEmptyArrangement()
    expect(
      illegalChordFix.canFix(
        { id: 'x', ruleId: 'illegal-nature', severity: 'error', message: 'x' },
        p,
      ),
    ).toBe(false)
  })

  it('illegalChordFix replaces half-dim under sai11', () => {
    const p = createEmptyArrangement()
    p.contestProfile = 'sai11'
    p.melody = [{ id: 'm', midi: 60, startTick: 0, durationTicks: 480, role: 'pmn' }]
    p.pillars = [
      { id: 'p', rootPc: 0, startTick: 0, endTick: 480, source: 'user', confirmed: true },
    ]
    p.stacks = [
      {
        id: 'bad',
        startTick: 0,
        durationTicks: 480,
        rootPc: 0,
        natureId: 'half-dim',
        voicing: '5317',
        spread: false,
        layer: 'primary',
        scfGroup: null,
        pillarId: 'p',
        midi: { bass: 48, bari: 55, lead: 60, tenor: 63 },
        ruleTags: [],
      },
    ]
    const lint = lintArrangement(p).find((l) => l.ruleId === 'illegal-nature')
    expect(lint).toBeTruthy()
    if (illegalChordFix.canFix(lint!, p)) {
      const next = createFixRegistry().applyToProject(lint!, p)
      expect(next!.stacks[0]!.natureId).not.toBe('half-dim')
    }
  })

  it('doubledThirdFix / dullHarmonicityFix reject missing stack', () => {
    const p = createEmptyArrangement()
    const lint = {
      id: 'x',
      ruleId: 'doubled-third' as const,
      severity: 'warn' as const,
      message: 'x',
      stackId: 'missing',
    }
    expect(doubledThirdFix.canFix(lint, p)).toBe(false)
    expect(
      dullHarmonicityFix.canFix({ ...lint, ruleId: 'dull-harmonicity' }, p),
    ).toBe(false)
  })

  it('doubledThirdFix / dullHarmonicityFix apply when stack+note exist', () => {
    const p = createEmptyArrangement()
    p.melody = [{ id: 'm', midi: 60, startTick: 0, durationTicks: 480, role: 'pmn' }]
    p.pillars = [
      { id: 'p', rootPc: 0, startTick: 0, endTick: 480, source: 'user', confirmed: true },
    ]
    p.stacks = autoHarmonizeMelody({
      melody: p.melody,
      pillars: p.pillars,
      tonality: 0,
    })
    const stackId = p.stacks[0]!.id
    const doubledLint = {
      id: 'd',
      ruleId: 'doubled-third' as const,
      severity: 'warn' as const,
      message: 'd',
      stackId,
    }
    const dullLint = {
      id: 'h',
      ruleId: 'dull-harmonicity' as const,
      severity: 'info' as const,
      message: 'h',
      stackId,
    }
    expect(doubledThirdFix.canFix(doubledLint, p)).toBe(true)
    expect(doubledThirdFix.apply(doubledLint, p)?.stacks).toBeTruthy()
    expect(dullHarmonicityFix.canFix(dullLint, p)).toBe(true)
    expect(dullHarmonicityFix.apply(dullLint, p)?.stacks).toBeTruthy()
  })

  it('fewSeventhsFix inserts a seventh when chart is seventh-poor', () => {
    const p = createEmptyArrangement()
    p.melody = Array.from({ length: 6 }, (_, i) => ({
      id: `m${i}`,
      midi: 60 + (i % 3) * 2,
      startTick: i * 480,
      durationTicks: 480,
      role: 'pmn' as const,
    }))
    p.pillars = [
      { id: 'p', rootPc: 0, startTick: 0, endTick: 4000, source: 'user', confirmed: true },
    ]
    p.stacks = autoHarmonizeMelody({
      melody: p.melody,
      pillars: p.pillars,
      tonality: 0,
    }).map((s) => (s.natureId === 'seventh' ? { ...s, natureId: 'major' } : s))
    const lint = {
      id: 'few',
      ruleId: 'few-sevenths' as const,
      severity: 'warn' as const,
      message: 'few',
    }
    if (fewSeventhsFix.canFix(lint, p)) {
      const patch = fewSeventhsFix.apply(lint, p)
      expect(patch?.stacks?.some((s) => s.natureId === 'seventh')).toBe(true)
    }
  })
})

describe('coach tips', () => {
  it('tipForStep returns curriculum-backed tips for known steps', () => {
    const tip = tipForStep('step1_roots')
    expect(tip.title.length).toBeGreaterThan(0)
    expect(tip.body.length).toBeGreaterThan(0)
  })

  it('allCoachTips covers every wizard step', () => {
    const tips = allCoachTips()
    expect(tips.length).toBe(WIZARD_ORDER.length)
    expect(tips.every((t) => t.title.length > 0)).toBe(true)
  })

  it('unknown-ish done step still returns a tip', () => {
    expect(tipForStep('done').body.length).toBeGreaterThan(0)
  })
})

describe('syncStacks + strengthen replace', () => {
  it('syncStackAfterMelodyEdit revoices on pitch change', () => {
    const p = createEmptyArrangement()
    p.melody = [{ id: 'm', midi: 60, startTick: 0, durationTicks: 480, role: 'pmn' }]
    p.pillars = [
      { id: 'p', rootPc: 0, startTick: 0, endTick: 2000, source: 'user', confirmed: true },
    ]
    p.stacks = autoHarmonizeMelody({
      melody: p.melody,
      pillars: p.pillars,
      tonality: 0,
    })
    const prev = p.melody[0]!
    const next = { ...prev, midi: 64 }
    const stacks = syncStackAfterMelodyEdit({ ...p, melody: [next] }, prev, next, {
      idGen: createSequentialIdGenerator(),
    })
    expect(stacks[0]!.midi?.lead).toBe(64)
  })

  it('syncStackAfterMelodyEdit shifts timing without revoice when pitch same', () => {
    const p = createEmptyArrangement()
    p.melody = [{ id: 'm', midi: 60, startTick: 0, durationTicks: 480, role: 'pmn' }]
    p.pillars = [
      { id: 'p', rootPc: 0, startTick: 0, endTick: 2000, source: 'user', confirmed: true },
    ]
    p.stacks = autoHarmonizeMelody({
      melody: p.melody,
      pillars: p.pillars,
      tonality: 0,
    })
    const prev = p.melody[0]!
    const next = { ...prev, startTick: 240, durationTicks: 240 }
    const stacks = syncStackAfterMelodyEdit({ ...p, melody: [next] }, prev, next, {
      revoice: false,
    })
    expect(stacks[0]!.startTick).toBe(240)
    expect(stacks[0]!.midi?.lead).toBe(60)
  })

  it('strengthen keeps stack when no pillar covers note', () => {
    const p = createEmptyArrangement()
    p.melody = [{ id: 'm', midi: 60, startTick: 0, durationTicks: 480, role: 'pmn' }]
    p.pillars = []
    p.stacks = [
      {
        id: 's',
        startTick: 0,
        durationTicks: 480,
        rootPc: 0,
        natureId: 'major',
        voicing: '1513',
        spread: false,
        layer: 'primary',
        scfGroup: null,
        pillarId: null,
        midi: { bass: 48, bari: 52, lead: 60, tenor: 67 },
        ruleTags: [],
      },
    ]
    const next = strengthenStacks(p)
    expect(next).toHaveLength(1)
    expect(next[0]!.id).toBe('s')
  })

  it('strengthen replaces weak stack when better candidate gains enough', () => {
    const p = createEmptyArrangement()
    p.melody = [{ id: 'm', midi: 60, startTick: 0, durationTicks: 480, role: 'pmn' }]
    p.pillars = [
      { id: 'p', rootPc: 0, startTick: 0, endTick: 2000, source: 'user', confirmed: true },
    ]
    // Intentionally odd voicing unlikely to match top candidate
    p.stacks = [
      {
        id: 'weak',
        startTick: 0,
        durationTicks: 480,
        rootPc: 0,
        natureId: 'aug',
        voicing: '1153',
        spread: true,
        layer: 'primary',
        scfGroup: null,
        pillarId: 'p',
        midi: { bass: 48, bari: 52, lead: 60, tenor: 64 },
        ruleTags: [],
      },
    ]
    const next = strengthenStacks(p, { minScoreGain: 0.1 })
    expect(next[0]!.id).toBe('weak')
    expect(next[0]!.natureId).not.toBe('aug')
  })
})

describe('incomplete triad fix + candidate why copy', () => {
  it('incompleteTriadFix upgrades thin major', () => {
    const p = createEmptyArrangement()
    p.melody = [{ id: 'm', midi: 60, startTick: 0, durationTicks: 480, role: 'pmn' }]
    p.pillars = [
      { id: 'p', rootPc: 0, startTick: 0, endTick: 480, source: 'user', confirmed: true },
    ]
    p.stacks = [
      {
        id: 'thin',
        startTick: 0,
        durationTicks: 480,
        rootPc: 0,
        natureId: 'major',
        voicing: '1513',
        spread: false,
        layer: 'primary',
        scfGroup: null,
        pillarId: 'p',
        midi: { bass: 60, bari: 60, lead: 60, tenor: 72 },
        ruleTags: [],
      },
    ]
    const lint = lintArrangement(p).find((l) => l.ruleId === 'incomplete-triad')
    expect(lint).toBeTruthy()
    expect(incompleteTriadFix.canFix(lint!, p)).toBe(true)
    const patch = incompleteTriadFix.apply(lint!, p)
    expect(patch?.stacks?.[0]?.midi).toBeTruthy()
    const m = patch!.stacks![0]!.midi!
    const pcs = new Set([m.bass, m.bari, m.lead, m.tenor].map((x) => ((x % 12) + 12) % 12))
    expect(pcs.size).toBeGreaterThanOrEqual(3)
  })

  it('explainCandidate covers PCF, SCF, tags, spread, harmonicity', () => {
    const base: HarmonizeCandidate = {
      rootPc: 0,
      natureId: 'seventh',
      voicing: '1537',
      spread: false,
      layer: 'primary',
      scfGroup: null,
      midi: { bass: 48, bari: 52, lead: 60, tenor: 67 },
      score: 12,
      ruleTags: ['R1_p5', 'R2_chromatic', 'R3_tritone', 'springboard'],
      label: 'seventh',
      harmonicity: 0.82,
    }
    const why = explainCandidate(base)
    expect(why.bullets.some((b) => /Primary/i.test(b))).toBe(true)
    expect(why.bullets.some((b) => /seventh/i.test(b))).toBe(true)
    expect(why.bullets.some((b) => /Closed/i.test(b))).toBe(true)
    expect(why.bullets.some((b) => /0\.82/.test(b))).toBe(true)

    const scf = explainCandidate({
      ...base,
      layer: 'passing',
      scfGroup: 3,
      natureId: 'dim7',
      spread: true,
      ruleTags: [],
      harmonicity: undefined,
    })
    expect(scf.bullets.some((b) => /Secondary|group 3/i.test(b))).toBe(true)
    expect(scf.bullets.some((b) => /Spread/i.test(b))).toBe(true)
  })
})
