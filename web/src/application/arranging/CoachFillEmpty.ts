/**
 * Fill empty Coach moments with the top ranked candidate (pure plan + pick helpers).
 */
import {
  listCandidatesForNote,
  type SoftSuggestContext,
} from './AutoHarmonize'
import type { HarmonizeCandidate } from '../../domain/arranging/harmonize'
import type { RankerDeps } from '../../domain/arranging/harmonize'
import {
  momentToMelodyEvent,
  type HarmonicMoment,
} from '../../domain/arranging/harmonicMoments'
import type { ArrangementProject, MelodyEvent } from '../../domain/arranging/types'
import type { IdGenerator } from '../../ports/IdGenerator'

/** Soft root/quality at a tick — locked Sketch, else Detected, else unlocked Sketch. */
export function softChordAtTick(
  soft: SoftSuggestContext,
  tick: number,
): { rootPc: number; natureId?: string } | null {
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

export function pickFillCandidate(
  cands: readonly HarmonizeCandidate[],
  soft: { rootPc: number; natureId?: string } | null,
): HarmonizeCandidate | null {
  if (!cands.length) return null
  if (soft) {
    if (soft.natureId) {
      const exact = cands.find(
        (c) => c.rootPc === soft.rootPc && c.natureId === soft.natureId,
      )
      if (exact) return exact
    }
    const byRoot = cands.find((c) => c.rootPc === soft.rootPc)
    if (byRoot) return byRoot
  }
  return cands[0] ?? null
}

export type FillEmptyApply = {
  note: MelodyEvent
  candidate: HarmonizeCandidate
}

/**
 * Build Apply ops for Lead onsets that still lack a real stack.
 * Held posts are skipped (they follow Sketch/Detected spans).
 */
export function planFillEmptyWithBest(opts: {
  project: ArrangementProject
  moments: readonly HarmonicMoment[]
  soft: SoftSuggestContext | null
  rankerDeps: RankerDeps
  idGen: IdGenerator
  limit?: number
}): FillEmptyApply[] {
  const out: FillEmptyApply[] = []
  const limit = opts.limit ?? 16
  for (const m of opts.moments) {
    if (m.heldLead) continue
    if (opts.project.stacks.some((s) => s.startTick === m.startTick && s.natureId !== 'unknown')) {
      continue
    }
    const note = momentToMelodyEvent(m)
    const cands = listCandidatesForNote(
      opts.project,
      note,
      { softContext: opts.soft, limit },
      { rankerDeps: opts.rankerDeps, idGen: opts.idGen },
    )
    const softChord = opts.soft ? softChordAtTick(opts.soft, m.startTick) : null
    const top = pickFillCandidate(cands, softChord)
    if (!top) continue
    out.push({ note, candidate: top })
  }
  return out
}
