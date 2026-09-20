/**
 * Pure helpers for barbershop harmonizer note upsert.
 *
 * Places the chord on the melody note under the cursor (same start + duration).
 * Existing notes on other parts are moved into that stack; notes spanning the
 * insert tick are broken (left stump truncated, new stack note inserted).
 */
import type { IdGenerator } from '../../../ports/IdGenerator'
import type { TagRollNote, TagRollPart } from '../types'

export type HarmonyPitches = {
  tenor: number
  bari: number
  bass: number
  lead: number
}

function applyHarmonyForPart(
  partNotes: readonly TagRollNote[],
  partId: string,
  midi: number,
  insertTick: number,
  durationTicks: number,
  idGen: IdGenerator,
): TagRollNote[] {
  const dur = Math.max(1, durationTicks)
  const endTick = insertTick + dur
  const sorted = partNotes
    .map((n) => ({ ...n }))
    .sort((a, b) => a.startTick - b.startTick || a.midi - b.midi || a.id.localeCompare(b.id))

  const out: TagRollNote[] = []
  let moved: TagRollNote | null = null

  for (const n of sorted) {
    const nEnd = n.startTick + n.durationTicks

    // Entirely before the insert point.
    if (nEnd <= insertTick) {
      out.push(n)
      continue
    }

    // Entirely at or after the harmony window.
    if (n.startTick >= endTick) {
      out.push(n)
      continue
    }

    // Spans the insert tick from the left → truncate, optional right remnant.
    if (n.startTick < insertTick) {
      const leftDur = insertTick - n.startTick
      if (leftDur > 0) {
        out.push({ ...n, durationTicks: leftDur })
      }
      if (nEnd > endTick) {
        out.push({
          id: idGen.next('trn'),
          partId,
          midi: n.midi,
          startTick: endTick,
          durationTicks: nEnd - endTick,
        })
      }
      continue
    }

    // Starts inside the harmony window → move into the stack (first wins).
    if (!moved) {
      moved = {
        ...n,
        startTick: insertTick,
        durationTicks: dur,
        midi,
      }
      if (nEnd > endTick) {
        out.push({
          id: idGen.next('trn'),
          partId,
          midi: n.midi,
          startTick: endTick,
          durationTicks: nEnd - endTick,
        })
      }
    } else if (nEnd > endTick) {
      // Extra notes in the window are absorbed; keep only a post-window remnant.
      out.push({
        id: idGen.next('trn'),
        partId,
        midi: n.midi,
        startTick: endTick,
        durationTicks: nEnd - endTick,
      })
    }
  }

  if (moved) {
    out.push(moved)
  } else {
    out.push({
      id: idGen.next('trn'),
      partId,
      midi,
      startTick: insertTick,
      durationTicks: dur,
    })
  }

  return out.sort(
    (a, b) => a.startTick - b.startTick || a.midi - b.midi || a.id.localeCompare(b.id),
  )
}

/**
 * Upsert harmony for every non-melody part at the melody note's time span.
 * Existing notes are moved into the stack; notes spanning the insert tick are broken.
 */
export function applyHarmonyToNotes(opts: {
  notes: readonly TagRollNote[]
  parts: readonly TagRollPart[]
  melody: TagRollNote
  pitches: HarmonyPitches
  /** Insert tick (defaults to melody start — the stack under the cursor). */
  cursorTick?: number
  /** Required for new remnant / stack note ids (no offline imports). */
  idGen: IdGenerator
}): TagRollNote[] {
  const { melody, pitches, idGen } = opts
  const melodyPartId = melody.partId
  const insertTick = Math.max(0, opts.cursorTick ?? melody.startTick)
  const durationTicks = melody.durationTicks
  const roleMidi: Record<string, number> = {
    Tenor: pitches.tenor,
    Lead: pitches.lead,
    Bari: pitches.bari,
    Bass: pitches.bass,
  }

  const otherParts = opts.parts.filter((x) => x.id !== melodyPartId)
  const namedTargets: { partId: string; midi: number }[] = []
  for (const part of otherParts) {
    if (part.name in roleMidi && part.name !== 'Lead') {
      namedTargets.push({ partId: part.id, midi: roleMidi[part.name]! })
    }
  }

  let targets = namedTargets
  if (targets.length < otherParts.length) {
    const filled = new Set(targets.map((t) => t.partId))
    const remaining = otherParts.filter((x) => !filled.has(x.id))
    const stack = [pitches.bass, pitches.bari, pitches.tenor].filter((m) => m !== pitches.lead)
    const pool =
      stack.length >= remaining.length
        ? stack
        : [pitches.bass, pitches.bari, pitches.tenor]
    remaining.forEach((part, i) => {
      targets.push({ partId: part.id, midi: pool[i % pool.length]! })
    })
  }

  const byPart = new Map<string, number>()
  for (const t of targets) byPart.set(t.partId, t.midi)
  targets = [...byPart.entries()].map(([partId, midi]) => ({ partId, midi }))

  const targetIds = new Set(targets.map((t) => t.partId))
  let notes = opts.notes.filter((n) => !targetIds.has(n.partId))

  for (const t of targets) {
    const partNotes = opts.notes.filter((n) => n.partId === t.partId)
    notes = [
      ...notes,
      ...applyHarmonyForPart(partNotes, t.partId, t.midi, insertTick, durationTicks, idGen),
    ]
  }
  return notes
}
