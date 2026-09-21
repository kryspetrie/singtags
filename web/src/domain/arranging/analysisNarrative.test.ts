import { describe, expect, it } from 'vitest'
import { narrateArrangementAnalysis, narrateStackInContext } from './education/analysisNarrative'
import { createEmptyArrangement, type ChordStack } from './types'
import { teachArrangementAnalysis } from '../../application/arranging/TheoryAssist'

function stack(id: string, tick: number, rootPc: number, natureId: string): ChordStack {
  return {
    id,
    startTick: tick,
    durationTicks: 480,
    rootPc,
    natureId,
    voicing: '1735',
    spread: false,
    layer: 'primary',
    scfGroup: null,
    pillarId: null,
    midi: { bass: 48, bari: 55, lead: 64, tenor: 67 },
    ruleTags: [],
  }
}

describe('analysisNarrative', () => {
  it('narrates V7/V → V7 → I with teaching prose and glossary', () => {
    const project = createEmptyArrangement('narr')
    project.tonality = 0
    project.stacks = [
      stack('s0', 0, 2, 'seventh'),
      stack('s1', 480, 7, 'seventh'),
      stack('s2', 960, 0, 'major'),
    ]
    const report = narrateArrangementAnalysis(project)
    expect(report.headline).toMatch(/V7\/V/)
    expect(report.paragraphs.some((p) => p.section === 'overview')).toBe(true)
    expect(report.paragraphs.some((p) => p.section === 'progression')).toBe(true)
    expect(report.paragraphs.filter((p) => p.section === 'chord')).toHaveLength(3)
    expect(
      report.paragraphs.some((p) => /secondary dominant|five-of-five|5–1|tension/i.test(p.body)),
    ).toBe(true)
    expect(report.glossary.length).toBeGreaterThan(0)
    expect(report.progression.patterns.some((p) => p.kind === 'V7/V–V–I')).toBe(true)

    const one = narrateStackInContext(project, 's0')
    expect(one?.body).toMatch(/V7\/V|secondary/i)
    expect(teachArrangementAnalysis(project).headline).toBe(report.headline)
  })

  it('still returns helpful narrative with no stacks', () => {
    const project = createEmptyArrangement('empty')
    const report = narrateArrangementAnalysis(project)
    expect(report.headline.toLowerCase()).toMatch(/voicing|unlock|stack/)
    expect(report.paragraphs.some((p) => p.section === 'overview')).toBe(true)
  })
})
