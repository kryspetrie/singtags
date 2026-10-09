/**
 * Per-song weight tune + cluster analysis (manual).
 *
 * For each polecat: coordinate-descent on rankingBase + cadenceBias.
 * Then cluster songs by which knobs they want, and dump highway mismatch
 * fingerprints for rule candidates.
 *
 *   npx vitest run src/domain/arranging/polecatGold/polecatPerSongTune.test.ts
 *
 * @vitest-environment node
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { RankingWeights } from '../harmonize/rankingWeights'
import type { PathOptimizeWeights } from '../pathOptimize/types'
import { loadCorpusIndex } from './corpus'
import {
  evalGoldSequence,
  highwayKey,
  optimizeBasic,
  predictedSequence,
  projectFromGold,
  type EvalWeightOpts,
} from './sequenceEval'
import type { PolecatGoldSequence, SequenceScore } from './types'

const FIX_DIR = resolve(__dirname, 'fixtures')
const OUT_PATH = resolve(__dirname, 'perSongTune.json')

const SWEEP_KEYS: (keyof RankingWeights)[] = [
  'secondaryDominant',
  'cadenceFit',
  'diatonicFunction',
  'homeTriad',
  'seventh',
  'colorChordPenalty',
  'passingSoftPenalty',
  'unforcedMinorPenalty',
  'songFinalHome',
  'finalComplete',
  'completeFourPart',
  'strongVoice',
]

const SCALE_GRID = [0.25, 0.5, 0.75, 1.25, 1.5, 2, 3]
/** Min absolute hwy gain to keep a knob (per song). */
const GAIN_EPS = 0.015

type SongResult = {
  tagId: number
  title: string
  role: 'gold' | 'holdout'
  baseline: { hwy: number; strict: number }
  best: { hwy: number; strict: number }
  deltaHwy: number
  rankingBase: Partial<RankingWeights>
  cadenceBias: PathOptimizeWeights['cadenceBias']
  goldHighway: string[]
  predHighway: string[]
  missingInPred: string[]
  extraInPred: string[]
  styleFlags: string[]
}

function loadGold(tagId: number): PolecatGoldSequence {
  return JSON.parse(readFileSync(resolve(FIX_DIR, `${tagId}.json`), 'utf8'))
}

function collapseKeys(keys: string[]): string[] {
  const out: string[] = []
  for (const k of keys) {
    if (out[out.length - 1] === k) continue
    out.push(k)
  }
  return out
}

async function scoreSong(
  gold: PolecatGoldSequence,
  opts: EvalWeightOpts,
): Promise<SequenceScore> {
  return evalGoldSequence(gold, opts)
}

async function highwayDump(
  gold: PolecatGoldSequence,
  opts: EvalWeightOpts,
): Promise<{ goldHwy: string[]; predHwy: string[]; goldRomans: string[]; predRomans: string[] }> {
  const project = projectFromGold(gold)
  const out = await optimizeBasic(project, opts)
  const pred = predictedSequence(out.project, gold.tonality, gold.mode)
  const tonality = gold.tonality
  const goldHwy = collapseKeys(
    gold.tokens
      .filter((t) => t.role === 'pillar')
      .map((t) => highwayKey(t.rootPc, t.natureId, tonality)),
  )
  const predHwy = collapseKeys(
    pred.map((p) => highwayKey(p.rootPc, p.natureId, tonality)),
  )
  const goldRomans = collapseKeys(
    gold.tokens.filter((t) => t.role === 'pillar').map((t) => t.roman),
  )
  const predRomans = collapseKeys(pred.map((p) => p.roman))
  return { goldHwy, predHwy, goldRomans, predRomans }
}

