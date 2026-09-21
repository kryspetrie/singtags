import {
  autoHarmonizeMelody,
  candidatesForMelodyNote,
  candidateToStack,
  type HarmonizeCandidate,
  type RankerDeps,
} from '../../domain/arranging/harmonize'
import type { ArrangementProject, ChordStack, MelodyEvent } from '../../domain/arranging/types'
import type { IdGenerator } from '../../ports/IdGenerator'

export type AutoHarmonizeDeps = {
  idGen?: IdGenerator
  rankerDeps?: RankerDeps
}

export function autoHarmonize(
  project: ArrangementProject,
  opts: { preferScfForSmn?: boolean } = {},
  deps: AutoHarmonizeDeps = {},
): ChordStack[] {
  return autoHarmonizeMelody({
    melody: project.melody,
    pillars: project.pillars,
    tonality: project.tonality,
    mode: project.tonalityMode ?? 'major',
    preferScfForSmn: opts.preferScfForSmn,
    profile: project.contestProfile,
    rankerDeps: deps.rankerDeps,
    idGen: deps.idGen,
  })
}

export function listCandidatesForNote(
  project: ArrangementProject,
  note: MelodyEvent,
  opts: { preferScf?: boolean; limit?: number } = {},
  deps: AutoHarmonizeDeps = {},
): HarmonizeCandidate[] {
  const pillar = project.pillars.find(
    (x) => x.startTick <= note.startTick && note.startTick < x.endTick,
  )
  if (!pillar) return []
  const prev = [...project.stacks]
    .filter((s) => s.startTick < note.startTick)
    .sort((a, b) => b.startTick - a.startTick)[0]
  const nextPillar = project.pillars.find((x) => x.startTick >= pillar.endTick)
  return candidatesForMelodyNote({
    note,
    pillar,
    tonality: project.tonality,
    mode: project.tonalityMode ?? 'major',
    prevRootPc: prev?.rootPc ?? null,
    preferScf: opts.preferScf,
    limit: opts.limit ?? 16,
    profile: project.contestProfile,
    nextPillarRoot: nextPillar?.rootPc ?? null,
    rankerDeps: deps.rankerDeps,
  })
}

export function applyCandidateToProject(
  project: ArrangementProject,
  note: MelodyEvent,
  candidate: HarmonizeCandidate,
  deps: AutoHarmonizeDeps = {},
): ArrangementProject {
  const pillar = project.pillars.find(
    (x) => x.startTick <= note.startTick && note.startTick < x.endTick,
  )
  const stack = candidateToStack(note, candidate, pillar?.id ?? null, deps.idGen)
  const stacks = project.stacks
    .filter((s) => s.startTick !== note.startTick)
    .concat(stack)
    .sort((a, b) => a.startTick - b.startTick)
  return { ...project, stacks }
}
