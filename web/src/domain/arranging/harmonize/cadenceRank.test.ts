/**
 * Coach ranking should prefer classic cadences when context matches.
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { generateCandidates } from './candidateGenerator'
import { explainRankingBreakdown, rankCandidates } from './candidateRanker'
import type { MelodyEvent, Pillar } from '../types'
import type { CadenceContext } from '../cadences'

function note(midi: number, role: MelodyEvent['role'] = 'pmn'): MelodyEvent {
  return { id: `n${midi}`, midi, startTick: 0, durationTicks: 480, role }
}

function pillar(rootPc: number): Pillar {
  return { id: 'p1', rootPc, startTick: 0, endTick: 4000, source: 'user', confirmed: true }
}

function ctx(partial: Partial<CadenceContext> & Pick<CadenceContext, 'melodyMidi'>): CadenceContext {
  return { tonality: 0, mode: 'major', ...partial }
}

describe('coach cadenceFit ranking', () => {
  it('prefers V7 when Lead ^5→^1', () => {
    const raw = generateCandidates({
      note: note(67), // G
      pillar: pillar(0),
      tonality: 0,
      prevRootPc: null,
      preferScf: false,
      nextPillarRoot: 0,
    })
    const ranked = rankCandidates(raw, {
      cadenceContext: ctx({ melodyMidi: 67, nextMelodyMidi: 60 }),
    })
    const top = ranked[0]!
    expect(top.rootPc).toBe(7)
    expect(top.natureId === 'seventh' || top.natureId === 'ninth').toBe(true)
    const parts = explainRankingBreakdown(raw.find((c) => c.rootPc === 7 && c.natureId === 'seventh')!, {
      cadenceContext: ctx({ melodyMidi: 67, nextMelodyMidi: 60 }),
    })
    expect(parts.some((p) => p.label === 'cadenceFit' && p.value > 0)).toBe(true)
  })

  it('prefers V7 after II7 (circle highway)', () => {
    const raw = generateCandidates({
      note: note(67),
      pillar: pillar(0),
      tonality: 0,
      prevRootPc: 2,
      prevNatureId: 'seventh',
      preferScf: false,
      nextPillarRoot: 0,
    })
    const ranked = rankCandidates(raw, {
      cadenceContext: ctx({
        melodyMidi: 67,
        prevRootPc: 2,
        prevNatureId: 'seventh',
        nextPillarRoot: 0,
      }),
    })
    const top = ranked[0]!
    expect(top.rootPc).toBe(7)
    expect(top.natureId === 'seventh' || top.natureId === 'ninth').toBe(true)
  })

  it('prefers I7 when Lead ^1→^4 (I7→IV)', () => {
    const raw = generateCandidates({
      note: note(60),
      pillar: pillar(0),
      tonality: 0,
      prevRootPc: null,
      preferScf: false,
      nextPillarRoot: 5,
    })
    const ranked = rankCandidates(raw, {
      cadenceContext: ctx({
        melodyMidi: 60,
        nextMelodyMidi: 65,
        nextPillarRoot: 5,
        pillarRoot: 0,
      }),
    })
    const top = ranked[0]!
    expect(top.rootPc).toBe(0)
    expect(top.natureId === 'seventh' || top.natureId === 'ninth').toBe(true)
  })

  it('still prefers home triad when no cadence fires', () => {
    const raw = generateCandidates({
      note: note(60),
      pillar: pillar(0),
      tonality: 0,
      prevRootPc: null,
      preferScf: true,
      nextPillarRoot: 5,
    })
    const ranked = rankCandidates(raw, {
      cadenceContext: ctx({ melodyMidi: 60, pillarRoot: 0, nextPillarRoot: 5 }),
    })
    expect(ranked[0]!.natureId).toBe('major')
    expect(ranked[0]!.rootPc).toBe(0)
  })
})
