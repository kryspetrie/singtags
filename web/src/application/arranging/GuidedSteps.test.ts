import { describe, expect, it } from 'vitest'
import { createEmptyArrangement } from '../../domain/arranging/types'
import {
  focusTabForGuidedStep,
  resolveGuidedStep,
  tipForGuidedStep,
  GUIDED_STEPS,
} from './GuidedSteps'

describe('GuidedSteps', () => {
  it('defines exactly four steps (no VI–IX chrome)', () => {
    expect(GUIDED_STEPS).toHaveLength(4)
    expect(GUIDED_STEPS.map((s) => s.id)).toEqual(['pillars', 'roles', 'chords', 'review'])
  })

  it('resolves pillars → roles → chords → review', () => {
    const p = createEmptyArrangement('G')
    expect(resolveGuidedStep(p)).toBe('pillars')
    p.melody = [{ id: 'm1', midi: 60, startTick: 0, durationTicks: 480, role: 'unknown' }]
    p.pillars = [
      { id: 'p1', rootPc: 0, startTick: 0, endTick: 480, confirmed: true, source: 'user' },
    ]
    expect(resolveGuidedStep(p)).toBe('roles')
    p.melody[0]!.role = 'pmn'
    expect(resolveGuidedStep(p)).toBe('chords')
    p.stacks = [
      {
        id: 's1',
        startTick: 0,
        durationTicks: 480,
        rootPc: 0,
        natureId: 'seventh',
        voicing: '1513',
        spread: false,
        layer: 'primary',
        scfGroup: null,
        pillarId: 'p1',
        midi: { bass: 48, bari: 55, lead: 60, tenor: 67 },
        ruleTags: [],
      },
    ]
    expect(resolveGuidedStep(p)).toBe('review')
  })

  it('maps steps to focus tabs and tips', () => {
    expect(focusTabForGuidedStep('pillars')).toBe('now')
    expect(focusTabForGuidedStep('chords')).toBe('choose')
    expect(focusTabForGuidedStep('review')).toBe('check')
    expect(tipForGuidedStep('roles')).toMatch(/PMN|SMN/)
  })
})
