import { describe, expect, it } from 'vitest'
import { analyzeArrangementHarmony, labelStackHarmony } from './progressionAnalyze'
import { createEmptyArrangement, type ChordStack } from './types'
import { analyzeProjectProgression } from '../../application/arranging/TheoryAssist'

function stack(
  id: string,
  tick: number,
  rootPc: number,
  natureId: string,
): ChordStack {
  return {
    id,
    startTick: tick,
    durationTicks: 480,
    rootPc,
    natureId,
    voicing: natureId === 'seventh' ? '1735' : '1531',
    spread: false,
    layer: natureId === 'seventh' ? 'passing' : 'primary',
    scfGroup: null,
    pillarId: null,
    midi: { bass: 48, bari: 55, lead: 60 + rootPc, tenor: 67 },
    ruleTags: [],
  }
}

describe('progressionAnalyze', () => {
  it('labels diatonic degrees I ii iii IV V vi vii°', () => {
    const tonality = 0
    const mode = 'major' as const
    const cases: { root: number; nature: string; expect: string }[] = [
      { root: 0, nature: 'major', expect: 'I' },
      { root: 2, nature: 'minor', expect: 'ii' },
      { root: 4, nature: 'minor', expect: 'iii' },
      { root: 5, nature: 'major', expect: 'IV' },
      { root: 7, nature: 'major', expect: 'V' },
      { root: 9, nature: 'minor', expect: 'vi' },
      { root: 11, nature: 'dim', expect: 'vii°' },
    ]
    for (const c of cases) {
      const lab = labelStackHarmony({
        stack: stack('x', 0, c.root, c.nature),
        tonality,
        mode,
      })
      expect(lab.roman).toBe(c.expect)
    }
  })

  it('labels V7 and authentic 5–1', () => {
    const project = createEmptyArrangement('auth')
    project.tonality = 0
    project.stacks = [stack('s0', 0, 7, 'seventh'), stack('s1', 480, 0, 'major')]
    const report = analyzeArrangementHarmony(project)
    expect(report.stacks[0]!.roman).toBe('V7')
    expect(report.stacks[1]!.roman).toBe('I')
    expect(report.links.some((l) => l.kind === 'authentic')).toBe(true)
    expect(report.counts.authentic).toBe(1)
    expect(report.summary.toLowerCase()).toMatch(/5–1|authentic/)
  })

  it('detects V7/V → V → I (five of five)', () => {
    const project = createEmptyArrangement('vv')
    project.tonality = 0
    // D7 → G7 → C
    project.stacks = [
      stack('s0', 0, 2, 'seventh'),
      stack('s1', 480, 7, 'seventh'),
      stack('s2', 960, 0, 'major'),
    ]
    const report = analyzeArrangementHarmony(project)
    expect(report.stacks[0]!.roman).toBe('V7/V')
    expect(report.stacks[1]!.roman).toBe('V7')
    expect(report.stacks[2]!.roman).toBe('I')
    expect(report.patterns.some((p) => p.kind === 'V7/V–V–I')).toBe(true)
    expect(report.links.some((l) => l.kind === 'secondary_resolution')).toBe(true)
    expect(report.links.some((l) => l.kind === 'authentic')).toBe(true)
  })

  it('detects tritone sub ♭II7 → I', () => {
    const project = createEmptyArrangement('tts')
    project.tonality = 0
    // Db7 → C (tritone sub for G7→C)
    project.stacks = [stack('s0', 0, 1, 'seventh'), stack('s1', 480, 0, 'major')]
    const report = analyzeArrangementHarmony(project)
    expect(report.stacks[0]!.roman).toMatch(/♭II7|SubV/)
    expect(report.stacks[0]!.functionKind).toBe('tritone_sub')
    expect(report.links.some((l) => l.kind === 'tritone_sub_resolve')).toBe(true)
  })

  it('authentic links teach classic_cadences', () => {
    const project = createEmptyArrangement('auth')
    project.tonality = 0
    project.stacks = [
      stack('s0', 0, 7, 'seventh'),
      stack('s1', 480, 0, 'major'),
    ]
    const report = analyzeArrangementHarmony(project)
    const auth = report.links.find((l) => l.kind === 'authentic')
    expect(auth?.teachingId).toBe('classic_cadences')
  })

  it('detects plagal IV → I and descending fifths', () => {
    const project = createEmptyArrangement('plag')
    project.tonality = 0
    project.stacks = [
      stack('s0', 0, 2, 'seventh'), // D7
      stack('s1', 480, 7, 'seventh'), // G7
      stack('s2', 960, 0, 'major'), // C
      stack('s3', 1440, 5, 'major'), // F
      stack('s4', 1920, 0, 'major'), // C
    ]
    const report = analyzeArrangementHarmony(project)
    expect(report.links.some((l) => l.kind === 'plagal')).toBe(true)
    expect(report.links.some((l) => l.kind === 'secondary_resolution')).toBe(true)
    expect(report.links.some((l) => l.kind === 'authentic')).toBe(true)
    // Descending-fifth root motion is classified as cadence/secondary when applicable
    expect(
      report.counts.circleFifths +
        report.counts.authentic +
        report.counts.secondaryResolutions,
    ).toBeGreaterThanOrEqual(2)
    const plagal = report.links.find((l) => l.kind === 'plagal')
    expect(plagal?.teachingId).toBe('classic_cadences')
  })

  it('detects counterpart swap between BS7s a tritone apart', () => {
    const project = createEmptyArrangement('cp')
    project.tonality = 0
    project.stacks = [stack('s0', 0, 0, 'seventh'), stack('s1', 480, 6, 'seventh')]
    const report = analyzeArrangementHarmony(project)
    expect(report.links.some((l) => l.kind === 'counterpart_swap')).toBe(true)
  })

  it('labels chromatic passing motion', () => {
    const project = createEmptyArrangement('pass')
    project.tonality = 0
    project.stacks = [stack('s0', 0, 0, 'seventh'), stack('s1', 480, 1, 'seventh')]
    const report = analyzeArrangementHarmony(project)
    expect(report.links.some((l) => l.kind === 'chromatic_pass')).toBe(true)
  })

  it('application analyzeProjectProgression mirrors domain', () => {
    const project = createEmptyArrangement('app')
    project.stacks = [stack('s0', 0, 7, 'seventh'), stack('s1', 480, 0, 'major')]
    expect(analyzeProjectProgression(project).counts.authentic).toBe(
      analyzeArrangementHarmony(project).counts.authentic,
    )
  })

  it('minor mode uses i / iv / V labeling', () => {
    const lab = labelStackHarmony({
      stack: stack('a', 0, 9, 'minor'),
      tonality: 9,
      mode: 'minor',
    })
    expect(lab.roman).toBe('i')
    const iv = labelStackHarmony({
      stack: stack('b', 0, 2, 'minor'),
      tonality: 9,
      mode: 'minor',
    })
    expect(iv.roman).toBe('iv')
  })

  it('tonic Mm7 driving IV prefers I7 primary with V7/IV alt', () => {
    const lab = labelStackHarmony({
      stack: stack('c7', 0, 0, 'seventh'),
      tonality: 0,
      mode: 'major',
      nextRootPc: 5,
      nextNatureId: 'major',
    })
    expect(lab.roman).toBe('I7')
    expect(lab.alts).toContain('V7/IV')
  })
})
