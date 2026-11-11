/**
 * Continuous strong-pitch tracks across spectrogram columns.
 * Stable (held) tracks get note labels.
 */

import { noteFromHz } from '../../domain/tuner/noteFromHz'
import { binCenterHz, type SpectrogramRing } from './spectrogramRing'

export type SpectrogramTrackPoint = {
  /** Column index in the current ring (0 = oldest). */
  col: number
  hz: number
  salience: number
}

export type SpectrogramTrack = {
  id: number
  points: SpectrogramTrackPoint[]
  /** True when recent Hz variance is small enough to count as a held note. */
  held: boolean
  label: string | null
}

export type SpectrogramTrackState = {
  tracks: SpectrogramTrack[]
  nextId: number
}

export type AdvanceTracksOpts = {
  a4Hz?: number
  /** Max simultaneous tracks. Default 4. */
  maxTracks?: number
  /** Min salience (0…1) to seed/extend. Default 0.35. */
  salienceFloor?: number
  /** Match window in cents. Default 60. */
  matchCents?: number
  /** Frames of low variance required for a hold label. Default 10. */
  holdFrames?: number
  /** Max Hz std-dev (as cents) for hold. Default 25. */
  holdCents?: number
}

export function createSpectrogramTrackState(): SpectrogramTrackState {
  return { tracks: [], nextId: 1 }
}

export function clearSpectrogramTracks(state: SpectrogramTrackState): void {
  state.tracks = []
}

/** Drop the oldest `n` columns from every track (ring scrolled). */
export function shiftSpectrogramTracks(state: SpectrogramTrackState, dropped: number): void {
  if (dropped <= 0) return
  for (const t of state.tracks) {
    t.points = t.points
      .map((p) => ({ ...p, col: p.col - dropped }))
      .filter((p) => p.col >= 0)
  }
  state.tracks = state.tracks.filter((t) => t.points.length > 0)
}

/** Peak pick one spectrogram column → candidate Hz list. */
export function peaksFromSpectrogramColumn(
  col: Float32Array,
  ring: Pick<SpectrogramRing, 'binCount' | 'fMinHz' | 'fMaxHz' | 'scale'>,
  opts?: { floor?: number; maxPeaks?: number },
): { hz: number; salience: number; bin: number }[] {
  const floor = opts?.floor ?? 0.35
  const maxPeaks = opts?.maxPeaks ?? 6
  const cands: { bin: number; sal: number }[] = []
  for (let b = 1; b < col.length - 1; b++) {
    const v = col[b]!
    if (v >= floor && v >= col[b - 1]! && v >= col[b + 1]!) {
      cands.push({ bin: b, sal: v })
    }
  }
  cands.sort((a, b) => b.sal - a.sal)
  const out: { hz: number; salience: number; bin: number }[] = []
  const used: number[] = []
  for (const c of cands) {
    if (used.some((u) => Math.abs(u - c.bin) < 2)) continue
    out.push({
      bin: c.bin,
      salience: c.sal,
      hz: binCenterHz(ring, c.bin),
    })
    used.push(c.bin)
    if (out.length >= maxPeaks) break
  }
  return out
}

/** Extend / spawn tracks from the newest column (index = columns.length - 1). */
export function advanceSpectrogramTracks(
  state: SpectrogramTrackState,
  colIndex: number,
  peaks: { hz: number; salience: number }[],
  opts: AdvanceTracksOpts = {},
): void {
  const a4 = opts.a4Hz ?? 440
  const maxTracks = opts.maxTracks ?? 4
  const matchCents = opts.matchCents ?? 60
  const holdFrames = opts.holdFrames ?? 10
  const holdCents = opts.holdCents ?? 25

  const assigned = new Set<number>()
  // Greedy: strongest peaks first, match nearest open track
  const sortedPeaks = [...peaks].sort((a, b) => b.salience - a.salience)
  for (const peak of sortedPeaks) {
    let best: SpectrogramTrack | null = null
    let bestDist = matchCents
    for (const t of state.tracks) {
      if (assigned.has(t.id)) continue
      const last = t.points[t.points.length - 1]
      if (!last || last.col < colIndex - 2) continue // allow 1-frame gap
      const dist = Math.abs(1200 * Math.log2(peak.hz / last.hz))
      if (dist < bestDist) {
        bestDist = dist
        best = t
      }
    }
    if (best) {
      assigned.add(best.id)
      best.points.push({ col: colIndex, hz: peak.hz, salience: peak.salience })
      // Trim long histories (ring-sized)
      if (best.points.length > 400) best.points.splice(0, best.points.length - 400)
    } else if (state.tracks.length < maxTracks) {
      const id = state.nextId++
      state.tracks.push({
        id,
        points: [{ col: colIndex, hz: peak.hz, salience: peak.salience }],
        held: false,
        label: null,
      })
      assigned.add(id)
    }
  }

  // Drop stale tracks (no update for 3 columns)
  state.tracks = state.tracks.filter((t) => {
    const last = t.points[t.points.length - 1]
    return last != null && colIndex - last.col <= 3
  })

  // Hold / label
  for (const t of state.tracks) {
    const recent = t.points.slice(-holdFrames)
    if (recent.length < holdFrames) {
      t.held = false
      t.label = null
      continue
    }
    const mean =
      recent.reduce((s, p) => s + Math.log2(p.hz), 0) / recent.length
    let varCents = 0
    for (const p of recent) {
      varCents += (1200 * (Math.log2(p.hz) - mean)) ** 2
    }
    varCents = Math.sqrt(varCents / recent.length)
    t.held = varCents <= holdCents
    if (t.held) {
      const hz = 2 ** mean
      t.label = noteFromHz(hz, a4)?.name ?? `${hz.toFixed(0)} Hz`
    } else {
      t.label = null
    }
  }
}
