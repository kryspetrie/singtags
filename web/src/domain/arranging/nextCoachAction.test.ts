import { describe, expect, it } from 'vitest'
import { createEmptyArrangement } from './types'
import { defaultFocusForMode, resolveCoachNextAction } from './nextCoachAction'

describe('resolveCoachNextAction', () => {
  it('asks for melody when empty', () => {
    const a = resolveCoachNextAction({ project: null, mode: 'arrange', lints: [] })
    expect(a.kind).toBe('enter_melody')
  })

  it('suggests Sketch chords when melody exists without pillars or soft map', () => {
    const p = createEmptyArrangement()
    p.melody = [{ id: 'm', midi: 60, startTick: 0, durationTicks: 480, role: 'pmn' }]
    const a = resolveCoachNextAction({ project: p, mode: 'arrange', lints: [] })
    expect(a.kind).toBe('suggest_pillars')
    expect(a.cta).toMatch(/Open Sketch/i)
    expect(a.focus).toBe('home')
    expect(a.body).toMatch(/Strong|passing/i)
  })

  it('skips Sketch nag when Sketch/Detected already map the phrase', () => {
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
    expect(a.body).toMatch(/Sketch\/Detected|Strong|passing/i)
  })

  it('mentions existing stacks when suggesting Sketch chords', () => {
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

  it('surfaces resolve_passing when Sketch NCTs remain after coverage', () => {
    const p = createEmptyArrangement()
    p.melody = [{ id: 'm', midi: 65, startTick: 0, durationTicks: 480, role: 'smn' }]
    p.pillars = [
      {
        id: 'pil',
        rootPc: 0,
        startTick: 0,
        endTick: 1920,
        source: 'user',
        confirmed: true,
      },
    ]
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
        pillarId: 'pil',
        midi: { bass: 48, bari: 55, lead: 60, tenor: 67 },
        ruleTags: [],
      },
    ]
    const a = resolveCoachNextAction({
      project: p,
      mode: 'arrange',
      lints: [],
      momentsLen: 1,
      passingMismatchCount: 1,
    })
    expect(a.kind).toBe('resolve_passing')
    expect(a.cta).toMatch(/Resolve passing/i)
  })
})
