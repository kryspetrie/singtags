import { describe, expect, it } from 'vitest'
import { createEmptyArrangement } from '../types'
import { lintArrangement, createFixRegistry, illegalChordFix } from '../qa'
import { autoHarmonizeMelody } from '../harmonize'

describe('qa fix illegal chord', () => {
  it('detects and replaces nature outside sai11', () => {
    const p = createEmptyArrangement('t')
    p.contestProfile = 'sai11'
    p.melody = [
      { id: 'm1', midi: 60, startTick: 0, durationTicks: 480, role: 'pmn' },
      { id: 'm2', midi: 64, startTick: 480, durationTicks: 480, role: 'pmn' },
    ]
    p.pillars = [
      {
        id: 'pil1',
        rootPc: 0,
        startTick: 0,
        endTick: 2000,
        source: 'user',
        confirmed: true,
      },
    ]
    p.stacks = autoHarmonizeMelody({
      melody: p.melody,
      pillars: p.pillars,
      tonality: 0,
      profile: 'learning',
    })
    // Force an illegal nature
    if (p.stacks[0]) {
      p.stacks[0] = { ...p.stacks[0], natureId: 'half-dim' }
    }

    const lints = lintArrangement(p, { profile: 'sai11' })
    const illegal = lints.find((l) => l.ruleId === 'illegal-nature')
    expect(illegal).toBeTruthy()

    const registry = createFixRegistry([illegalChordFix])
    expect(registry.canFix(illegal!, p)).toBe(true)
    const next = registry.applyToProject(illegal!, p)
    expect(next).toBeTruthy()
    expect(next!.stacks[0]!.natureId).not.toBe('half-dim')
    const again = lintArrangement(next!, { profile: 'sai11' })
    expect(again.every((l) => l.stackId !== illegal!.stackId || l.ruleId !== 'illegal-nature')).toBe(
      true,
    )
  })
})
