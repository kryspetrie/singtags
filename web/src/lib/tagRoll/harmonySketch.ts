/**
 * Harmony sketch: lead-sheet style chord spans on a Tag Studio project.
 * Locked user spans are authoritative; detect only fills holes.
 */
import { absoluteChordLabel, natureSuffix } from '../../domain/arranging/chordAnalysisBar'
import { BARBERSHOP_CHORDS } from '../../domain/arranging/chords/chords'
import {
  degreeOf,
  formatRomanWithAlt,
  romanForChordDetailed,
} from '../../domain/arranging/secondaryDominant'
import type { TonalityMode } from '../../domain/arranging/types'
import { allocatePrefixedId } from './ids'
import {
  HARMONY_SKETCH_QUALITIES,
  type HarmonySketchQuality,
  type HarmonySketchSpan,
} from './types'

export type { HarmonySketchQuality, HarmonySketchSpan }
export { HARMONY_SKETCH_QUALITIES }

export type HarmonySketchDetectHole = {
  startTick: number
  endTick: number
  rootPc: number
  quality: HarmonySketchQuality
}

const QUALITY_SET = new Set<string>(HARMONY_SKETCH_QUALITIES)

export function isHarmonySketchQuality(q: string): q is HarmonySketchQuality {
  return QUALITY_SET.has(q)
}

/** Map stack/detect nature → sketch quality (unknown → major). */
export function natureToSketchQuality(natureId: string): HarmonySketchQuality {
  return trySketchQualityFromNature(natureId) ?? 'major'
}

/**
 * Map nature → sketch quality, or null when unrecognized / blank / empty.
 * Use for Complete-from-parts / Lock gates so unknown never becomes major.
 */
export function trySketchQualityFromNature(natureId: string): HarmonySketchQuality | null {
  if (!natureId || natureId === 'unknown' || natureId === 'blank') return null
  if (isHarmonySketchQuality(natureId)) {
    return isBlankSketchQuality(natureId) ? null : natureId
  }
  if (natureId === 'halfdim' || natureId === 'half_dim') return 'half-dim'
  return null
}

/** Timing placeholder — no sounding chord yet. */
export function isBlankSketchQuality(quality: string): boolean {
  return quality === 'blank'
}

/** Empty / dash / ? → blank placeholder chord. */
export function isBlankHarmonyEntry(raw: string): boolean {
  const t = raw.trim()
  return !t || /^(—|-|–|−|\?|blank)$/i.test(t)
}

/** Melody-note window → locked sketch span fields for Harmonize commits. */
export function sketchPatchFromMelodyNote(opts: {
  melodyStartTick: number
  melodyDurationTicks: number
  rootPc: number
  quality: string
  id?: string
}): Omit<HarmonySketchSpan, 'id'> & { id?: string } {
  const startTick = Math.max(0, Math.round(opts.melodyStartTick))
  const endTick = Math.max(startTick + 1, startTick + Math.max(1, Math.round(opts.melodyDurationTicks)))
  return {
    id: opts.id,
    startTick,
    endTick,
    rootPc: ((opts.rootPc % 12) + 12) % 12,
    quality: natureToSketchQuality(opts.quality),
    source: 'user',
    locked: true,
    pillar: true,
  }
}

export function normalizeHarmonySketchSpan(raw: unknown): HarmonySketchSpan | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const startTick = Math.max(0, Math.round(Number(o.startTick) || 0))
  const endTick = Math.max(startTick + 1, Math.round(Number(o.endTick) || startTick + 1))
  const rootPc = ((Math.round(Number(o.rootPc) || 0) % 12) + 12) % 12
  const qRaw = typeof o.quality === 'string' ? o.quality : typeof o.natureId === 'string' ? o.natureId : 'major'
  const quality = natureToSketchQuality(qRaw)
  const source =
    o.source === 'detect' || o.source === 'coach' || o.source === 'user' ? o.source : 'user'
  const locked =
    typeof o.locked === 'boolean' ? o.locked : source === 'detect' ? false : true
  const pillar =
    typeof o.pillar === 'boolean' ? o.pillar : locked
  return {
    id: typeof o.id === 'string' && o.id.trim() ? o.id.trim() : allocatePrefixedId('hs'),
    startTick,
    endTick,
    rootPc,
    quality,
    source,
    locked,
    pillar,
  }
}

