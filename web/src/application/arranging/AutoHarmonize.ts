import {
  autoHarmonizeMelody,
  candidatesForMelodyNote,
  candidateToStack,
  type HarmonizeCandidate,
  type RankerDeps,
} from '../../domain/arranging/harmonize'
import { phraseRoleAtMelodyIndex } from '../../domain/arranging/cadences'
import {
  natureAllowlistForRisk,
  rankerDepsForWeights,
} from '../../domain/arranging/pathOptimize/candidates'
import { leapsWithinCaps, partJumpCost } from '../../domain/arranging/pathOptimize/partLeaps'
import {
  weightsFromRisk,
  type PathOptimizeWeights,
} from '../../domain/arranging/pathOptimize/types'
import { pillarAtTick } from '../../domain/arranging/pillars'
import { degreeOf } from '../../domain/arranging/secondaryDominant'
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
  /**
   * Basic→Risky + cadence from Path Optimize. When omitted, uses Basic-leaning
   * defaults so Coach Suggest matches the Optimize taste panel.
   */
  pathWeights?: Partial<PathOptimizeWeights>
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
  const priorStacks = [...project.stacks]
    .filter((s) => s.startTick < note.startTick)
    .sort((a, b) => b.startTick - a.startTick)
  const prev = priorStacks[0]
  const prevPrev = priorStacks[1]
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
  const nextPillarRoot = nextPillar?.rootPc ?? null
  const weights = weightsFromRisk(opts.pathWeights?.risk ?? 0.2, opts.pathWeights)
  const risk = weights.risk
  // Sec-dom of pillar (= key V7 when pillar is I) must stay available at Basic.
  const allowPassing = true
  const allowScf = risk > 0.5 && !!opts.preferScf
  const allowSpread = risk > 0.4
  let ranked = candidatesForMelodyNote({
    note,
    pillar,
    tonality: project.tonality,
    mode: project.tonalityMode ?? 'major',
    prevRootPc: prev?.rootPc ?? null,
    prevNatureId: prev?.natureId ?? null,
    preferScf: allowScf,
    allowPassing,
    allowScf,
    allowSpread,
    natureAllowlist: natureAllowlistForRisk(risk),
    limit: opts.limit ?? 16,
    profile: project.contestProfile,
    nextPillarRoot,
    prevMidi: prev?.midi ?? null,
    prevPrevMidi: prevPrev?.midi ?? null,
    rankerDeps: rankerDepsForWeights(weights, deps.rankerDeps),
    nextMelodyMidi: nextMel?.midi ?? null,
    prevMelodyMidi: prevMel?.midi ?? null,
    phraseRole,
  })
  // Hard leap filter (same caps as Path Optimize) so Basic Fill doesn’t thrash register.
  if (prev?.midi) {
    const safe = ranked.filter((c) => leapsWithinCaps(prev.midi, c.midi, risk))
    if (safe.length) {
      ranked = [...safe].sort(
        (a, b) => partJumpCost(prev.midi!, a.midi) - partJumpCost(prev.midi!, b.midi),
      )
    } else if (risk <= 0.35) {
      const loosened = ranked.filter((c) =>
        leapsWithinCaps(prev.midi, c.midi, Math.min(1, risk + 0.35), null, true),
      )
      ranked = loosened.length
        ? [...loosened].sort(
            (a, b) => partJumpCost(prev.midi!, a.midi) - partJumpCost(prev.midi!, b.midi),
          )
        : ranked
            .filter((c) => {
              const t = Math.abs(c.midi.tenor - prev.midi!.tenor)
              const b = Math.abs(c.midi.bass - prev.midi!.bass)
              return t <= 12 && (b === 12 || b <= 12)
            })
            .sort(
              (a, b) => partJumpCost(prev.midi!, a.midi) - partJumpCost(prev.midi!, b.midi),
            )
    }
  }
  // Prefer Sketch/Detected quality when soft map names it (Fill empties + Choose).
  // Never soft-promote a non-tonic onto a true song/phrase final.
  const softNature = softNatureAtTick(opts.softContext, note.startTick)
  if (!softNature?.natureId) return ranked
  const trueFinal =
    (phraseRole === 'cadence' || phraseRole === 'tag') &&
    nextMel == null &&
    nextPillarRoot == null
  if (trueFinal && degreeOf(softNature.rootPc, project.tonality) !== 0) {
    return ranked
  }
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
