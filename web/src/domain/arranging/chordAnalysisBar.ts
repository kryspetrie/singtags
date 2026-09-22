/**
 * Chord analysis strip: absolute names + Roman numerals at each stack change.
 */
import { pcName } from './chords/chords'
import { isKnownStack } from './coachEntryMode'
import {
  identifyNatureFromMidi,
  inferNaturesFromPcs,
} from './chordCompletion'
import type { VoicingPitches } from './chords'
import {
  accidentalBiasForRootInKey,
  romanForChordDetailed,
} from './secondaryDominant'
import type { ChordStack, ContestProfile, TonalityMode } from './types'

export type ChordAnalysisMode = 'name' | 'roman'

export type ChordAnalysisOverride = {
  name?: string
  roman?: string
}

export type ChordAnalysisSegment = {
  id: string
  startTick: number
  endTick: number
  /** True when Coach Apply (or known ID) fixed the nature — display follows that chord. */
  locked: boolean
  /** Key-based guess for bare melody (no TBB) — not a Coach Apply. */
  implied: boolean
  name: string
  nameOptions: string[]
  roman: string
  romanOptions: string[]
  /** Effective labels after user override (must be in options). */
  displayName: string
  displayRoman: string
}

export function natureSuffix(natureId: string): string {
  if (!natureId || natureId === 'unknown') return ''
  if (natureId === 'major') return ''
  if (natureId === 'seventh') return '7'
  if (natureId === 'minor') return 'm'
  if (natureId === 'm7') return 'm7'
  if (natureId === 'dim7') return '°7'
  if (natureId === 'dim') return '°'
  if (natureId === 'half-dim') return 'ø7'
  if (natureId === 'aug') return '+'
  if (natureId === 'ninth') return '7(9)'
  if (natureId === 'maj7') return 'maj7'
  if (natureId === 'sixth') return '6'
  if (natureId === 'add9') return 'add9'
  if (natureId === 'madd6') return 'm6'
  return natureId
}

export function absoluteChordLabel(
  rootPc: number,
  natureId: string,
  preferFlats: boolean,
  opts?: { tonality?: number; tonalityMode?: TonalityMode },
): string {
  let flats = preferFlats
  if (opts?.tonality != null) {
    const bias = accidentalBiasForRootInKey(
      rootPc,
      opts.tonality,
      opts.tonalityMode ?? 'major',
    )
    if (bias != null) flats = bias
  }
  if (!natureId || natureId === 'unknown') {
    return `${pcName(rootPc, flats)}?`
  }
  return `${pcName(rootPc, flats)}${natureSuffix(natureId)}`
}

