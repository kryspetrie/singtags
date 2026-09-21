import { describe, expect, it } from 'vitest'
import { scoreHarmonicSeriesSpacing } from './spacing/harmonicSeriesSpacing'
import {
  analyzeTensionRelease,
  functionTagForStack,
  resolutionScore,
} from './tensionRelease'
import { analyzeHarmonyTheory } from './analyzeHarmonyTheory'
import { analyzeVoiceLeading } from './voiceLeading'
import { autocompleteNextChord } from './harmonize/chordAutocomplete'
import { completePartialChord, repairStackAfterRemovingParts } from './chordCompletion'
import { explainRankingBreakdown } from './harmonize/candidateRanker'
import { generateCandidates } from './harmonize/candidateGenerator'
import { createEmptyArrangement } from './types'
import { BARBERSHOP_CHORDS, placeVoicing } from './chords'
import {
  autocompleteChordAtNote,
  completeChordFromPitches,
  repairProjectStack,
  runHarmonyTheoryAnalysis,
} from '../../application/arranging/TheoryAssist'
import { lintArrangement } from './qa'
import { glossaryById } from './education'

function mkSeventh(rootPc: number, leadMidi: number, voicing = '1735') {
  const chord = BARBERSHOP_CHORDS.find((c) => c.id === 'seventh')!
  const midi = placeVoicing({ chord, rootPc, leadMidi, voicing, spread: false })!
  return midi
}

describe('theory headless: spacing', () => {
  it('scores compact upper + wider bass higher than muddy spacing', () => {
    const good = scoreHarmonicSeriesSpacing({
      bass: 48,
      bari: 60,
      lead: 64,
      tenor: 67,
    })
    const muddy = scoreHarmonicSeriesSpacing({
      bass: 60,
      bari: 63,
      lead: 64,
      tenor: 79,
    })
    expect(good.score).toBeGreaterThan(muddy.score)
    expect(muddy.issues.length).toBeGreaterThan(0)
  })
})

describe('theory headless: tension / resolution', () => {
  it('tags BS7 as tension and major pillar as release', () => {
    expect(
      functionTagForStack(
        {
          id: 's',
          startTick: 0,
          durationTicks: 480,
          rootPc: 7,
          natureId: 'seventh',
          voicing: '1735',
          spread: false,
          layer: 'passing',
          scfGroup: 1,
          pillarId: null,
          midi: null,
          ruleTags: [],
        },
        { nextPillarRoot: 0 },
      ),
    ).toBe('tension')
    expect(
      functionTagForStack(
        {
          id: 's2',
          startTick: 0,
          durationTicks: 480,
          rootPc: 0,
          natureId: 'major',
          voicing: '1531',
          spread: false,
          layer: 'primary',
          scfGroup: null,
          pillarId: null,
          midi: null,
          ruleTags: [],
        },
        { pillarRoot: 0 },
      ),
    ).toBe('release')
  })

  it('scores G7→C resolution highly when 3↑ and 7↓', () => {
    // G7: G B D F — lead on B (71)
    const prev = mkSeventh(7, 71, '1735')
    // Ideal: B→C, F→E in same parts
    const next = {
      bass: prev.bass, // may stay/root
      bari: prev.bari,
      lead: prev.lead + 1, // B→C
      tenor: prev.tenor - 1, // if tenor was F
    }
    // Rebuild with known voicing: find which parts have 3 and 7
    const score = resolutionScore(
      { rootPc: 7, natureId: 'seventh', midi: prev },
      // Force: map third part +1, seventh part -1
      (() => {
        const m = { ...prev }
        for (const k of ['bass', 'bari', 'lead', 'tenor'] as const) {
          const p = ((prev[k] % 12) + 12) % 12
          if (p === 11) m[k] = prev[k] + 1 // B→C
          if (p === 5) m[k] = prev[k] - 1 // F→E
        }
        return m
      })(),
    )
    expect(score).toBeGreaterThanOrEqual(0.75)
    expect(next.lead).toBeTruthy()
  })
})

