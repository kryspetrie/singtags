/**
 * Overlapping moment windows for holistic Path Optimize.
 */

export type OptimizeWindow = {
  /** Inclusive start index into the moments array. */
  start: number
  /** Exclusive end index. */
  end: number
}

/**
 * Cover `n` moments with overlapping windows (width ~6–10, hop ~2–3).
 * Always includes a trailing window that reaches the end.
 */
export function overlappingWindows(
  n: number,
  width = 8,
  hop = 3,
): OptimizeWindow[] {
  if (n <= 0) return []
  const w = Math.max(2, Math.floor(width))
  const h = Math.max(1, Math.floor(hop))
  if (n <= w) return [{ start: 0, end: n }]

  const out: OptimizeWindow[] = []
  for (let start = 0; start < n; start += h) {
    const end = Math.min(n, start + w)
    out.push({ start, end })
    if (end >= n) break
  }
  const last = out[out.length - 1]!
  if (last.end < n) {
    out.push({ start: Math.max(0, n - w), end: n })
  }
  return out
}
