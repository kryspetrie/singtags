/**
 * Pure helpers for piano-roll tuplet containers.
 * Binary snap stays global; containers own irregular member subdivisions.
 */
import { allocatePrefixedId } from './ids'
import type { TagRollNote, TagRollTuplet } from './types'

const TOL = 1

export type TupletRatio = {
  actualNotes: number
  normalNotes: number
}

export const TUPLET_PRESETS = {
  triplet: { actualNotes: 3, normalNotes: 2 } satisfies TupletRatio,
  sextuplet: { actualNotes: 6, normalNotes: 4 } satisfies TupletRatio,
  quintuplet: { actualNotes: 5, normalNotes: 4 } satisfies TupletRatio,
} as const

export function newTupletId(): string {
  return allocatePrefixedId('tup')
}

export function tupletEndTick(t: Pick<TagRollTuplet, 'startTick' | 'spanTicks'>): number {
  return t.startTick + t.spanTicks
}

/** True when two half-open [start, end) ranges on the same part overlap. */
export function tupletRangesOverlap(
  a: Pick<TagRollTuplet, 'startTick' | 'spanTicks'>,
  b: Pick<TagRollTuplet, 'startTick' | 'spanTicks'>,
): boolean {
  const a0 = a.startTick
  const a1 = tupletEndTick(a)
  const b0 = b.startTick
  const b1 = tupletEndTick(b)
  return a0 < b1 && b0 < a1
}

export function assertNoTupletOverlap(
  existing: readonly TagRollTuplet[],
  candidate: Pick<TagRollTuplet, 'partId' | 'startTick' | 'spanTicks'>,
  opts?: { ignoreId?: string },
): boolean {
  for (const t of existing) {
    if (opts?.ignoreId && t.id === opts.ignoreId) continue
    if (t.partId !== candidate.partId) continue
    if (tupletRangesOverlap(t, candidate)) return false
  }
  return true
}

/**
 * Equal-length member start ticks + durations that fill `spanTicks`.
 * Remainders go to the last slice so the sum is exact.
 */
export function memberTicksForTuplet(
  startTick: number,
  spanTicks: number,
  actualNotes: number,
): { startTick: number; durationTicks: number }[] {
  const n = Math.max(1, Math.round(actualNotes))
  const span = Math.max(1, Math.round(spanTicks))
  const base = Math.floor(span / n)
  let used = 0
  const out: { startTick: number; durationTicks: number }[] = []
  for (let i = 0; i < n; i++) {
    const dur = i === n - 1 ? span - used : base
    out.push({ startTick: startTick + used, durationTicks: Math.max(1, dur) })
    used += out[i]!.durationTicks
  }
  return out
}

export function createTupletContainer(input: {
  partId: string
  startTick: number
  spanTicks: number
  actualNotes?: number
  normalNotes?: number
  id?: string
}): TagRollTuplet {
  const actualNotes = Math.max(2, Math.round(input.actualNotes ?? 3))
  const normalNotes = Math.max(1, Math.round(input.normalNotes ?? 2))
  return {
    id: input.id?.trim() || newTupletId(),
    partId: input.partId,
    startTick: Math.max(0, Math.round(input.startTick)),
    spanTicks: Math.max(1, Math.round(input.spanTicks)),
    actualNotes,
    normalNotes,
  }
}

/** Notes that belong to a container (by groupId). */
export function notesForTuplet(
  notes: readonly TagRollNote[],
  tupletId: string,
): TagRollNote[] {
  return notes.filter((n) => n.tuplet?.groupId === tupletId)
}

/** Stamp every note that claims this group with the container ratio. */
export function syncMemberTupletTags(
  notes: readonly TagRollNote[],
  tuplet: Pick<TagRollTuplet, 'id' | 'actualNotes' | 'normalNotes'>,
): TagRollNote[] {
  return notes.map((n) => {
    if (n.tuplet?.groupId !== tuplet.id) return n
    return {
      ...n,
      tuplet: {
        groupId: tuplet.id,
        actualNotes: tuplet.actualNotes,
        normalNotes: tuplet.normalNotes,
      },
    }
  })
}

/**
 * Remove a container and optionally its member notes.
 * When `removeMembers` is false, strip `tuplet` tags from former members.
 */
