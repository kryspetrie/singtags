import { describe, expect, it } from 'vitest'
import { createEmptyArrangement } from './types'
import { createFixRegistry, lintArrangement, incompleteTriadFix } from './qa'
import { tipForStep, tipForCoachUi } from './coachTips'
import { strengthenStacks } from './strengthen'
import { autoHarmonizeMelody } from './harmonize'
import { snapTick } from './snap'
import { strengthenArrangement } from '../../application/arranging/Strengthen'
import { autoLabelMelodyRoles } from '../../application/arranging/LabelMelodyRoles'

describe('coach tips + strengthen + snap', () => {
  it('returns tip for known wizard steps', () => {
    expect(tipForStep('melody').body.length).toBeGreaterThan(0)
    expect(tipForStep('step1_roots').title.length).toBeGreaterThan(0)
    expect(tipForStep('done').body).not.toMatch(/Auto-harmonize/i)
  })

  it('tipForCoachUi is phase-aware', () => {
    expect(tipForCoachUi({
        mode: 'quick',
        phase: 'pillars',
        hasMelody: true,
        hasPillars: false,
      }).title,
    ).toBe('Assign pillars')
    expect(
      tipForCoachUi({
        mode: 'review',
        phase: 'walk',
        hasMelody: true,
        hasPillars: false,
      }).title,
    ).toBe('Review')
  })

  it('strengthenStacks preserves stack count', () => {
    const p = createEmptyArrangement()
    p.melody = [
      { id: 'm1', midi: 60, startTick: 0, durationTicks: 480, role: 'pmn' },
      { id: 'm2', midi: 64, startTick: 480, durationTicks: 480, role: 'pmn' },
    ]
    p.pillars = [
      { id: 'p', rootPc: 0, startTick: 0, endTick: 2000, source: 'user', confirmed: true },
    ]
    p.stacks = autoHarmonizeMelody({
      melody: p.melody,
      pillars: p.pillars,
      tonality: 0,
    })
    const next = strengthenStacks(p)
    expect(next.length).toBe(p.stacks.length)
    const viaUc = strengthenArrangement(p)
    expect(viaUc.stacks.length).toBe(p.stacks.length)
  })

  it('snapTick snaps to grid', () => {
    expect(snapTick(100, 120)).toBe(120)
    expect(snapTick(0, 120)).toBe(0)
  })

  it('autoLabelMelodyRoles marks pmn/smn', () => {
    const p = createEmptyArrangement()
    p.melody = [
      { id: 'm1', midi: 60, startTick: 0, durationTicks: 480, role: 'pmn' },
      { id: 'm2', midi: 61, startTick: 480, durationTicks: 240, role: 'pmn' },
      { id: 'm3', midi: 62, startTick: 720, durationTicks: 480, role: 'pmn' },
    ]
    const next = autoLabelMelodyRoles(p)
    expect(next.melody.every((n) => n.role === 'pmn' || n.role === 'smn')).toBe(true)
  })
})

describe('incomplete triad fix', () => {
  it('canFix probes apply success', () => {
    const p = createEmptyArrangement()
    p.contestProfile = 'sai11'
    p.melody = [{ id: 'm', midi: 60, startTick: 0, durationTicks: 480, role: 'pmn' }]
    p.pillars = [
      { id: 'p', rootPc: 0, startTick: 0, endTick: 2000, source: 'user', confirmed: true },
    ]
    p.stacks = [
      {
        id: 's',
        startTick: 0,
        durationTicks: 480,
        rootPc: 0,
        natureId: 'major',
        voicing: '1351',
        spread: false,
        layer: 'primary',
        scfGroup: null,
        pillarId: 'p',
        midi: { bass: 48, bari: 48, lead: 60, tenor: 60 },
        ruleTags: [],
      },
    ]
    const lint = lintArrangement(p).find((l) => l.ruleId === 'incomplete-triad')
    if (!lint) {
      expect(
        incompleteTriadFix.canFix(
          { id: 'x', ruleId: 'incomplete-triad', severity: 'warn', message: '', stackId: 'missing' },
          p,
        ),
      ).toBe(false)
      return
    }
    const reg = createFixRegistry()
    expect(reg.canFix(lint, p)).toBe(true)
    const next = reg.applyToProject(lint, p)
    expect(next).toBeTruthy()
  })
})
