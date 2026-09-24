/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { createEmptyArrangement } from '../../domain/arranging/types'
import { polishInversionPath } from './PolishInversionPath'
import { polishArrangementVoicing } from './DocumentOps'

function phrase() {
  const p = createEmptyArrangement('Polish path')
  p.tonality = 0
  p.melody = [
    { id: 'm0', midi: 60, startTick: 0, durationTicks: 480, role: 'pmn' },
    { id: 'm1', midi: 62, startTick: 480, durationTicks: 480, role: 'smn' },
    { id: 'm2', midi: 64, startTick: 960, durationTicks: 480, role: 'pmn' },
    { id: 'm3', midi: 60, startTick: 1440, durationTicks: 480, role: 'pmn' },
  ]
  p.pillars = [
    { id: 'p0', rootPc: 0, startTick: 0, endTick: 2000, source: 'user', confirmed: true },
  ]
  // Deliberately awkward leaps: high bass then low, etc.
  p.stacks = [
    {
      id: 's0',
      startTick: 0,
      durationTicks: 480,
      rootPc: 0,
      natureId: 'major',
      voicing: '3515',
      spread: false,
      layer: 'primary',
      scfGroup: null,
      pillarId: 'p0',
      midi: { bass: 64, bari: 67, lead: 60, tenor: 72 },
      ruleTags: [],
    },
    {
      id: 's1',
      startTick: 480,
      durationTicks: 480,
      rootPc: 7,
      natureId: 'seventh',
      voicing: '1735',
      spread: false,
      layer: 'primary',
      scfGroup: null,
      pillarId: 'p0',
      midi: { bass: 43, bari: 50, lead: 62, tenor: 55 },
      ruleTags: [],
    },
    {
      id: 's2',
      startTick: 960,
      durationTicks: 480,
      rootPc: 5,
      natureId: 'major',
      voicing: '5135',
      spread: false,
      layer: 'primary',
      scfGroup: null,
      pillarId: 'p0',
      midi: { bass: 72, bari: 69, lead: 64, tenor: 77 },
      ruleTags: [],
    },
    {
      id: 's3',
      startTick: 1440,
      durationTicks: 480,
      rootPc: 0,
      natureId: 'major',
      voicing: '1351',
      spread: false,
      layer: 'primary',
      scfGroup: null,
      pillarId: 'p0',
      midi: { bass: 36, bari: 52, lead: 60, tenor: 67 },
      ruleTags: [],
    },
  ]
  return p
}

function harmonyMotion(stacks: { midi: { bass: number; bari: number; tenor: number } | null }[]): number {
  let m = 0
  for (let i = 1; i < stacks.length; i++) {
    const a = stacks[i - 1]!.midi!
    const b = stacks[i]!.midi!
    m += Math.abs(b.bass - a.bass) + Math.abs(b.bari - a.bari) + Math.abs(b.tenor - a.tenor)
  }
  return m
}

describe('polishInversionPath', () => {
  it('keeps roots and natures while reducing total part motion', () => {
    const p = phrase()
    const before = harmonyMotion(p.stacks)
    const { project, changed } = polishInversionPath(p)
    expect(changed).toBeGreaterThan(0)
    expect(project.stacks).toHaveLength(p.stacks.length)
    for (let i = 0; i < p.stacks.length; i++) {
      expect(project.stacks[i]!.rootPc).toBe(p.stacks[i]!.rootPc)
      expect(project.stacks[i]!.natureId).toBe(p.stacks[i]!.natureId)
      expect(project.stacks[i]!.midi!.lead).toBe(p.melody[i]!.midi)
    }
    expect(harmonyMotion(project.stacks)).toBeLessThanOrEqual(before)
  })

  it('prefers opening I with bass on root or fifth', () => {
    const { project } = polishInversionPath(phrase())
    const bassPc = ((project.stacks[0]!.midi!.bass % 12) + 12) % 12
    expect([0, 7]).toContain(bassPc)
  })
})

describe('polishArrangementVoicing', () => {
  it('includes path revoice ids in applied list', () => {
    const { project, applied } = polishArrangementVoicing(phrase())
    expect(project.stacks.length).toBe(4)
    expect(applied.some((a) => a.startsWith('path:'))).toBe(true)
  })
})
