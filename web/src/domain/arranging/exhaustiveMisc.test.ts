/**
 * Additional input iterations: history, melody roles, compare-hear, org tips.
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { createEmptyArrangement } from './types'
import {
  pushUndo,
  undoOnce,
  redoOnce,
  type HistoryStacks,
} from './history'
import { labelMelodyRoles, applyRoleLabels } from './melodyRoles'
import { compareHearTopTwo, compareEqualVsJust, auditionPayload } from './compareHear'
import { tipsForProfile, ORG_TIPS } from './orgTips'
import { autoHarmonizeMelody, candidatesForMelodyNote, generateCandidates, rankCandidates } from './harmonize'
import { DEFAULT_RANKING_WEIGHTS } from './harmonize/rankingWeights'

describe('document history iterations', () => {
  it.each([1, 2, 5, 10, 20])('push %i undos then undo to start title', (n) => {
    let p = createEmptyArrangement('t0', { id: 'h', now: 1 })
    let stacks: HistoryStacks = { undo: [], redo: [] }
    for (let i = 1; i <= n; i++) {
      stacks = pushUndo(stacks, p, 80)
      p = { ...p, title: `t${i}` }
    }
    expect(p.title).toBe(`t${n}`)
    let steps = 0
    while (true) {
      const r = undoOnce(p, stacks)
      if (!r) break
      p = r.project
      stacks = r.stacks
      steps++
    }
    expect(steps).toBe(n)
    expect(p.title).toBe('t0')
  })

  it('redo restores after partial undo; push clears redo', () => {
    let p = createEmptyArrangement('a', { id: 'h', now: 1 })
    let stacks: HistoryStacks = { undo: [], redo: [] }
    stacks = pushUndo(stacks, p)
    p = { ...p, title: 'b' }
    stacks = pushUndo(stacks, p)
    p = { ...p, title: 'c' }

    let r = undoOnce(p, stacks)!
    p = r.project
    stacks = r.stacks
    r = undoOnce(p, stacks)!
    p = r.project
    stacks = r.stacks
    expect(p.title).toBe('a')

    r = redoOnce(p, stacks)!
    p = r.project
    stacks = r.stacks
    expect(p.title).toBe('b')

    stacks = pushUndo(stacks, p)
    p = { ...p, title: 'd' }
    expect(stacks.redo).toHaveLength(0)
  })

  it('respects history limit', () => {
    let p = createEmptyArrangement('x', { id: 'h', now: 1 })
    let stacks: HistoryStacks = { undo: [], redo: [] }
    for (let i = 0; i < 10; i++) {
      stacks = pushUndo(stacks, p, 3)
      p = { ...p, title: `t${i}` }
    }
    expect(stacks.undo.length).toBeLessThanOrEqual(3)
  })
})

describe('melody role labeling iterations', () => {
  it.each([
    [[60, 64, 67]],
    [[67, 65, 64, 62, 60]],
    [[60, 60, 62, 64]],
    [[55, 57, 59, 60, 62, 64, 65, 67, 69]],
  ])('labels phrase %j', (midis) => {
    const melody = midis.map((m, i) => ({
      id: `m${i}`,
      midi: m,
      startTick: i * 480,
      durationTicks: 480,
      role: 'unknown' as const,
    }))
    const pillars = [
      {
        id: 'p',
        rootPc: 0,
        startTick: 0,
        endTick: midis.length * 480 + 1,
        source: 'user' as const,
        confirmed: true,
      },
    ]
    const labels = labelMelodyRoles({ melody, pillars })
    expect(labels.length).toBe(melody.length)
    const applied = applyRoleLabels(melody, labels)
    expect(applied.every((m) => m.role === 'pmn' || m.role === 'smn' || m.role === 'unknown')).toBe(
      true,
    )
  })

  it('force=false preserves existing roles', () => {
    const melody = [
      { id: 'm0', midi: 60, startTick: 0, durationTicks: 480, role: 'pmn' as const },
      { id: 'm1', midi: 62, startTick: 480, durationTicks: 480, role: 'smn' as const },
    ]
    const pillars = [
      { id: 'p', rootPc: 0, startTick: 0, endTick: 2000, source: 'user' as const, confirmed: true },
    ]
    const labels = labelMelodyRoles({ melody, pillars, force: false })
    const applied = applyRoleLabels(melody, labels)
    expect(applied[0]!.role).toBe('pmn')
    expect(applied[1]!.role).toBe('smn')
  })
})

describe('compare-hear iterations', () => {
  it('builds top-two and equal-vs-just payloads', () => {
    const note = { id: 'n', midi: 60, startTick: 0, durationTicks: 480, role: 'pmn' as const }
    const pillar = {
      id: 'p',
      rootPc: 0,
      startTick: 0,
      endTick: 1000,
      source: 'user' as const,
      confirmed: true,
    }
    const cands = candidatesForMelodyNote({
      note,
      pillar,
      tonality: 0,
      prevRootPc: null,
      limit: 5,
    })
    expect(cands.length).toBeGreaterThanOrEqual(2)
    const pair = compareHearTopTwo(cands, 'just')
    expect(pair).not.toBeNull()
    expect(pair!.a.midi.lead).toBe(60)
    expect(pair!.b.midi.lead).toBe(60)
    const ej = compareEqualVsJust(cands[0]!)
    expect(ej.a.label).toContain('equal')
    expect(ej.b.label).toContain('just')
    expect(auditionPayload(cands[0]!, 'equal').cents.lead).toBe(0)
  })

  it('compareHearTopTwo null with <2 candidates', () => {
    expect(compareHearTopTwo([])).toBeNull()
    const one = candidatesForMelodyNote({
      note: { id: 'n', midi: 60, startTick: 0, durationTicks: 480, role: 'pmn' },
      pillar: {
        id: 'p',
        rootPc: 0,
        startTick: 0,
        endTick: 1000,
        source: 'user',
        confirmed: true,
      },
      tonality: 0,
      prevRootPc: null,
      limit: 1,
    })
    expect(compareHearTopTwo(one)).toBeNull()
  })
})

describe('org tips for profiles', () => {
  it.each(['sai11', 'bhs_extended', 'learning'] as const)('tipsForProfile(%s)', (profile) => {
    const tips = tipsForProfile(profile, 'ttbb')
    expect(tips.length).toBeGreaterThan(0)
    expect(tips.every((t) => t.title.length > 0 && t.body.length > 0)).toBe(true)
  })

  it('ORG_TIPS catalog is non-empty and ids unique', () => {
    expect(ORG_TIPS.length).toBeGreaterThanOrEqual(4)
    const ids = ORG_TIPS.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('ranking weight sensitivity', () => {
  it('zeroing seventh weight lowers BS7 scores when lead carries 3/7 color', () => {
    // B lead → G7 (lead on 3); positive seventh bias applies.
    const raw = generateCandidates({
      note: { id: 'n', midi: 71, startTick: 0, durationTicks: 480, role: 'pmn' },
      pillar: {
        id: 'p',
        rootPc: 0,
        startTick: 0,
        endTick: 1000,
        source: 'user',
        confirmed: true,
      },
      tonality: 0,
      prevRootPc: null,
    })
    const def = rankCandidates(raw)
    const no7 = rankCandidates(raw, {
      weights: { ...DEFAULT_RANKING_WEIGHTS, seventh: 0 },
    })
    expect(def.length).toBe(no7.length)
    const d7 = def.find((c) => c.natureId === 'seventh' && c.rootPc === 7)
    const n7 = no7.find((c) => c.natureId === 'seventh' && c.rootPc === 7)
    expect(d7 && n7).toBeTruthy()
    expect(d7!.score).toBeGreaterThan(n7!.score)
  })
})

describe('autoHarmonize across tonality cycle', () => {
  it.each([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])('tonality %i', (tonality) => {
    const melody = [0, 4, 7].map((semi, i) => ({
      id: `m${i}`,
      midi: 60 + semi,
      startTick: i * 480,
      durationTicks: 480,
      role: 'pmn' as const,
    }))
    const pillars = [
      {
        id: 'p',
        rootPc: tonality,
        startTick: 0,
        endTick: 2000,
        source: 'user' as const,
        confirmed: true,
      },
    ]
    const stacks = autoHarmonizeMelody({ melody, pillars, tonality, profile: 'sai11' })
    expect(stacks.length).toBeGreaterThan(0)
  })
})
