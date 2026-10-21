/**
 * Build per-Lead-onset gold candidates from a TTBB chart snapshot.
 * Seed loading stays in lib/tagRoll; this module is pure domain.
 */
import {
  absoluteChordLabel,
  DETECT_ALT_LIMIT,
  listNatureNameCandidates,
} from '../chordAnalysisBar'
import { identifyNatureFromMidi } from '../chordCompletion'
import type { ContestProfile } from '../contestProfile'
import { romanForChord } from '../secondaryDominant'
import type { TonalityMode } from '../types'
import {
  MIXED_CHART_GOLD_SCHEMA,
  MIXED_GOLD_AUTO_LOCK_CONFIDENCE,
  MIXED_GOLD_VERIFIED_COVERAGE,
  type MixedAltCandidate,
  type MixedChartGold,
  type MixedGoldOverride,
  type MixedOnsetGold,
  type MixedOnsetMidi,
  type MixedOnsetRole,
} from './types'

/** Minimal chart view for gold derivation (TagRoll-agnostic). */
export type MixedGoldChartNote = {
  partName: 'Tenor' | 'Lead' | 'Bari' | 'Bass' | string
  midi: number
  startTick: number
  durationTicks: number
}

export type MixedGoldChartView = {
  id: string
  tonality: number
  tonalityMode?: TonalityMode
  preferFlats?: boolean
  notes: readonly MixedGoldChartNote[]
}

function coveringMidi(
  notes: readonly MixedGoldChartNote[],
  partName: string,
  tick: number,
): number | undefined {
  const exact = notes.find((n) => n.partName === partName && n.startTick === tick)
  if (exact) return exact.midi
  const cover = notes.find(
    (n) =>
      n.partName === partName &&
      n.startTick <= tick &&
      tick < n.startTick + n.durationTicks,
  )
  return cover?.midi
}

function harmonyMidiAt(
  notes: readonly MixedGoldChartNote[],
  tick: number,
): MixedOnsetMidi {
  const out: MixedOnsetMidi = {}
  const t = coveringMidi(notes, 'Tenor', tick)
  const b = coveringMidi(notes, 'Bari', tick)
  const bs = coveringMidi(notes, 'Bass', tick)
  if (t != null) out.tenor = t
  if (b != null) out.bari = b
  if (bs != null) out.bass = bs
  return out
}

function stackPartCount(midi: MixedOnsetMidi): number {
  return (midi.tenor != null ? 1 : 0) + (midi.bari != null ? 1 : 0) + (midi.bass != null ? 1 : 0)
}

function defaultRole(natureId: string, confidence: number): MixedOnsetRole {
  if (
    confidence >= 0.7 &&
    (natureId === 'major' || natureId === 'seventh' || natureId === 'minor')
  ) {
    return 'pillar'
  }
  if (confidence < 0.5) return 'passing'
  return 'other'
}

/** Soft family for auto-lock (seventh≡ninth, major≡add9/sixth, …). */
function softNatureFamily(natureId: string): string {
  if (natureId === 'ninth') return 'seventh'
  if (natureId === 'add9' || natureId === 'sixth') return 'major'
  if (natureId === 'madd6') return 'minor'
  return natureId
}

function altsAreHighwayEquivalent(
  primary: { rootPc: number; natureId: string },
  alts: readonly { rootPc: number; natureId: string }[],
): boolean {
  if (!alts.length) return true
  const fam = softNatureFamily(primary.natureId)
  return alts.every(
    (a) => a.rootPc === primary.rootPc && softNatureFamily(a.natureId) === fam,
  )
}

export function computeLockCoverage(onsets: readonly MixedOnsetGold[]): number {
  const stack = onsets.filter((o) => stackPartCount(o.midi) >= 1)
  if (!stack.length) return 0
  const locked = stack.filter((o) => o.locked).length
  return locked / stack.length
}

export function computeVerified(onsets: readonly MixedOnsetGold[]): boolean {
  return computeLockCoverage(onsets) >= MIXED_GOLD_VERIFIED_COVERAGE
}

/**
 * Label one Lead onset from sounding midis (auto-identify + alts).
 */