describe('theory headless: voice leading extensions', () => {
  it('flags parallel octaves and contrary hints', () => {
    const a = {
      id: 'a',
      startTick: 0,
      durationTicks: 480,
      rootPc: 0,
      natureId: 'major',
      voicing: '1531',
      spread: false,
      layer: 'primary' as const,
      scfGroup: null,
      pillarId: null,
      midi: { bass: 48, bari: 60, lead: 64, tenor: 72 },
      ruleTags: [],
    }
    const b = {
      ...a,
      id: 'b',
      startTick: 480,
      midi: { bass: 50, bari: 62, lead: 66, tenor: 74 }, // all +2 — parallel everything
    }
    const issues = analyzeVoiceLeading([a, b])
    expect(issues.some((i) => i.teachingId === 'parallel_5_8' || i.id.includes('p8'))).toBe(
      true,
    )
    expect(issues.some((i) => i.teachingId === 'contrary_motion')).toBe(true)
  })
})

describe('theory headless: autocomplete', () => {
  it('suggests secondary-dom BS7 toward next pillar when lead allows', () => {
    const note = {
      id: 'n',
      midi: 66, // F# = 3rd of D7
      startTick: 0,
      durationTicks: 480,
      role: 'pmn' as const,
    }
    const pillar = {
      id: 'p',
      rootPc: 0,
      startTick: 0,
      endTick: 1920,
      source: 'user' as const,
      confirmed: true,
    }
    const sug = autocompleteNextChord({
      note,
      pillar,
      tonality: 0,
      prevRootPc: null,
      nextPillarRoot: 7,
      preferScf: true,
      preferSevenths: true,
      limit: 16,
    })
    expect(sug.length).toBeGreaterThan(0)
    expect(sug[0]!.why.length).toBeGreaterThan(0)
    expect(sug.some((s) => s.rootPc === 2 && s.natureId === 'seventh')).toBe(true)
    expect(sug.some((s) => s.chip === 'secondary_dom' || s.roman?.includes('V7'))).toBe(true)
  })

  it('explainRankingBreakdown includes theory factors', () => {
    const note = {
      id: 'n',
      midi: 64,
      startTick: 0,
      durationTicks: 480,
      role: 'pmn' as const,
    }
    const pillar = {
      id: 'p',
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
      nextPillarRoot: 0,
    })
    expect(raw[0]).toBeTruthy()
    const parts = explainRankingBreakdown(raw[0]!)
    const labels = parts.map((p) => p.label)
    expect(labels).toEqual(expect.arrayContaining(['spacing', 'tensionRelease']))
  })
})

describe('theory headless: chord completion', () => {
  it('completes E+Bb (+implied) toward C7', () => {
    // Tritone of C7: E and Bb
    const result = completePartialChord({
      presentMidi: [64, 70], // E, Bb
      leadMidi: 64,
      tonality: 0,
      profile: 'sai11',
      pillarRoot: 0,
      nextPillarRoot: 5,
      limit: 16,
    })
    expect(result.inferredNatures.some((n) => n.natureId === 'seventh' && n.rootPc === 0)).toBe(
      true,
    )
    expect(result.suggestions.length).toBeGreaterThan(0)
    expect(
      result.suggestions.some((s) => s.natureId === 'seventh' && s.rootPc === 0),
    ).toBe(true)
    expect(result.suggestions[0]!.why.toLowerCase()).toMatch(/complete|7|third|seventh/)
  })

  it('repair after removing bari keeps lead fixed', () => {
    const midi = mkSeventh(0, 64, '1735')
    const result = repairStackAfterRemovingParts({
      midi,
      natureId: 'seventh',
      rootPc: 0,
      remove: ['bari'],
      profile: 'sai11',
      tonality: 0,
      pillarRoot: 0,
      limit: 12,
    })
    expect(result.suggestions.length).toBeGreaterThan(0)
    expect(result.suggestions.every((s) => s.midi.lead === midi.lead)).toBe(true)
  })
})

