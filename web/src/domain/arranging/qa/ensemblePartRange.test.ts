import { describe, expect, it } from 'vitest'
import { createEmptyArrangement } from '../types'
import { voicingProfileFromPreset } from '../voicingProfile'
import { lintArrangement } from './arrangementLinter'

describe('ensemble-part-range', () => {
  it('flags parts outside the Ranges profile bands', () => {
    const p = createEmptyArrangement('ranges')
    p.melody = [{ id: 'm1', midi: 60, startTick: 0, durationTicks: 480, role: 'pmn' }]
    p.stacks = [
      {
        id: 's1',
        startTick: 0,
        durationTicks: 480,
        rootPc: 0,
        natureId: 'maj',
        voicing: '0413',
        spread: false,
        layer: 'primary',
        scfGroup: null,
        pillarId: null,
        midi: { bass: 36, bari: 55, lead: 60, tenor: 72 },
        ruleTags: [],
      },
    ]
    const profile = voicingProfileFromPreset('ttbb')
    const lints = lintArrangement(p, { voicingProfile: profile })
    const bass = lints.find((l) => l.id === 'ensemble-range-s1-bass')
    expect(bass).toBeTruthy()
    expect(bass!.ruleId).toBe('ensemble-part-range')
    expect(bass!.message).toMatch(/Bass/)
  })

  it('flags outer span above maxOuterSpan', () => {
    const p = createEmptyArrangement('span')
    p.melody = [{ id: 'm1', midi: 60, startTick: 0, durationTicks: 480, role: 'pmn' }]
    p.stacks = [
      {
        id: 's1',
        startTick: 0,
        durationTicks: 480,
        rootPc: 0,
        natureId: 'maj',
        voicing: '0413',
        spread: false,
        layer: 'primary',
        scfGroup: null,
        pillarId: null,
        // All in TTBB bands but tenor−bass > 21
        midi: { bass: 40, bari: 55, lead: 60, tenor: 67 },
        ruleTags: [],
      },
    ]
    const profile = { ...voicingProfileFromPreset('ttbb'), maxOuterSpan: 21 }
    const lints = lintArrangement(p, { voicingProfile: profile })
    expect(lints.some((l) => l.id === 'ensemble-span-s1')).toBe(true)
  })

  it('skips when no voicing profile is provided', () => {
    const p = createEmptyArrangement('none')
    p.melody = [{ id: 'm1', midi: 60, startTick: 0, durationTicks: 480, role: 'pmn' }]
    p.stacks = [
      {
        id: 's1',
        startTick: 0,
        durationTicks: 480,
        rootPc: 0,
        natureId: 'maj',
        voicing: '0413',
        spread: false,
        layer: 'primary',
        scfGroup: null,
        pillarId: null,
        midi: { bass: 36, bari: 55, lead: 60, tenor: 72 },
        ruleTags: [],
      },
    ]
    const lints = lintArrangement(p, { voicingProfile: null })
    expect(lints.every((l) => l.ruleId !== 'ensemble-part-range')).toBe(true)
  })
})
