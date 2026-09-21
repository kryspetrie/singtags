import { suggestPillars, suggestionsToPillars } from '../../domain/arranging/pillars'
import type { ArrangementProject, Pillar } from '../../domain/arranging/types'
import type { IdGenerator } from '../../ports/IdGenerator'

export function inferPillars(
  project: ArrangementProject,
  deps?: { idGen?: IdGenerator },
): Pillar[] {
  const suggestions = suggestPillars({
    melody: project.melody,
    tonality: project.tonality,
    mode: project.tonalityMode ?? 'major',
  })
  const pillars = suggestionsToPillars(suggestions)
  if (!deps?.idGen) return pillars
  return pillars.map((p) => ({ ...p, id: deps.idGen!.next('pil') }))
}

export function confirmAllPillars(project: ArrangementProject): ArrangementProject {
  return {
    ...project,
    pillars: project.pillars.map((p) => ({
      ...p,
      confirmed: true,
      source: 'user' as const,
    })),
  }
}
