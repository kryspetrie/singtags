/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { createEmptyArrangement } from './types'
import {
  detectCoachEntryMode,
  knownStackCoverage,
  isKnownStack,
} from './coachEntryMode'
import { mergeMelodyRoles } from './mergeMelodyRoles'
import {
  resolveGuidedStep,
  resolveGuidedStepWithLints,
} from '../../application/arranging/GuidedSteps'
import { lintArrangement } from './qa'
import { resolveCoachNextAction } from './nextCoachAction'

function knownSeventh(startTick: number) {
  return {
    id: `s${startTick}`,
    startTick,
    durationTicks: 480,
    rootPc: 0,
    natureId: 'seventh',
    voicing: '1513',
    spread: false,
    layer: 'primary' as const,
    scfGroup: null,
    pillarId: null,
    midi: { bass: 48, bari: 55, lead: 60, tenor: 67 },
    ruleTags: [] as [],
  }
}

describe('coachEntryMode', () => {
  it('compose when only melody', () => {
    const p = createEmptyArrangement()
    p.melody = [{ id: 'm', midi: 60, startTick: 0, durationTicks: 480, role: 'unknown' }]
    expect(detectCoachEntryMode(p)).toBe('compose')
  })

  it('repair when known stacks cover the chart', () => {
    const p = createEmptyArrangement()
    p.melody = [
      { id: 'm1', midi: 60, startTick: 0, durationTicks: 480, role: 'pmn' },
      { id: 'm2', midi: 62, startTick: 480, durationTicks: 480, role: 'pmn' },
    ]
    p.stacks = [knownSeventh(0), knownSeventh(480)]
    expect(detectCoachEntryMode(p)).toBe('repair')
    expect(knownStackCoverage(p)).toBe(1)
    expect(isKnownStack(p.stacks[0]!)).toBe(true)
  })

  it('repair when many unknown imported stacks', () => {
    const p = createEmptyArrangement()
    p.melody = [
      { id: 'm1', midi: 60, startTick: 0, durationTicks: 480, role: 'unknown' },
      { id: 'm2', midi: 62, startTick: 480, durationTicks: 480, role: 'unknown' },
    ]
    p.stacks = [
      { ...knownSeventh(0), natureId: 'unknown' },
      { ...knownSeventh(480), natureId: 'unknown' },
    ]
    expect(detectCoachEntryMode(p)).toBe('repair')
  })
})

describe('resolveGuidedStep entry routing', () => {
  it('compose: pillars → roles → chords', () => {
    const p = createEmptyArrangement()
    p.melody = [{ id: 'm', midi: 60, startTick: 0, durationTicks: 480, role: 'unknown' }]
    expect(resolveGuidedStep(p)).toBe('pillars')
    p.pillars = [
      { id: 'p1', rootPc: 0, startTick: 0, endTick: 480, confirmed: true, source: 'user' },
    ]
    expect(resolveGuidedStep(p)).toBe('roles')
    p.melody[0]!.role = 'pmn'
    expect(resolveGuidedStep(p)).toBe('chords')
  })

  it('repair: skips roles after pillars locked', () => {
    const p = createEmptyArrangement()
    p.melody = [
      { id: 'm1', midi: 60, startTick: 0, durationTicks: 480, role: 'unknown' },
      { id: 'm2', midi: 62, startTick: 480, durationTicks: 480, role: 'unknown' },
    ]
    p.stacks = [knownSeventh(0), knownSeventh(480)]
    p.pillars = [
      { id: 'p1', rootPc: 0, startTick: 0, endTick: 960, confirmed: true, source: 'user' },
    ]
    expect(resolveGuidedStep(p, { entryMode: 'repair' })).toBe('polish')
  })

  it('does not treat unknown as filled coverage', () => {
    const p = createEmptyArrangement()
    p.melody = [
      { id: 'm1', midi: 60, startTick: 0, durationTicks: 480, role: 'pmn' },
      { id: 'm2', midi: 62, startTick: 480, durationTicks: 480, role: 'pmn' },
    ]
    p.pillars = [
      { id: 'p1', rootPc: 0, startTick: 0, endTick: 960, confirmed: true, source: 'user' },
    ]
    p.stacks = [
      { ...knownSeventh(0), natureId: 'unknown' },
      { ...knownSeventh(480), natureId: 'unknown' },
    ]
    expect(resolveGuidedStep(p, { entryMode: 'compose' })).toBe('chords')
  })

  it('polish when clean and well covered', () => {
    const p = createEmptyArrangement()
    p.melody = [{ id: 'm', midi: 60, startTick: 0, durationTicks: 480, role: 'pmn' }]
    p.pillars = [
      { id: 'p1', rootPc: 0, startTick: 0, endTick: 480, confirmed: true, source: 'user' },
    ]
    p.stacks = [knownSeventh(0)]
    expect(resolveGuidedStepWithLints(p, 0)).toBe('polish')
  })
})

describe('unrecognized-nature lint', () => {
  it('flags unknown stacks', () => {
    const p = createEmptyArrangement()
    p.melody = [{ id: 'm', midi: 60, startTick: 0, durationTicks: 480, role: 'pmn' }]
    p.pillars = [
      { id: 'p1', rootPc: 0, startTick: 0, endTick: 480, confirmed: true, source: 'user' },
    ]
    p.stacks = [{ ...knownSeventh(0), natureId: 'unknown' }]
    expect(lintArrangement(p).some((l) => l.ruleId === 'unrecognized-nature')).toBe(true)
  })
})

describe('mergeMelodyRoles', () => {
  it('preserves non-unknown roles by tick+midi', () => {
    const fresh = [
      { id: 'n1', midi: 60, startTick: 0, durationTicks: 480, role: 'unknown' as const },
    ]
    const prior = [
      { id: 'o1', midi: 60, startTick: 0, durationTicks: 480, role: 'pmn' as const },
    ]
    expect(mergeMelodyRoles(fresh, prior)[0]!.role).toBe('pmn')
  })
})

describe('nextAction repair', () => {
  it('prefers issues when repair has unrecognized stacks', () => {
    const p = createEmptyArrangement()
    p.melody = [
      { id: 'm1', midi: 60, startTick: 0, durationTicks: 480, role: 'pmn' },
      { id: 'm2', midi: 62, startTick: 480, durationTicks: 480, role: 'pmn' },
    ]
    p.pillars = [
      { id: 'p1', rootPc: 0, startTick: 0, endTick: 960, confirmed: true, source: 'user' },
    ]
    p.stacks = [
      knownSeventh(0),
      { ...knownSeventh(480), natureId: 'unknown' },
    ]
    const a = resolveCoachNextAction({
      project: p,
      mode: 'review',
      lints: lintArrangement(p),
    })
    expect(a.kind).toBe('fix_issues')
    expect(a.focus).toBe('check')
  })
})