describe('theory headless: project analysis + lint + app', () => {
  it('analyzeHarmonyTheory returns labels and issues', () => {
    const project = createEmptyArrangement('theory')
    project.tonality = 0
    project.pillars = [
      {
        id: 'p1',
        rootPc: 0,
        startTick: 0,
        endTick: 3840,
        source: 'user',
        confirmed: true,
      },
    ]
    const g7 = mkSeventh(7, 71)
    const c = placeVoicing({
      chord: BARBERSHOP_CHORDS.find((c) => c.id === 'major')!,
      rootPc: 0,
      leadMidi: 72,
      voicing: '1531',
      spread: false,
    })!
    project.stacks = [
      {
        id: 's0',
        startTick: 0,
        durationTicks: 480,
        rootPc: 7,
        natureId: 'seventh',
        voicing: '1735',
        spread: false,
        layer: 'passing',
        scfGroup: 1,
        pillarId: 'p1',
        midi: g7,
        ruleTags: ['R1_p5'],
      },
      {
        id: 's1',
        startTick: 480,
        durationTicks: 480,
        rootPc: 0,
        natureId: 'major',
        voicing: '1531',
        spread: false,
        layer: 'primary',
        scfGroup: null,
        pillarId: 'p1',
        midi: c,
        ruleTags: [],
      },
    ]
    const report = analyzeHarmonyTheory(project)
    expect(report.labels.length).toBe(2)
    expect(report.labels[0]!.roman).toMatch(/V/)
    expect(runHarmonyTheoryAnalysis(project).labels.length).toBe(2)
  })

  it('lints include bs7-density and theory rules when applicable', () => {
    const project = createEmptyArrangement('lint')
    project.melody = Array.from({ length: 5 }, (_, i) => ({
      id: `m${i}`,
      midi: 60,
      startTick: i * 480,
      durationTicks: 480,
      role: 'pmn' as const,
    }))
    project.stacks = Array.from({ length: 5 }, (_, i) => ({
      id: `s${i}`,
      startTick: i * 480,
      durationTicks: 480,
      rootPc: 0,
      natureId: 'major',
      voicing: '1531',
      spread: false,
      layer: 'primary' as const,
      scfGroup: null,
      pillarId: null,
      midi: { bass: 48, bari: 52, lead: 60, tenor: 67 },
      ruleTags: [],
    }))
    const lints = lintArrangement(project)
    expect(lints.some((l) => l.ruleId === 'bs7-density')).toBe(true)
    expect(lints.some((l) => l.ruleId === 'theory-spacing')).toBe(true)
  })

  it('application autocomplete and repair work', () => {
    const project = createEmptyArrangement('app')
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
    const note = {
      id: 'n1',
      midi: 66,
      startTick: 0,
      durationTicks: 480,
      role: 'pmn' as const,
    }
    project.melody = [note]
    const sug = autocompleteChordAtNote(project, note)
    expect(sug.length).toBeGreaterThan(0)

    const midi = mkSeventh(0, 64)
    project.stacks = [
      {
        id: 's0',
        startTick: 0,
        durationTicks: 480,
        rootPc: 0,
        natureId: 'seventh',
        voicing: '1735',
        spread: false,
        layer: 'primary',
        scfGroup: null,
        pillarId: 'p1',
        midi,
        ruleTags: [],
      },
    ]
    const repaired = repairProjectStack(project, 's0', ['tenor'])
    expect(repaired.suggestions.every((s) => s.midi.lead === midi.lead)).toBe(true)

    const partial = completeChordFromPitches(project, {
      presentMidi: [64, 70],
      leadMidi: 64,
      tick: 0,
    })
    expect(partial.suggestions.length).toBeGreaterThan(0)
  })

  it('glossary includes new theory ids', () => {
    expect(glossaryById('tension_release')?.term).toMatch(/Tension/)
    expect(glossaryById('incomplete_chord')).toBeTruthy()
  })
})
