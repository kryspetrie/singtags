/**
 * Timing-agnostic Coach eval vs polecat gold chord sequences.
 * Lead + synthetic pillars → Basic pathOptimize → LCS on pillar romans.
 */
import { createSequentialIdGenerator } from '../../../adapters/arranging/persistence/systemServices'
import { createEmptyArrangement, type ArrangementProject } from '../types'
import { pathOptimize } from '../pathOptimize/optimize'
import type { PathOptimizeWeights } from '../pathOptimize/types'
import type { RankingWeights } from '../harmonize/rankingWeights'
import { romanForChord } from '../secondaryDominant'
import type { GoldChordToken, PolecatGoldSequence, SequenceScore } from './types'

/** Optional overrides for sweep / training experiments. */
export type EvalWeightOpts = {
  /** Base ranking knobs fed into `rankerDepsForWeights` (default empty ⇒ scale from 1). */
  rankingBase?: Partial<RankingWeights>
  /** Path Optimize taste (merged with Basic risk:0 defaults). */
  pathWeights?: Partial<PathOptimizeWeights>
}

const TICK = 480

/** Longest common subsequence length for string tokens. */
export function lcsLength(a: string[], b: string[]): number {
  const n = a.length
  const m = b.length
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    Array.from({ length: m + 1 }, () => 0),
  )
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      dp[i]![j] =
        a[i - 1] === b[j - 1]
          ? (dp[i - 1]![j - 1]! + 1)
          : Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!)
    }
  }
  return dp[n]![m]!
}

/** Align LCS pairs for nature match (greedy from DP). */
export function lcsAlignedPairs(
  a: { roman: string; natureId: string }[],
  b: { roman: string; natureId: string }[],
): { a: string; b: string }[] {
  const n = a.length
  const m = b.length
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    Array.from({ length: m + 1 }, () => 0),
  )
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      dp[i]![j] =
        a[i - 1]!.roman === b[j - 1]!.roman
          ? dp[i - 1]![j - 1]! + 1
          : Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!)
    }
  }
  const pairs: { a: string; b: string }[] = []
  let i = n
  let j = m
  while (i > 0 && j > 0) {
    if (a[i - 1]!.roman === b[j - 1]!.roman) {
      pairs.push({ a: a[i - 1]!.natureId, b: b[j - 1]!.natureId })
      i--
      j--
    } else if (dp[i - 1]![j]! >= dp[i]![j - 1]!) i--
    else j--
  }
  return pairs.reverse()
}

export function collapseTokens(
  items: { rootPc: number; natureId: string; roman: string }[],
): { rootPc: number; natureId: string; roman: string }[] {
  const out: { rootPc: number; natureId: string; roman: string }[] = []
  for (const it of items) {
    const last = out[out.length - 1]
    if (last && last.rootPc === it.rootPc && last.natureId === it.natureId) continue
    out.push(it)
  }
  return out
}

/**
 * Build an ArrangementProject from gold sequence.
 * Melody follows every gold token (Lead contour); Coach pillars are gold
 * pillar roots only (mid/passing roots omitted — they smeared the highway).
 *
 * QUARANTINE: Do not use for product-quality / Auto Coach gates — gold pillars
 * cheat the Auto path. Prefer scripts/arranging/polecatHonestScore.mjs
 * (Lead + key + roles only). Highway LCS via this helper is advisory only.
 */
