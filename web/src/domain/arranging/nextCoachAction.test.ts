import { describe, expect, it } from 'vitest'
import { createEmptyArrangement } from './types'
import { defaultFocusForMode, resolveCoachNextAction } from './nextCoachAction'

describe('resolveCoachNextAction', () => {
  it('asks for melody when empty', () => {
    const a = resolveCoachNextAction({ project: null, mode: 'arrange', lints: [] })
    expect(a.kind).toBe('enter_melody')
  })

  it('suggests Sketch pillars when melody exists without pillars or soft map', () => {
    const p = createEmptyArrangement()
    p.melody = [{ id: 'm', midi: 60, startTick: 0, durationTicks: 480, role: 'pmn' }]
    const a = resolveCoachNextAction({ project: p, mode: 'arrange', lints: [] })
    expect(a.kind).toBe('suggest_pillars')
    expect(a.cta).toMatch(/Open Sketch/i)
    expect(a.focus).toBe('home')
    expect(a.body).toMatch(/Alt\+click|◆/i)
  })

  it('skips pillar nag when Sketch/Detected already map the phrase', () => {
    const p = createEmptyArrangement()
    p.melody = [{ id: 'm', midi: 60, startTick: 0, durationTicks: 480, role: 'pmn' }]
    const a = resolveCoachNextAction({
      project: p,
      mode: 'arrange',
      lints: [],
      hasSoftHarmonyMap: true,
    })
    expect(a.kind).toBe('walk_choose')
    expect(a.focus).toBe('choose')
    expect(a.body).toMatch(/Sketch\/Detected|◆/i)
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
    expect(a.cta).toMatch(/Open Sketch/i)
  })

  it('defaultFocusForMode matches session lenses', () => {
    expect(defaultFocusForMode('arrange')).toBe('home')
    expect(defaultFocusForMode('review')).toBe('check')
  })
})
