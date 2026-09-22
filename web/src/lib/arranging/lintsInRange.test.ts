import { describe, expect, it } from 'vitest'
import type { ArrangementLint } from '../../domain/arranging/qa/types'
import { createEmptyArrangement } from '../../domain/arranging/types'
import {
  filterLintsInRange,
  formatLintMeasureBeatRow,
  lintRowParts,
  lintStartTick,
} from './lintsInRange'

describe('lintsInRange', () => {
  const project = createEmptyArrangement()
  project.melody = [
    { id: 'm1', midi: 60, startTick: 0, durationTicks: 480, role: 'pmn' },
    { id: 'm2', midi: 62, startTick: 480, durationTicks: 480, role: 'pmn' },
  ]
  project.stacks = [
    {
      id: 's1',
      startTick: 0,
      durationTicks: 480,
      rootPc: 0,
      natureId: 'major',
      voicing: '1513',
      spread: false,
      layer: 'primary',
      scfGroup: null,
      pillarId: null,
      midi: { bass: 48, bari: 55, lead: 60, tenor: 67 },
      ruleTags: [],
    },
    {
      id: 's2',
      startTick: 480,
      durationTicks: 480,
      rootPc: 2,
      natureId: 'major',
      voicing: '1513',
      spread: false,
      layer: 'primary',
      scfGroup: null,
      pillarId: null,
      midi: { bass: 50, bari: 57, lead: 62, tenor: 69 },
      ruleTags: [],
    },
  ]

  const lints: ArrangementLint[] = [
    { id: 'a', ruleId: 'x', severity: 'error', message: 'bad at 0', stackId: 's1' },
    { id: 'b', ruleId: 'y', severity: 'warn', message: 'warn at 480', stackId: 's2' },
    { id: 'c', ruleId: 'z', severity: 'info', message: 'global' },
  ]

  it('resolves stack ticks', () => {
    expect(lintStartTick(lints[0]!, project)).toBe(0)
    expect(lintStartTick(lints[1]!, project)).toBe(480)
    expect(lintStartTick(lints[2]!, project)).toBeNull()
  })

  it('filters to inspect range', () => {
    expect(filterLintsInRange(lints, project, { startTick: 0, endTick: 480 }).map((l) => l.id)).toEqual([
      'a',
    ])
    expect(
      filterLintsInRange(lints, project, { startTick: 480, endTick: 960 }).map((l) => l.id),
    ).toEqual(['b'])
  })

  it('formats measure:beat rows without pipe characters', () => {
    expect(
      formatLintMeasureBeatRow(lints[1]!, project, { numerator: 4, denominator: 4 }, 480),
    ).toBe('1:2  warn at 480')
    expect(lintRowParts(lints[1]!, project, { numerator: 4, denominator: 4 }, 480)).toEqual({
      loc: '1:2',
      message: 'warn at 480',
    })
  })
})