export function normalizeHarmonySketch(raw: unknown): HarmonySketchSpan[] {
  if (!Array.isArray(raw)) return []
  const out: HarmonySketchSpan[] = []
  for (const item of raw) {
    const s = normalizeHarmonySketchSpan(item)
    if (s) out.push(s)
  }
  return sortSpans(out)
}

export function sortSpans(spans: readonly HarmonySketchSpan[]): HarmonySketchSpan[] {
  return [...spans].sort((a, b) => a.startTick - b.startTick || a.endTick - b.endTick)
}

/** Locked spans only — Declared row / Hear. Unlock drafts stay out of Declared. */
export function authoritativeSketch(spans: readonly HarmonySketchSpan[]): HarmonySketchSpan[] {
  return sortSpans(spans.filter((s) => s.locked))
}

/**
 * Next / previous locked Sketch span for Harmonize Tab / Shift+Tab walk.
 * Prefers `spanId` when present; otherwise the span covering `tick`; holes jump
 * to the nearest neighbor in `dir`.
 */
export function stepAuthoritativeSketchSpan(
  sketch: readonly HarmonySketchSpan[],
  from: { spanId?: string | null; tick: number },
  dir: -1 | 1,
): HarmonySketchSpan | null {
  const list = authoritativeSketch(sketch)
  if (!list.length) return null

  let idx = -1
  if (from.spanId) idx = list.findIndex((s) => s.id === from.spanId)
  if (idx < 0) {
    idx = list.findIndex((s) => s.startTick <= from.tick && from.tick < s.endTick)
  }
  if (idx >= 0) return list[idx + dir] ?? null

  if (dir > 0) {
    return list.find((s) => s.startTick >= from.tick) ?? null
  }
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i]!.startTick <= from.tick) return list[i]!
  }
  return null
}

/** Locked spans marked as structural home-roots for Coach. */
export function isPillarSketchSpan(s: Pick<HarmonySketchSpan, 'locked' | 'pillar'>): boolean {
  return s.locked && s.pillar !== false
}

export function pillarSketch(spans: readonly HarmonySketchSpan[]): HarmonySketchSpan[] {
  return authoritativeSketch(spans).filter(isPillarSketchSpan)
}

/**
 * Fill gaps between authoritative spans with detect proposals (never overwrite locked).
 */
export function mergeDetectIntoSketchHoles(
  sketch: readonly HarmonySketchSpan[],
  detect: readonly HarmonySketchDetectHole[],
): HarmonySketchSpan[] {
  const base = authoritativeSketch(sketch)
  const occupied = base.map((s) => ({ start: s.startTick, end: s.endTick }))
  const extras: HarmonySketchSpan[] = []
  for (const d of detect) {
    if (d.endTick <= d.startTick) continue
    let cursor = d.startTick
    const end = d.endTick
    while (cursor < end) {
      const blocker = occupied.find((o) => o.start < end && o.end > cursor)
      if (!blocker) {
        extras.push({
          id: `det:${cursor}:${end}:${d.rootPc}:${d.quality}`,
          startTick: cursor,
          endTick: end,
          rootPc: d.rootPc,
          quality: d.quality,
          source: 'detect',
          locked: false,
        })
        break
      }
      if (blocker.start > cursor) {
        extras.push({
          id: `det:${cursor}:${Math.min(blocker.start, end)}:${d.rootPc}:${d.quality}`,
          startTick: cursor,
          endTick: Math.min(blocker.start, end),
          rootPc: d.rootPc,
          quality: d.quality,
          source: 'detect',
          locked: false,
        })
      }
      cursor = Math.max(cursor, blocker.end)
    }
  }
  return sortSpans([...base, ...extras])
}

