import { describe, expect, it } from 'vitest'
import type { ArrangementProject } from '../../domain/arranging/types'
import { ARRANGEMENT_SCHEMA, ARRANGING_PPQ } from '../../domain/arranging/types'
import { buildCoachLaneMarkers, buildCoachLanePillarBands } from './coachLaneMetrics'

function baseProject(partial: Partial<ArrangementProject> & Pick<ArrangementProject, 'melody' | 'stacks'>): ArrangementProject {
  return {
    schema: ARRANGEMENT_SCHEMA,
    id: 'p',
    title: 't',
    tonality: 0,
    tonalityMode: 'major',
    preferFlats: false,
    bpm: 120,
    ppq: ARRANGING_PPQ,
    wizardStep: 'melody',
    tuningMode: 'equal',
    contestProfile: 'learning',
    qaConfig: { disabledGroups: [] },
    pillars: [],
    createdAt: 0,
    updatedAt: 0,
    ...partial,
  }
}

describe('buildCoachLaneMarkers', () => {
  it('marks empty melody notes and scores filled stacks', () => {
    const project = baseProject({
      melody: [
        { id: 'm1', midi: 60, startTick: 0, durationTicks: 480, role: 'pmn' },
        { id: 'm2', midi: 62, startTick: 480, durationTicks: 480, role: 'pmn' },
      ],
      stacks: [
        {
          id: 's1',
          startTick: 0,
          durationTicks: 480,
          rootPc: 0,
          natureId: 'seventh',
          voicing: 'root',
          spread: false,
          layer: 'primary',
          scfGroup: null,
          pillarId: null,
          midi: { bass: 48, bari: 55, lead: 60, tenor: 67 },
          ruleTags: [],
        },
      ],
    })
    const markers = buildCoachLaneMarkers(project, [
      {
        id: 'l1',
        ruleId: 'test',
        severity: 'warn',
        message: 'test',
        stackId: 's1',
      },
    ])
    expect(markers).toHaveLength(2)
    expect(markers[0]!.severity).toBe('warn')
    expect(markers[0]!.harmonicity).not.toBeNull()
    expect(markers[0]!.label).toBe('test')
    expect(markers[1]!.severity).toBe('empty')
    expect(markers[1]!.harmonicity).toBeNull()
    expect(markers[1]!.label).toBe('Needs chord')
  })

  it('filterMarkersForLens isolates gaps', async () => {
    const { filterMarkersForLens } = await import('./coachLaneMetrics')
    const project = baseProject({
      melody: [
        { id: 'm1', midi: 60, startTick: 0, durationTicks: 480, role: 'pmn' },
        { id: 'm2', midi: 62, startTick: 480, durationTicks: 480, role: 'pmn' },
      ],
      stacks: [
        {
          id: 's1',
          startTick: 0,
          durationTicks: 480,
          rootPc: 0,
          natureId: 'seventh',
          voicing: 'root',
          spread: false,
          layer: 'primary',
          scfGroup: null,
          pillarId: null,
          midi: { bass: 48, bari: 55, lead: 60, tenor: 67 },
          ruleTags: [],
        },
      ],
    })
    const markers = buildCoachLaneMarkers(project, [])
    expect(filterMarkersForLens(markers, 'gaps')).toHaveLength(1)
  })
})

describe('buildCoachLanePillarBands', () => {
  it('maps pillars to bands', () => {
    const bands = buildCoachLanePillarBands([
      {
        id: 'p1',
        rootPc: 0,
        startTick: 0,
        endTick: 480,
        source: 'inferred',
        confirmed: false,
        reason: 'strong coverage',
      },
    ])
    expect(bands).toEqual([
      {
        pillarId: 'p1',
        startTick: 0,
        endTick: 480,
        rootPc: 0,
        confirmed: false,
        reason: 'strong coverage',
      },
    ])
  })
})
