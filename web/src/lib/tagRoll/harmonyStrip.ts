/**
 * Build display segments for the Tag Studio harmony strip (declared + detect rows).
 */
import {
  absoluteChordLabel,
  detectAltCandidateCount,
  type NatureNameCandidate,
} from '../../domain/arranging/chordAnalysisBar'
import {
  formatRomanWithAlt,
  romanForChordDetailed,
} from '../../domain/arranging/secondaryDominant'
import type { TonalityMode } from '../../domain/arranging/types'
import {
  authoritativeSketch,
  mergeDetectIntoSketchHoles,
  sketchLabel,
  type HarmonySketchDetectHole,
  type HarmonySketchSpan,
  natureToSketchQuality,
} from './harmonySketch'
import type { ChordStack } from '../../domain/arranging/types'
import { isKnownStack } from '../../domain/arranging/coachEntryMode'

export type HarmonyStripSegment = {
  id: string
  startTick: number
  endTick: number
  rootPc: number
  quality: string
  /** User/coach locked sketch. */
  locked: boolean
  /** Unlocked detect fill. */
  detect: boolean
  name: string
  nameOptions: string[]
  roman: string
  romanOptions: string[]
  displayName: string
  displayRoman: string
  /** Classic cadence hint for Detected tooltips. */
  cadenceLabel?: string
}

export type HarmonyStripRows = {
  declared: HarmonyStripSegment[]
  detect: HarmonyStripSegment[]
}

/** Convert live analysis stacks into detect-hole proposals.
 * Spans cover the stack’s sounding window only — never paint empty bars
 * between melody notes (end at duration, or the next onset if sooner).
 */
export function stacksToDetectHoles(
  stacks: readonly ChordStack[],
  lengthTicks: number,
): HarmonySketchDetectHole[] {
  const sorted = [...stacks]
    .filter((s) => s.midi || (s.natureId && s.natureId !== 'unknown'))
    .sort((a, b) => a.startTick - b.startTick)
  const out: HarmonySketchDetectHole[] = []
  for (let i = 0; i < sorted.length; i++) {
    const s = sorted[i]!
    const next = sorted[i + 1]
    const byDuration = s.startTick + Math.max(1, s.durationTicks)
    const byNext = next != null ? next.startTick : Number.POSITIVE_INFINITY
    const endTick = Math.max(
      s.startTick + 1,
      Math.min(byDuration, byNext, Math.max(s.startTick + 1, lengthTicks)),
    )
    out.push({
      startTick: s.startTick,
      endTick,
      rootPc: s.rootPc,
      quality: natureToSketchQuality(s.natureId),
    })
  }
  return out
}

function toSegment(
  s: HarmonySketchSpan,
  next: HarmonySketchSpan | undefined,
  opts: {
    tonality: number
    mode: TonalityMode
    preferFlats: boolean
    nameCandidatesByTick?: ReadonlyMap<
      number,
      readonly { rootPc: number; natureId: string; label: string; roman?: string; cadenceLabel?: string }[]
    >
    /** Fragment start → analysis tick for candidate lookup (sketch-split holes). */
    resolveCandidateTick?: (fragmentStartTick: number) => number
  },
  detectOnly: boolean,
): HarmonyStripSegment {
  const locked = s.locked && s.source !== 'detect'
  const name = sketchLabel(s, opts.preferFlats, opts.tonality, opts.mode)
  const detailed = romanForChordDetailed({
    rootPc: s.rootPc,
    natureId: s.quality,
    tonality: opts.tonality,
    mode: opts.mode,
    resolvesToRoot: next?.rootPc ?? null,
  })
  const roman = detailed.roman
  const displayRoman = formatRomanWithAlt(roman, detailed.altRoman)
  const candTick = opts.resolveCandidateTick?.(s.startTick) ?? s.startTick
  const tickCands = opts.nameCandidatesByTick?.get(candTick) ?? []
  const nameOptions = unique([
    name,
    ...(!locked ? tickCands.map((c) => c.label) : []),
  ])
  const romanOptions = unique([
    roman,
    ...(detailed.altRoman ? [detailed.altRoman] : []),
    displayRoman,
    ...(!locked ? (tickCands.map((c) => c.roman).filter(Boolean) as string[]) : []),
  ])
  const cadenceLabel =
    detectOnly && !locked
      ? tickCands.find((c) => c.rootPc === s.rootPc)?.cadenceLabel ??
        tickCands[0]?.cadenceLabel
      : undefined
  return {
    id: s.id,
    startTick: s.startTick,
    endTick: s.endTick,
    rootPc: s.rootPc,
    quality: s.quality,
    locked,
    detect: detectOnly,
    name,
    nameOptions,
    roman,
    romanOptions,
    displayName: name,
    displayRoman,
    cadenceLabel,
  }
}

/**
 * Apply Detected Alt picks per *fragment* startTick (after sketch splits a hole).
 * Candidates resolve via `resolveCandidateTick` (defaults to fragment start).
 */
