/**
 * Step IX — final readiness probes (data gates; no creative auto-clear).
 */
import type { ArrangementProject } from './types'
import { lintArrangement } from './qa/arrangementLinter'
import { findEmbellishmentSeeds } from './embellishments'

export type FinalChecklistItem = {
  id: string
  label: string
  ok: boolean
  detail?: string
}

export type FinalChecklistResult = {
  ready: boolean
  items: FinalChecklistItem[]
}

export function assessFinalReadiness(project: ArrangementProject): FinalChecklistResult {
  const lints = lintArrangement(project)
  const errors = lints.filter((l) => l.severity === 'error')
  const pillarsOk =
    project.pillars.length > 0 && project.pillars.every((p) => p.confirmed)
  const hasMelody = project.melody.length > 0
  const hasStacks = project.stacks.some((s) => s.midi)
  const hasLyrics = project.melody.some((m) => (m.lyric ?? '').trim().length > 0)
  const embSeeds = findEmbellishmentSeeds(project)

  const items: FinalChecklistItem[] = [
    {
      id: 'melody',
      label: 'Melody present',
      ok: hasMelody,
      detail: hasMelody ? `${project.melody.length} notes` : 'Enter a melody first',
    },
    {
      id: 'pillars',
      label: 'Pillars confirmed',
      ok: pillarsOk,
      detail: pillarsOk
        ? `${project.pillars.length} pillars`
        : 'Infer and confirm primary roots',
    },
    {
      id: 'harmony',
      label: 'Harmony stacks present',
      ok: hasStacks,
    },
    {
      id: 'errors',
      label: 'No error-severity QA issues',
      ok: errors.length === 0,
      detail: errors.length ? `${errors.length} error(s)` : undefined,
    },
    {
      id: 'lyrics',
      label: 'Lyrics on melody (optional)',
      ok: hasLyrics,
      detail: hasLyrics ? undefined : 'Optional for export',
    },
    {
      id: 'copyright',
      label: 'Copyright / clearance reviewed',
      ok: true,
      detail: 'Human gate — coach only reminds',
    },
    {
      id: 'embellish-review',
      label: 'Embellishment opportunities reviewed',
      ok: embSeeds.length === 0 || project.stacks.some((s) => s.layer === 'embellishment'),
      detail: embSeeds.length ? `${embSeeds.length} seed(s) available` : undefined,
    },
  ]

  const required = items.filter((i) =>
    ['melody', 'pillars', 'harmony', 'errors'].includes(i.id),
  )
  return {
    ready: required.every((i) => i.ok),
    items,
  }
}
