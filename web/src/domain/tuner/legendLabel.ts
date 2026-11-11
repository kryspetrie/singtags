/**
 * Compact Tune legend copy (temperament + concert A from global resolve).
 */

export function formatConcertAHz(hz: number): string {
  if (!Number.isFinite(hz)) return '—'
  const rounded = Math.round(hz * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

export function tunerLegendLabel(opts: {
  a4Hz: number
  temperament: 'equal' | 'justTriad' | 'custom'
  chordLock: boolean
  chordNatureId?: string | null
  short?: boolean
}): string {
  const a = `A=${formatConcertAHz(opts.a4Hz)}`
  if (opts.chordLock) {
    if (opts.short) return `Chord · ${a}`
    const nature = opts.chordNatureId || 'chord'
    return `vs Chord lock · ${nature} · ${a}`
  }
  if (opts.short) {
    if (opts.temperament === 'justTriad') return `Just · ${a}`
    if (opts.temperament === 'custom') return `Custom · ${a}`
    return a
  }
  const grid =
    opts.temperament === 'equal'
      ? 'Equal'
      : opts.temperament === 'justTriad'
        ? 'Just triad'
        : 'Custom'
  return `vs ${grid} · ${a}`
}
