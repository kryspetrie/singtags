/**
 * Build a shareable tag URL that preserves session query (shift, detune, practice).
 * Fullscreen is optional — recipients only jump into sheet fullscreen when requested.
 *
 * `detune` is absolute cents (±50) for this shared session only — scanners must apply
 * it without writing pitch-pipe / global-detune preferences.
 */

import { FULLSCREEN_QUERY_FLAG } from './fullscreenQuery'

/** Clamp shared / session fine detune to ±50 cents (integer). */
export function clampShareDetuneCents(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.max(-50, Math.min(50, Math.round(n)))
}

/**
 * Parse `?detune=` from a route query.
 * Returns `null` when absent (caller should fall back to local prefs);
 * otherwise the clamped cents value (including explicit `0`).
 */
export function readDetuneFromQuery(
  query: Record<string, unknown> | { detune?: unknown },
): number | null {
  const raw = query.detune
  if (raw == null || raw === '') return null
  const s = Array.isArray(raw) ? raw[0] : raw
  if (typeof s !== 'string' && typeof s !== 'number') return null
  const n = typeof s === 'number' ? s : Number(s)
  if (!Number.isFinite(n)) return null
  return clampShareDetuneCents(n)
}

export function buildTagSharePath(
  tagId: string | number,
  opts?: {
    shift?: number
    /** Absolute fine detune in cents (session-only for recipients). */
    detuneCents?: number
    practice?: boolean
    /** When true, recipient opens into sheet fullscreen (`?fullscreen`). */
    fullscreen?: boolean
  },
): { path: string; query: Record<string, string | null> } {
  const query: Record<string, string | null> = {}
  const shift = opts?.shift ?? 0
  if (shift) query.shift = String(shift)
  const detune = clampShareDetuneCents(opts?.detuneCents ?? 0)
  if (detune) query.detune = String(detune)
  if (opts?.practice) query.set = 'practice'
  if (opts?.fullscreen) query.fullscreen = FULLSCREEN_QUERY_FLAG
  return { path: `/tag/${tagId}`, query }
}