export function projectFromGold(gold: PolecatGoldSequence): ArrangementProject {
  const p = createEmptyArrangement(`polecat-gold-${gold.tagId}`)
  p.tonality = gold.tonality
  p.tonalityMode = gold.mode === 'minor' ? 'minor' : 'major'
  p.preferFlats = [1, 3, 5, 8, 10].includes(gold.tonality)

  const units = gold.tokens.map((t) =>
    Math.max(1, Math.round(t.dur / Math.max(0.12, (gold.tokens[0]?.medianDur ?? 0.5) * 0.5))),
  )
  let tick = 0
  const spans: { start: number; end: number; token: GoldChordToken }[] = []
  p.melody = gold.tokens.map((t, i) => {
    const durTicks = units[i]! * TICK
    const startTick = tick
    const lead =
      t.leadMidi ?? 60 + ((t.rootPc - gold.tonality + 12) % 12)
    const ev = {
      id: `m${i}`,
      midi: lead,
      startTick,
      durationTicks: durTicks,
      role: (i % 2 ? 'smn' : 'pmn') as 'smn' | 'pmn',
    }
    spans.push({ start: startTick, end: startTick + durTicks, token: t })
    tick += durTicks
    return ev
  })

  const pillarSpans = spans.filter((s) => s.token.role === 'pillar')
  const merged: { rootPc: number; startTick: number; endTick: number }[] = []
  for (const s of pillarSpans) {
    const last = merged[merged.length - 1]
    if (last && last.rootPc === s.token.rootPc && last.endTick >= s.start) {
      last.endTick = Math.max(last.endTick, s.end)
    } else {
      merged.push({
        rootPc: s.token.rootPc,
        startTick: s.start,
        endTick: s.end,
      })
    }
  }
  const covered = merged
  if (!covered.length && gold.tokens.length) {
    covered.push({
      rootPc: gold.tokens[0]!.rootPc,
      startTick: 0,
      endTick: tick,
    })
  } else {
    if (covered[0]!.startTick > 0) covered[0]!.startTick = 0
    if (covered[covered.length - 1]!.endTick < tick) {
      covered[covered.length - 1]!.endTick = tick
    }
    for (let g = 0; g < covered.length - 1; g++) {
      const a = covered[g]!
      const b = covered[g + 1]!
      if (a.endTick < b.startTick) {
        const mid = spans.find(
          (s) => s.start >= a.endTick && s.end <= b.startTick,
        )
        if (mid) {
          covered.splice(g + 1, 0, {
            rootPc: mid.token.rootPc,
            startTick: a.endTick,
            endTick: b.startTick,
          })
        } else {
          a.endTick = b.startTick
        }
      }
    }
  }

  p.pillars = covered.map((x, i) => ({
    id: `p${i}`,
    rootPc: x.rootPc,
    startTick: x.startTick,
    endTick: x.endTick,
    source: 'user' as const,
    confirmed: true,
  }))
  return p
}

export async function optimizeBasic(
  project: ArrangementProject,
  opts: EvalWeightOpts = {},
) {
  return pathOptimize(
    project,
    {
      mode: 'full',
      scope: { kind: 'whole' },
      weights: { risk: 0, cadenceBias: 'moderate', ...opts.pathWeights },
      maxPasses: 8,
      skipProbe: true,
    },
    {
      idGen: createSequentialIdGenerator(),
      rankerDeps: opts.rankingBase ? { weights: opts.rankingBase } : undefined,
    },
  )
}

export function predictedSequence(
  project: ArrangementProject,
  tonality: number,
  mode: string,
): { rootPc: number; natureId: string; roman: string }[] {
  const stacks = [...project.stacks]
    .filter((s) => s.natureId && s.rootPc != null)
    .sort((a, b) => a.startTick - b.startTick)
  const items = stacks.map((s) => {
    const rootPc = s.rootPc!
    const natureId = s.natureId!
    const roman = romanForChord({
      rootPc,
      natureId,
      tonality,
      mode: mode === 'minor' ? 'minor' : 'major',
    })
    return { rootPc, natureId, roman }
  })
  return collapseTokens(items)
}

function chordKey(rootPc: number, natureId: string): string {
  return `${natureId}@${rootPc}`
}

/**
 * Highway sequence key: Dom9 ≡ Mm7, m7 ≡ minor (function, not color shell).
 * On I / IV, major ≡ Mm7 — Coach correctly prefers I7 when Lead is on 3 while
 * gold extracts often label the long hold as a triad.
 * Exact nature match is reported separately.
 */
export function highwayKey(
  rootPc: number,
  natureId: string,
  tonality?: number,
): string {
  let n = natureId
  if (n === 'ninth') n = 'seventh'
  else if (n === 'm7' || n === 'madd6') n = 'minor'
  if (tonality != null) {
    const deg = (((rootPc - tonality) % 12) + 12) % 12
    // I / IV: triad ↔ Mm7 ↔ sixth (I6) are the same highway slot for sequence eval.
    if (
      (deg === 0 || deg === 5) &&
      (n === 'major' || n === 'seventh' || n === 'sixth')
    ) {
      n = 'triad7'
    }
    // II / ii / ii7 / II7 — same supertonic highway slot (extract vs Coach).
    if (
      deg === 2 &&
      (n === 'major' || n === 'seventh' || n === 'minor' || n === 'm7')
    ) {
      n = 'supertonic'
    }
    // V ↔ V7 (extract sometimes labels bare V on a long dominant hold).
    if (deg === 7 && (n === 'major' || n === 'seventh')) n = 'dom'
    // iii ↔ III7 / iii7 — extract vs Coach disagree on mediant color; same slot.
    if (deg === 4 && (n === 'minor' || n === 'm7' || n === 'seventh')) n = 'mediant'
  }
  return chordKey(rootPc, n)
}

