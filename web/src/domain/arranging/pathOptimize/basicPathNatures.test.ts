/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { createEmptyArrangement } from '../types'
import { pathOptimize } from './optimize'
import { createSequentialIdGenerator } from '../../../adapters/arranging/persistence/systemServices'
import { TTBB_CLOSE_SPAN_MAX, ttbbPartsDistinct } from '../chords'
import { candidatesForMoment } from './candidates'
import { weightsFromRisk } from './types'

describe('Basic path natures', () => {
  it('tonic ^1 Basic top pick is major, not I7', () => {
    const p = createEmptyArrangement('x')
    p.tonality = 0
    p.melody = [
      { id: 'm0', midi: 60, startTick: 0, durationTicks: 480, role: 'pmn' },
      { id: 'm1', midi: 64, startTick: 480, durationTicks: 480, role: 'pmn' },
    ]
    p.pillars = [{ id: 'p0', rootPc: 0, startTick: 0, endTick: 2000, source: 'user', confirmed: true }]
    const cands = candidatesForMoment(p, p.melody[0]!, {
      topK: 8,
      weights: weightsFromRisk(0),
    })
    expect(cands[0]!.natureId).toBe('major')
    expect(cands[0]!.rootPc).toBe(0)
    expect(cands[0]!.midi!.tenor - cands[0]!.midi!.bass).toBeLessThanOrEqual(TTBB_CLOSE_SPAN_MAX)
  })

  it('Path Optimize Basic: major homes under ^1, legal close stacks', async () => {
    const p = createEmptyArrangement('probe')
    p.tonality = 0
    const midis = [60, 64, 67, 65, 62, 67, 60]
    p.melody = midis.map((midi, i) => ({
      id: `m${i}`,
      midi,
      startTick: i * 480,
      durationTicks: 480,
      role: i % 2 ? ('smn' as const) : ('pmn' as const),
    }))
    p.pillars = [
      { id: 'p0', rootPc: 0, startTick: 0, endTick: 3 * 480, source: 'user', confirmed: true },
      { id: 'p1', rootPc: 7, startTick: 3 * 480, endTick: 5 * 480, source: 'user', confirmed: true },
      { id: 'p2', rootPc: 0, startTick: 5 * 480, endTick: 8 * 480, source: 'user', confirmed: true },
    ]
    const out = await pathOptimize(
      p,
      {
        mode: 'full',
        scope: { kind: 'whole' },
        weights: { risk: 0, cadenceBias: 'moderate' },
        maxPasses: 6,
        skipProbe: true,
      },
      { idGen: createSequentialIdGenerator() },
    )
    expect(out.report.applied).toBe(true)
    const stacks = [...out.project.stacks]
      .filter((s) => s.midi)
      .sort((a, b) => a.startTick - b.startTick)
    expect(stacks.length).toBe(midis.length)
    const natures = stacks.map(
      (s) => `${s.natureId}@${s.rootPc}/${s.voicing}`,
    )
    for (const s of stacks) {
      expect(ttbbPartsDistinct(s.midi!), natures.join(' | ')).toBe(true)
      expect(s.midi!.bass).toBeGreaterThanOrEqual(45)
      expect(s.midi!.tenor - s.midi!.bass).toBeLessThanOrEqual(TTBB_CLOSE_SPAN_MAX)
      expect(s.spread).toBeFalsy()
    }
    expect(stacks[0]!.natureId, natures.join(' | ')).toBe('major')
    expect(stacks[0]!.rootPc).toBe(0)
    const close = stacks[stacks.length - 1]!
    expect(close.rootPc).toBe(0)
    expect(close.natureId, natures.join(' | ')).toBe('major')
  })
})
