/**
 * Guided home-root propose — one destination at a time (Approach Two Step I).
 * Batch `suggestPillars` remains for advanced “draft all measures.”
 */
import type { MelodyEvent, Pillar, TonalityMode } from './types'
import { melodyWithDeferredPortamento } from './harmonicMoments'

/** Stored span only — Propose still offers later homes inside a succession gap. */
function pillarSpanAtTick(pillars: readonly Pillar[], tick: number): Pillar | null {
  return pillars.find((p) => p.startTick <= tick && tick < p.endTick) ?? null
}

export type ProposeSpan = {
  startTick: number
  endTick: number
  /** Why this window was offered. */
  kind: 'playhead' | 'uncovered' | 'measure'
}

export type PillarSuggestion = {
  rootPc: number
  startTick: number
  endTick: number
  confidence: number
  reason: string
}

/** Stable key for a proposed / skipped home-root window. */
export function spanKey(startTick: number, endTick: number): string {
  return `${startTick}:${endTick}`
}

function isSkipped(
  skipped: ReadonlySet<string> | readonly string[] | undefined,
  start: number,
  end: number,
): boolean {
  if (!skipped) return false
  const key = spanKey(start, end)
  return skipped instanceof Set
    ? skipped.has(key)
    : (skipped as readonly string[]).includes(key)
}