export function applyDetectAltToDetectSpans(
  spans: readonly HarmonySketchSpan[],
  opts: {
    nameCandidatesByTick?: ReadonlyMap<number, readonly NatureNameCandidate[]>
    detectAltIndexByStartTick?: Readonly<Record<number, number>>
    resolveCandidateTick?: (fragmentStartTick: number) => number
  },
): HarmonySketchSpan[] {
  const alts = opts.detectAltIndexByStartTick
  const candsByTick = opts.nameCandidatesByTick
  if (!alts || !candsByTick) return spans as HarmonySketchSpan[]
  const resolve = opts.resolveCandidateTick ?? ((t: number) => t)
  return spans.map((s) => {
    if (s.source !== 'detect' || s.locked) return s
    const raw = alts[s.startTick] ?? 0
    if (raw <= 0) return s
    const cands = candsByTick.get(resolve(s.startTick))
    const n = detectAltCandidateCount(cands)
    if (n < 2 || !cands) return s
    const pick = cands[Math.min(raw, n - 1)]
    if (!pick) return s
    const quality = natureToSketchQuality(pick.natureId)
    if (pick.rootPc === s.rootPc && quality === s.quality) return s
    return {
      ...s,
      rootPc: pick.rootPc,
      quality,
      id: `det:${s.startTick}:${s.endTick}:${pick.rootPc}:${quality}`,
    }
  })
}

/** Separate declared (authoritative) and detect-only rows for the dual-lane strip. */
export function buildHarmonyStripRows(opts: {
  sketch: readonly HarmonySketchSpan[]
  detectStacks: readonly ChordStack[]
  tonality: number
  tonalityMode?: TonalityMode
  preferFlats: boolean
  lengthTicks: number
  /** When set, drop detect spans that overlap no sounding notes. */
  notes?: readonly { startTick: number; durationTicks: number }[]
  nameCandidatesByTick?: ReadonlyMap<
    number,
    readonly { rootPc: number; natureId: string; label: string; roman?: string; cadenceLabel?: string }[]
  >
  /**
   * Detected Alt index keyed by fragment startTick (independent for sketch-split halves).
   */
  detectAltIndexByStartTick?: Readonly<Record<number, number>>
  /** Map Detected fragment start → analysis-stack tick for ranked candidates. */
  resolveCandidateTick?: (fragmentStartTick: number) => number
}): HarmonyStripRows {
  const mode = opts.tonalityMode ?? 'major'
  const declaredSpans = authoritativeSketch(opts.sketch)
  const detectHoles = stacksToDetectHoles(opts.detectStacks, opts.lengthTicks)
  const merged = mergeDetectIntoSketchHoles(opts.sketch, detectHoles)
  let detectOnly = merged.filter((s) => s.source === 'detect' && !s.locked)
  if (opts.notes) {
    detectOnly = detectOnly.filter((s) =>
      opts.notes!.some(
        (n) => n.startTick < s.endTick && n.startTick + n.durationTicks > s.startTick,
      ),
    )
  }
  detectOnly = applyDetectAltToDetectSpans(detectOnly, {
    nameCandidatesByTick: opts.nameCandidatesByTick as
      | ReadonlyMap<number, readonly NatureNameCandidate[]>
      | undefined,
    detectAltIndexByStartTick: opts.detectAltIndexByStartTick,
    resolveCandidateTick: opts.resolveCandidateTick,
  })

  const baseOpts = {
    tonality: opts.tonality,
    mode,
    preferFlats: opts.preferFlats,
    nameCandidatesByTick: opts.nameCandidatesByTick,
    resolveCandidateTick: opts.resolveCandidateTick,
  }

  const declared: HarmonyStripSegment[] = declaredSpans.map((s, i) =>
    toSegment(s, declaredSpans[i + 1], baseOpts, false),
  )
  const detect: HarmonyStripSegment[] = detectOnly.map((s, i) =>
    toSegment(s, detectOnly[i + 1], baseOpts, true),
  )
  return { declared, detect }
}

/** @deprecated Prefer {@link buildHarmonyStripRows}. */
export function buildHarmonyStripSegments(opts: {
  sketch: readonly HarmonySketchSpan[]
  detectStacks: readonly ChordStack[]
  tonality: number
  tonalityMode?: TonalityMode
  preferFlats: boolean
  lengthTicks: number
  nameCandidatesByTick?: ReadonlyMap<
    number,
    readonly { rootPc: number; natureId: string; label: string; roman?: string }[]
  >
}): HarmonyStripSegment[] {
  const rows = buildHarmonyStripRows(opts)
  return [...rows.declared, ...rows.detect].sort((a, b) => a.startTick - b.startTick)
}

function unique(labels: readonly string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const l of labels) {
    const t = l.trim()
    if (!t || seen.has(t)) continue
    seen.add(t)
    out.push(t)
  }
  return out
}

/** @deprecated keep for stack-locked detection helpers */
export function stackIsLockedSketchSource(s: ChordStack): boolean {
  return isKnownStack(s)
}

export function absoluteFromSketch(
  rootPc: number,
  quality: string,
  preferFlats: boolean,
  tonality: number,
  mode: TonalityMode,
): string {
  return absoluteChordLabel(rootPc, quality, preferFlats, { tonality, tonalityMode: mode })
}