export function upsertSketchSpan(
  spans: readonly HarmonySketchSpan[],
  patch: Omit<HarmonySketchSpan, 'id'> & { id?: string },
): HarmonySketchSpan[] {
  const id = patch.id ?? allocatePrefixedId('hs')
  const quality = natureToSketchQuality(patch.quality)
  const next: HarmonySketchSpan = {
    id,
    startTick: patch.startTick,
    endTick: Math.max(patch.startTick + 1, patch.endTick),
    rootPc: ((patch.rootPc % 12) + 12) % 12,
    quality,
    source: patch.source,
    locked: patch.locked,
    // Blank placeholders are never structural homes.
    pillar: patch.locked && !isBlankSketchQuality(quality) ? patch.pillar !== false : false,
  }
  // Replace overlapping authoritative spans when writing a locked user span.
  const kept = spans.filter((s) => {
    if (s.id === id) return false
    if (!next.locked) return true
    if (s.source === 'detect' && !s.locked) {
      return s.endTick <= next.startTick || s.startTick >= next.endTick
    }
    if (next.locked && (s.locked || s.source === 'user' || s.source === 'coach')) {
      return s.endTick <= next.startTick || s.startTick >= next.endTick
    }
    return true
  })
  return sortSpans([...kept, next])
}

/**
 * Insert a locked Sketch chord by carving through overlapping spans (left/right
 * remnants keep the prior root/quality). Used for passing / NCT fills so the
 * covering pillar is not deleted wholesale.
 */
/**
 * Split one locked Sketch span at `tick` into left + right remnants
 * (same root/quality/pillar/source). Returns null when tick is not strictly inside.
 */
export function splitSketchSpanAt(
  spans: readonly HarmonySketchSpan[],
  id: string,
  tick: number,
): HarmonySketchSpan[] | null {
  const t = Math.round(tick)
  const s = spans.find((x) => x.id === id)
  if (!s?.locked) return null
  if (!(s.startTick < t && t < s.endTick)) return null
  if (t - s.startTick < 1 || s.endTick - t < 1) return null
  const left: HarmonySketchSpan = { ...s, endTick: t }
  const right: HarmonySketchSpan = {
    ...s,
    id: allocatePrefixedId('hs'),
    startTick: t,
  }
  return sortSpans([...spans.filter((x) => x.id !== id), left, right])
}

export function carveInsertSketchSpan(
  spans: readonly HarmonySketchSpan[],
  patch: {
    startTick: number
    endTick: number
    rootPc: number
    quality: string
    id?: string
    source?: HarmonySketchSpan['source']
    locked?: boolean
    /** Passing inserts default to non-pillar; structural homes stay on remnants. */
    pillar?: boolean
  },
): HarmonySketchSpan[] {
  const start = Math.max(0, Math.round(patch.startTick))
  const end = Math.max(start + 1, Math.round(patch.endTick))
  const locked = patch.locked !== false
  const insert: HarmonySketchSpan = {
    id: patch.id ?? allocatePrefixedId('hs'),
    startTick: start,
    endTick: end,
    rootPc: ((patch.rootPc % 12) + 12) % 12,
    quality: natureToSketchQuality(patch.quality),
    source: patch.source ?? 'coach',
    locked,
    pillar: locked ? patch.pillar === true : false,
  }

  const out: HarmonySketchSpan[] = []
  for (const s of spans) {
    if (s.id === insert.id) continue
    // No overlap
    if (s.endTick <= start || s.startTick >= end) {
      out.push(s)
      continue
    }
    // Drop unlocked detect that sits under the insert window.
    if (s.source === 'detect' && !s.locked) {
      if (s.startTick < start) {
        out.push({ ...s, endTick: Math.min(s.endTick, start) })
      }
      if (s.endTick > end) {
        out.push({
          ...s,
          id: allocatePrefixedId('hs'),
          startTick: Math.max(s.startTick, end),
        })
      }
      continue
    }
    // Carve locked / user / coach spans into remnants around the insert.
    if (s.startTick < start) {
      out.push({ ...s, endTick: start })
    }
    if (s.endTick > end) {
      out.push({
        ...s,
        id: allocatePrefixedId('hs'),
        startTick: end,
      })
    }
  }
  out.push(insert)
  return sortSpans(out)
}

