import { describe, expect, it } from 'vitest'
import { runSyntheticKillGate } from './killGateEval'

describe('killGateEval synthetics', () => {
  it('discriminates Locked / Shifted / Fix at ≥95% with nature ≥90%', () => {
    const report = runSyntheticKillGate()
    const fails = report.cases.filter((c) => !c.statusOk)
    expect(
      report.statusAccuracy,
      `status ${(report.statusAccuracy * 100).toFixed(1)}% fails=${JSON.stringify(fails)}`,
    ).toBeGreaterThanOrEqual(0.95)
    expect(report.natureAccuracy).toBeGreaterThanOrEqual(0.9)
    expect(report.syntheticsGo).toBe(true)
  })
})
