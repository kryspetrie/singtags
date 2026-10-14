/**
 * Plan Apply ops that realize passing / same-root-color stacks under Sketch NCTs.
 * Sketch spans are never mutated.
 */
import {
  proposePassingUnderSketch,
  sketchContainsLead,
  type PassingListCandidates,
  type PassingMismatch,
  type PassingProposal,
  type PassingSketchSpan,
} from '../../domain/arranging/passingUnderSketch'
import {
  candidateToStack,
  candidatesForMelodyNote,
  type HarmonizeCandidate,
  type RankerDeps,
} from '../../domain/arranging/harmonize'
import type { ArrangementProject, MelodyEvent } from '../../domain/arranging/types'
import type { IdGenerator } from '../../ports/IdGenerator'
import type { SoftSuggestContext } from './suggestHomeRoot'

function listCandidatesWithRanker(rankerDeps?: RankerDeps): PassingListCandidates {
  return (opts) =>
    candidatesForMelodyNote({
      ...opts,
      rankerDeps,
    })
}

export type ResolvePassingApply = {
  note: MelodyEvent
  candidate: HarmonizeCandidate
  mismatch: PassingMismatch
}

export type TagRollPassingApply = {
  melodyNoteId: string
  pitches: { tenor: number; bari: number; bass: number; lead: number }
  rootPc: number
  natureId: string
  kind: PassingProposal['kind']
  layer: PassingProposal['layer']
  mismatch: PassingMismatch
}

export function proposalToCandidate(p: PassingProposal): HarmonizeCandidate {
  return {
    rootPc: p.rootPc,
    natureId: p.natureId,
    voicing: p.voicing,
    spread: p.spread,
    layer: p.layer,
    scfGroup: p.scfGroup,
    midi: p.midi,
    score: p.score,
    ruleTags: [],
    label: p.label,
  }
}

/** Locked Sketch spans from soft context (authoritative homes). */
export function lockedSketchSpansFromSoft(
  soft: SoftSuggestContext | null | undefined,
): PassingSketchSpan[] {
  const spans = soft?.sketchSpans ?? []
  return spans
    .filter((s) => s.locked === true && s.natureId)
    .map((s, i) => ({
      id: `soft-sketch-${i}-${s.startTick}`,
      startTick: s.startTick,
      endTick: s.endTick,
      rootPc: s.rootPc,
      natureId: s.natureId!,
    }))
}

export function sketchSpansFromTagRoll(
  sketch: readonly {
    id: string
    startTick: number
    endTick: number
    rootPc: number
    quality: string
    locked?: boolean
  }[],
  /** When true (default), only locked spans. */
  lockedOnly = true,
): PassingSketchSpan[] {
  return sketch
    .filter((s) => (lockedOnly ? s.locked === true : true))
    .map((s) => ({
      id: s.id,
      startTick: s.startTick,
      endTick: s.endTick,
      rootPc: s.rootPc,
      natureId: s.quality,
    }))
}

/** Prefer locked; if none, use all soft sketch spans with a nature. */
function sketchForScan(soft: SoftSuggestContext | null | undefined): PassingSketchSpan[] {
  const locked = lockedSketchSpansFromSoft(soft)
  if (locked.length) return locked
  return (soft?.sketchSpans ?? [])
    .filter((s) => s.natureId)
    .map((s, i) => ({
      id: `soft-sketch-${i}-${s.startTick}`,
      startTick: s.startTick,
      endTick: s.endTick,
      rootPc: s.rootPc,
      natureId: s.natureId!,
    }))
}

export function scanPassingUnderSketch(opts: {
  melody: readonly MelodyEvent[]
  soft: SoftSuggestContext | null
  tonality: number
  mode?: ArrangementProject['tonalityMode']
  profile?: ArrangementProject['contestProfile']
  rankerDeps?: RankerDeps
}): PassingMismatch[] {
  const spans = sketchForScan(opts.soft)
  if (!spans.length || !opts.melody.length) return []
  return proposePassingUnderSketch({
    sketchSpans: spans,
    melody: opts.melody.map((m) => ({
      id: m.id,
      midi: m.midi,
      startTick: m.startTick,
      durationTicks: m.durationTicks,
      role: m.role,
    })),
    tonality: opts.tonality,
    mode: opts.mode ?? 'major',
    profile: opts.profile,
    listCandidates: listCandidatesWithRanker(opts.rankerDeps),
  })
}