function uniqueLabels(labels: readonly string[]): string[] {
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

function pickDisplay(preferred: string | undefined, options: readonly string[], fallback: string): string {
  if (preferred && options.includes(preferred)) return preferred
  if (options.includes(fallback)) return fallback
  return options[0] ?? fallback
}

export type NatureNameCandidate = {
  rootPc: number
  natureId: string
  label: string
  /** Optional RN when supplied by key-based implication. */
  roman?: string
}

/**
 * Build time-aligned chord-analysis segments for the roll strip.
 * `nameCandidatesByTick` supplies alternate absolute spellings when ID is ambiguous.
 */
export function buildChordAnalysisSegments(opts: {
  stacks: readonly ChordStack[]
  tonality: number
  tonalityMode?: TonalityMode
  preferFlats: boolean
  /** Tick → alternate absolute names (e.g. G7 vs Dm6). */
  nameCandidatesByTick?: ReadonlyMap<number, readonly NatureNameCandidate[]>
  overrides?: Readonly<Record<string, ChordAnalysisOverride>>
  /** Project end — last segment extends to here when duration is short. */
  lengthTicks?: number
}): ChordAnalysisSegment[] {
  const mode = opts.tonalityMode ?? 'major'
  const sorted = [...opts.stacks]
    .filter((s) => s.midi || (s.natureId && s.natureId !== 'unknown'))
    .sort((a, b) => a.startTick - b.startTick)
  if (!sorted.length) return []

  const out: ChordAnalysisSegment[] = []
  for (let i = 0; i < sorted.length; i++) {
    const s = sorted[i]!
    const next = sorted[i + 1]
    const endTick = Math.max(
      s.startTick + 1,
      next?.startTick ??
        (opts.lengthTicks != null
          ? Math.min(opts.lengthTicks, s.startTick + s.durationTicks)
          : s.startTick + s.durationTicks),
    )
    const locked = isKnownStack(s)
    const implied = !locked && !s.midi && s.natureId !== 'unknown'
    const name = absoluteChordLabel(s.rootPc, s.natureId, opts.preferFlats, {
      tonality: opts.tonality,
      tonalityMode: mode,
    })
    const tickCands = opts.nameCandidatesByTick?.get(s.startTick) ?? []
    const candLabels = tickCands.map((c) => c.label)
    const nameOptions = uniqueLabels(
      locked ? [name] : [name, ...candLabels],
    )

    const nextRoot =
      next?.rootPc ??
      null
    const detailed = romanForChordDetailed({
      rootPc: s.rootPc,
      natureId: s.natureId === 'unknown' ? 'major' : s.natureId,
      tonality: opts.tonality,
      mode,
      resolvesToRoot: nextRoot,
    })
    const impliedRoman = tickCands.find(
      (c) => c.rootPc === s.rootPc && c.natureId === s.natureId && c.roman,
    )?.roman
    // Unknown natures: still show a tentative roman from root, but mark soft.
    const roman =
      s.natureId === 'unknown'
        ? `${detailed.roman}?`
        : (impliedRoman ?? detailed.roman)
    const candRomans = tickCands.map((c) => c.roman).filter(Boolean) as string[]
    const romanOptions = uniqueLabels(
      s.natureId === 'unknown'
        ? [roman]
        : ([roman, detailed.roman, detailed.altRoman, ...candRomans].filter(Boolean) as string[]),
    )

    const ovKey = String(s.startTick)
    const ov = opts.overrides?.[ovKey] ?? opts.overrides?.[s.id]
    out.push({
      id: s.id,
      startTick: s.startTick,
      endTick,
      locked,
      implied,
      name,
      nameOptions,
      roman,
      romanOptions,
      displayName: pickDisplay(ov?.name, nameOptions, name),
      displayRoman: pickDisplay(ov?.roman, romanOptions, roman),
    })
  }
  return out
}

/** Top absolute-name interpretations for an ambiguous sounding stack. */
export function listNatureNameCandidates(opts: {
  midi: Partial<VoicingPitches> & { lead: number }
  profile: ContestProfile
  tonality: number
  preferFlats: boolean
  limit?: number
}): NatureNameCandidate[] {
  const limit = Math.max(1, opts.limit ?? 3)
  const presentMidi = [opts.midi.tenor, opts.midi.lead, opts.midi.bari, opts.midi.bass].filter(
    (m): m is number => m != null,
  )
  const primary = identifyNatureFromMidi({
    midi: opts.midi,
    profile: opts.profile,
    tonality: opts.tonality,
  })
  const inferred = inferNaturesFromPcs({
    presentMidi,
    profile: opts.profile,
    tonality: opts.tonality,
    pillarRoot: opts.midi.bass != null ? ((opts.midi.bass % 12) + 12) % 12 : undefined,
  })
  const ranked = [...inferred].sort((a, b) => b.confidence - a.confidence)
  const out: NatureNameCandidate[] = []
  const push = (rootPc: number, natureId: string) => {
    const label = absoluteChordLabel(rootPc, natureId, opts.preferFlats, {
      tonality: opts.tonality,
    })
    if (out.some((c) => c.label === label)) return
    out.push({ rootPc, natureId, label })
  }
  if (primary) push(primary.rootPc, primary.natureId)
  for (const inf of ranked) {
    if (out.length >= limit) break
    push(inf.rootPc, inf.natureId)
  }
  return out.slice(0, limit)
}
