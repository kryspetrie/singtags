/**
 * Cadence/tag tonic: prefer major/minor home (Rylander), not automatic I7.
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { generateCandidates } from './candidateGenerator'
import { rankCandidates, triadDoubleKind } from './candidateRanker'
import type { MelodyEvent, Pillar } from '../types'

const note = (midi: number, startTick = 0): MelodyEvent => ({
  id: `m${startTick}`,
  midi,
  startTick,
  durationTicks: 480,
  role: 'pmn',
})

const pillarC: Pillar = {
  id: 'p0',
  rootPc: 0,
  startTick: 0,
  endTick: 4000,
  source: 'user',
  confirmed: true,
}

describe('finalComplete tonic bias', () => {
  it('cadence tonic under ^1 prefers major triad home over I7', () => {
    const raw = generateCandidates({
      note: note(60), // C (^1)
      pillar: pillarC,
      tonality: 0,
      mode: 'major',
      prevRootPc: 7,
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
        phraseRole: 'cadence',
        prevRootPc: 7,
      },
    })
    expect(ranked.length).toBeGreaterThan(0)
    expect(ranked[0]!.natureId).toBe('major')
    expect(triadDoubleKind(ranked[0]!.midi, 0, 'major')).toBe('root')
  })

  it('tag tonic under ^1 prefers major triad home', () => {
    const raw = generateCandidates({
      note: note(72), // C
      pillar: pillarC,
      tonality: 0,
      mode: 'major',
      prevRootPc: 7,
      allowPassing: false,
      allowScf: false,
      natureAllowlist: ['major', 'seventh'],
    })
    const ranked = rankCandidates(raw, {
      cadenceContext: {
        tonality: 0,
        mode: 'major',
        melodyMidi: 72,
        pillarRoot: 0,
        phraseRole: 'tag',
      },
    })
    expect(ranked[0]!.natureId).toBe('major')
  })

  it('cadence tonic under ♭7 prefers I7', () => {
    const raw = generateCandidates({
      note: note(70), // B♭ = ♭7 of C
      pillar: pillarC,
      tonality: 0,
      mode: 'major',
      prevRootPc: 7,
      allowPassing: false,
      allowScf: false,
      natureAllowlist: ['major', 'seventh'],
    })
    const ranked = rankCandidates(raw, {
      cadenceContext: {
        tonality: 0,
        mode: 'major',
        melodyMidi: 70,
        pillarRoot: 0,
        phraseRole: 'cadence',
        prevRootPc: 7,
      },
    })
    expect(ranked[0]!.natureId).toBe('seventh')
  })

  it('mid-phrase tonic under ^1 prefers major home over I7', () => {
    const raw = generateCandidates({
      note: note(60),
      pillar: pillarC,
      tonality: 0,
      mode: 'major',
      prevRootPc: null,
      allowPassing: false,
      allowScf: false,
      natureAllowlist: ['major', 'seventh'],
    })
    const ranked = rankCandidates(raw, {
      cadenceContext: {
        tonality: 0,
        mode: 'major',
        melodyMidi: 60,
        pillarRoot: 0,
        phraseRole: 'mid',
      },
    })
    expect(ranked[0]!.natureId).toBe('major')
  })
})
