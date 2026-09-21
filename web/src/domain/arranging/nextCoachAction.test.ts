import { describe, expect, it } from 'vitest'
import { createEmptyArrangement } from './types'
import { defaultFocusForMode, resolveCoachNextAction } from './nextCoachAction'

describe('resolveCoachNextAction', () => {
  it('asks for melody when empty', () => {
    const a = resolveCoachNextAction({ project: null, mode: 'quick', lints: [] })
    expect(a.kind).toBe('enter_melody')
  })

  it('suggests pillars when melody exists without pillars', () => {
    const p = createEmptyArrangement()
    p.melody = [{ id: 'm', midi: 60, startTick: 0, durationTicks: 480, role: 'pmn' }]
    const a = resolveCoachNextAction({ project: p, mode: 'quick', lints: [] })
    expect(a.kind).toBe('suggest_pillars')
    expect(a.cta).toMatch(/Suggest pillars/i)
  })

  it('mentions existing stacks when suggesting pillars', () => {
    const p = createEmptyArrangement()
    p.melody = [{ id: 'm', midi: 60, startTick: 0, durationTicks: 480, role: 'pmn' }]
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
        midi: { bass: 48, bari: 55, lead: 60, tenor: 67 },
        ruleTags: [],
      },
    ]
    const a = resolveCoachNextAction({ project: p, mode: 'review', lints: [] })
    expect(a.body).toMatch(/stacks stay put/i)
  })

  it('defaultFocusForMode matches session lenses', () => {
    expect(defaultFocusForMode('review')).toBe('check')
    expect(defaultFocusForMode('guided')).toBe('now')
    expect(defaultFocusForMode('quick')).toBe('choose')
  })
})
