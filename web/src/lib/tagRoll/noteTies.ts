/**
 * User-authored ties between adjacent same-pitch notes on one part.
 * Two (or more) roll notes stay separate; playback treats a chain as one sound.
 */
import type { TagRollNote } from './types'

/** Max gap (ticks) between A’s end and B’s start to count as “adjacent.” */
export const TIE_ADJACENCY_TOL = 2

export type TiePairValidity =
  | { ok: true; earlier: TagRollNote; later: TagRollNote }
  | { ok: false; reason: string }

export function noteEndTick(n: Pick<TagRollNote, 'startTick' | 'durationTicks'>): number {
  return n.startTick + n.durationTicks
}

/** True when B starts at (or within tol of) A’s release. */
export function notesAreAdjacentForTie(
  a: Pick<TagRollNote, 'startTick' | 'durationTicks'>,
  b: Pick<TagRollNote, 'startTick'>,
  tol = TIE_ADJACENCY_TOL,
): boolean {
  const gap = b.startTick - noteEndTick(a)
  return gap >= -tol && gap <= tol
}

export function canTieNotes(a: TagRollNote, b: TagRollNote): TiePairValidity {
  if (a.id === b.id) return { ok: false, reason: 'Select two different notes' }
  if (a.partId !== b.partId) return { ok: false, reason: 'Notes must be on the same part' }
  if (a.midi !== b.midi) return { ok: false, reason: 'Tied notes must be the same pitch' }
  const earlier = a.startTick <= b.startTick ? a : b
  const later = earlier === a ? b : a
  if (later.startTick < noteEndTick(earlier) - TIE_ADJACENCY_TOL) {
    return { ok: false, reason: 'Notes overlap; ties need adjacent notes' }
  }
  if (!notesAreAdjacentForTie(earlier, later)) {
    return { ok: false, reason: 'Notes must be next to each other' }
  }
  return { ok: true, earlier, later }
}

export function notesAreTied(a: TagRollNote, b: TagRollNote): boolean {
  return a.tie?.toNoteId === b.id || b.tie?.toNoteId === a.id
}

/** Validate a two-note selection for the Tie / Untie chrome. */
export function tieSelectionState(
  notes: readonly TagRollNote[],
  selectedIds: readonly string[],
): {
  canTie: boolean
  canUntie: boolean
  earlier: TagRollNote | null
  later: TagRollNote | null
  reason: string
} {
  if (selectedIds.length !== 2) {
    return {
      canTie: false,
      canUntie: false,
      earlier: null,
      later: null,
      reason: 'Select exactly two notes',
    }
  }
  const a = notes.find((n) => n.id === selectedIds[0])
  const b = notes.find((n) => n.id === selectedIds[1])
  if (!a || !b) {
    return {
      canTie: false,
      canUntie: false,
      earlier: null,
      later: null,
      reason: 'Selection incomplete',
    }
  }
  const v = canTieNotes(a, b)
  if (!v.ok) {
    return {
      canTie: false,
      canUntie: false,
      earlier: null,
      later: null,
      reason: v.reason,
    }
  }
  const tied = notesAreTied(v.earlier, v.later)
  return {
    canTie: !tied,
    canUntie: tied,
    earlier: v.earlier,
    later: v.later,
    reason: tied ? 'Already tied' : '',
  }
}

/** Drop dangling / invalid tie targets; keep only legal adjacent same-pitch links. */
export function sanitizeNoteTies(notes: readonly TagRollNote[]): TagRollNote[] {
  const byId = new Map(notes.map((n) => [n.id, n]))
  return notes.map((n) => {
    const toId = n.tie?.toNoteId
    if (!toId) {
      if (n.tie) {
        const { tie: _drop, ...rest } = n
        return rest
      }
      return n
    }
    const target = byId.get(toId)
    if (!target) {
      const { tie: _drop, ...rest } = n
      return rest
    }
    const v = canTieNotes(n, target)
    if (!v.ok || v.earlier.id !== n.id || v.later.id !== target.id) {
      const { tie: _drop, ...rest } = n
      return rest
    }
    return n
  })
}

/** Clear ties that reference any of `removeIds` (inbound or outbound). */
export function clearTiesInvolving(
  notes: readonly TagRollNote[],
  removeIds: ReadonlySet<string>,
): TagRollNote[] {
  return notes.map((n) => {
    if (removeIds.has(n.id) && n.tie) {
      const { tie: _drop, ...rest } = n
      return rest
    }
    if (n.tie && removeIds.has(n.tie.toNoteId)) {
      const { tie: _drop, ...rest } = n
      return rest
    }
    return n
  })
}

export function tieNotesInList(
  notes: readonly TagRollNote[],
  aId: string,
  bId: string,
): TagRollNote[] | null {
  const a = notes.find((n) => n.id === aId)
  const b = notes.find((n) => n.id === bId)
  if (!a || !b) return null
  const v = canTieNotes(a, b)
  if (!v.ok) return null
  return notes.map((n) => {
    if (n.id === v.earlier.id) return { ...n, tie: { toNoteId: v.later.id } }
    // Break any other note that pointed at later or from earlier conflicts
    if (n.id === v.later.id && n.tie) {
      const { tie: _drop, ...rest } = n
      return rest
    }
    if (n.tie?.toNoteId === v.later.id && n.id !== v.earlier.id) {
      const { tie: _drop, ...rest } = n
      return rest
    }
    return n
  })
}

export function untieNotesInList(
  notes: readonly TagRollNote[],
  aId: string,
  bId: string,
): TagRollNote[] {
  return notes.map((n) => {
    if (
      (n.id === aId && n.tie?.toNoteId === bId) ||
      (n.id === bId && n.tie?.toNoteId === aId)
    ) {
      const { tie: _drop, ...rest } = n
      return rest
    }
    return n
  })
}

export function isTieContinuation(
  notes: readonly TagRollNote[],
  noteId: string,
): boolean {
  return notes.some((n) => n.tie?.toNoteId === noteId)
}

/** Sounding end tick of a note including its outbound tie chain. */
export function tieChainEndTick(
  notes: readonly TagRollNote[],
  start: TagRollNote,
): number {
  const byId = new Map(notes.map((n) => [n.id, n]))
  let cur: TagRollNote | undefined = start
  let end = noteEndTick(start)
  const seen = new Set<string>()
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id)
    end = Math.max(end, noteEndTick(cur))
    const nextId: string | undefined = cur.tie?.toNoteId
    cur = nextId ? byId.get(nextId) : undefined
  }
  return end
}

/** Ids in the outbound chain starting at `start` (inclusive). */
export function tieChainIds(
  notes: readonly TagRollNote[],
  start: TagRollNote,
): string[] {
  const byId = new Map(notes.map((n) => [n.id, n]))
  const out: string[] = []
  let cur: TagRollNote | undefined = start
  const seen = new Set<string>()
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id)
    out.push(cur.id)
    const nextId: string | undefined = cur.tie?.toNoteId
    cur = nextId ? byId.get(nextId) : undefined
  }
  return out
}

/** Resolved A→B pairs for roll chrome. */
export function listAuthoredTieLinks(
  notes: readonly TagRollNote[],
): { from: TagRollNote; to: TagRollNote }[] {
  const byId = new Map(notes.map((n) => [n.id, n]))
  const out: { from: TagRollNote; to: TagRollNote }[] = []
  for (const n of notes) {
    const toId = n.tie?.toNoteId
    if (!toId) continue
    const to = byId.get(toId)
    if (!to) continue
    const v = canTieNotes(n, to)
    if (!v.ok || v.earlier.id !== n.id) continue
    out.push({ from: n, to })
  }
  return out
}