export function deleteTupletContainer(
  tuplets: readonly TagRollTuplet[],
  notes: readonly TagRollNote[],
  tupletId: string,
  opts?: { removeMembers?: boolean },
): { tuplets: TagRollTuplet[]; notes: TagRollNote[] } {
  const removeMembers = opts?.removeMembers !== false
  const nextTuplets = tuplets.filter((t) => t.id !== tupletId)
  const nextNotes = removeMembers
    ? notes.filter((n) => n.tuplet?.groupId !== tupletId)
    : notes.map((n) => {
        if (n.tuplet?.groupId !== tupletId) return n
        const { tuplet: _drop, ...rest } = n
        return rest
      })
  return { tuplets: nextTuplets, notes: nextNotes }
}

/**
 * Build missing containers from note.tuplet groups (legacy / import).
 * Existing containers win; orphan groups synthesize a span covering members.
 */
export function migrateTupletsFromNotes(
  notes: readonly TagRollNote[],
  existing: readonly TagRollTuplet[],
): TagRollTuplet[] {
  const byId = new Map(existing.map((t) => [t.id, t]))
  const groups = new Map<
    string,
    { partId: string; actualNotes: number; normalNotes: number; starts: number[]; ends: number[] }
  >()

  for (const n of notes) {
    const t = n.tuplet
    if (!t) continue
    if (byId.has(t.groupId)) continue
    let g = groups.get(t.groupId)
    if (!g) {
      g = {
        partId: n.partId,
        actualNotes: t.actualNotes,
        normalNotes: t.normalNotes,
        starts: [],
        ends: [],
      }
      groups.set(t.groupId, g)
    }
    // Prefer first part seen; mixed-part groups stay on that part.
    g.starts.push(n.startTick)
    g.ends.push(n.startTick + n.durationTicks)
    g.actualNotes = t.actualNotes
    g.normalNotes = t.normalNotes
  }

  const synthesized: TagRollTuplet[] = []
  for (const [id, g] of groups) {
    const startTick = Math.min(...g.starts)
    const endTick = Math.max(...g.ends)
    synthesized.push(
      createTupletContainer({
        id,
        partId: g.partId,
        startTick,
        spanTicks: Math.max(1, endTick - startTick),
        actualNotes: g.actualNotes,
        normalNotes: g.normalNotes,
      }),
    )
  }

  return [...existing, ...synthesized]
}

/** Drop containers that overlap on the same part (keep earlier by startTick, then id). */
export function repairOverlappingTuplets(tuplets: readonly TagRollTuplet[]): TagRollTuplet[] {
  const sorted = [...tuplets].sort((a, b) => {
    if (a.partId !== b.partId) return a.partId.localeCompare(b.partId)
    if (a.startTick !== b.startTick) return a.startTick - b.startTick
    return a.id.localeCompare(b.id)
  })
  const kept: TagRollTuplet[] = []
  for (const t of sorted) {
    if (assertNoTupletOverlap(kept, t)) kept.push(t)
  }
  return kept
}

/** Clamp member notes that extend past the container span (test / repair aid). */
export function clampMembersToTupletSpan(
  notes: readonly TagRollNote[],
  tuplet: TagRollTuplet,
): TagRollNote[] {
  const end = tupletEndTick(tuplet)
  return notes.map((n) => {
    if (n.tuplet?.groupId !== tuplet.id) return n
    if (n.partId !== tuplet.partId) return n
    const start = Math.max(tuplet.startTick, Math.min(n.startTick, end - 1))
    const noteEnd = Math.min(end, Math.max(start + 1, n.startTick + n.durationTicks))
    const durationTicks = Math.max(1, noteEnd - start)
    if (start === n.startTick && durationTicks === n.durationTicks) return n
    return { ...n, startTick: start, durationTicks }
  })
}

export function nearTick(a: number, b: number, tol = TOL): boolean {
  return Math.abs(a - b) <= tol
}

/** True when a note is a member of the given container (by groupId). */
export function noteBelongsToTuplet(
  note: Pick<TagRollNote, 'tuplet'>,
  tupletId: string,
): boolean {
  return note.tuplet?.groupId === tupletId
}

/** True when a note is tagged as any tuplet member. */
export function isTupletMemberNote(note: Pick<TagRollNote, 'tuplet'>): boolean {
  return !!note.tuplet?.groupId
}