export function scoreAgainstGold(
  gold: PolecatGoldSequence,
  pred: { rootPc: number; natureId: string; roman: string }[],
): SequenceScore {
  const goldPillars = gold.tokens.filter((t) => t.role === 'pillar')
  // Primary: highway function@root (ninth≡seventh). Exact nature is secondary.
  // Collapse consecutive identical highway keys on BOTH sides — pred already
  // collapses; gold had repeated I/I/I pillars inflating the denominator.
  const tonality = gold.tonality
  const goldPillarKeys = collapseKeys(
    goldPillars.map((t) => highwayKey(t.rootPc, t.natureId, tonality)),
  )
  const predKeys = collapseKeys(
    pred.map((p) => highwayKey(p.rootPc, p.natureId, tonality)),
  )
  const pillarLcs = lcsLength(predKeys, goldPillarKeys)
  const pillarNorm =
    goldPillarKeys.length > 0 ? pillarLcs / goldPillarKeys.length : 1

  const goldPillarsCollapsed = collapseTokenNatures(goldPillars, tonality)
  const predCollapsed = collapseTokenNatures(pred, tonality)
  const aligned = lcsAlignedPairs(
    predCollapsed.map((p) => ({
      roman: highwayKey(p.rootPc, p.natureId, tonality),
      natureId: p.natureId,
    })),
    goldPillarsCollapsed.map((t) => ({
      roman: highwayKey(t.rootPc, t.natureId, tonality),
      natureId: t.natureId,
    })),
  )
  const natureAligned = aligned.length
  const natureMatch =
    natureAligned > 0
      ? aligned.filter((x) => x.a === x.b).length / natureAligned
      : 0

  const goldAllKeys = collapseKeys(
    gold.tokens.map((t) => highwayKey(t.rootPc, t.natureId, tonality)),
  )
  const softLcs = lcsLength(predKeys, goldAllKeys)
  const softFullNorm = goldAllKeys.length > 0 ? softLcs / goldAllKeys.length : 1

  const strictGold = collapseKeys(
    goldPillars.map((t) => chordKey(t.rootPc, t.natureId)),
  )
  const strictPred = collapseKeys(pred.map((p) => chordKey(p.rootPc, p.natureId)))
  const strictLcs = lcsLength(strictPred, strictGold)
  const strictPillarNorm =
    strictGold.length > 0 ? strictLcs / strictGold.length : 1

  return {
    tagId: gold.tagId,
    title: gold.title,
    pillarLcs,
    pillarGoldLen: goldPillarKeys.length,
    pillarNorm,
    strictPillarNorm,
    natureMatch,
    natureAligned,
    softFullNorm,
    predPillars: predCollapsed.map((p) => p.roman),
    goldPillars: goldPillarsCollapsed.map((t) => t.roman),
    predAll: pred.map((p) => p.roman),
    goldAll: gold.tokens.map((t) => t.roman),
  }
}

function collapseKeys(keys: string[]): string[] {
  const out: string[] = []
  for (const k of keys) {
    if (out[out.length - 1] === k) continue
    out.push(k)
  }
  return out
}

function collapseTokenNatures<T extends { rootPc: number; natureId: string; roman?: string }>(
  items: T[],
  tonality?: number,
): T[] {
  const out: T[] = []
  for (const it of items) {
    const last = out[out.length - 1]
    if (
      last &&
      highwayKey(last.rootPc, last.natureId, tonality) ===
        highwayKey(it.rootPc, it.natureId, tonality)
    ) {
      continue
    }
    out.push(it)
  }
  return out
}

export async function evalGoldSequence(
  gold: PolecatGoldSequence,
  opts: EvalWeightOpts = {},
): Promise<SequenceScore> {
  const project = projectFromGold(gold)
  const out = await optimizeBasic(project, opts)
  const pred = predictedSequence(out.project, gold.tonality, gold.mode)
  return scoreAgainstGold(gold, pred)
}

export function microAverage(scores: SequenceScore[]): {
  pillarNorm: number
  natureMatch: number
  softFullNorm: number
} {
  if (!scores.length) return { pillarNorm: 0, natureMatch: 0, softFullNorm: 0 }
  const pillarNorm =
    scores.reduce((s, x) => s + x.pillarNorm, 0) / scores.length
  const natureMatch =
    scores.reduce((s, x) => s + x.natureMatch, 0) / scores.length
  const softFullNorm =
    scores.reduce((s, x) => s + x.softFullNorm, 0) / scores.length
  return { pillarNorm, natureMatch, softFullNorm }
}