function styleFlags(gold: PolecatGoldSequence): string[] {
  const pillars = gold.tokens.filter((t) => t.role === 'pillar')
  const romans = pillars.map((t) => t.roman)
  const flags: string[] = []
  const has = (re: RegExp) => romans.some((r) => re.test(r))
  if (has(/^b[IVX]/) || has(/^♭/)) flags.push('chromatic')
  if (has(/^III7$/) || has(/^iii$/)) flags.push('mediant')
  if (has(/^VI7$/) && has(/^II7$/)) flags.push('circle')
  if (has(/^IV7$/)) flags.push('I7-IV')
  if (has(/^ii7$/) || has(/^ii$/)) flags.push('supertonic-minor')
  if (has(/^I6$/)) flags.push('added6')
  const mm7 = pillars.filter((t) => t.natureId === 'seventh' || t.natureId === 'ninth').length
  const dens = mm7 / Math.max(1, pillars.length)
  if (dens >= 0.55) flags.push('dense-7ths')
  else if (dens <= 0.35) flags.push('triad-leaning')
  // Chromatic fraction
  const chrom = pillars.filter((t) => {
    const deg = (((t.rootPc - gold.tonality) % 12) + 12) % 12
    return ![0, 2, 4, 5, 7, 9, 11].includes(deg)
  }).length
  if (chrom / pillars.length >= 0.08) flags.push('chromatic-roots')
  return flags
}

/** Multiset difference helpers on collapsed highway keys. */
function bagDiff(a: string[], b: string[]): string[] {
  const bag = new Map<string, number>()
  for (const x of b) bag.set(x, (bag.get(x) ?? 0) + 1)
  const missing: string[] = []
  for (const x of a) {
    const n = bag.get(x) ?? 0
    if (n > 0) bag.set(x, n - 1)
    else missing.push(x)
  }
  return missing
}

async function tuneOne(tagId: number, role: 'gold' | 'holdout'): Promise<SongResult> {
  const gold = loadGold(tagId)
  const base = await scoreSong(gold, {})
  let bestOpts: EvalWeightOpts = {}
  let best = base
  let bestBias: PathOptimizeWeights['cadenceBias'] = 'moderate'

  // cadenceBias axis first
  for (const cadenceBias of ['off', 'moderate', 'strong'] as const) {
    const sc = await scoreSong(gold, { pathWeights: { cadenceBias } })
    if (sc.pillarNorm > best.pillarNorm + GAIN_EPS ||
      (Math.abs(sc.pillarNorm - best.pillarNorm) <= GAIN_EPS &&
        sc.strictPillarNorm > best.strictPillarNorm + GAIN_EPS)) {
      best = sc
      bestBias = cadenceBias
      bestOpts = { pathWeights: { cadenceBias } }
    }
  }

  const rankingBase: Partial<RankingWeights> = {}
  for (const key of SWEEP_KEYS) {
    let localBest = best
    let localScale = 1
    for (const scale of SCALE_GRID) {
      const opts: EvalWeightOpts = {
        rankingBase: { ...rankingBase, [key]: scale },
        pathWeights: { cadenceBias: bestBias },
      }
      const sc = await scoreSong(gold, opts)
      if (
        sc.pillarNorm > localBest.pillarNorm + GAIN_EPS ||
        (Math.abs(sc.pillarNorm - localBest.pillarNorm) <= GAIN_EPS &&
          sc.strictPillarNorm > localBest.strictPillarNorm + GAIN_EPS)
      ) {
        localBest = sc
        localScale = scale
      }
    }
    if (localScale !== 1) {
      rankingBase[key] = localScale
      best = localBest
      bestOpts = {
        rankingBase: { ...rankingBase },
        pathWeights: { cadenceBias: bestBias },
      }
    }
  }

  const final = await scoreSong(gold, bestOpts)
  const dump = await highwayDump(gold, {}) // baseline mismatches for rule diagnosis
  const missingInPred = bagDiff(dump.goldHwy, dump.predHwy)
  const extraInPred = bagDiff(dump.predHwy, dump.goldHwy)

  return {
    tagId,
    title: gold.title,
    role,
    baseline: { hwy: base.pillarNorm, strict: base.strictPillarNorm },
    best: { hwy: final.pillarNorm, strict: final.strictPillarNorm },
    deltaHwy: final.pillarNorm - base.pillarNorm,
    rankingBase: { ...rankingBase },
    cadenceBias: bestBias,
    goldHighway: dump.goldRomans.slice(0, 20),
    predHighway: dump.predRomans.slice(0, 20),
    missingInPred: topCounts(missingInPred, 8),
    extraInPred: topCounts(extraInPred, 8),
    styleFlags: styleFlags(gold),
  }
}