/**
 * Lightweight NCT count for Coach CTA (no voicing generation).
 * Skips Lead onsets that already have a stack whose nature contains the Lead.
 */
export function countPassingUnderSoftSketch(opts: {
  melody: readonly MelodyEvent[]
  soft: SoftSuggestContext | null
  stacks?: ArrangementProject['stacks']
}): number {
  const spans = sketchForScan(opts.soft)
  if (!spans.length || !opts.melody.length) return 0
  const stacks = opts.stacks ?? []
  let n = 0
  for (const m of opts.melody) {
    const span = spans.find((s) => s.startTick <= m.startTick && m.startTick < s.endTick)
    if (!span) continue
    if (sketchContainsLead(span.natureId, span.rootPc, m.midi)) continue
    const existing = stacks.find(
      (s) => s.startTick === m.startTick && s.natureId !== 'unknown',
    )
    if (
      existing &&
      sketchContainsLead(existing.natureId, existing.rootPc, m.midi)
    ) {
      continue
    }
    n += 1
  }
  return n
}

/**
 * Arrangement Apply ops: write stacks for NCT Lead under Sketch.
 * Skips moments that already have a stack whose nature contains the Lead.
 */
export function planResolvePassingUnderSketch(opts: {
  project: ArrangementProject
  soft: SoftSuggestContext | null
  rankerDeps?: RankerDeps
  idGen: IdGenerator
  limit?: number
}): ResolvePassingApply[] {
  const mismatches = scanPassingUnderSketch({
    melody: opts.project.melody,
    soft: opts.soft,
    tonality: opts.project.tonality,
    mode: opts.project.tonalityMode,
    profile: opts.project.contestProfile,
    rankerDeps: opts.rankerDeps,
  })
  const out: ResolvePassingApply[] = []
  let working = opts.project
  const cap = opts.limit ?? 64
  for (const mismatch of mismatches) {
    if (out.length >= cap) break
    const note = working.melody.find((m) => m.id === mismatch.melodyNoteId)
    if (!note) continue
    const existing = working.stacks.find(
      (s) => s.startTick === note.startTick && s.natureId !== 'unknown',
    )
    if (
      existing &&
      sketchContainsLead(existing.natureId, existing.rootPc, note.midi)
    ) {
      continue
    }
    const candidate = proposalToCandidate(mismatch.proposal)
    out.push({ note, candidate, mismatch })
    const stack = candidateToStack(note, candidate, null, opts.idGen)
    working = {
      ...working,
      stacks: [
        ...working.stacks.filter((s) => s.startTick !== note.startTick),
        stack,
      ],
    }
  }
  return out
}

/**
 * Tag Roll Apply ops: upsert TTBB pitches at melody notes (Sketch unchanged).
 */
export function planTagRollPassingStacks(opts: {
  sketch: readonly {
    id: string
    startTick: number
    endTick: number
    rootPc: number
    quality: string
    locked?: boolean
  }[]
  melody: readonly {
    id: string
    midi: number
    startTick: number
    durationTicks: number
    role?: MelodyEvent['role'] | null
  }[]
  tonality: number
  mode?: ArrangementProject['tonalityMode']
  profile?: ArrangementProject['contestProfile']
  rankerDeps?: RankerDeps
  lockedOnly?: boolean
}): TagRollPassingApply[] {
  const spans = sketchSpansFromTagRoll(opts.sketch, opts.lockedOnly !== false)
  if (!spans.length) return []
  const mismatches = proposePassingUnderSketch({
    sketchSpans: spans,
    melody: opts.melody,
    tonality: opts.tonality,
    mode: opts.mode ?? 'major',
    profile: opts.profile,
    listCandidates: listCandidatesWithRanker(opts.rankerDeps),
  })
  return mismatches.map((mismatch) => ({
    melodyNoteId: mismatch.melodyNoteId,
    pitches: {
      tenor: mismatch.proposal.midi.tenor,
      bari: mismatch.proposal.midi.bari,
      bass: mismatch.proposal.midi.bass,
      lead: mismatch.proposal.midi.lead,
    },
    rootPc: mismatch.proposal.rootPc,
    natureId: mismatch.proposal.natureId,
    kind: mismatch.proposal.kind,
    layer: mismatch.proposal.layer,
    mismatch,
  }))
}
