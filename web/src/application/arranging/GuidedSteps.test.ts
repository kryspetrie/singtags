import { describe, expect, it } from 'vitest'
import { createEmptyArrangement } from '../../domain/arranging/types'
import {
  focusTabForGuidedStep,
  modeForGuidedStep,
  resolveGuidedStep,
  tipForGuidedStep,
  GUIDED_STEPS,
} from './GuidedSteps'

describe('GuidedSteps', () => {
  it('defines a single ordered path', () => {
    expect(GUIDED_STEPS.map((s) => s.id)).toEqual([
      'pillars',
      'roles',
      'chords',
      'check',
      'polish',
    ])
  })

  it('resolves pillars → roles → chords → check (compose)', () => {
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
    expect(resolveGuidedStep(p)).toBe('polish')
  })

  it('maps steps to focus tabs, mode, and tips', () => {
    expect(focusTabForGuidedStep('pillars')).toBe('now')
    expect(focusTabForGuidedStep('chords')).toBe('choose')
    expect(focusTabForGuidedStep('check')).toBe('check')
    expect(focusTabForGuidedStep('polish')).toBe('polish')
    expect(modeForGuidedStep('chords')).toBe('arrange')
    expect(modeForGuidedStep('polish')).toBe('review')
    expect(tipForGuidedStep('roles')).toMatch(/strong|passing/i)
    expect(GUIDED_STEPS.every((s) => s.buttonTip.length > 20)).toBe(true)
    expect(GUIDED_STEPS.every((s) => s.glossaryIds.length > 0)).toBe(true)
  })
})
