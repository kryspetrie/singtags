/**
 * Harmony sketch: lead-sheet style chord spans on a Tag Studio project.
 * Locked user spans are authoritative; detect only fills holes.
 */
import { absoluteChordLabel, natureSuffix } from '../../domain/arranging/chordAnalysisBar'
import { BARBERSHOP_CHORDS, pcName } from '../../domain/arranging/chords/chords'
import {
  degreeOf,
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
  if (isHarmonySketchQuality(natureId)) return natureId
  if (natureId === 'unknown' || !natureId) return 'major'
  return 'major'
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
  return {
    id: typeof o.id === 'string' && o.id.trim() ? o.id.trim() : allocatePrefixedId('hs'),
    startTick,
    endTick,
    rootPc,
    quality,
    source,
    locked,
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

/** Locked spans only — Declared row / pillars / Hear. Unlock drafts stay out of Declared. */
export function authoritativeSketch(spans: readonly HarmonySketchSpan[]): HarmonySketchSpan[] {
  return sortSpans(spans.filter((s) => s.locked))
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
  const next: HarmonySketchSpan = {
    id,
    startTick: patch.startTick,
    endTick: Math.max(patch.startTick + 1, patch.endTick),
    rootPc: ((patch.rootPc % 12) + 12) % 12,
    quality: patch.quality,
    source: patch.source,
    locked: patch.locked,
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

export function removeSketchSpan(
  spans: readonly HarmonySketchSpan[],
  id: string,
): HarmonySketchSpan[] {
  return spans.filter((s) => s.id !== id)
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
  return romanForChordDetailed({
    rootPc: span.rootPc,
    natureId: span.quality,
    tonality,
    mode: tonalityMode,
    resolvesToRoot: nextRootPc ?? null,
  }).roman
}

export function qualityChipLabel(quality: HarmonySketchQuality): string {
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

/**
 * Parse common RN tokens into root + quality given key.
 * Supports I–VII, ♭/♯ accidentals, 7 / m7 / maj7.
 */
export function parseRomanToSketch(
  raw: string,
  tonality: number,
  mode: TonalityMode,
): { rootPc: number; quality: HarmonySketchQuality } | null {
  let s = raw.trim().replace(/\s+/g, '')
  if (!s) return null
  s = s.replace(/b/gi, '♭').replace(/#/g, '♯')

  let quality: HarmonySketchQuality = 'major'
  // Dim / half-dim before m7 (else viidim7 matches trailing m7).
  if (/maj7$/i.test(s)) {
    quality = 'maj7'
    s = s.replace(/maj7$/i, '')
  } else if (/°7$|dim7$/i.test(s)) {
    quality = 'dim7'
    s = s.replace(/°7$|dim7$/i, '')
  } else if (/ø7$|hdim7$|halfdim7$/i.test(s)) {
    quality = 'half-dim'
    s = s.replace(/ø7$|hdim7$|halfdim7$/i, '')
  } else if (/ø$|hdim$|halfdim$/i.test(s)) {
    quality = 'half-dim'
    s = s.replace(/ø$|hdim$|halfdim$/i, '')
  } else if (/°$|(?<![a-z])dim$/i.test(s) || /dim$/i.test(s)) {
    // plain dim triad (after dim7 handled above)
    quality = 'dim'
    s = s.replace(/°$/i, '').replace(/dim$/i, '')
  } else if (/m7$/i.test(s) || /min7$/i.test(s)) {
    quality = 'm7'
    s = s.replace(/m(in)?7$/i, '')
  } else if (/7$/.test(s)) {
    quality = 'seventh'
    s = s.replace(/7$/, '')
  } else if (/\+$|aug$/i.test(s)) {
    quality = 'aug'
    s = s.replace(/\+$|aug$/i, '')
  } else if (/add9$/i.test(s)) {
    quality = 'add9'
    s = s.replace(/add9$/i, '')
  }

  const map: Record<string, number> = {
    I: 0,
    II: 2,
    III: 4,
    IV: 5,
    V: 7,
    VI: 9,
    VII: 11,
    i: 0,
    ii: 2,
    iii: 4,
    iv: 5,
    v: 7,
    vi: 9,
    vii: 11,
  }

  let accidental = 0
  if (s.startsWith('♭')) {
    accidental = -1
    s = s.slice(1)
  } else if (s.startsWith('♯')) {
    accidental = 1
    s = s.slice(1)
  }

  const numeral = s
  const base = map[numeral]
  if (base == null) return null

  // Lowercase (non-I/V dominant conventions) → minor triad when no 7 set
  if (quality === 'major' && numeral === numeral.toLowerCase() && !['v'].includes(numeral)) {
    quality = 'minor'
  }
  // In major, lowercase ii/iii/vi are minor; v alone is rare — keep major if V was upper
  if (mode === 'major' && numeral === numeral.toLowerCase() && quality === 'major') {
    quality = 'minor'
  }

  const rootPc = (((tonality + base + accidental) % 12) + 12) % 12
  return { rootPc, quality }
}

/** Parse absolute chord token like G7, Am, Bbmaj7. */
export function parseChordNameToSketch(
  raw: string,
  _preferFlats: boolean,
): { rootPc: number; quality: HarmonySketchQuality } | null {
  let s = raw.trim().replace(/\s+/g, '')
  if (!s) return null
  const m = s.match(/^([A-Ga-g])([#♯b♭]?)(.*)$/)
  if (!m) return null
  const letter = m[1]!.toUpperCase()
  const acc = m[2] ?? ''
  const rest = (m[3] ?? '').toLowerCase()
  const natural: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
  let rootPc = natural[letter]
  if (rootPc == null) return null
  if (acc === '#' || acc === '♯') rootPc = (rootPc + 1) % 12
  if (acc === 'b' || acc === '♭') rootPc = (rootPc + 11) % 12

  let quality: HarmonySketchQuality = 'major'
  if (!rest || rest === 'maj' || rest === 'm') {
    quality = rest === 'm' ? 'minor' : 'major'
  } else if (rest === '7' || rest === 'dom7') quality = 'seventh'
  else if (rest === 'm7' || rest === 'min7') quality = 'm7'
  else if (rest === 'maj7' || rest === 'Δ' || rest === 'Δ7') quality = 'maj7'
  else if (rest === 'dim7' || rest === '°7' || rest === 'o7') quality = 'dim7'
  else if (rest === 'dim' || rest === '°' || rest === 'o') quality = 'dim'
  else if (rest === 'ø' || rest === 'ø7' || rest === 'hdim' || rest === 'halfdim' || rest === 'm7b5')
    quality = 'half-dim'
  else if (rest === 'aug' || rest === '+') quality = 'aug'
  else if (rest === '6') quality = 'sixth'
  else if (rest === 'm6') quality = 'madd6'
  else if (rest === '9' || rest === '7(9)') quality = 'ninth'
  else if (rest === 'add9' || rest === 'add9th') quality = 'add9'
  else {
    // Unknown quality — do not silently coerce to major.
    return null
  }
  return { rootPc, quality }
}

export function parseHarmonyEntry(
  raw: string,
  opts: { tonality: number; mode: TonalityMode; preferFlats: boolean; entryMode: 'name' | 'roman' },
): { rootPc: number; quality: HarmonySketchQuality } | null {
  if (opts.entryMode === 'roman') {
    return parseRomanToSketch(raw, opts.tonality, opts.mode) ?? parseChordNameToSketch(raw, opts.preferFlats)
  }
  return parseChordNameToSketch(raw, opts.preferFlats) ?? parseRomanToSketch(raw, opts.tonality, opts.mode)
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
  }
}

/** Locked sketch → coach pillars (quality stays on the sketch). */
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
  return authoritativeSketch(sketch).map((s) => ({
    id: nextId('pil'),
    rootPc: s.rootPc,
    startTick: s.startTick,
    endTick: s.endTick,
    source: s.source === 'coach' ? ('inferred' as const) : ('user' as const),
    confirmed: s.locked,
  }))
}

/**
 * Replace locked sketch from **confirmed** coach pillars only.
 * Unconfirmed drafts stay coach-session-only until Lock (never paint as Declared).
 * Preserves quality from matching prior spans; drops spans not in confirmed pillars.
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
  const out: HarmonySketchSpan[] = []
  for (const pil of pillars) {
    if (!pil.confirmed) continue
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
    })
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

/**
 * Shared declare window: inspect range → melody note under playhead → +1 measure.
 * Keeps strip typeahead and Harmonize melody windows aligned.
 */
export function sketchWindowAtPlayhead(opts: {
  playheadTick: number
  measureTicks: number
  inspectRange?: { startTick: number; endTick: number } | null
  melodyNote?: { startTick: number; durationTicks: number } | null
}): { startTick: number; endTick: number } {
  const inspect = opts.inspectRange
  if (inspect && inspect.endTick > inspect.startTick) {
    return { startTick: inspect.startTick, endTick: inspect.endTick }
  }
  const mel = opts.melodyNote
  if (mel && mel.durationTicks > 0) {
    return {
      startTick: mel.startTick,
      endTick: mel.startTick + mel.durationTicks,
    }
  }
  const m = Math.max(1, opts.measureTicks)
  const start = Math.floor(Math.max(0, opts.playheadTick) / m) * m
  return { startTick: start, endTick: start + m }
}

export function formatSketchOption(
  rootPc: number,
  quality: HarmonySketchQuality,
  preferFlats: boolean,
): string {
  return `${pcName(rootPc, preferFlats)}${qualityChipLabel(quality) === 'maj' ? '' : qualityChipLabel(quality)}`
}

export type HarmonyEntrySuggestion = {
  label: string
  insert: string
  rootPc: number
  quality: HarmonySketchQuality
}

/** Code-completion style suggestions for the harmony entry field. */
export function suggestHarmonyEntries(
  raw: string,
  opts: { tonality: number; mode: TonalityMode; preferFlats: boolean; entryMode: 'name' | 'roman' },
  limit = 8,
): HarmonyEntrySuggestion[] {
  const q = raw.trim()
  const out: HarmonyEntrySuggestion[] = []
  const pushParsed = (insert: string) => {
    const parsed = parseHarmonyEntry(insert, opts)
    if (!parsed) return
    const label =
      opts.entryMode === 'roman'
        ? sketchRoman(parsed, opts.tonality, opts.mode)
        : sketchLabel(parsed, opts.preferFlats, opts.tonality, opts.mode)
    if (out.some((x) => x.label === label && x.insert === insert)) return
    out.push({ label, insert, rootPc: parsed.rootPc, quality: parsed.quality })
  }

  if (!q) {
    if (opts.entryMode === 'roman') {
      for (const s of ['I', 'ii', 'IV', 'V', 'V7', 'vi', '♭VII']) pushParsed(s)
    } else {
      for (const s of ['C', 'Dm', 'F', 'G', 'G7', 'Am', 'Bb']) pushParsed(s)
    }
    return out.slice(0, limit)
  }

  // Normalize ASCII accidentals toward symbols for suggestions.
  const normalized = q
    .replace(/bb/gi, '♭♭')
    .replace(/b(?=[A-Za-z#♯]|$)/i, '♭')
    .replace(/#/g, '♯')
    .replace(/\bo\b/gi, '°')
    .replace(/\bhdim\b/gi, 'ø')
    .replace(/\b0\b/g, 'ø')

  pushParsed(normalized)
  pushParsed(q)

  const suffixes =
    opts.entryMode === 'roman'
      ? ['', '7', 'm7', 'maj7', '°', '°7', 'ø']
      : ['', 'm', '7', 'm7', 'maj7', 'dim', 'dim7', 'ø', 'aug', '6', '9', 'add9']
  const rootish = normalized.replace(
    /(maj7|m7|dim7|dim|hdim|add9|aug|ø7?|°7?|7|m|6|9|\+|ø)$/i,
    '',
  )
  for (const suf of suffixes) {
    if (rootish) pushParsed(`${rootish}${suf}`)
  }

  // Common enharmonic / symbol helpers when user typed a lone accidental hint
  if (/[b♭#♯]$/.test(q) || /dim|hdim|ø|maj|m7?/i.test(q)) {
    for (const cand of opts.entryMode === 'roman'
      ? [`${normalized}7`, `♭VII`, `♯iv°`]
      : [`${normalized}7`, `${normalized}m7`, `${normalized}ø`]) {
      pushParsed(cand)
    }
  }

  return out.slice(0, limit)
}
