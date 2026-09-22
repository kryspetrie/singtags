import type { ArrangementProject, MelodyEvent } from '../../domain/arranging/types'
import { syncStackAfterMelodyEdit } from '../../domain/arranging/syncStacks'
import type { RankerDeps } from '../../domain/arranging/harmonize'
import type { IdGenerator } from '../../ports/IdGenerator'
import type { Clock } from '../../ports/Clock'

export type UpdateMelodyDeps = {
  idGen?: IdGenerator
  rankerDeps?: RankerDeps
  clock?: Clock
  revoice?: boolean
}

/** Replace or insert a melody note and sync harmony stacks. */
export function upsertMelodyNote(
  project: ArrangementProject,
  note: MelodyEvent,
  deps: UpdateMelodyDeps = {},
): ArrangementProject {
  const prev = project.melody.find((m) => m.id === note.id)
  let melody: MelodyEvent[]
  if (prev) {
    melody = project.melody.map((m) => (m.id === note.id ? note : m))
  } else {
    melody = [...project.melody, note].sort((a, b) => a.startTick - b.startTick)
  }
  let stacks = project.stacks
  if (prev) {
    stacks = syncStackAfterMelodyEdit({ ...project, melody }, prev, note, deps)
  }
  const updatedAt = deps.clock?.now() ?? project.updatedAt
  return { ...project, melody, stacks, updatedAt }
}

export function removeMelodyNote(
  project: ArrangementProject,
  noteId: string,
  deps: { clock?: Clock; removeOrphanStacks?: boolean } = {},
): ArrangementProject {
  const note = project.melody.find((m) => m.id === noteId)
  const melody = project.melody.filter((m) => m.id !== noteId)
  let stacks = project.stacks
  if (deps.removeOrphanStacks !== false && note) {
    stacks = stacks.filter(
      (s) => !(s.startTick === note.startTick && s.durationTicks === note.durationTicks),
    )
  }
  return {
    ...project,
    melody,
    stacks,
    updatedAt: deps.clock?.now() ?? project.updatedAt,
  }
}

export function setProjectMeta(
  project: ArrangementProject,
  patch: Partial<
    Pick<
      ArrangementProject,
      | 'title'
      | 'bpm'
      | 'tonality'
      | 'tonalityMode'
      | 'preferFlats'
      | 'tuningMode'
      | 'contestProfile'
      | 'qaConfig'
      | 'wizardStep'
    >
  >,
  clock?: Clock,
): ArrangementProject {
  return {
    ...project,
    ...patch,
    updatedAt: clock?.now() ?? project.updatedAt,
  }
}