export function removeSketchSpan(
  spans: readonly HarmonySketchSpan[],
  id: string,
): HarmonySketchSpan[] {
  return spans.filter((s) => s.id !== id)
}

export type HarmonyAbsorbNeighbor = {
  id?: string
  startTick: number
  endTick: number
  rootPc: number
  quality: HarmonySketchQuality
}

/**
 * Remove a Sketch/Detected span and leave empty time (do not stretch neighbors).
 * Neighbors are accepted for call-site compatibility but unused.
 * Detected-row analysis may still propose chords in the hole; Declared stays empty.
 */
export function absorbHarmonySpanRemoval(
  sketch: readonly HarmonySketchSpan[],
  removal: { id: string; startTick: number; endTick: number },
  _adjacent?: { left?: HarmonyAbsorbNeighbor | null; right?: HarmonyAbsorbNeighbor | null },
): HarmonySketchSpan[] {
  const start = Math.max(0, Math.round(removal.startTick))
  const end = Math.max(start + 1, Math.round(removal.endTick))
  return sketch.filter((s) => {
    if (s.id === removal.id) return false
    // Synthetic Detect ids may not match persisted sketch ids — drop exact window.
    if (s.startTick === start && s.endTick === end) return false
    return true
  })
}

export function sketchSpanAtTick(
  spans: readonly HarmonySketchSpan[],
  tick: number,
): HarmonySketchSpan | null {
  return (
    sortSpans(spans).find((s) => s.startTick <= tick && tick < s.endTick) ?? null
  )
}

export function sketchLabel(
  span: Pick<HarmonySketchSpan, 'rootPc' | 'quality'>,
  preferFlats: boolean,
  tonality: number,
  tonalityMode: TonalityMode,
): string {
  if (isBlankSketchQuality(span.quality)) return '—'
  return absoluteChordLabel(span.rootPc, span.quality, preferFlats, {
    tonality,
    tonalityMode,
  })
}

export function sketchRoman(
  span: Pick<HarmonySketchSpan, 'rootPc' | 'quality'>,
  tonality: number,
  tonalityMode: TonalityMode,
  nextRootPc?: number | null,
): string {
  if (isBlankSketchQuality(span.quality)) return '—'
  return romanForChordDetailed({
    rootPc: span.rootPc,
    natureId: span.quality,
    tonality,
    mode: tonalityMode,
    resolvesToRoot: nextRootPc ?? null,
  }).roman
}

/** Number-mode cell label with optional alt, e.g. `V7/V (II7)`. */
export function sketchRomanDisplay(
  span: Pick<HarmonySketchSpan, 'rootPc' | 'quality'>,
  tonality: number,
  tonalityMode: TonalityMode,
  nextRootPc?: number | null,
): string {
  if (isBlankSketchQuality(span.quality)) return '—'
  const d = romanForChordDetailed({
    rootPc: span.rootPc,
    natureId: span.quality,
    tonality,
    mode: tonalityMode,
    resolvesToRoot: nextRootPc ?? null,
  })
  return formatRomanWithAlt(d.roman, d.altRoman)
}

export function qualityChipLabel(quality: HarmonySketchQuality): string {
  if (quality === 'blank') return '—'
  if (quality === 'major') return 'maj'
  if (quality === 'minor') return 'm'
  if (quality === 'seventh') return '7'
  if (quality === 'm7') return 'm7'
  if (quality === 'dim') return 'dim'
  if (quality === 'dim7') return 'dim7'
  if (quality === 'half-dim') return 'ø'
  if (quality === 'add9') return 'add9'
  return natureSuffix(quality) || quality
}

/**
 * Close-position block chord — DEPRECATED for Hear.
 * Prefer {@link sketchHearMidis} from `./sketchHearVoicing` (TTBB mid-range).
 * Kept only so older tests can assert catalog tone sets if needed.
 */