function chordToneWeight(rel: number, mode: TonalityMode): number {
  if (mode === 'minor') {
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
  return rel === 0 ? 4 : rel === 4 ? 3 : rel === 7 ? 3 : rel === 10 ? 3.5 : rel === 2 ? 1 : 0
}

/** Score candidate roots for notes in a span; best first. */
export function scoreRootsForNotes(
  notes: readonly MelodyEvent[],
  tonality: number,
  mode: TonalityMode,
): { rootPc: number; score: number; reason: string }[] {
  if (!notes.length) return []
  const candidates = new Set<number>()
  const degreeBoosts =
    mode === 'minor'
      ? [0, 5, 7, 3, 8, 10, 2]
      : [0, 5, 7, 2, 9, 4, 11]
  for (const deg of degreeBoosts) {
    candidates.add(((tonality + deg) % 12 + 12) % 12)
  }
  for (const n of notes) candidates.add(((n.midi % 12) + 12) % 12)

  // Duration-weighted melody scale-degree mass (major map; minor uses same pcs).
  let massTon = 0
  let mass2 = 0
  let mass3 = 0
  let mass4 = 0
  let mass5 = 0
  let mass6 = 0
  let massLt = 0
  for (const n of notes) {
    const sd = (((n.midi % 12) - tonality) % 12 + 12) % 12
    const w = Math.max(1, n.durationTicks / 240)
    if (sd === 0) massTon += w
    else if (sd === 2) mass2 += w
    else if (sd === 3 || sd === 4) mass3 += w
    else if (sd === 5) mass4 += w
    else if (sd === 7) mass5 += w
    else if (sd === 8 || sd === 9) mass6 += w
    else if (sd === 10 || sd === 11) massLt += w
  }
  const massSum = massTon + mass2 + mass3 + mass4 + mass5 + mass6 + massLt || 1

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
    const deg = ((rootPc - tonality) % 12 + 12) % 12
    if (deg === 0) score += 2.5
    else if (deg === 5 || deg === 7) score += 1.75
    else if (mode === 'minor' && (deg === 3 || deg === 8)) score += 0.75

    // Honest polecat miss: V stolen by I/II; I stolen by vi/iii.
    // Cue V when melody is heavy on LT / ^2; protect I when tonic is present.
    if (mode !== 'minor') {
      if (deg === 7) {
        score += 1.35 * massLt + 1.0 * mass2 + 0.35 * mass5
        // Sweet Roses: V was stealing I when tonic is present in the span.
        if (massTon > 0.3 * massSum) score -= 2.4
      } else if (deg === 0) {
        score += 0.85 * massTon
        // Bare LT/^2 without tonic → not I
        if (massLt + mass2 > massTon + 0.25 * massSum && massTon < 0.35 * massSum) {
          score -= 2.2
        }
        // Single-note (or tonic-dominated) spans: prefer I home.
        if (massTon >= 0.6 * massSum) score += 1.5
      } else if (deg === 5) {
        // IV when melody sits on ^4 / ^6 / ^1 (subdominant)
        score += 0.9 * mass4 + 0.45 * mass6 + 0.25 * massTon
      } else if (deg === 2) {
        // II often steals V under LT; keep II when ^2/^4 dominate without LT
        if (massLt > 0.2 * massSum) score -= 1.8
        else score += 0.45 * mass2 + 0.35 * mass4
      } else if (deg === 9) {
        // vi steals I under ^3; demote when tonic is clear
        if (massTon > 0.25 * massSum) score -= 1.2
      } else if (deg === 4) {
        if (massTon > 0.3 * massSum) score -= 0.8
      }
    }

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

export function proposeRootForSpan(opts: {
  melody: readonly MelodyEvent[]
  startTick: number
  endTick: number
  tonality: number
  mode?: TonalityMode
}): { rootPc: number; confidence: number; reason: string } | null {
  const mode = opts.mode ?? 'major'
  const notes = opts.melody.filter(
    (n) => n.startTick < opts.endTick && n.startTick + n.durationTicks > opts.startTick,
  )
  // Single-tone spans (common at eighth-note inference): map scale degree → home.
  // Multi-note spans keep the coverage scorer.
  // 1–2 note spans: use (arrival) tone scale-degree → I/IV/V prior.
  if (mode !== 'minor' && notes.length >= 1 && notes.length <= 2) {
    const tone = notes.length === 1 ? notes[0]! : notes.reduce((a, b) =>
      b.startTick >= a.startTick ? b : a,
    )
    const sd = (((tone.midi % 12) - opts.tonality) % 12 + 12) % 12
    // ^1/^3/^5→I, ^4/^6→IV, ^2/^7→V (barbershop melody-harmonization prior)
    const homeDeg =
      sd === 0 || sd === 4 || sd === 7
        ? 0
        : sd === 5 || sd === 9
          ? 5
          : sd === 2 || sd === 11
            ? 7
            : sd === 3 || sd === 8
              ? 0
              : null
    if (homeDeg != null) {
      const rootPc = ((opts.tonality + homeDeg) % 12 + 12) % 12
      return {
        rootPc,
        confidence: 2,
        reason: 'single-tone scale-degree home',
      }
    }
  }
  const best = scoreRootsForNotes(notes, opts.tonality, mode)[0]
  if (!best) return null
  return { rootPc: best.rootPc, confidence: best.score, reason: best.reason }
}

function spanNeedsWork(pillars: readonly Pillar[], start: number, end: number): boolean {
  const locked = pillars.find(
    (p) => p.confirmed && p.startTick < end && p.endTick > start,
  )
  if (locked && locked.startTick <= start && locked.endTick >= end) return false
  const covering = pillarSpanAtTick(pillars, start)
  if (covering?.confirmed) return false
  return true
}

/**
 * Ordered candidate windows for guided propose.
 * Prefer phrase-ish uncovered onsets; fall back to measures with melody.
 */
export function candidatePillarPositions(opts: {
  melody: readonly MelodyEvent[]
  pillars: readonly Pillar[]
  measureTicks?: number
  cursorTick?: number
  /** Session-skipped windows (`spanKey`). */
  skippedSpans?: ReadonlySet<string> | readonly string[]
}): ProposeSpan[] {
  const measureTicks = opts.measureTicks ?? 480 * 4
  // Portamento destinations start early in the roll; coach windows use release timing.
  const melody = melodyWithDeferredPortamento(opts.melody).sort(
    (a, b) => a.startTick - b.startTick,
  )
  if (!melody.length) return []

  const out: ProposeSpan[] = []
  const seen = new Set<string>()
  const push = (span: ProposeSpan) => {
    if (span.endTick <= span.startTick) return
    if (isSkipped(opts.skippedSpans, span.startTick, span.endTick)) return
    if (!spanNeedsWork(opts.pillars, span.startTick, span.endTick)) return
    const key = `${span.startTick}:${span.endTick}`
    if (seen.has(key)) return
    seen.add(key)
    out.push(span)
  }

  const cursor = opts.cursorTick ?? 0
  const playheadMeasure = Math.floor(cursor / measureTicks) * measureTicks
  const playNotes = melody.filter(
    (n) =>
      n.startTick < playheadMeasure + measureTicks &&
      n.startTick + n.durationTicks > playheadMeasure,
  )
  if (playNotes.length) {
    push({
      startTick: playheadMeasure,
      endTick: playheadMeasure + measureTicks,
      kind: 'playhead',
    })
  }

  // Prefer Strong→Strong phrase windows when roles are labeled; else non-passing; else all.
  const labeledStrong = melody.filter((n) => n.role === 'pmn')
  const strongOrOpen = melody.filter((n) => n.role !== 'smn')
  const usePhrase = labeledStrong.length >= 2
  const chain = usePhrase ? labeledStrong : strongOrOpen.length ? strongOrOpen : melody
  for (let i = 0; i < chain.length; i++) {
    const n = chain[i]!
    if (pillarSpanAtTick(opts.pillars, n.startTick)?.confirmed) continue
    if (
      pillarSpanAtTick(opts.pillars, n.startTick) &&
      !spanNeedsWork(opts.pillars, n.startTick, n.startTick + 1)
    ) {
      continue
    }
    const next = chain[i + 1]
    const measureEnd = (Math.floor(n.startTick / measureTicks) + 1) * measureTicks
    // Phrase: onset → next Strong onset. Fallback: clamp to measure.
    const endTick = usePhrase && next
      ? Math.max(n.startTick + 1, next.startTick)
      : next
        ? Math.min(next.startTick, measureEnd)
        : measureEnd
    // Skip empty pickup-only silence as a first-class home (no melody in span).
    const covered = melody.some(
      (m) => m.startTick < endTick && m.startTick + m.durationTicks > n.startTick,
    )
    if (!covered) continue
    push({
      startTick: n.startTick,
      endTick,
      kind: 'uncovered',
    })
  }

  const end = Math.max(...melody.map((n) => n.startTick + n.durationTicks))
  const measures = Math.max(1, Math.ceil(end / measureTicks))
  for (let m = 0; m < measures; m++) {
    const startTick = m * measureTicks
    const endTick = (m + 1) * measureTicks
    const notes = melody.filter(
      (n) => n.startTick < endTick && n.startTick + n.durationTicks > startTick,
    )
    if (!notes.length) continue
    push({ startTick, endTick, kind: 'measure' })
  }

  // Prefer work at/after cursor; within that, playhead → phrase → measure.
  const kindRank = (k: ProposeSpan['kind']) =>
    k === 'playhead' ? 0 : k === 'uncovered' ? 1 : 2
  out.sort((a, b) => {
    const aAfter = a.startTick >= cursor - 1 ? 0 : 1
    const bAfter = b.startTick >= cursor - 1 ? 0 : 1
    if (aAfter !== bAfter) return aAfter - bAfter
    const kr = kindRank(a.kind) - kindRank(b.kind)
    if (kr !== 0) return kr
    return a.startTick - b.startTick
  })
  return out
}

/** Next single home-root proposal at/after the cursor, or null when done. */
export function nextHomeRootProposal(opts: {
  melody: readonly MelodyEvent[]
  pillars: readonly Pillar[]
  tonality: number
  mode?: TonalityMode
  cursorTick?: number
  measureTicks?: number
  skippedSpans?: ReadonlySet<string> | readonly string[]
}): PillarSuggestion | null {
  const mode = opts.mode ?? 'major'
  const positions = candidatePillarPositions({
    melody: opts.melody,
    pillars: opts.pillars,
    measureTicks: opts.measureTicks,
    cursorTick: opts.cursorTick,
    skippedSpans: opts.skippedSpans,
  })
  for (const pos of positions) {
    // Prefer creating where no pillar covers the start; skip locked.
    const hit = pillarSpanAtTick(opts.pillars, pos.startTick)
    if (hit?.confirmed) continue
    if (isSkipped(opts.skippedSpans, pos.startTick, pos.endTick)) continue
    const root = proposeRootForSpan({
      melody: opts.melody,
      startTick: pos.startTick,
      endTick: pos.endTick,
      tonality: opts.tonality,
      mode,
    })
    if (!root) continue
    return {
      rootPc: root.rootPc,
      startTick: pos.startTick,
      endTick: pos.endTick,
      confidence: root.confidence,
      reason: root.reason,
    }
  }
  return null
}
