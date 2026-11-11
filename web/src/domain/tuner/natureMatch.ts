/**
 * Live PC-set → nature/root match for Digital Tuner (kill-gate / Chord Glance).
 * Priority order from the plan; hysteresis helper for sticky nature+root.
 */

import { BARBERSHOP_CHORDS } from '../arranging/chords'

/** Auto-detect priority (plan Phase 4 / visual design). */
export const NATURE_AUTO_PRIORITY = [
  'seventh',
  'major',
  'minor',
  'sixth',
  'm7',
  'maj7',
] as const

export type NatureMatch = {
  natureId: string
  rootPc: number
  /** 0…1 — higher when PC set fills the nature tightly. */
  confidence: number
}

export type NatureHysteresisState = {
  natureId: string | null
  rootPc: number | null
  streak: number
  pendingNatureId: string | null
  pendingRootPc: number | null
  pendingStreak: number
  /** Consecutive frames with no PC match while sticky nature is held. */
  missStreak: number
}

function chordTonePcs(rootPc: number, natureId: string): number[] {
  const nature = BARBERSHOP_CHORDS.find((c) => c.id === natureId)
  if (!nature) return []
  return Object.values(nature.offsets).map((off) => (((rootPc + off) % 12) + 12) % 12)
}

/**
 * Infer best nature+root for a detected PC set.
 * Prefers complete fills of priority natures; falls back to any catalog nature.
 */
export function matchNatureFromPcs(pcs: readonly number[]): NatureMatch | null {
  const present = [...new Set(pcs.map((p) => ((p % 12) + 12) % 12))].sort((a, b) => a - b)
  if (!present.length) return null

  const candidates: NatureMatch[] = []
  const tryNature = (natureId: string) => {
    const nature = BARBERSHOP_CHORDS.find((c) => c.id === natureId)
    if (!nature) return
    for (const rootPc of present) {
      const tones = chordTonePcs(rootPc, natureId)
      if (!tones.length) continue
      if (!present.every((p) => tones.includes(p))) continue
      const fill = present.length / tones.length
      const conf = Math.min(1, fill) * (present.length === tones.length ? 1 : 0.85)
      candidates.push({ natureId, rootPc, confidence: conf })
    }
  }

  for (const id of NATURE_AUTO_PRIORITY) tryNature(id)
  if (!candidates.length) {
    for (const n of BARBERSHOP_CHORDS) {
      if ((NATURE_AUTO_PRIORITY as readonly string[]).includes(n.id)) continue
      tryNature(n.id)
    }
  }
  if (!candidates.length) return null
  candidates.sort((a, b) => b.confidence - a.confidence)
  const best = candidates[0]!
  const tied = candidates.filter((c) => Math.abs(c.confidence - best.confidence) < 1e-6)
  for (const id of NATURE_AUTO_PRIORITY) {
    const hit = tied.find((c) => c.natureId === id)
    if (hit) return hit
  }
  return best
}

export function createNatureHysteresis(): NatureHysteresisState {
  return {
    natureId: null,
    rootPc: null,
    streak: 0,
    pendingNatureId: null,
    pendingRootPc: null,
    pendingStreak: 0,
    missStreak: 0,
  }
}

/**
 * Sticky nature/root:
 * - Require `holdFrames` agreeing frames before first commit or switch.
 * - Keep sticky match across brief nulls until `missHoldFrames`.
 * Manual pin (when provided) always wins.
 */
export function applyNatureHysteresis(
  state: NatureHysteresisState,
  next: NatureMatch | null,
  opts?: {
    holdFrames?: number
    missHoldFrames?: number
    pinned?: { natureId: string; rootPc: number } | null
  },
): { state: NatureHysteresisState; match: NatureMatch | null } {
  const hold = opts?.holdFrames ?? 4
  const missHold = opts?.missHoldFrames ?? Math.max(hold, 10)

  if (opts?.pinned) {
    const match = {
      natureId: opts.pinned.natureId,
      rootPc: opts.pinned.rootPc,
      confidence: 1,
    }
    return {
      state: {
        natureId: match.natureId,
        rootPc: match.rootPc,
        streak: hold,
        pendingNatureId: null,
        pendingRootPc: null,
        pendingStreak: 0,
        missStreak: 0,
      },
      match,
    }
  }

  if (!next) {
    if (state.natureId == null || state.rootPc == null) {
      return {
        state: {
          ...state,
          streak: 0,
          pendingNatureId: null,
          pendingRootPc: null,
          pendingStreak: 0,
          missStreak: 0,
        },
        match: null,
      }
    }
    const missStreak = state.missStreak + 1
    if (missStreak >= missHold) {
      return { state: createNatureHysteresis(), match: null }
    }
    return {
      state: {
        ...state,
        streak: 0,
        pendingStreak: 0,
        missStreak,
      },
      match: {
        natureId: state.natureId,
        rootPc: state.rootPc,
        confidence: 0.4,
      },
    }
  }

  if (state.natureId === next.natureId && state.rootPc === next.rootPc) {
    return {
      state: {
        ...state,
        streak: state.streak + 1,
        pendingNatureId: null,
        pendingRootPc: null,
        pendingStreak: 0,
        missStreak: 0,
      },
      match: next,
    }
  }

  // First commit and switches both go through pending hold.
  const samePending =
    state.pendingNatureId === next.natureId && state.pendingRootPc === next.rootPc
  const pendingStreak = samePending ? state.pendingStreak + 1 : 1
  if (pendingStreak >= hold) {
    return {
      state: {
        natureId: next.natureId,
        rootPc: next.rootPc,
        streak: pendingStreak,
        pendingNatureId: null,
        pendingRootPc: null,
        pendingStreak: 0,
        missStreak: 0,
      },
      match: next,
    }
  }

  return {
    state: {
      ...state,
      pendingNatureId: next.natureId,
      pendingRootPc: next.rootPc,
      pendingStreak,
      missStreak: 0,
    },
    match:
      state.natureId != null && state.rootPc != null
        ? {
            natureId: state.natureId,
            rootPc: state.rootPc,
            confidence: 0.5,
          }
        : null,
  }
}
