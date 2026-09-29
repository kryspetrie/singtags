import {
  autoHarmonizeMelody,
  candidatesForMelodyNote,
  candidateToStack,
  type HarmonizeCandidate,
  type RankerDeps,
} from '../../domain/arranging/harmonize'
import { phraseRoleAtMelodyIndex } from '../../domain/arranging/cadences'
import { pillarAtTick } from '../../domain/arranging/pillars'
import type { ArrangementProject, ChordStack, MelodyEvent } from '../../domain/arranging/types'
import type { IdGenerator } from '../../ports/IdGenerator'
import {
  resolveSuggestHomeRoot,
  type SoftSuggestContext,
} from './suggestHomeRoot'

/**
 * Coach moments often use synthetic / held-post ids. Resolve the covering Lead
 * onset so next/prev melody (cadence ^5→^1) still works.
 */
function melodyIndexForCandidateTarget(
  melodySorted: readonly MelodyEvent[],
  note: MelodyEvent,
): number {
  const byId = melodySorted.findIndex((m) => m.id === note.id)
  if (byId >= 0) return byId
  const byStart = melodySorted.findIndex((m) => m.startTick === note.startTick)
  if (byStart >= 0) return byStart
  let covering = -1
  for (let i = 0; i < melodySorted.length; i++) {
    const m = melodySorted[i]!
    if (m.startTick <= note.startTick && note.startTick < m.startTick + Math.max(1, m.durationTicks)) {
      covering = i
    }
  }
  if (covering >= 0) return covering
  for (let i = melodySorted.length - 1; i >= 0; i--) {
    if (melodySorted[i]!.startTick <= note.startTick) return i
  }
  return -1
}

export type { SoftSuggestContext, SuggestHomeRootSource } from './suggestHomeRoot'
export { resolveSuggestHomeRoot } from './suggestHomeRoot'

export type AutoHarmonizeDeps = {
  idGen?: IdGenerator
  rankerDeps?: RankerDeps
}

export type ListCandidatesOpts = {
  preferScf?: boolean
  limit?: number
  /** Sketch / Detected spans for mid-arrangement Suggest without pillars. */
  softContext?: SoftSuggestContext | null
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

/**
 * Rank voicings for one melody note. Uses a real pillar when present; otherwise
 * falls back to locked Sketch → Detected → implied melody chord (soft context).
 */
export function listCandidatesForNote(
  project: ArrangementProject,
  note: MelodyEvent,
  opts: ListCandidatesOpts = {},
  deps: AutoHarmonizeDeps = {},
): HarmonizeCandidate[] {
  const prev = [...project.stacks]
    .filter((s) => s.startTick < note.startTick)
    .sort((a, b) => b.startTick - a.startTick)[0]
  const melodySorted = [...project.melody].sort((a, b) => a.startTick - b.startTick)
  const noteIdx = melodyIndexForCandidateTarget(melodySorted, note)
  const nextMel = noteIdx >= 0 ? melodySorted[noteIdx + 1] ?? null : null
  const prevMel = noteIdx > 0 ? melodySorted[noteIdx - 1]! : null
  const songEnd = Math.max(
    1,
    ...melodySorted.map((m) => m.startTick + Math.max(1, m.durationTicks)),
    note.startTick + Math.max(1, note.durationTicks),
  )
  const phraseRole =
    noteIdx >= 0 ? phraseRoleAtMelodyIndex(melodySorted, noteIdx, songEnd) : undefined

  const resolved = resolveSuggestHomeRoot({
    note,
    pillars: project.pillars,
    soft: opts.softContext,
    tonality: project.tonality,
    mode: project.tonalityMode ?? 'major',
    nextMelodyMidi: nextMel?.midi ?? null,
    prevMelodyMidi: prevMel?.midi ?? null,
    prevRootPc: prev?.rootPc ?? null,
    prevNatureId: prev?.natureId ?? null,
    melodyRole: note.role === 'pmn' || note.role === 'smn' ? note.role : null,
  })
  if (!resolved) return []

  const { pillar } = resolved
  const nextPillar = [...project.pillars]
    .filter((x) => x.startTick > pillar.startTick)
    .sort((a, b) => a.startTick - b.startTick)[0]
  const ranked = candidatesForMelodyNote({
    note,
    pillar,
    tonality: project.tonality,
    mode: project.tonalityMode ?? 'major',
    prevRootPc: prev?.rootPc ?? null,
    prevNatureId: prev?.natureId ?? null,
    preferScf: opts.preferScf,
    limit: opts.limit ?? 16,
    profile: project.contestProfile,
    nextPillarRoot: nextPillar?.rootPc ?? null,
    prevMidi: prev?.midi ?? null,
    rankerDeps: deps.rankerDeps,
    nextMelodyMidi: nextMel?.midi ?? null,
    prevMelodyMidi: prevMel?.midi ?? null,
    phraseRole,
  })
  // Prefer Sketch/Detected quality when soft map names it (Fill empties + Choose).
  const softNature = softNatureAtTick(opts.softContext, note.startTick)
  if (!softNature?.natureId) return ranked
  const match = ranked.find(
    (c) => c.rootPc === softNature.rootPc && c.natureId === softNature.natureId,
  )
  if (!match || ranked[0] === match) return ranked
  return [match, ...ranked.filter((c) => c !== match)]
}

function softNatureAtTick(
  soft: SoftSuggestContext | null | undefined,
  tick: number,
): { rootPc: number; natureId?: string } | null {
  if (!soft) return null
  const covers = (s: { startTick: number; endTick: number }) =>
    s.startTick <= tick && tick < s.endTick
  const locked = (soft.sketchSpans ?? []).find((s) => s.locked === true && covers(s))
  if (locked) return { rootPc: locked.rootPc, natureId: locked.natureId }
  const det = (soft.detectedSpans ?? []).find((s) => covers(s))
  if (det) return { rootPc: det.rootPc, natureId: det.natureId }
  const sketch = (soft.sketchSpans ?? []).find((s) => covers(s))
  if (sketch) return { rootPc: sketch.rootPc, natureId: sketch.natureId }
  return null
}

export function applyCandidateToProject(
  project: ArrangementProject,
  note: MelodyEvent,
  candidate: HarmonizeCandidate,
  deps: AutoHarmonizeDeps = {},
): ArrangementProject {
  // Same succession rule as ranking: home continues until the next pillar starts.
  const pillar = pillarAtTick(project.pillars, note.startTick)
  const stack = candidateToStack(note, candidate, pillar?.id ?? null, deps.idGen)
  const stacks = project.stacks
    .filter((s) => s.startTick !== note.startTick)
    .concat(stack)
    .sort((a, b) => a.startTick - b.startTick)
  return { ...project, stacks }
}