function topCounts(items: string[], n: number): string[] {
  const m = new Map<string, number>()
  for (const x of items) m.set(x, (m.get(x) ?? 0) + 1)
  return [...m.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k, c]) => (c > 1 ? `${k}×${c}` : k))
}

function knobSignature(r: SongResult): string {
  const parts = Object.entries(r.rankingBase)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${v}`)
  if (r.cadenceBias !== 'moderate') parts.unshift(`cadence:${r.cadenceBias}`)
  return parts.length ? parts.join(' ') : '(baseline)'
}

function clusterSongs(results: SongResult[]): {
  name: string
  members: number[]
  signature: string
  meanDelta: number
}[] {
  const buckets = new Map<string, SongResult[]>()
  for (const r of results) {
    // Coarse signature: which knobs moved (direction only), ignore exact scale
    const dirs = Object.entries(r.rankingBase)
      .map(([k, v]) => `${k}${Number(v) < 1 ? '↓' : '↑'}`)
      .sort()
    if (r.cadenceBias !== 'moderate') dirs.unshift(`cadence=${r.cadenceBias}`)
    // Songs that don't move stay in "baseline-ok"
    const key =
      r.deltaHwy < GAIN_EPS && Object.keys(r.rankingBase).length === 0
        ? 'baseline-ok'
        : dirs.join('|') || 'baseline-ok'
    const arr = buckets.get(key) ?? []
    arr.push(r)
    buckets.set(key, arr)
  }
  return [...buckets.entries()]
    .map(([signature, members]) => ({
      name:
        signature === 'baseline-ok'
          ? 'A — already fits Basic'
          : signature.includes('unforcedMinor↓')
            ? 'B — allow more minor color'
            : signature.includes('diatonicFunction↑') || signature.includes('seventh↑')
              ? 'C — denser highway / sevenths'
              : signature.includes('cadence=off')
                ? 'D — cadence-off'
                : `E — ${signature.slice(0, 60)}`,
      members: members.map((m) => m.tagId),
      signature,
      meanDelta: members.reduce((s, m) => s + m.deltaHwy, 0) / members.length,
    }))
    .sort((a, b) => b.members.length - a.members.length)
}

describe('polecat per-song tune + cluster', () => {
  it(
    'tunes each song, clusters presets, fingerprints mismatches',
    async () => {
      const idx = loadCorpusIndex()
      const results: SongResult[] = []

      for (const id of [...idx.gold, ...idx.holdout]) {
        const role = idx.gold.includes(id) ? 'gold' : 'holdout'
        // eslint-disable-next-line no-console
        console.log(`\n--- tuning ${id} (${role}) ---`)
        const r = await tuneOne(id, role)
        results.push(r)
        // eslint-disable-next-line no-console
        console.log(
          `  baseline hwy=${r.baseline.hwy.toFixed(3)} → best=${r.best.hwy.toFixed(3)} ` +
            `(Δ${r.deltaHwy >= 0 ? '+' : ''}${r.deltaHwy.toFixed(3)}) ` +
            `bias=${r.cadenceBias} knobs=${JSON.stringify(r.rankingBase)}`,
        )
        // eslint-disable-next-line no-console
        console.log(`  style: ${r.styleFlags.join(', ') || 'plain'}`)
        // eslint-disable-next-line no-console
        console.log(`  missing vs pred: ${r.missingInPred.join(', ') || '—'}`)
        // eslint-disable-next-line no-console
        console.log(`  extra in pred:   ${r.extraInPred.join(', ') || '—'}`)
      }

      const clusters = clusterSongs(results)

      // eslint-disable-next-line no-console
      console.log('\n========== PER-SONG SUMMARY ==========')
      for (const r of results) {
        // eslint-disable-next-line no-console
        console.log(
          `${r.role[0].toUpperCase()} ${r.tagId} ${r.title.slice(0, 28).padEnd(28)} ` +
            `${r.baseline.hwy.toFixed(3)}→${r.best.hwy.toFixed(3)} ` +
            `[${r.styleFlags.join('+') || 'plain'}] ${knobSignature(r)}`,
        )
      }

      // eslint-disable-next-line no-console
      console.log('\n========== CLUSTERS / PRESET CANDIDATES ==========')
      for (const c of clusters) {
        // eslint-disable-next-line no-console
        console.log(
          `${c.name}\n  sig: ${c.signature}\n  tags: ${c.members.join(', ')} ` +
            `meanΔ=${c.meanDelta.toFixed(3)}`,
        )
      }

      // Cross-apply: does cluster B's knobs help all B members without killing gold?
      // eslint-disable-next-line no-console
      console.log('\n========== CROSS-APPLY PRESETS ==========')
      const presets: { name: string; opts: EvalWeightOpts }[] = [
        { name: 'Basic (current)', opts: {} },
        {
          name: 'minor-soft',
          opts: { rankingBase: { unforcedMinorPenalty: 0.25 } },
        },
        {
          name: 'highway-dense',
          opts: { rankingBase: { diatonicFunction: 3, seventh: 3 } },
        },
        {
          name: 'cadence-off',
          opts: { pathWeights: { cadenceBias: 'off' } },
        },
        {
          name: 'circle-up',
          opts: {
            rankingBase: {
              secondaryDominant: 2,
              cadenceFit: 1.5,
              diatonicFunction: 2,
            },
          },
        },
        {
          name: 'home-soft',
          opts: { rankingBase: { homeTriad: 0.5, completeFourPart: 0.5 } },
        },
      ]

      type CrossRow = {
        preset: string
        goldMicro: number
        holdMicro: number
        perTag: Record<string, number>
      }
      const cross: CrossRow[] = []
      for (const p of presets) {
        let g = 0
        let gN = 0
        let h = 0
        let hN = 0
        const perTag: Record<string, number> = {}
        for (const id of [...idx.gold, ...idx.holdout]) {
          const sc = await scoreSong(loadGold(id), p.opts)
          perTag[String(id)] = sc.pillarNorm
          if (idx.gold.includes(id)) {
            g += sc.pillarNorm
            gN++
          } else {
            h += sc.pillarNorm
            hN++
          }
        }
        const row = {
          preset: p.name,
          goldMicro: g / gN,
          holdMicro: h / hN,
          perTag,
        }
        cross.push(row)
        // eslint-disable-next-line no-console
        console.log(
          `  ${p.name.padEnd(14)} gold=${row.goldMicro.toFixed(3)} hold=${row.holdMicro.toFixed(3)}`,
        )
      }

      // Mismatch aggregation across holdouts at baseline
      // eslint-disable-next-line no-console
      console.log('\n========== HOLDOUT MISMATCH BAG (baseline) ==========')
      const missBag = new Map<string, number>()
      const extraBag = new Map<string, number>()
      for (const r of results.filter((x) => x.role === 'holdout' && x.baseline.hwy < 0.99)) {
        for (const m of r.missingInPred) {
          const k = m.replace(/×\d+$/, '')
          missBag.set(k, (missBag.get(k) ?? 0) + 1)
        }
        for (const m of r.extraInPred) {
          const k = m.replace(/×\d+$/, '')
          extraBag.set(k, (extraBag.get(k) ?? 0) + 1)
        }
      }
      const top = (m: Map<string, number>) =>
        [...m.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 12)
          .map(([k, c]) => `${k}(${c})`)
          .join(', ')
      // eslint-disable-next-line no-console
      console.log(`  gold-not-pred: ${top(missBag)}`)
      // eslint-disable-next-line no-console
      console.log(`  pred-not-gold: ${top(extraBag)}`)

      const report = {
        updatedAt: new Date().toISOString(),
        note:
          'Per-song coordinate tune + coarse clusters. Presets are diagnostic; do not ship without gold gate.',
        results,
        clusters,
        crossApply: cross.map(({ preset, goldMicro, holdMicro }) => ({
          preset,
          goldMicro,
          holdMicro,
        })),
        holdoutMissTop: top(missBag),
        holdoutExtraTop: top(extraBag),
      }
      writeFileSync(OUT_PATH, JSON.stringify(report, null, 2) + '\n')
      // eslint-disable-next-line no-console
      console.log(`\nWrote ${OUT_PATH}`)

      expect(results.length).toBe(12)
    },
    900_000,
  )
})
