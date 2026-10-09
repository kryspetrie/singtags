/**
 * Classic Co5 / highway digraph + beam over Strong homes.
 * Hard legal edges (not soft Viterbi transitions) when emission is flat.
 */
import { segmentChordToneFit } from './segmentEmission'
import { leadFitsHome } from './strongRootCadence'

const HOMES = [0, 2, 5, 7, 9] as const

/** Successors of a home deg (Classic highway + stay + common leaps). */
export const CO5_SUCCESSORS: Readonly<Record<number, readonly number[]>> = {
  0: [0, 5, 7, 9, 2], // I → IV / V / vi / II
  2: [2, 7, 0, 5], // II → V (primary), I, IV
  5: [5, 0, 7, 2], // IV → I / V / II
  7: [7, 0, 2, 5], // V → I (primary)
  9: [9, 2, 0, 7, 5], // vi → II (primary)
}

/** Lower is better. Primary Co5 edges cheapest. */
export function co5EdgeCost(prev: number | null, cur: number): number {
  if (prev == null) {
    if (cur === 0 || cur === 7) return 0
    if (cur === 5 || cur === 2) return 0.5
    return 1
  }
  if (prev === cur) return 0.25
  // Primary circle: II→V→I, vi→II, I→IV, IV→I, I→V
  if (prev === 2 && cur === 7) return 0
  if (prev === 7 && cur === 0) return 0
  if (prev === 9 && cur === 2) return 0
  if (prev === 0 && cur === 5) return 0.15
  if (prev === 5 && cur === 0) return 0.15
  if (prev === 0 && cur === 7) return 0.2
  if (prev === 5 && cur === 7) return 0.25
  if (prev === 9 && cur === 0) return 0.35
  if (prev === 0 && cur === 9) return 0.35
  if (prev === 2 && cur === 0) return 0.4
  const allowed = CO5_SUCCESSORS[prev]
  if (allowed?.includes(cur)) return 0.75
  return 3.5 // illegal-ish
}

export type Co5Note = {
  scaleDegree: number
  preferredDeg: number
  phraseEdge: 'start' | 'end' | null
  /** Optional precomputed segment fits by home deg. */
  segFit?: Partial<Record<number, number>>
}

function emission(n: Co5Note, cur: number): number {
  let s = 0
  if (cur === n.preferredDeg) s += 2.2
  if (leadFitsHome(n.scaleDegree, cur)) s += 1.4
  else s -= 2.2
  const fit = n.segFit?.[cur]
  if (fit != null) s += fit * 2.5
  if (n.phraseEdge === 'end' && cur === 0) s += 1.8
  if (n.phraseEdge === 'start' && (cur === 0 || cur === 7)) s += 1
  return s
}

/**
 * Beam decode over Co5-legal paths. Width default 6.
 */
export function decodeStrongHomesCo5Beam(
  notes: readonly Co5Note[],
  opts?: { beamWidth?: number },
): number[] {
  if (!notes.length) return []
  const width = opts?.beamWidth ?? 6
  type Beam = { degs: number[]; score: number }
  let beams: Beam[] = HOMES.map((cur) => ({
    degs: [cur],
    score: emission(notes[0]!, cur) - co5EdgeCost(null, cur),
  }))
  beams.sort((a, b) => b.score - a.score)
  beams = beams.slice(0, width)

  for (let i = 1; i < notes.length; i++) {
    const note = notes[i]!
    const next: Beam[] = []
    for (const b of beams) {
      const prev = b.degs[b.degs.length - 1]!
      const succ = CO5_SUCCESSORS[prev] ?? HOMES
      const cands = new Set<number>([...succ, prev, note.preferredDeg])
      for (const cur of cands) {
        if (!(HOMES as readonly number[]).includes(cur)) continue
        const sc =
          b.score + emission(note, cur) - co5EdgeCost(prev, cur)
        next.push({ degs: [...b.degs, cur], score: sc })
      }
    }
    next.sort((a, b) => b.score - a.score)
    beams = next.slice(0, width)
  }
  return beams[0]?.degs ?? notes.map((n) => n.preferredDeg)
}

/**
 * C6 spike: Co5 beam with some Strong indices locked to a home deg.
 * Locked slots are forced; free slots search successors as usual.
 */
export function decodeStrongHomesCo5UnderLocks(
  notes: readonly Co5Note[],
  locks: ReadonlyMap<number, number>,
  opts?: { beamWidth?: number },
): number[] {
  if (!notes.length) return []
  const width = opts?.beamWidth ?? 6
  type Beam = { degs: number[]; score: number }

  const startLock = locks.get(0)
  let beams: Beam[] = (startLock != null ? [startLock] : [...HOMES]).map((cur) => ({
    degs: [cur],
    score: emission(notes[0]!, cur) - co5EdgeCost(null, cur),
  }))
  beams.sort((a, b) => b.score - a.score)
  beams = beams.slice(0, width)

  for (let i = 1; i < notes.length; i++) {
    const note = notes[i]!
    const lock = locks.get(i)
    const next: Beam[] = []
    for (const b of beams) {
      const prev = b.degs[b.degs.length - 1]!
      const succ = CO5_SUCCESSORS[prev] ?? HOMES
      const cands =
        lock != null
          ? new Set<number>([lock])
          : new Set<number>([...succ, prev, note.preferredDeg])
      for (const cur of cands) {
        if (!(HOMES as readonly number[]).includes(cur)) continue
        const sc = b.score + emission(note, cur) - co5EdgeCost(prev, cur)
        next.push({ degs: [...b.degs, cur], score: sc })
      }
    }
    next.sort((a, b) => b.score - a.score)
    beams = next.slice(0, width)
  }
  return beams[0]?.degs ?? notes.map((n) => n.preferredDeg)
}

/** Build segFit map for a Strong span (for Co5 emission). */
export function segFitByHome(opts: {
  melody: readonly { midi: number; startTick: number; durationTicks: number }[]
  startTick: number
  endTick: number
  tonality: number
}): Partial<Record<number, number>> {
  const out: Partial<Record<number, number>> = {}
  for (const deg of HOMES) {
    out[deg] = segmentChordToneFit({
      melody: opts.melody as never,
      startTick: opts.startTick,
      endTick: opts.endTick,
      tonality: opts.tonality,
      homeDeg: deg,
    })
  }
  return out
}
