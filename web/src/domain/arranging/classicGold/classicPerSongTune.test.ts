/**
 * Classic Tags per-song tune + cluster (manual, long).
 *
 *   npx vitest run src/domain/arranging/classicGold/classicPerSongTune.test.ts
 *
 * @vitest-environment node
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { RankingWeights } from '../harmonize/rankingWeights'
import type { PathOptimizeWeights } from '../pathOptimize/types'
import type { PolecatGoldSequence, SequenceScore } from '../polecatGold/types'
import {
  evalGoldSequence,
  type EvalWeightOpts,
} from '../polecatGold/sequenceEval'
import { classicCorpusIds, loadClassicIndex } from './corpus'

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
]
/** Coarse grid — Classic corpus is large. */
const SCALE_GRID = [0.5, 2]
const GAIN_EPS = 0.02
/** Only tune tags below this highway score. */
const TUNE_BELOW = 0.97

type SongResult = {
  tagId: number
  classic?: string | number
  title: string
  baseline: { hwy: number; strict: number }
  best: { hwy: number; strict: number }
  deltaHwy: number
  rankingBase: Partial<RankingWeights>
  cadenceBias: PathOptimizeWeights['cadenceBias']
  styleFlags: string[]
  tuned: boolean
}

function loadGold(tagId: number): PolecatGoldSequence {
  return JSON.parse(readFileSync(resolve(FIX_DIR, `${tagId}.json`), 'utf8'))
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
  if (has(/^I6$/) || pillars.some((t) => t.natureId === 'sixth')) flags.push('added6')
  const mm7 = pillars.filter(
    (t) => t.natureId === 'seventh' || t.natureId === 'ninth',
  ).length
  const dens = mm7 / Math.max(1, pillars.length)
  if (dens >= 0.55) flags.push('dense-7ths')
  else if (dens <= 0.35) flags.push('triad-leaning')
  const chrom = pillars.filter((t) => {
    const deg = (((t.rootPc - gold.tonality) % 12) + 12) % 12
    return ![0, 2, 4, 5, 7, 9, 11].includes(deg)
  }).length
  if (chrom / pillars.length >= 0.08) flags.push('chromatic-roots')
  return flags
}

async function scoreSong(
  gold: PolecatGoldSequence,
  opts: EvalWeightOpts = {},
): Promise<SequenceScore> {
  return evalGoldSequence(gold, opts)
}

async function tuneOne(tagId: number): Promise<SongResult> {
  const gold = loadGold(tagId)
  const classic = (gold as PolecatGoldSequence & { classic?: string | number }).classic
  const base = await scoreSong(gold)
  let best = base
  let bestBias: PathOptimizeWeights['cadenceBias'] = 'moderate'
  const rankingBase: Partial<RankingWeights> = {}
  let tuned = false

  if (base.pillarNorm >= TUNE_BELOW) {
    return {
      tagId,
      classic,
      title: gold.title,
      baseline: { hwy: base.pillarNorm, strict: base.strictPillarNorm },
      best: { hwy: base.pillarNorm, strict: base.strictPillarNorm },
      deltaHwy: 0,
      rankingBase: {},
      cadenceBias: 'moderate',
      styleFlags: styleFlags(gold),
      tuned: false,
    }
  }

  tuned = true
  for (const cadenceBias of ['off', 'moderate', 'strong'] as const) {
    const sc = await scoreSong(gold, { pathWeights: { cadenceBias } })
    if (
      sc.pillarNorm > best.pillarNorm + GAIN_EPS ||
      (Math.abs(sc.pillarNorm - best.pillarNorm) <= GAIN_EPS &&
        sc.strictPillarNorm > best.strictPillarNorm + GAIN_EPS)
    ) {
      best = sc
      bestBias = cadenceBias
    }
  }

  for (const key of SWEEP_KEYS) {
    let localBest = best
    let localScale = 1
    for (const scale of SCALE_GRID) {
      const sc = await scoreSong(gold, {
        rankingBase: { ...rankingBase, [key]: scale },
        pathWeights: { cadenceBias: bestBias },
      })
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
    }
  }

  return {
    tagId,
    classic,
    title: gold.title,
    baseline: { hwy: base.pillarNorm, strict: base.strictPillarNorm },
    best: { hwy: best.pillarNorm, strict: best.strictPillarNorm },
    deltaHwy: best.pillarNorm - base.pillarNorm,
    rankingBase,
    cadenceBias: bestBias,
    styleFlags: styleFlags(gold),
    tuned,
  }
}

