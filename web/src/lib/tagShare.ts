/**
 * Build a shareable tag URL that preserves session query (shift, detune, practice).
 * Fullscreen is optional — recipients only jump into sheet fullscreen when requested.
 *
 * `detune` is absolute cents (±50) for this shared session only — scanners must apply
 * it without writing pitch-pipe / global-detune preferences.
 */

export type ShareOrCopyResult = 'shared' | 'copied' | 'cancelled' | 'failed'

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
    /** When true, recipient opens into sheet fullscreen (`fullscreen=1`). */
    fullscreen?: boolean
  },
): { path: string; query: Record<string, string> } {
  const query: Record<string, string> = {}
  const shift = opts?.shift ?? 0
  if (shift) query.shift = String(shift)
  const detune = clampShareDetuneCents(opts?.detuneCents ?? 0)
  if (detune) query.detune = String(detune)
  if (opts?.practice) query.set = 'practice'
  if (opts?.fullscreen) query.fullscreen = '1'
  return { path: `/tag/${tagId}`, query }
}

/**
 * Whether to prefer the Web Share sheet over clipboard.
 * Desktop browsers often expose `navigator.share` but reject URL-only payloads —
 * check `canShare` when present, otherwise only auto-open share on touch devices.
 */
export function shouldPreferWebShare(data: ShareData): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return false
  if (typeof navigator.canShare === 'function') {
    try {
      return navigator.canShare(data)
    } catch {
      return false
    }
  }
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(pointer: coarse)').matches
}

/**
 * Share via the OS sheet when reliable; otherwise copy the URL to the clipboard.
 */
export async function shareOrCopyUrl(
  url: string,
  opts?: { title?: string; text?: string },
): Promise<ShareOrCopyResult> {
  const title = opts?.title || 'SingTags'
  const text = opts?.text || title
  const data: ShareData = { title, text, url }

  if (shouldPreferWebShare(data)) {
    try {
      await navigator.share(data)
      return 'shared'
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled'
      // Fall through to clipboard for NotAllowed / TypeError / etc.
    }
  }

  try {
    await navigator.clipboard.writeText(url)
    return 'copied'
  } catch {
    return 'failed'
  }
}
