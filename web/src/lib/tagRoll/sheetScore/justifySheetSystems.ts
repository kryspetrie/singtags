/**
 * After measures wrap into systems, stretch each system so its measures
 * fill the line from leftPad to leftPad + targetInnerWidth.
 * Never shrinks a system that already meets or exceeds the target.
 */

export type JustifiablePlace = {
  systemIndex: number
  x: number
  width: number
}

export function justifySheetSystems(
  places: JustifiablePlace[],
  opts: {
    enabled: boolean
    leftPad: number
    /** Inner content width (between left and right margins). */
    targetInnerWidth: number
  },
): void {
  if (!opts.enabled) return
  const target = opts.targetInnerWidth
  if (!(target > 0) || !places.length) return

  const bySystem = new Map<number, JustifiablePlace[]>()
  for (const p of places) {
    const row = bySystem.get(p.systemIndex)
    if (row) row.push(p)
    else bySystem.set(p.systemIndex, [p])
  }

  for (const row of bySystem.values()) {
    row.sort((a, b) => a.x - b.x || a.width - b.width)
    const natural = row.reduce((sum, p) => sum + p.width, 0)
    if (!(natural > 0) || natural >= target - 0.5) {
      // Still re-seat X so rows stay left-aligned after earlier edits.
      let x = opts.leftPad
      for (const p of row) {
        p.x = x
        x += p.width
      }
      continue
    }
    const extra = target - natural
    let given = 0
    let x = opts.leftPad
    for (let i = 0; i < row.length; i++) {
      const p = row[i]!
      const share =
        i === row.length - 1
          ? Math.round(extra - given)
          : Math.round((extra * p.width) / natural)
      given += share
      p.width = Math.max(1, p.width + share)
      p.x = x
      x += p.width
    }
    // Absorb leftover rounding on the last bar so the right edge is exact.
    const last = row[row.length - 1]!
    const end = opts.leftPad + target
    const drift = end - (last.x + last.width)
    if (Math.abs(drift) >= 0.5) last.width = Math.max(1, last.width + drift)
  }
}
