/**
 * Adapt TagRoll mixed-polecat seeds → MixedGoldChartView for gold builders.
 */
import type { MixedGoldChartView } from '../../domain/arranging/mixedChartGold/buildFromSeed'
import { normalizeTagRollProject } from './normalize'
import type { TagRollProject } from './types'

export function tagRollProjectToGoldChart(project: TagRollProject): MixedGoldChartView {
  const nameById = new Map(project.parts.map((p) => [p.id, p.name]))
  return {
    id: project.id,
    tonality: project.tonality,
    tonalityMode: project.tonalityMode ?? 'major',
    preferFlats: project.preferFlats,
    notes: project.notes.map((n) => ({
      partName: nameById.get(n.partId) ?? n.partId,
      midi: n.midi,
      startTick: n.startTick,
      durationTicks: n.durationTicks,
    })),
  }
}

export function loadMixedSeedProject(raw: unknown): TagRollProject {
  const p = normalizeTagRollProject(raw)
  if (!p) throw new Error('Invalid mixed polecat seed JSON')
  return p
}
