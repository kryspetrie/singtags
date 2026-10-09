/**
 * True song finals must land on tonic major/minor home — not hanging V7 / I7.
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { generateCandidates } from './candidateGenerator'
import { rankCandidates } from './candidateRanker'
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

describe('songFinalHome', () => {
  it('true tag final under ^5 prefers tonic major over hanging V7 or I7', () => {
    const raw = generateCandidates({
      note: note(67), // G = ^5
      pillar: pillarC,
      tonality: 0,
      mode: 'major',
      prevRootPc: 7,
      allowPassing: false,
      allowScf: false,
      natureAllowlist: ['major', 'minor', 'seventh', 'm7'],
    })
    const ranked = rankCandidates(raw, {
      cadenceContext: {
        tonality: 0,
        mode: 'major',
        melodyMidi: 67,
        pillarRoot: 0,
        phraseRole: 'tag',
        // No next melody — true song end (Bonnie-style hang).
        nextMelodyMidi: null,
        nextPillarRoot: null,
        prevRootPc: 7,
        prevNatureId: 'seventh',
      },
      cadenceBias: 'moderate',
    })
    expect(ranked.length).toBeGreaterThan(0)
    expect(ranked[0]!.rootPc).toBe(0)
    expect(ranked[0]!.natureId).toBe('major')
  })

  it('penultimate tag with next ^1 still prefers V7', () => {
    const pillarV: Pillar = {
      id: 'pV',
      rootPc: 7,
      startTick: 0,
      endTick: 4000,
      source: 'user',
      confirmed: true,
    }
    const raw = generateCandidates({
      note: note(67),
      pillar: pillarV,
      tonality: 0,
      mode: 'major',
      prevRootPc: 2,
      allowPassing: true,
      allowScf: false,
      natureAllowlist: ['major', 'seventh', 'm7'],
    })
    const ranked = rankCandidates(raw, {
      cadenceContext: {
        tonality: 0,
        mode: 'major',
        melodyMidi: 67,
        pillarRoot: 7,
        phraseRole: 'tag',
        nextMelodyMidi: 60,
        nextPillarRoot: 0,
      },
      cadenceBias: 'strong',
    })
    expect(ranked[0]!.rootPc).toBe(7)
    expect(ranked[0]!.natureId).toBe('seventh')
  })
})
