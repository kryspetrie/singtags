/**
 * Beam-search auto-harmonize keeps cadence highways intact.
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { autoHarmonizeMelody } from './autoHarmonize'
import type { MelodyEvent, Pillar } from '../types'

function mel(midi: number, tick: number, id: string): MelodyEvent {
  return { id, midi, startTick: tick, durationTicks: 480, role: 'pmn' }
}

function pillar(rootPc: number, start: number, end: number, id: string): Pillar {
  return { id, rootPc, startTick: start, endTick: end, source: 'user', confirmed: true }
}

describe('autoHarmonizeMelody cadence path', () => {
  it('prefers V7 under ^5→^1 opening (beam)', () => {
    // G → C in C major under tonic pillar
    const stacks = autoHarmonizeMelody({
      melody: [mel(67, 0, 'a'), mel(60, 480, 'b')],
      pillars: [pillar(0, 0, 2000, 'p')],
      tonality: 0,
      mode: 'major',
      preferScfForSmn: false,
      rankerDeps: { cadenceBias: 'strong', harmonicity: null },
      beamWidth: 3,
    })
    expect(stacks.length).toBeGreaterThanOrEqual(1)
    expect(stacks[0]!.rootPc).toBe(7)
    expect(stacks[0]!.natureId === 'seventh' || stacks[0]!.natureId === 'ninth').toBe(true)
  })

  it('greedy beamWidth=1 still returns stacks', () => {
    const stacks = autoHarmonizeMelody({
      melody: [mel(60, 0, 'a'), mel(64, 480, 'b')],
      pillars: [pillar(0, 0, 2000, 'p')],
      tonality: 0,
      beamWidth: 1,
      rankerDeps: { harmonicity: null },
    })
    expect(stacks.length).toBe(2)
  })
})
