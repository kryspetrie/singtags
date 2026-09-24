/**
 * Preserve coach session fields when re-importing from a live Tag Studio roll.
 * Locked harmony sketch on the roll is authoritative for pillars when present.
 */
import type { ArrangementProject, Pillar } from '../../domain/arranging/types'
import { mergeMelodyRoles } from '../../domain/arranging/mergeMelodyRoles'
import { mergeStacksFromRollImport } from '../../domain/arranging/mergeStacksFromRoll'
import {
  authoritativeSketch,
  pillarsFromHarmonySketch,
  replaceSketchFromPillars,
} from '../../lib/tagRoll/harmonySketch'
import type { HarmonySketchSpan } from '../../lib/tagRoll/types'

export type MergeCoachSessionOpts = {
  /** Locked sketch from the live Tag Studio project (authoritative when non-empty). */
  harmonySketch?: readonly HarmonySketchSpan[]
  nextId?: (prefix: string) => string
}

/**
 * Merge an existing coach session onto a fresh import from Tag Studio.
 * When locked sketch spans exist, pillars are re-seeded from sketch (ids preserved when possible).
 * When sketch is empty but existing pillars exist, pillars are kept (caller should migrate → sketch).
 */
export function mergeCoachSessionFromExisting(
  fresh: ArrangementProject,
  existing: ArrangementProject,
  opts?: MergeCoachSessionOpts,
): ArrangementProject {
  const sketch = opts?.harmonySketch ?? []
  const locked = authoritativeSketch(sketch)
  const nextId =
    opts?.nextId ?? ((prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 8)}`)

  if (locked.length) {
    const seeded = pillarsFromHarmonySketch(locked, nextId)
    fresh.pillars = seeded.map((p) => {
      const hit =
        existing.pillars.find((e) => e.startTick === p.startTick && e.endTick === p.endTick) ??
        existing.pillars.find(
          (e) => e.startTick < p.endTick && p.startTick < e.endTick && e.rootPc === p.rootPc,
        )
      return {
        id: hit?.id ?? p.id,
        rootPc: p.rootPc,
        startTick: p.startTick,
        endTick: p.endTick,
        source: p.source,
        confirmed: p.confirmed,
      } satisfies Pillar
    })
  } else if (existing.pillars.length) {
    fresh.pillars = existing.pillars
  }
  // else keep fresh.pillars (usually empty)

  fresh.wizardStep = existing.wizardStep
  fresh.contestProfile = existing.contestProfile
  fresh.tuningMode = existing.tuningMode
  fresh.qaConfig = existing.qaConfig
  fresh.melody = mergeMelodyRoles(fresh.melody, existing.melody)
  fresh.stacks = mergeStacksFromRollImport(fresh.stacks, existing.stacks)
  return fresh
}

/** One-shot: empty sketch ← **confirmed** pillars only (migration before sketch becomes source of truth).
 * Never promotes unconfirmed Propose/Draft pillars into Declared.
 */
export function migratePillarsToSketchIfEmpty(
  sketch: readonly HarmonySketchSpan[],
  pillars: readonly Pillar[],
): HarmonySketchSpan[] {
  if (authoritativeSketch(sketch).length) return [...sketch]
  const confirmed = pillars.filter((p) => p.confirmed)
  if (!confirmed.length) return [...sketch]
  return replaceSketchFromPillars(sketch, confirmed)
}
