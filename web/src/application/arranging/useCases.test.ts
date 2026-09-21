import { describe, expect, it } from 'vitest'
import { createEmptyArrangement } from '../../domain/arranging/types'
import { inferPillars, confirmAllPillars } from './InferPillars'
import { autoHarmonize } from './AutoHarmonize'
import { runQa, lintSummary } from './RunQa'
import { applyFix } from './ApplyFix'
import { createSequentialIdGenerator } from '../../adapters/arranging/persistence/systemServices'
import { createHarmonicityScorer } from '../../domain/arranging/harmonicity/harmonicityScore'

describe('application use-cases', () => {
  it('infer → confirm → auto-harmonize → qa is headless', () => {
    const idGen = createSequentialIdGenerator()
    let p = createEmptyArrangement('t', { id: idGen.next('arr'), now: 1 })
    p.melody = [0, 4, 7, 0].map((semi, i) => ({
      id: idGen.next('mel'),
      midi: 60 + semi,
      startTick: i * 480,
      durationTicks: 480,
      role: 'pmn' as const,
    }))
    p.pillars = inferPillars(p, { idGen })
    expect(p.pillars.length).toBeGreaterThan(0)
    p = confirmAllPillars({ ...p, pillars: p.pillars })
    expect(p.pillars.every((x) => x.confirmed)).toBe(true)

    const stacks = autoHarmonize(
      p,
      {},
      {
        idGen,
        rankerDeps: { harmonicity: createHarmonicityScorer() },
      },
    )
    p = { ...p, stacks }
    expect(stacks.length).toBe(p.melody.length)

    const lints = runQa(p)
    const summary = lintSummary(lints)
    expect(summary.errors + summary.warns + summary.infos).toBeGreaterThanOrEqual(0)
  })

  it('applyFix no-ops when nothing illegal', () => {
    const p = createEmptyArrangement()
    p.melody = [{ id: 'm1', midi: 60, startTick: 0, durationTicks: 480, role: 'pmn' }]
    p.pillars = [
      {
        id: 'p1',
        rootPc: 0,
        startTick: 0,
        endTick: 1000,
        source: 'user',
        confirmed: true,
      },
    ]
    const lints = runQa(p)
    const illegal = lints.find((l) => l.ruleId === 'illegal-nature')
    expect(illegal).toBeUndefined()
    expect(applyFix(p, { id: 'x', ruleId: 'illegal-nature', severity: 'error', message: 'x' })).toBeNull()
  })
})
