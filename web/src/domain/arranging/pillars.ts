/**
 * Infer / manage primary harmonic pillars from a melody.
 * Heuristic only — Approach Two Step I requires user confirm.
 */
import type { MelodyEvent, Pillar, TonalityMode } from './types'
import { newId } from './types'

export type PillarSuggestion = {
  rootPc: number
  startTick: number
  endTick: number
  confidence: number
  reason: string
}

/**
 * Segment melody into spans and guess primary roots.
 * Strategy: group consecutive notes into beat windows; prefer pitch classes
 * that fit I/IV/V (or i/iv/V) of tonality and appear as chord-tones on that root.
 */
export function suggestPillars(opts: {
  melody: readonly MelodyEvent[]
  tonality: number
  mode?: TonalityMode
  measureTicks?: number
}): PillarSuggestion[] {
  const { melody, tonality } = opts
  const mode = opts.mode ?? 'major'
  const measureTicks = opts.measureTicks ?? 480 * 4
  if (!melody.length) return []

  const sorted = [...melody].sort((a, b) => a.startTick - b.startTick)
  const end = Math.max(...sorted.map((n) => n.startTick + n.durationTicks))
  const suggestions: PillarSuggestion[] = []

  // One candidate pillar per measure so ←/→ can step measure-by-measure.
  // (Merging same-root neighbors used to yield one chart-length pillar.)
  const measures = Math.max(1, Math.ceil(end / measureTicks))
  for (let m = 0; m < measures; m++) {
    const startTick = m * measureTicks
    const endTick = (m + 1) * measureTicks
    const notes = sorted.filter(
      (n) => n.startTick < endTick && n.startTick + n.durationTicks > startTick,
    )
    if (!notes.length) continue

    const scored = scoreRootsForNotes(notes, tonality, mode)
    const best = scored[0]
    if (!best) continue
    suggestions.push({
      rootPc: best.rootPc,
      startTick,
      endTick,
      confidence: best.score,
      reason: best.reason,
    })
  }

  return suggestions
}

function chordToneWeight(rel: number, mode: TonalityMode): number {
  if (mode === 'minor') {
    // minor triad + BS7 flat-7; keep major 3rd as weak color
    return rel === 0
      ? 4
      : rel === 3
        ? 3.5
        : rel === 7
          ? 3
          : rel === 10
            ? 3.5
            : rel === 4
              ? 1.5
              : rel === 2
                ? 1
                : 0
  }
  // major / BS7
  return rel === 0 ? 4 : rel === 4 ? 3 : rel === 7 ? 3 : rel === 10 ? 3.5 : rel === 2 ? 1 : 0
}

function scoreRootsForNotes(
  notes: readonly MelodyEvent[],
  tonality: number,
  mode: TonalityMode,
): { rootPc: number; score: number; reason: string }[] {
  // Candidate roots: tonality degrees + melody pitch classes
  const candidates = new Set<number>()
  const degreeBoosts =
    mode === 'minor'
      ? [0, 5, 7, 3, 8, 10, 2] // i, iv, V, III, VI, VII, ii
      : [0, 5, 7, 2, 9, 4, 11]
  for (const deg of degreeBoosts) {
    candidates.add(((tonality + deg) % 12 + 12) % 12)
  }
  for (const n of notes) candidates.add(((n.midi % 12) + 12) % 12)

  const results: { rootPc: number; score: number; reason: string }[] = []
  for (const rootPc of candidates) {
    let score = 0
    let hits = 0
    for (const n of notes) {
      const pc = ((n.midi % 12) + 12) % 12
      const rel = ((pc - rootPc) % 12 + 12) % 12
      const w = chordToneWeight(rel, mode)
      if (w > 0) {
        hits++
        score += w * Math.max(1, n.durationTicks / 240)
      } else {
        score -= 0.5
      }
    }
    // Prefer I/i, IV/iv, V of key
    const deg = ((rootPc - tonality) % 12 + 12) % 12
    if (deg === 0) score += 2.5
    else if (deg === 5 || deg === 7) score += 1.75
    else if (mode === 'minor' && (deg === 3 || deg === 8)) score += 0.75

    const coverage = hits / notes.length
    score *= 0.5 + coverage
    results.push({
      rootPc,
      score,
      reason: coverage >= 0.7 ? 'strong coverage' : 'partial coverage',
    })
  }
  return results.sort((a, b) => b.score - a.score)
}

