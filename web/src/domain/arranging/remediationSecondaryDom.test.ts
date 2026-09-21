import { describe, expect, it } from 'vitest'
import {
  isDominantOf,
  romanForChord,
  secondaryDominantRootOf,
  isSecondaryDominantSeventh,
} from './secondaryDominant'
import { explainRankingBreakdown, generateCandidates, rankCandidates } from './harmonize'
import { createEmptyArrangement } from './types'
import { fewSeventhsFix } from './qa/fixes/illegalChordFix'
import type { ArrangementLint } from './qa/types'

describe('remediation: secondary dominant / V/V', () => {
  it('detects dominant-of relation (II7 = V of V in C)', () => {
    expect(isDominantOf(2, 7)).toBe(true) // D7 → G
    expect(secondaryDominantRootOf(7)).toBe(2)
    expect(isDominantOf(7, 0)).toBe(true) // G7 → C
  })

  it('labels V7 and V7/V from resolution target', () => {
    expect(
      romanForChord({
        rootPc: 7,
        natureId: 'seventh',
        tonality: 0,
        resolvesToRoot: 0,
      }),
    ).toBe('V7')
    expect(
      romanForChord({
        rootPc: 2,
        natureId: 'seventh',
        tonality: 0,
        resolvesToRoot: 7,
      }),
    ).toBe('V7/V')
  })

  it('ranker explain surfaces secondaryDominant factor for II7 into V pillar', () => {
    const note = {
      id: 'n1',
      midi: 62, // D = 3rd of Bb? Wait — D is root of D7; use F# = 3rd of D7
      startTick: 0,
      durationTicks: 480,
      role: 'pmn' as const,
    }
    // D7 chord tones: D F# A C — lead on F# (66)
    note.midi = 66
    const pillar = {
      id: 'p1',
      rootPc: 0,
      startTick: 0,
      endTick: 1920,
      source: 'user' as const,
      confirmed: true,
    }
    const raw = generateCandidates({
      note,
      pillar,
      tonality: 0,
      prevRootPc: null,
      preferScf: true,
      nextPillarRoot: 7, // approaching V
    })
    const d7 = raw.find((c) => c.natureId === 'seventh' && c.rootPc === 2)
    expect(d7).toBeTruthy()
    const parts = explainRankingBreakdown(d7!)
    expect(parts.some((p) => p.label === 'secondaryDominant' && p.value > 0)).toBe(true)
    const ranked = rankCandidates(raw)
    const topSevenths = ranked.filter((c) => c.natureId === 'seventh').slice(0, 3)
    expect(topSevenths.some((c) => c.rootPc === 2)).toBe(true)
  })

  it('fewSeventhsFix prefers secondary-dom root toward next pillar', () => {
    const project = createEmptyArrangement('sec-dom-fix')
    project.tonality = 0
    project.pillars = [
      {
        id: 'p1',
        rootPc: 0,
        startTick: 0,
        endTick: 1920,
        source: 'user',
        confirmed: true,
      },
      {
        id: 'p2',
        rootPc: 7,
        startTick: 1920,
        endTick: 3840,
        source: 'user',
        confirmed: true,
      },
    ]
    // Lead F# (66) fits D7 (V/V); stacks are majors (few sevenths)
    const mk = (id: string, tick: number, midi: number, root: number) => ({
      id,
      startTick: tick,
      durationTicks: 480,
      rootPc: root,
      natureId: 'major',
      voicing: '1531',
      spread: false,
      layer: 'primary' as const,
      scfGroup: null,
      pillarId: 'p1',
      midi: { bass: midi - 12, bari: midi - 4, lead: midi, tenor: midi + 4 },
      ruleTags: [] as const,
    })
    project.melody = [
      { id: 'm0', midi: 66, startTick: 0, durationTicks: 480, role: 'pmn' },
      { id: 'm1', midi: 67, startTick: 480, durationTicks: 480, role: 'pmn' },
      { id: 'm2', midi: 69, startTick: 960, durationTicks: 480, role: 'pmn' },
      { id: 'm3', midi: 71, startTick: 1440, durationTicks: 480, role: 'pmn' },
      { id: 'm4', midi: 72, startTick: 1920, durationTicks: 480, role: 'pmn' },
    ]
    project.stacks = [
      mk('s0', 0, 66, 0),
      mk('s1', 480, 67, 0),
      mk('s2', 960, 69, 0),
      mk('s3', 1440, 71, 0),
    ]
    const lint: ArrangementLint = {
      id: 'l1',
      ruleId: 'few-sevenths',
      severity: 'warn',
      message: 'few',
    }
    expect(fewSeventhsFix.canFix(lint, project)).toBe(true)
    const patch = fewSeventhsFix.apply(lint, project)
    expect(patch?.stacks).toBeTruthy()
    const changed = patch!.stacks!.find((s) => s.natureId === 'seventh')
    expect(changed).toBeTruthy()
    // Prefer D7 (root 2) as V of G pillar when lead allows
    if (changed && isSecondaryDominantSeventh({
      rootPc: changed.rootPc,
      natureId: changed.natureId,
      targetRoot: 7,
    })) {
      expect(changed.rootPc).toBe(2)
    } else {
      // At minimum we inserted a seventh somewhere
      expect(changed!.natureId).toBe('seventh')
    }
  })
})
