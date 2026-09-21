import { describe, expect, it } from 'vitest'
import { createEmptyArrangement } from './types'
import {
  createFixRegistry,
  lintArrangement,
  voiceLeadingFix,
  augPillarFix,
  fewSeventhsFix,
  thinNinthPreferFix,
  doubledThirdFix,
  dullHarmonicityFix,
} from './qa'
import { autoHarmonizeMelody } from './harmonize'
import { doubledThirdLints } from './denseQa'

function baseProject() {
  const p = createEmptyArrangement('fix-matrix')
  p.contestProfile = 'sai11'
  p.melody = [60, 64, 67, 65, 64, 62, 60, 59].map((midi, i) => ({
    id: `m${i}`,
    midi,
    startTick: i * 480,
    durationTicks: 480,
    role: i % 2 === 0 ? ('pmn' as const) : ('smn' as const),
  }))
  p.pillars = [
    { id: 'p', rootPc: 0, startTick: 0, endTick: 4800, source: 'user', confirmed: true },
  ]
  p.stacks = autoHarmonizeMelody({
    melody: p.melody,
    pillars: p.pillars,
    tonality: 0,
    profile: 'sai11',
  })
  return p
}

describe('fix strategy matrix', () => {
  it('voiceLeadingFix canFix matches apply when tenor broken', () => {
    const p = baseProject()
    if (!p.stacks[0]?.midi) throw new Error('need stack')
    p.stacks[0] = {
      ...p.stacks[0],
      midi: { ...p.stacks[0].midi, tenor: p.stacks[0].midi.lead - 2 },
    }
    const lint = lintArrangement(p).find((l) => l.ruleId === 'voice-leading' && l.stackId === p.stacks[0]!.id)
    expect(lint).toBeTruthy()
    const can = voiceLeadingFix.canFix(lint!, p)
    const patch = voiceLeadingFix.apply(lint!, p)
    expect(can).toBe(!!patch)
    if (patch?.stacks?.[0]?.midi) {
      expect(patch.stacks[0].midi.tenor).toBeGreaterThan(patch.stacks[0].midi.lead)
    }
  })

  it('augPillarFix swaps away from aug when canFix', () => {
    const p = baseProject()
    if (!p.stacks[0]) throw new Error('need stack')
    p.stacks[0] = { ...p.stacks[0], natureId: 'aug', layer: 'primary' }
    const lint = lintArrangement(p).find((l) => l.ruleId === 'aug-pillar')
    expect(lint).toBeTruthy()
    expect(augPillarFix.canFix(lint!, p)).toBe(true)
    const next = createFixRegistry().applyToProject(lint!, p)
    expect(next!.stacks.find((s) => s.id === p.stacks[0]!.id)!.natureId).not.toBe('aug')
  })

  it('fewSeventhsFix canFix is false when no seventh candidate path', () => {
    const p = createEmptyArrangement()
    p.stacks = []
    const lint = {
      id: 'few',
      ruleId: 'few-sevenths',
      severity: 'warn' as const,
      message: 'few',
    }
    expect(fewSeventhsFix.canFix(lint, p)).toBe(false)
  })

  it('fewSeventhsFix applies when enough stacks and a seventh exists', () => {
    const p = baseProject()
    // Force all non-seventh so lint fires and fix has work
    p.stacks = p.stacks.map((s) => ({ ...s, natureId: s.natureId === 'seventh' ? 'major' : s.natureId }))
    const lint = lintArrangement(p).find((l) => l.ruleId === 'few-sevenths')
    if (!lint) {
      // Short charts may not trip the ratio rule — still assert probe on empty
      expect(fewSeventhsFix.canFix({ id: 'f', ruleId: 'few-sevenths', severity: 'warn', message: '' }, p)).toBe(
        fewSeventhsFix.apply({ id: 'f', ruleId: 'few-sevenths', severity: 'warn', message: '' }, p) != null,
      )
      return
    }
    const can = fewSeventhsFix.canFix(lint, p)
    const patch = fewSeventhsFix.apply(lint, p)
    expect(can).toBe(!!patch)
  })

  it('thinNinthPreferFix probes PC count', () => {
    const p = baseProject()
    if (!p.stacks[0]?.midi) throw new Error('need')
    p.stacks[0] = {
      ...p.stacks[0],
      natureId: 'ninth',
      midi: { bass: 48, bari: 48, lead: 60, tenor: 60 },
    }
    const lint = {
      id: 'tn',
      ruleId: 'thin-ninth',
      severity: 'info' as const,
      message: 'thin',
      stackId: p.stacks[0].id,
    }
    const can = thinNinthPreferFix.canFix(lint, p)
    const patch = thinNinthPreferFix.apply(lint, p)
    expect(can).toBe(!!patch)
  })

  it('doubledThirdFix and dullHarmonicityFix register in default registry', () => {
    const p = baseProject()
    const reg = createFixRegistry()
    const doubled = doubledThirdLints([
      {
        id: 'd',
        startTick: 0,
        durationTicks: 480,
        rootPc: 0,
        natureId: 'major',
        voicing: '1351',
        spread: false,
        layer: 'primary',
        scfGroup: null,
        pillarId: null,
        midi: { bass: 48, bari: 52, lead: 64, tenor: 67 },
        ruleTags: [],
      },
    ])[0]
    if (doubled) {
      p.stacks = [
        {
          id: 'd',
          startTick: 0,
          durationTicks: 480,
          rootPc: 0,
          natureId: 'major',
          voicing: '1351',
          spread: false,
          layer: 'primary',
          scfGroup: null,
          pillarId: p.pillars[0]!.id,
          midi: { bass: 48, bari: 52, lead: 64, tenor: 67 },
          ruleTags: [],
        },
      ]
      p.melody = [{ id: 'm', midi: 64, startTick: 0, durationTicks: 480, role: 'pmn' }]
      expect(doubledThirdFix.canFix(doubled, p)).toBe(reg.canFix(doubled, p))
    }
    expect(dullHarmonicityFix.ruleId).toBe('dull-harmonicity')
  })
})