export function blockChordMidis(opts: {
  rootPc: number
  quality: HarmonySketchQuality
  leadMidi: number
}): number[] {
  const chord =
    BARBERSHOP_CHORDS.find((c) => c.id === opts.quality) ??
    BARBERSHOP_CHORDS.find((c) => c.id === 'major')!

  const toneOffs = [
    ...new Set(
      (Object.values(chord.offsets) as (number | undefined)[]).filter(
        (o): o is number => o != null,
      ),
    ),
  ].sort((a, b) => a - b)

  let root = opts.rootPc
  while (root + 12 <= opts.leadMidi - 8) root += 12
  while (root > opts.leadMidi - 5) root -= 12

  const out = toneOffs.map((o) => {
    let m = root + o
    while (m > opts.leadMidi + 2) m -= 12
    while (m < root) m += 12
    return m
  })
  out.push(opts.leadMidi)
  return [...new Set(out)].sort((a, b) => a - b)
}

/** Pillars ↔ sketch: locked sketch spans as pillar-shaped destinations. */
export function sketchToPillarFields(span: HarmonySketchSpan): {
  rootPc: number
  startTick: number
  endTick: number
  confirmed: boolean
} {
  return {
    rootPc: span.rootPc,
    startTick: span.startTick,
    endTick: span.endTick,
    confirmed: span.locked,
  }
}

export function pillarToSketchSpan(opts: {
  id?: string
  rootPc: number
  startTick: number
  endTick: number
  confirmed: boolean
  quality?: HarmonySketchQuality
}): HarmonySketchSpan {
  return {
    id: opts.id ?? allocatePrefixedId('hs'),
    startTick: opts.startTick,
    endTick: Math.max(opts.startTick + 1, opts.endTick),
    rootPc: opts.rootPc,
    quality: opts.quality ?? 'major',
    source: 'coach',
    locked: opts.confirmed,
    pillar: opts.confirmed,
  }
}

/** Pillar-marked locked sketch → coach pillars (quality stays on the sketch). */
export function pillarsFromHarmonySketch(
  sketch: readonly HarmonySketchSpan[],
  nextId: (prefix: string) => string,
): Array<{
  id: string
  rootPc: number
  startTick: number
  endTick: number
  source: 'user' | 'inferred'
  confirmed: boolean
}> {
  return pillarSketch(sketch).map((s) => ({
    id: nextId('pil'),
    rootPc: s.rootPc,
    startTick: s.startTick,
    endTick: s.endTick,
    source: s.source === 'coach' ? ('inferred' as const) : ('user' as const),
    confirmed: true,
  }))
}

/**
 * Upsert confirmed coach pillars into locked+pillar sketch spans.
 * Preserves locked non-pillar Declared chords; drops unlocked drafts.
 */
export function replaceSketchFromPillars(
  sketch: readonly HarmonySketchSpan[],
  pillars: readonly {
    id: string
    rootPc: number
    startTick: number
    endTick: number
    confirmed: boolean
  }[],
): HarmonySketchSpan[] {
  const prev = authoritativeSketch(sketch)
  const confirmed = pillars.filter((p) => p.confirmed)
  const nonPillar = prev.filter((s) => !isPillarSketchSpan(s))
  const out: HarmonySketchSpan[] = []
  for (const pil of confirmed) {
    const hit = prev.find(
      (s) =>
        s.id === pil.id ||
        (s.startTick === pil.startTick && s.endTick === pil.endTick) ||
        (s.startTick < pil.endTick && pil.startTick < s.endTick && s.rootPc === pil.rootPc),
    )
    out.push({
      id: hit?.id ?? (pil.id.startsWith('hs') ? pil.id : allocatePrefixedId('hs')),
      startTick: pil.startTick,
      endTick: Math.max(pil.startTick + 1, pil.endTick),
      rootPc: ((pil.rootPc % 12) + 12) % 12,
      quality: hit?.quality ?? 'major',
      source: hit?.source === 'user' ? 'user' : 'coach',
      locked: true,
      pillar: true,
    })
  }
  for (const s of nonPillar) {
    if (out.some((p) => s.startTick < p.endTick && p.startTick < s.endTick)) continue
    out.push({ ...s, locked: true, pillar: false })
  }
  return sortSpans(out)
}

/**
 * @deprecated Prefer {@link replaceSketchFromPillars} for coach→sketch sync (drops orphans).
 * Additive merge kept for callers that only upsert.
 */
