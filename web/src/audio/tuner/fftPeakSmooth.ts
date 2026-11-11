/**
 * Temporal tracking for FFT labeled peaks — match by cents, EMA Hz, hold/miss.
 */

import type { FftPeak } from './fftPeaks'

export type FftPeakTrack = {
  id: number
  hz: number
  salience: number
  note: string | null
  errorCents: number | null
  /** Consecutive hits while visible. */
  hits: number
  /** Frames since last match. */
  miss: number
  /** Ready to show in the UI. */
  visible: boolean
}

export type FftPeakSmoothState = {
  tracks: FftPeakTrack[]
  nextId: number
}

export type SmoothFftPeaksOpts = {
  /** Match window in cents. Default 45. */
  matchCents?: number
  /** Hits required before a track appears. Default 2. */
  appearHits?: number
  /** Misses before a track drops. Default 4. */
  holdMisses?: number
  /** EMA on Hz. Default 0.28. */
  alpha?: number
  /** Max labeled peaks. Default 6. */
  maxPeaks?: number
}

export function createFftPeakSmoothState(): FftPeakSmoothState {
  return { tracks: [], nextId: 1 }
}

export function resetFftPeakSmooth(state: FftPeakSmoothState): void {
  state.tracks = []
}

/**
 * Merge raw detector peaks into stable labeled tracks.
 * Returns visible peaks sorted by Hz (lowest first).
 */
export function smoothFftPeaks(
  state: FftPeakSmoothState,
  incoming: readonly FftPeak[],
  opts: SmoothFftPeaksOpts = {},
): FftPeak[] {
  const matchCents = opts.matchCents ?? 45
  const appearHits = opts.appearHits ?? 2
  const holdMisses = opts.holdMisses ?? 4
  const alpha = opts.alpha ?? 0.28
  const maxPeaks = opts.maxPeaks ?? 6

  const assigned = new Set<number>()
  const sorted = [...incoming].sort((a, b) => b.salience - a.salience)

  for (const peak of sorted) {
    let best: FftPeakTrack | null = null
    let bestDist = matchCents
    for (const t of state.tracks) {
      if (assigned.has(t.id)) continue
      const dist = Math.abs(1200 * Math.log2(peak.hz / t.hz))
      if (dist < bestDist) {
        bestDist = dist
        best = t
      }
    }
    if (best) {
      assigned.add(best.id)
      best.hz = best.hz + alpha * (peak.hz - best.hz)
      best.salience = best.salience + alpha * (peak.salience - best.salience)
      if (peak.note) best.note = peak.note
      if (peak.errorCents != null) {
        best.errorCents =
          best.errorCents == null
            ? peak.errorCents
            : best.errorCents + alpha * (peak.errorCents - best.errorCents)
      }
      best.hits += 1
      best.miss = 0
      if (best.hits >= appearHits) best.visible = true
    } else {
      const id = state.nextId++
      state.tracks.push({
        id,
        hz: peak.hz,
        salience: peak.salience,
        note: peak.note,
        errorCents: peak.errorCents,
        hits: 1,
        miss: 0,
        visible: appearHits <= 1,
      })
      assigned.add(id)
    }
  }

  for (const t of state.tracks) {
    if (assigned.has(t.id)) continue
    t.miss += 1
    t.hits = 0
  }

  state.tracks = state.tracks.filter((t) => t.miss <= holdMisses)

  // Cap: keep strongest visible + in-progress tracks.
  if (state.tracks.length > maxPeaks + 2) {
    state.tracks.sort((a, b) => b.salience - a.salience)
    state.tracks = state.tracks.slice(0, maxPeaks + 2)
  }

  return state.tracks
    .filter((t) => t.visible)
    .sort((a, b) => b.salience - a.salience)
    .slice(0, maxPeaks)
    .map((t) => ({
      hz: t.hz,
      salience: t.salience,
      note: t.note,
      errorCents: t.errorCents,
    }))
    .sort((a, b) => a.hz - b.hz)
}
