/**
 * Prefer 4 distinct PCs; when a triad must double, prefer the root.
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { generateCandidates } from './candidateGenerator'
import { rankCandidates, triadDoubleKind, voicingDoublingInfo } from './candidateRanker'
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
  endTick: 4000,
  source: 'user',
  confirmed: true,
}

describe('completeFourPart / root doubling', () => {
  it('voicingDoublingInfo and triadDoubleKind classify root vs third doubles', () => {
    // Lead C, bass C — doubles root (also Lead when Lead is ^1)
    const rootDouble = voicingDoublingInfo({
      bass: 48,
      bari: 55,
      lead: 60,
      tenor: 64,
    })
    expect(rootDouble.distinctPcs).toBe(3)
    expect(triadDoubleKind(
      { bass: 48, bari: 55, lead: 60, tenor: 64 },
      0,
      'major',
    )).toBe('root')

    // Lead E, bass+tenor C — doubles root while Lead sings 3rd
    const rootWithLead3 = triadDoubleKind(
      { bass: 48, bari: 55, lead: 64, tenor: 60 },
      0,
      'major',
    )
    expect(rootWithLead3).toBe('root')

    // Lead E, bass E — doubles the third (ugly on major)
    expect(
      triadDoubleKind({ bass: 52, bari: 55, lead: 64, tenor: 60 }, 0, 'major'),
    ).toBe('third')

    // C7: C–E–G–B♭
    expect(
      triadDoubleKind({ bass: 48, bari: 52, lead: 67, tenor: 70 }, 0, 'seventh'),
    ).toBe('complete')
  })

  it('mid-phrase tonic under ^3 prefers 4-PC I7 over doubled major triad', () => {
    const raw = generateCandidates({
      note: note(64), // E = ^3 — characteristic tone supports I7
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
        melodyMidi: 64,
        pillarRoot: 0,
        phraseRole: 'mid',
      },
    })
    expect(ranked[0]!.natureId).toBe('seventh')
    const info = voicingDoublingInfo(ranked[0]!.midi)
    expect(info.distinctPcs).toBeGreaterThanOrEqual(4)
  })

  it('mid-phrase tonic under ^1 prefers major triad home over I7', () => {
    const raw = generateCandidates({
      note: note(60), // C = ^1
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
    expect(triadDoubleKind(ranked[0]!.midi, 0, 'major')).toBe('root')
  })

  it('when only major fits, top voicing doubles the root', () => {
    const raw = generateCandidates({
      note: note(64), // E = ^3 — root double should win over doubling the 3rd
      pillar: pillarC,
      tonality: 0,
      mode: 'major',
      prevRootPc: null,
      allowPassing: false,
      allowScf: false,
      natureAllowlist: ['major'],
    })
    const ranked = rankCandidates(raw, {
      cadenceContext: {
        tonality: 0,
        mode: 'major',
        melodyMidi: 64,
        pillarRoot: 0,
        phraseRole: 'mid',
      },
    })
    expect(ranked[0]!.natureId).toBe('major')
    expect(triadDoubleKind(ranked[0]!.midi, 0, 'major')).toBe('root')
  })
})