export function mergePillarsIntoSketch(
  sketch: readonly HarmonySketchSpan[],
  pillars: readonly {
    id: string
    rootPc: number
    startTick: number
    endTick: number
    confirmed: boolean
  }[],
): HarmonySketchSpan[] {
  return replaceSketchFromPillars(sketch, pillars)
}

export function degreeHint(rootPc: number, tonality: number): number {
  return degreeOf(rootPc, tonality)
}

export type SketchApplyTarget = {
  startTick: number
  endTick: number
  durationTicks: number
  /** When replacing a selected Sketch span, keep its id. */
  spanId?: string
  source: 'selectedSketch' | 'inspect' | 'moment' | 'melody' | 'measure'
}

/**
 * Where Harmonize / Coach Apply should write Sketch:
 * selected Sketch span(s) → inspect/chord-cursor range → Suggest moment →
 * melody note → +1 measure at playhead.
 */
export function resolveSketchApplyTarget(opts: {
  playheadTick: number
  measureTicks: number
  selectedSpans?: readonly { id: string; startTick: number; endTick: number }[] | null
  inspectRange?: { startTick: number; endTick: number } | null
  momentWindow?: { startTick: number; durationTicks: number } | null
  melodyNote?: { startTick: number; durationTicks: number } | null
}): SketchApplyTarget {
  const selected = (opts.selectedSpans ?? []).filter((s) => s.endTick > s.startTick)
  if (selected.length === 1) {
    const s = selected[0]!
    return {
      startTick: s.startTick,
      endTick: s.endTick,
      durationTicks: s.endTick - s.startTick,
      spanId: s.id,
      source: 'selectedSketch',
    }
  }
  if (selected.length > 1) {
    const startTick = Math.min(...selected.map((s) => s.startTick))
    const endTick = Math.max(...selected.map((s) => s.endTick))
    return {
      startTick,
      endTick,
      durationTicks: Math.max(1, endTick - startTick),
      source: 'selectedSketch',
    }
  }
  const inspect = opts.inspectRange
  if (inspect && inspect.endTick > inspect.startTick) {
    return {
      startTick: inspect.startTick,
      endTick: inspect.endTick,
      durationTicks: inspect.endTick - inspect.startTick,
      source: 'inspect',
    }
  }
  const moment = opts.momentWindow
  if (moment && moment.durationTicks > 0) {
    const startTick = Math.max(0, Math.round(moment.startTick))
    const durationTicks = Math.max(1, Math.round(moment.durationTicks))
    return {
      startTick,
      endTick: startTick + durationTicks,
      durationTicks,
      source: 'moment',
    }
  }
  const mel = opts.melodyNote
  if (mel && mel.durationTicks > 0) {
    return {
      startTick: mel.startTick,
      endTick: mel.startTick + mel.durationTicks,
      durationTicks: mel.durationTicks,
      source: 'melody',
    }
  }
  const m = Math.max(1, opts.measureTicks)
  const start = Math.floor(Math.max(0, opts.playheadTick) / m) * m
  return {
    startTick: start,
    endTick: start + m,
    durationTicks: m,
    source: 'measure',
  }
}

/**
 * Shared declare window: inspect range → melody note under playhead → +1 measure.
 * Keeps strip typeahead and Harmonize melody windows aligned.
 */
export function sketchWindowAtPlayhead(opts: {
  playheadTick: number
  measureTicks: number
  selectedSpans?: readonly { id: string; startTick: number; endTick: number }[] | null
  inspectRange?: { startTick: number; endTick: number } | null
  momentWindow?: { startTick: number; durationTicks: number } | null
  melodyNote?: { startTick: number; durationTicks: number } | null
}): { startTick: number; endTick: number } {
  const t = resolveSketchApplyTarget(opts)
  return { startTick: t.startTick, endTick: t.endTick }
}
export {
  HARMONY_ENTRY_BROWSE_LIMIT,
  formatSketchOption,
  parseChordNameToSketch,
  parseHarmonyEntry,
  parseRomanToSketch,
  suggestHarmonyEntries,
} from './harmonySketchEntry'
export type { HarmonyEntrySuggestion } from './harmonySketchEntry'