function clusterResults(results: SongResult[]) {
  const buckets = new Map<string, SongResult[]>()
  for (const r of results) {
    let key: string
    if (r.baseline.hwy >= 0.99) key = 'A-fits-Basic'
    else if (!r.tuned || r.deltaHwy < GAIN_EPS) {
      const style = r.styleFlags.slice(0, 3).join('+') || 'plain'
      key = `B-rule-gap/${style}`
    } else {
      const dirs = Object.entries(r.rankingBase)
        .map(([k, v]) => `${k}${Number(v) < 1 ? '↓' : '↑'}`)
        .sort()
      if (r.cadenceBias !== 'moderate') dirs.unshift(`cadence=${r.cadenceBias}`)
      key = `C-weight/${dirs.join('|') || 'moved'}`
    }
    const arr = buckets.get(key) ?? []
    arr.push(r)
    buckets.set(key, arr)
  }
  return [...buckets.entries()]
    .map(([name, members]) => ({
      name,
      n: members.length,
      meanHwy: members.reduce((s, m) => s + m.baseline.hwy, 0) / members.length,
      meanDelta: members.reduce((s, m) => s + m.deltaHwy, 0) / members.length,
      members: members
        .map((m) => m.tagId)
        .sort((a, b) => a - b)
        .slice(0, 40),
      styles: [...new Set(members.flatMap((m) => m.styleFlags))].sort(),
    }))
    .sort((a, b) => b.n - a.n)
}

describe('classic per-song tune + cluster', () => {
  it(
    'baselines all, tunes soft tags, clusters',
    async () => {
      const ids = classicCorpusIds()
      expect(ids.length).toBeGreaterThan(10)
      const idx = loadClassicIndex()
      const byId = new Map(idx.fixtures.map((f) => [f.tagId, f]))

      const results: SongResult[] = []
      let i = 0
      for (const id of ids) {
        i++
        const r = await tuneOne(id)
        if (!r.classic && byId.get(id)?.classic != null) {
          r.classic = byId.get(id)!.classic
        }
        results.push(r)
        if (r.tuned || r.baseline.hwy < 0.9 || i % 25 === 0) {
          // eslint-disable-next-line no-console
          console.log(
            `[${i}/${ids.length}] c#${r.classic ?? '?'} ${id} ` +
              `${r.baseline.hwy.toFixed(3)}→${r.best.hwy.toFixed(3)} ` +
              `Δ${r.deltaHwy >= 0 ? '+' : ''}${r.deltaHwy.toFixed(3)} ` +
              `[${r.styleFlags.join('+') || 'plain'}]`,
          )
        }
      }

      const clusters = clusterResults(results)
      const micro =
        results.reduce((s, r) => s + r.baseline.hwy, 0) / Math.max(1, results.length)
      const soft = results.filter((r) => r.baseline.hwy < 0.9)
      const weightHelped = results.filter((r) => r.deltaHwy >= GAIN_EPS)

      // eslint-disable-next-line no-console
      console.log('\n========== CLASSIC SUMMARY ==========')
      // eslint-disable-next-line no-console
      console.log(
        `n=${results.length} microHwy=${micro.toFixed(3)} ` +
          `soft(<0.9)=${soft.length} weightHelped=${weightHelped.length}`,
      )

      // eslint-disable-next-line no-console
      console.log('\n========== CLUSTERS ==========')
      for (const c of clusters.slice(0, 20)) {
        // eslint-disable-next-line no-console
        console.log(
          `${c.name} n=${c.n} meanHwy=${c.meanHwy.toFixed(3)} meanΔ=${c.meanDelta.toFixed(3)} ` +
            `styles=${c.styles.join(',')}`,
        )
        // eslint-disable-next-line no-console
        console.log(`  ids: ${c.members.join(', ')}${c.n > 40 ? '…' : ''}`)
      }

      // Cross-apply a few presets on the soft band
      // eslint-disable-next-line no-console
      console.log('\n========== CROSS-APPLY (soft tags) ==========')
      const softIds = soft.map((s) => s.tagId)
      const presets: { name: string; opts: EvalWeightOpts }[] = [
        { name: 'Basic', opts: {} },
        { name: 'cadence-off', opts: { pathWeights: { cadenceBias: 'off' } } },
        {
          name: 'passingSoft↑',
          opts: { rankingBase: { passingSoftPenalty: 2 } },
        },
        {
          name: 'diatonic↑',
          opts: { rankingBase: { diatonicFunction: 2 } },
        },
        {
          name: 'minor-soft',
          opts: { rankingBase: { unforcedMinorPenalty: 0.5 } },
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
      ]
      const cross: { preset: string; softMicro: number; allMicro: number }[] = []
      for (const p of presets) {
        let softSum = 0
        let allSum = 0
        for (const id of ids) {
          const sc = await scoreSong(loadGold(id), p.opts)
          allSum += sc.pillarNorm
          if (softIds.includes(id)) softSum += sc.pillarNorm
        }
        const row = {
          preset: p.name,
          softMicro: softIds.length ? softSum / softIds.length : 0,
          allMicro: allSum / ids.length,
        }
        cross.push(row)
        // eslint-disable-next-line no-console
        console.log(
          `  ${p.name.padEnd(14)} all=${row.allMicro.toFixed(3)} soft=${row.softMicro.toFixed(3)}`,
        )
      }

      const report = {
        updatedAt: new Date().toISOString(),
        methodology: 'docs/arranging/sequence-corpus-methodology.md',
        n: results.length,
        microHwy: micro,
        softCount: soft.length,
        weightHelpedCount: weightHelped.length,
        clusters,
        crossApply: cross,
        results,
      }
      writeFileSync(OUT_PATH, JSON.stringify(report, null, 2) + '\n')
      // eslint-disable-next-line no-console
      console.log(`\nWrote ${OUT_PATH}`)

      expect(results.length).toBe(ids.length)
    },
    1_800_000,
  )
})
