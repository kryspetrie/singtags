import { describe, expect, it } from 'vitest'
import { createEmptyArrangement } from './types'
import { keySuggestionLints, motionLints, orphanStackLints } from './motionAndKey'
import { createFixRegistry } from './qa'

describe('motionAndKey', () => {
  it('flags orphan stacks', () => {
    const p = createEmptyArrangement()
    p.stacks = [
      {
        id: 's1',
        startTick: 0,
        durationTicks: 480,
        rootPc: 0,
        natureId: 'major',
        voicing: '1351',
        spread: false,
        layer: 'primary',
        scfGroup: null,
        pillarId: null,
        midi: { bass: 48, bari: 52, lead: 60, tenor: 67 },
        ruleTags: [],
      },
    ]
    const lints = orphanStackLints(p)
    expect(lints.some((l) => l.ruleId === 'orphan-stack')).toBe(true)
    const reg = createFixRegistry()
    const next = reg.applyToProject(lints[0]!, p)
    expect(next?.stacks).toHaveLength(0)
  })

  it('suggests transpose when lead is low', () => {
    const p = createEmptyArrangement()
    p.melody = [{ id: 'm1', midi: 40, startTick: 0, durationTicks: 480, role: 'pmn' }]
    const lints = keySuggestionLints(p)
    expect(lints[0]?.ruleId).toBe('key-suggestion')
    expect(Number(lints[0]?.data?.semitones)).toBeGreaterThan(0)
  })

  it('motion lints other root jumps', () => {
    const p = createEmptyArrangement()
    p.tonality = 0
    p.stacks = [
      {
        id: 'a',
        startTick: 0,
        durationTicks: 480,
        rootPc: 4, // III
        natureId: 'minor',
        voicing: '1351',
        spread: false,
        layer: 'primary',
        scfGroup: null,
        pillarId: null,
        midi: null,
        ruleTags: [],
      },
      {
        id: 'b',
        startTick: 480,
        durationTicks: 480,
        rootPc: 6, // tritones from III? pcDiff(4,6)=2 — M2, "other"
        natureId: 'major',
        voicing: '1351',
        spread: false,
        layer: 'primary',
        scfGroup: null,
        pillarId: null,
        midi: null,
        ruleTags: [],
      },
    ]
    const lints = motionLints(p)
    expect(lints.some((l) => l.ruleId === 'harmonic-motion')).toBe(true)
  })
})