export function suggestionsToPillars(suggestions: readonly PillarSuggestion[]): Pillar[] {
  return suggestions.map((s) => ({
    id: newId('pil'),
    rootPc: s.rootPc,
    startTick: s.startTick,
    endTick: s.endTick,
    source: 'inferred' as const,
    confirmed: false,
    reason: s.reason,
    confidence: s.confidence,
  }))
}

export function pillarAtTick(pillars: readonly Pillar[], tick: number): Pillar | null {
  return pillars.find((p) => p.startTick <= tick && tick < p.endTick) ?? null
}

/** Melody notes whose start is not covered by any pillar span. */
export function melodyGapsOutsidePillars(
  melody: readonly MelodyEvent[],
  pillars: readonly Pillar[],
): MelodyEvent[] {
  return melody.filter((m) => !pillarAtTick(pillars, m.startTick))
}

function sortPillars(pillars: readonly Pillar[]): Pillar[] {
  return [...pillars].sort((a, b) => a.startTick - b.startTick)
}

/**
 * Insert a user pillar covering [tick, nextPillarStart) or a default measure window.
 * Shrinks overlapping pillars so spans stay non-overlapping.
 */
export function addPillarAtTick(
  pillars: readonly Pillar[],
  tick: number,
  opts: {
    rootPc: number
    endTick?: number
    measureTicks?: number
    id?: string
  },
): Pillar[] {
  const measureTicks = opts.measureTicks ?? 480 * 4
  const sorted = sortPillars(pillars)
  const next = sorted.find((p) => p.startTick > tick)
  const endTick = opts.endTick ?? next?.startTick ?? tick + measureTicks
  const neu: Pillar = {
    id: opts.id ?? newId('pil'),
    rootPc: opts.rootPc,
    startTick: tick,
    endTick: Math.max(tick + 1, endTick),
    source: 'user',
    confirmed: false,
  }
  const kept = sorted
    .flatMap((p) => {
      if (p.endTick <= neu.startTick || p.startTick >= neu.endTick) return [p]
      const out: Pillar[] = []
      if (p.startTick < neu.startTick) {
        out.push({ ...p, endTick: neu.startTick, source: 'user' })
      }
      if (p.endTick > neu.endTick) {
        out.push({
          ...p,
          id: newId('pil'),
          startTick: neu.endTick,
          source: 'user',
          confirmed: false,
        })
      }
      return out
    })
    .filter((p) => p.endTick > p.startTick)
  return sortPillars([...kept, neu])
}

/** Extend pillar end (or start) so it covers tick; merge overlaps by absorbing. */
export function extendPillarToCover(
  pillars: readonly Pillar[],
  pillarId: string,
  tick: number,
): Pillar[] {
  const sorted = sortPillars(pillars)
  const pil = sorted.find((p) => p.id === pillarId)
  if (!pil) return sorted
  let start = Math.min(pil.startTick, tick)
  let end = Math.max(pil.endTick, tick + 1)
  const others = sorted.filter((p) => p.id !== pillarId)
  // Absorb fully covered neighbors
  const remaining: Pillar[] = []
  for (const o of others) {
    if (o.endTick <= start || o.startTick >= end) {
      remaining.push(o)
      continue
    }
    start = Math.min(start, o.startTick)
    end = Math.max(end, o.endTick)
  }
  return sortPillars([
    ...remaining,
    { ...pil, startTick: start, endTick: end, source: 'user' },
  ])
}

export function trimPillarEnd(
  pillars: readonly Pillar[],
  pillarId: string,
  endTick: number,
): Pillar[] {
  return pillars
    .map((p) =>
      p.id === pillarId
        ? { ...p, endTick: Math.max(p.startTick + 1, endTick), source: 'user' as const }
        : p,
    )
    .filter((p) => p.endTick > p.startTick)
}

export function deletePillar(pillars: readonly Pillar[], pillarId: string): Pillar[] {
  return pillars.filter((p) => p.id !== pillarId)
}

export function lockPillar(pillars: readonly Pillar[], pillarId: string): Pillar[] {
  return pillars.map((p) =>
    p.id === pillarId ? { ...p, confirmed: true, source: 'user' as const } : p,
  )
}

/** Lock all unconfirmed — only valid after at least one pillar is already locked. */
export function lockRemainingPillars(pillars: readonly Pillar[]): Pillar[] {
  if (!pillars.some((p) => p.confirmed)) return [...pillars]
  return pillars.map((p) => (p.confirmed ? p : { ...p, confirmed: true, source: 'user' as const }))
}
