/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { generateCandidates } from './candidateGenerator'
import { rankCandidates } from './candidateRanker'
import type { MelodyEvent, Pillar } from '../types'

const note = (midi: number): MelodyEvent => ({
  id: 'm0',
  midi,
  startTick: 0,
  durationTicks: 480,
  role: 'pmn',
})

const pillarC: Pillar = {
  id: 'p0',
  rootPc: 0,
  startTick: 0,
  endTick: 2000,
  source: 'user',
  confirmed: true,
}

describe('unforced minor demotion', () => {
  it('major key: Lead on 1 prefers major/seventh over minor', () => {
    const raw = generateCandidates({
      note: note(60), // C
      pillar: pillarC,
      tonality: 0,
      mode: 'major',
      prevRootPc: null,
      allowPassing: false,
      allowScf: false,
      natureAllowlist: ['major', 'minor', 'seventh'],
    })
    const ranked = rankCandidates(raw, {
      cadenceContext: {
        tonality: 0,
        mode: 'major',
        melodyMidi: 60,
        pillarRoot: 0,
      },
    })
    expect(ranked.length).toBeGreaterThan(0)
    expect(ranked[0]!.natureId).not.toBe('minor')
    expect(['major', 'seventh']).toContain(ranked[0]!.natureId)
  })

  it('major key: Lead on ♭3 still allows minor', () => {
    const raw = generateCandidates({
      note: note(63), // E♭
      pillar: pillarC,
      tonality: 0,
      mode: 'major',
      prevRootPc: null,
      allowPassing: false,
      allowScf: false,
      natureAllowlist: ['major', 'minor', 'seventh'],
    })
    const ranked = rankCandidates(raw, {
      cadenceContext: {
        tonality: 0,
        mode: 'major',
        melodyMidi: 63,
        pillarRoot: 0,
      },
    })
    expect(ranked.some((c) => c.natureId === 'minor')).toBe(true)
    expect(ranked[0]!.natureId).toBe('minor')
  })

  it('minor key: Lead on tonic prefers 4-PC i7 over doubled minor triad', () => {
    const raw = generateCandidates({
      note: note(57), // A
      pillar: {
        id: 'p0',
        rootPc: 9,
        startTick: 0,
        endTick: 2000,
        source: 'user',
        confirmed: true,
      },
      tonality: 9,
      mode: 'minor',
      prevRootPc: null,
      allowPassing: false,
      allowScf: false,
      natureAllowlist: ['major', 'minor', 'seventh', 'm7'],
    })
    const ranked = rankCandidates(raw, {
      cadenceContext: {
        tonality: 9,
        mode: 'minor',
        melodyMidi: 57,
        pillarRoot: 9,
      },
    })
    expect(ranked[0]!.rootPc).toBe(9)
    expect(ranked[0]!.natureId).toBe('m7')
  })
})
