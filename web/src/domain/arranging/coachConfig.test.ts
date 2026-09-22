/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  checkLeadRangeEnabled,
  isQaGroupEnabled,
  normalizeQaConfig,
  toggleQaGroup,
} from './coachConfig'
import { createEmptyArrangement } from './types'
import { lintArrangement, lintRulesForQaConfig } from './qa'

describe('coachConfig', () => {
  it('normalizes unknown groups away', () => {
    const c = normalizeQaConfig({
      disabledGroups: ['vocabulary', 'nope' as never],
    })
    expect(c.disabledGroups).toEqual(['vocabulary'])
  })

  it('toggles groups and gates lead-range', () => {
    let c = normalizeQaConfig(null)
    expect(checkLeadRangeEnabled(c)).toBe(true)
    c = toggleQaGroup(c, 'leadAndKey', false)
    expect(isQaGroupEnabled(c, 'leadAndKey')).toBe(false)
    expect(checkLeadRangeEnabled(c)).toBe(false)
    expect(lintRulesForQaConfig(c).some((r) => r.id === 'lead-range')).toBe(false)
    expect(lintRulesForQaConfig(c).some((r) => r.id === 'pillars')).toBe(true)
  })

  it('disabling vocabulary suppresses illegal-nature lints', () => {
    const p = createEmptyArrangement()
    p.contestProfile = 'sai11'
    p.melody = [{ id: 'm', midi: 60, startTick: 0, durationTicks: 480, role: 'pmn' }]
    p.pillars = [
      { id: 'p', rootPc: 0, startTick: 0, endTick: 480, source: 'user', confirmed: true },
    ]
    p.stacks = [
      {
        id: 's',
        startTick: 0,
        durationTicks: 480,
        rootPc: 0,
        natureId: 'half-dim',
        voicing: '5317',
        spread: false,
        layer: 'primary',
        scfGroup: null,
        pillarId: null,
        midi: { bass: 48, bari: 55, lead: 60, tenor: 63 },
        ruleTags: [],
      },
    ]
    expect(lintArrangement(p).some((l) => l.ruleId === 'illegal-nature')).toBe(true)
    p.qaConfig = toggleQaGroup(p.qaConfig, 'vocabulary', false)
    expect(lintArrangement(p).some((l) => l.ruleId === 'illegal-nature')).toBe(false)
  })
})
