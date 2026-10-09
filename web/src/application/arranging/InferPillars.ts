import { suggestPillars, suggestionsToPillars } from '../../domain/arranging/pillars'
import type { ArrangementProject, Pillar } from '../../domain/arranging/types'
import type { IdGenerator } from '../../ports/IdGenerator'

export function inferPillars(
  project: ArrangementProject,
  deps?: { idGen?: IdGenerator },
): Pillar[] {
  // Eighth-note homes (@ ppq=480): denser harmonic rhythm than beat-level;
  // consecutive same roots are merged below.
  const suggestions = suggestPillars({
    melody: project.melody,
    tonality: project.tonality,
    mode: project.tonalityMode ?? 'major',
    measureTicks: 240,
  })
  // Merge consecutive identical roots so Path Optimize sees stable homes
  // without losing beat-level change points.
  const raw = suggestionsToPillars(suggestions)
  const merged: typeof raw = []
  for (const p of raw) {
    const last = merged[merged.length - 1]
    if (last && last.rootPc === p.rootPc && last.endTick >= p.startTick) {
      last.endTick = Math.max(last.endTick, p.endTick)
      continue
    }
    merged.push({ ...p })
  }
  if (!deps?.idGen) return merged
  return merged.map((p) => ({ ...p, id: deps.idGen!.next('pil') }))
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
