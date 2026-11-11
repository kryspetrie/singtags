/**
 * Chord multi-F0 peak tracker — appear/hold hysteresis + singing F0 band.
 * Rejects brief blips, out-of-range drones, and one-frame harmonic ghosts
 * so held/frozen chords stay stable while singers tune slowly.
 */

import { noteFromHz } from './noteFromHz'

/** Default band when caller omits fMin/fMax (Quartet F0 preset). */
export const QUARTET_F0_MIN_HZ = 70
export const QUARTET_F0_MAX_HZ = 700

export type ChordPeakIn = {
  hz: number
  salience: number
}

export type ChordPeakOut = {
  hz: number
  salience: number
}

export type ChordPeakTrack = {
  id: number
  hz: number
  salience: number
  hits: number
  miss: number
  visible: boolean
}

export type ChordPeakTrackState = {
  tracks: ChordPeakTrack[]
  nextId: number
}

export type ChordPeakTrackOpts = {
  /** Match window (¢). Default 55. */
  matchCents?: number
  /** Hits before a track appears in the stack. Default 4. */
  appearHits?: number
  /** Misses before a visible track drops. Default 18 (~held-chord friendly). */
  holdMisses?: number
  /** EMA on Hz. Default 0.22. */
  alpha?: number
  maxPeaks?: number
  fMinHz?: number
  fMaxHz?: number
  a4Hz?: number
}

export function createChordPeakTrackState(): ChordPeakTrackState {
  return { tracks: [], nextId: 1 }
}

export function resetChordPeakTrackState(state: ChordPeakTrackState): void {
  state.tracks = []
  state.nextId = 1
}

export function inQuartetF0Band(
  hz: number,
  fMinHz = QUARTET_F0_MIN_HZ,
  fMaxHz = QUARTET_F0_MAX_HZ,
): boolean {
  return hz >= fMinHz && hz <= fMaxHz
}

/**
 * Merge raw multi-F0 peaks into stable visible tracks.
 * Returns pitch-ordered peaks + PC set from *visible* tracks only.
 */
export function pushChordPeaks(
  state: ChordPeakTrackState,
  incoming: readonly ChordPeakIn[],
  opts: ChordPeakTrackOpts = {},
): { peaks: ChordPeakOut[]; pitchClasses: number[] } {
  const matchCents = opts.matchCents ?? 55
  const appearHits = opts.appearHits ?? 4
  const holdMisses = opts.holdMisses ?? 18
  const alpha = opts.alpha ?? 0.22
  const maxPeaks = opts.maxPeaks ?? 4
  const fMin = opts.fMinHz ?? QUARTET_F0_MIN_HZ
  const fMax = opts.fMaxHz ?? QUARTET_F0_MAX_HZ
  const a4 = opts.a4Hz ?? 440

  const filtered = incoming
    .filter((p) => inQuartetF0Band(p.hz, fMin, fMax) && p.salience > 0)
    .sort((a, b) => b.salience - a.salience)

  const assigned = new Set<number>()

  for (const peak of filtered) {
    let best: ChordPeakTrack | null = null
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
      best.hits += 1
      best.miss = 0
      if (best.hits >= appearHits) best.visible = true
    } else {
      const id = state.nextId++
      state.tracks.push({
        id,
        hz: peak.hz,
        salience: peak.salience,
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
    // Keep visible until holdMisses so brief dropouts don't clear a held chord.
  }

  state.tracks = state.tracks.filter((t) => t.miss <= holdMisses)

  if (state.tracks.length > maxPeaks + 2) {
    state.tracks.sort((a, b) => b.salience - a.salience)
    state.tracks = state.tracks.slice(0, maxPeaks + 2)
  }

  const peaks = state.tracks
    .filter((t) => t.visible)
    .sort((a, b) => b.salience - a.salience)
    .slice(0, maxPeaks)
    .map((t) => ({ hz: t.hz, salience: t.salience }))
    .sort((a, b) => a.hz - b.hz)

  const pitchClasses = pcsFromPeaks(peaks, a4)
  return { peaks, pitchClasses }
}

function pcsFromPeaks(peaks: readonly ChordPeakOut[], a4Hz: number): number[] {
  const set = new Set<number>()
  for (const p of peaks) {
    const n = noteFromHz(p.hz, a4Hz)
    if (!n) continue
    set.add(((n.midi % 12) + 12) % 12)
  }
  return [...set].sort((a, b) => a - b)
}
