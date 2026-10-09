/**
 * Empirical probe: Basic closedness + leap behavior.
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { createEmptyArrangement } from '../types'
import { TTBB_CLOSE_SPAN_MAX } from '../chords'
import { pathOptimize } from './optimize'
import { createSequentialIdGenerator } from '../../../adapters/arranging/persistence/systemServices'
import { stackMidiSeq } from './objective'
import { leapCapsForRisk, maxCriticalLeap, pathJumpiness } from './partLeaps'
import { listCandidatesForNote } from '../../../application/arranging/AutoHarmonize'

function wanderingPhrase() {
  const p = createEmptyArrangement('probe')
  p.tonality = 0
  // Stay within an octave so Lead itself doesn’t force a register thrash.
  const midis = [60, 64, 67, 69, 65, 62, 67, 60, 64, 67, 60]
  p.melody = midis.map((midi, i) => ({
    id: `m${i}`,
    midi,
    startTick: i * 480,
    durationTicks: 480,
    role: i % 2 ? ('smn' as const) : ('pmn' as const),
  }))
  p.pillars = [
    { id: 'p0', rootPc: 0, startTick: 0, endTick: 4 * 480, source: 'user', confirmed: true },
    { id: 'p1', rootPc: 5, startTick: 4 * 480, endTick: 6 * 480, source: 'user', confirmed: true },
    { id: 'p2', rootPc: 7, startTick: 6 * 480, endTick: 8 * 480, source: 'user', confirmed: true },
    { id: 'p3', rootPc: 0, startTick: 8 * 480, endTick: 12 * 480, source: 'user', confirmed: true },
  ]
  return p
}

describe('Basic stability probe', () => {
  it('Path Optimize Basic: no spread, BAM-close span, leaps within caps', async () => {
    const caps = leapCapsForRisk(0)
    const basic = await pathOptimize(
      wanderingPhrase(),
      {
        mode: 'full',
        scope: { kind: 'whole' },
        weights: { risk: 0, cadenceBias: 'moderate' },
        maxPasses: 6,
        skipProbe: true,
      },
      { idGen: createSequentialIdGenerator() },
    )
    expect(
      basic.report.applied,
      `${basic.report.message} | ${basic.report.rejectReason ?? ''}`,
    ).toBe(true)
    const stacks = basic.project.stacks.filter((s) => s.midi)
    expect(stacks.length).toBeGreaterThan(3)
    expect(stacks.every((s) => !s.spread)).toBe(true)
    expect(stacks.every((s) => s.midi!.tenor - s.midi!.bass <= TTBB_CLOSE_SPAN_MAX)).toBe(true)
    expect(stacks.every((s) => s.midi!.bass >= 45)).toBe(true)

    const seq = stackMidiSeq(stacks)
    for (let i = 1; i < seq.length; i++) {
      const t = Math.abs(seq[i]!.tenor - seq[i - 1]!.tenor)
      const b = Math.abs(seq[i]!.bass - seq[i - 1]!.bass)
      expect(t).toBeLessThanOrEqual(12)
      // Descending bass settle into tonic homes may drop a 9th–11th.
      const bassDesc = seq[i]!.bass < seq[i - 1]!.bass
      if (b !== 12) expect(b).toBeLessThanOrEqual(bassDesc ? 16 : 12)
    }
    expect(maxCriticalLeap(seq)).toBeLessThanOrEqual(Math.max(caps.tenor + 4, 16))
    expect(pathJumpiness(seq)).toBeGreaterThanOrEqual(0)
  })

  it('Coach listCandidates at Basic only emits closed BAM-span voicings', () => {
    const p = wanderingPhrase()
    const note = p.melody[2]!
    const cands = listCandidatesForNote(
      p,
      note,
      { pathWeights: { risk: 0 }, limit: 24 },
      { idGen: createSequentialIdGenerator() },
    )
    expect(cands.length).toBeGreaterThan(0)
    expect(cands.every((c) => !c.spread)).toBe(true)
    expect(cands.every((c) => c.midi.bass >= 45)).toBe(true)
    expect(cands.every((c) => c.midi.tenor - c.midi.bass <= TTBB_CLOSE_SPAN_MAX)).toBe(true)
  })
})
