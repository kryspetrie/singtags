/**
 * Tag deep-link helpers: normal tag page vs sing-mode fullscreen entry.
 */

/** True when the route asks to open the sheet fullscreen (sing entry). */
export function isTagFullscreenQuery(query: Record<string, unknown> | { fullscreen?: unknown; sheet?: unknown; sing?: unknown }): boolean {
  const fs = query.fullscreen
  if (fs === '1' || fs === 'true' || fs === true) return true
  // Legacy aliases from early sing-entry experiments.
  if (query.sheet === '1' || query.sing === '1') return true
  return false
}

/** Vue-router location for opening a tag (optionally into sing fullscreen). */
export function tagOpenLocation(
  tagId: string | number,
  opts?: {
    fullscreen?: boolean
    shift?: number
    /** Absolute fine detune in cents (session-only; not a preference write). */
    detuneCents?: number
    practice?: boolean
  },
): { path: string; query: Record<string, string> } {
  const query: Record<string, string> = {}
  if (opts?.fullscreen) query.fullscreen = '1'
  const shift = opts?.shift ?? 0
  if (shift) query.shift = String(shift)
  const detune = opts?.detuneCents ?? 0
  if (Number.isFinite(detune) && detune !== 0) {
    query.detune = String(Math.max(-50, Math.min(50, Math.round(detune))))
  }
  if (opts?.practice) query.set = 'practice'
  return { path: `/tag/${tagId}`, query }
}