export function labelOnset(opts: {
  leadMidi: number
  midi: MixedOnsetMidi
  startTick: number
  endTick: number
  tonality: number
  mode: TonalityMode
  profile: ContestProfile
  preferFlats: boolean
}): MixedOnsetGold | null {
  const parts = stackPartCount(opts.midi)
  if (parts < 1) return null

  const voicing = {
    lead: opts.leadMidi,
    ...opts.midi,
  }
  const identified = identifyNatureFromMidi({
    midi: voicing,
    profile: opts.profile,
    tonality: opts.tonality,
  })
  const cands = listNatureNameCandidates({
    midi: voicing,
    profile: opts.profile,
    tonality: opts.tonality,
    preferFlats: opts.preferFlats,
    limit: DETECT_ALT_LIMIT,
  })

  const rootPc = identified?.rootPc ?? cands[0]?.rootPc
  const natureId = identified?.natureId ?? cands[0]?.natureId
  if (rootPc == null || !natureId || natureId === 'unknown') return null

  const confidence = identified?.confidence ?? 0
  const roman = romanForChord({
    rootPc,
    natureId,
    tonality: opts.tonality,
    mode: opts.mode,
  })
  const altCandidates: MixedAltCandidate[] = cands.map((c) => ({
    rootPc: c.rootPc,
    natureId: c.natureId,
    roman: romanForChord({
      rootPc: c.rootPc,
      natureId: c.natureId,
      tonality: opts.tonality,
      mode: opts.mode,
    }),
    label:
      c.label ||
      absoluteChordLabel(c.rootPc, c.natureId, opts.preferFlats, {
        tonality: opts.tonality,
        tonalityMode: opts.mode,
      }),
  }))

  // Ambiguous only when alts disagree on root or soft nature family
  // (V7 vs V7(9) still auto-locks; Dom9 omit-root vs m6 does not).
  const ambiguous = !altsAreHighwayEquivalent(
    { rootPc, natureId },
    altCandidates,
  )
  const autoLock =
    !ambiguous && confidence >= MIXED_GOLD_AUTO_LOCK_CONFIDENCE && parts >= 2

  return {
    startTick: opts.startTick,
    endTick: opts.endTick,
    leadMidi: opts.leadMidi,
    midi: opts.midi,
    rootPc,
    natureId,
    roman,
    role: defaultRole(natureId, confidence),
    labelSource: 'auto-identify',
    confidence,
    locked: autoLock,
    ...(altCandidates.length ? { altCandidates } : {}),
  }
}

/**
 * Build a full MixedChartGold document from a TTBB chart view (auto labels).
 */
export function buildGoldFromChart(opts: {
  chart: MixedGoldChartView
  tagId: number
  profile?: ContestProfile
}): MixedChartGold {
  const chart = opts.chart
  const profile = opts.profile ?? 'sai11'
  const mode = (chart.tonalityMode ?? 'major') as TonalityMode
  const preferFlats = !!chart.preferFlats
  const seedId = chart.id.startsWith('seed-')
    ? chart.id
    : `seed-polecat-mixed-${opts.tagId}`

  const melody = chart.notes
    .filter((n) => n.partName === 'Lead')
    .sort((a, b) => a.startTick - b.startTick || a.midi - b.midi)

  const onsets: MixedOnsetGold[] = []
  for (const m of melody) {
    const midi = harmonyMidiAt(chart.notes, m.startTick)
    const labeled = labelOnset({
      leadMidi: m.midi,
      midi,
      startTick: m.startTick,
      endTick: m.startTick + Math.max(1, m.durationTicks),
      tonality: chart.tonality,
      mode,
      profile,
      preferFlats,
    })
    if (labeled) onsets.push(labeled)
  }

  const lockCoverage = computeLockCoverage(onsets)
  return {
    schema: MIXED_CHART_GOLD_SCHEMA,
    tagId: opts.tagId,
    source: 'musicxml-mixed',
    seedId,
    tonality: chart.tonality,
    mode,
    profile,
    preferFlats,
    verified: computeVerified(onsets),
    lockCoverage,
    onsets,
  }
}

/**
 * Apply human/PDF overrides; marks those onsets locked.
 */
export function applyGoldOverrides(
  gold: MixedChartGold,
  overrides: readonly MixedGoldOverride[],
): MixedChartGold {
  if (!overrides.length) return gold
  const byTick = new Map(overrides.map((o) => [o.startTick, o]))
  const onsets = gold.onsets.map((o) => {
    const ov = byTick.get(o.startTick)
    if (!ov) return o
    const natureId = ov.natureId
    const rootPc = ((ov.rootPc % 12) + 12) % 12
    const roman = romanForChord({
      rootPc,
      natureId,
      tonality: gold.tonality,
      mode: gold.mode,
    })
    return {
      ...o,
      rootPc,
      natureId,
      roman,
      role: ov.role ?? o.role,
      labelSource: ov.labelSource ?? 'manual-alt',
      locked: true,
      confidence: Math.max(o.confidence, 0.9),
    }
  })
  const lockCoverage = computeLockCoverage(onsets)
  return {
    ...gold,
    onsets,
    lockCoverage,
    verified: computeVerified(onsets),
  }
}

/** Stack onsets that still need a human lock (ambiguous or low-conf). */
export function listAmbiguousOnsets(gold: MixedChartGold): MixedOnsetGold[] {
  return gold.onsets.filter((o) => stackPartCount(o.midi) >= 1 && !o.locked)
}

export function summarizeGold(gold: MixedChartGold): {
  stackOnsets: number
  locked: number
  unlocked: number
  lockCoverage: number
  verified: boolean
} {
  const stack = gold.onsets.filter((o) => stackPartCount(o.midi) >= 1)
  const locked = stack.filter((o) => o.locked).length
  return {
    stackOnsets: stack.length,
    locked,
    unlocked: stack.length - locked,
    lockCoverage: gold.lockCoverage,
    verified: gold.verified,
  }
}
