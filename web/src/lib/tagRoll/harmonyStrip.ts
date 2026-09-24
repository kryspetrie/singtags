/**
 * Build display segments for the Tag Studio harmony strip (declared + detect rows).
 */
import { absoluteChordLabel } from '../../domain/arranging/chordAnalysisBar'
import type { TonalityMode } from '../../domain/arranging/types'
import {
  authoritativeSketch,
  mergeDetectIntoSketchHoles,
  sketchLabel,
  sketchRoman,
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
  },
  detectOnly: boolean,
): HarmonyStripSegment {
  const locked = s.locked && s.source !== 'detect'
  const name = sketchLabel(s, opts.preferFlats, opts.tonality, opts.mode)
  const roman = sketchRoman(s, opts.tonality, opts.mode, next?.rootPc)
  const tickCands = opts.nameCandidatesByTick?.get(s.startTick) ?? []
  const nameOptions = unique([
    name,
    ...(!locked ? tickCands.map((c) => c.label) : []),
  ])
  const romanOptions = unique([
    roman,
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
    displayRoman: roman,
    cadenceLabel,
  }
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

  const baseOpts = {
    tonality: opts.tonality,
    mode,
    preferFlats: opts.preferFlats,
    nameCandidatesByTick: opts.nameCandidatesByTick,
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
