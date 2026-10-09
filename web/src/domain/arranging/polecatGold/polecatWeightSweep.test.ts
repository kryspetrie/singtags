/**
 * Full-corpus weight sweep — gold + holdout as training targets.
 * Not a CI gate: run manually to see if knobs move holdout without gold regress.
 *
 *   npx vitest run src/domain/arranging/polecatGold/polecatWeightSweep.test.ts
 *
 * @vitest-environment node
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import defaults from '../defaultWeights.json'
import type { RankingWeights } from '../harmonize/rankingWeights'
import type { PathOptimizeWeights } from '../pathOptimize/types'
import { corpusIds, loadCorpusIndex } from './corpus'
import {
  evalGoldSequence,
  microAverage,
  type EvalWeightOpts,
} from './sequenceEval'
import type { PolecatGoldSequence, SequenceScore } from './types'

const FIX_DIR = resolve(__dirname, 'fixtures')
const GOLD_FLOOR = 0.97 // allow tiny noise under 1.000 peak
const HOLD_EPS = 0.005 // min holdout micro gain to call a winner

type Micro = {
  pillarNorm: number
  strictPillarNorm: number
  natureMatch: number
  softFullNorm: number
}

type Trial = {
  label: string
  opts: EvalWeightOpts
  gold: Micro
  holdout: Micro
  perTag: Record<string, { pillarNorm: number; strictPillarNorm: number }>
}

function loadGold(tagId: number): PolecatGoldSequence {
  return JSON.parse(readFileSync(resolve(FIX_DIR, `${tagId}.json`), 'utf8'))
}

function microOf(scores: SequenceScore[]): Micro {
  const m = microAverage(scores)
  const strictPillarNorm =
    scores.length === 0
      ? 0
      : scores.reduce((s, x) => s + x.strictPillarNorm, 0) / scores.length
  return {
    pillarNorm: m.pillarNorm,
    strictPillarNorm,
    natureMatch: m.natureMatch,
    softFullNorm: m.softFullNorm,
  }
}

async function runTrial(
  label: string,
  goldIds: number[],
  holdoutIds: number[],
  opts: EvalWeightOpts,
): Promise<Trial> {
  const goldScores: SequenceScore[] = []
  for (const id of goldIds) goldScores.push(await evalGoldSequence(loadGold(id), opts))
  const holdScores: SequenceScore[] = []
  for (const id of holdoutIds) holdScores.push(await evalGoldSequence(loadGold(id), opts))
  const all = [...goldScores, ...holdScores]
  return {
    label,
    opts,
    gold: microOf(goldScores),
    holdout: microOf(holdScores),
    perTag: Object.fromEntries(
      all.map((s) => [
        String(s.tagId),
        { pillarNorm: s.pillarNorm, strictPillarNorm: s.strictPillarNorm },
      ]),
    ),
  }
}

function fmt(m: Micro): string {
  return `hwy=${m.pillarNorm.toFixed(3)} strict=${m.strictPillarNorm.toFixed(3)} nat=${m.natureMatch.toFixed(3)}`
}

function legal(t: Trial): boolean {
  return t.gold.pillarNorm >= GOLD_FLOOR
}

/** Knobs that `rankerDepsForWeights` actually scales (Path Optimize Basic). */
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
  'voiceLead',
  'ring',
]

const SCALE_GRID = [0.25, 0.5, 0.75, 1.25, 1.5, 2, 3]

describe('polecat full-corpus weight sweep', () => {
  it(
    'coordinate descent — holdout train, gold floor',
    async () => {
      const idx = loadCorpusIndex()
      const goldIds = idx.gold
      const holdoutIds = idx.holdout
      expect(goldIds.length).toBeGreaterThanOrEqual(4)
      expect(holdoutIds.length).toBeGreaterThanOrEqual(4)

      const trials: Trial[] = []
      const log = (t: Trial, note = '') => {
        // eslint-disable-next-line no-console
        console.log(
          `[${legal(t) ? 'ok' : 'GOLD↓'}] ${t.label}` +
            `\n  gold    ${fmt(t.gold)}` +
            `\n  holdout ${fmt(t.holdout)}${note ? `\n  ${note}` : ''}`,
        )
      }

      const baseline = await runTrial('baseline (empty rankingBase)', goldIds, holdoutIds, {})
      trials.push(baseline)
      log(baseline)

      // Does wiring defaultWeights.json into Path Optimize change anything?
      const jsonWired = await runTrial(
        'JSON ranking as rankerDeps base',
        goldIds,
        holdoutIds,
        { rankingBase: defaults.ranking as RankingWeights },
      )
      trials.push(jsonWired)
      log(
        jsonWired,
        `Δhold hwy=${(jsonWired.holdout.pillarNorm - baseline.holdout.pillarNorm).toFixed(3)} ` +
          `Δgold hwy=${(jsonWired.gold.pillarNorm - baseline.gold.pillarNorm).toFixed(3)}`,
      )

      // Path Optimize cadenceBias axis
      for (const cadenceBias of ['off', 'moderate', 'strong'] as const) {
        if (cadenceBias === 'moderate') continue
        const t = await runTrial(`cadenceBias=${cadenceBias}`, goldIds, holdoutIds, {
          pathWeights: { cadenceBias },
        })
        trials.push(t)
        log(t)
      }

      // issuePenalty / stayPut soft knobs
      for (const [k, v] of [
        ['issuePenalty', 0],
        ['issuePenalty', 1],
        ['stayPutEpsilon', 0],
        ['stayPutEpsilon', 0.5],
      ] as const) {
        const t = await runTrial(`path.${k}=${v}`, goldIds, holdoutIds, {
          pathWeights: { [k]: v } as Partial<PathOptimizeWeights>,
        })
        trials.push(t)
        log(t)
      }

      // Coordinate descent on ranking base multipliers (default base = 1)
      let best = baseline
      const currentBase: Partial<RankingWeights> = {}
      for (const key of SWEEP_KEYS) {
        let localBest = best
        let localScale = 1
        for (const scale of SCALE_GRID) {
          const rankingBase = { ...currentBase, [key]: scale }
          const t = await runTrial(
            `coord ${key}=${scale}` +
              (Object.keys(currentBase).length
                ? ` | base=${JSON.stringify(currentBase)}`
                : ''),
            goldIds,
            holdoutIds,
            { rankingBase },
          )
          trials.push(t)
          const holdGain = t.holdout.pillarNorm - localBest.holdout.pillarNorm
          const strictGain = t.holdout.strictPillarNorm - localBest.holdout.strictPillarNorm
          if (
            legal(t) &&
            (holdGain > HOLD_EPS ||
              (Math.abs(holdGain) <= HOLD_EPS && strictGain > HOLD_EPS))
          ) {
            localBest = t
            localScale = scale
            log(t, `← new local best for ${key}`)
          }
        }
        if (localScale !== 1) {
          currentBase[key] = localScale
          best = localBest
          // eslint-disable-next-line no-console
          console.log(`  keep ${key}=${localScale}`)
        } else {
          // eslint-disable-next-line no-console
          console.log(`  ${key}: no legal holdout gain on grid`)
        }
      }

      // Combined best from coordinate pass
      if (Object.keys(currentBase).length) {
        const combined = await runTrial(
          `combined ${JSON.stringify(currentBase)}`,
          goldIds,
          holdoutIds,
          { rankingBase: currentBase },
        )
        trials.push(combined)
        log(combined, 'coordinate-descent bundle')
        if (legal(combined) && combined.holdout.pillarNorm > best.holdout.pillarNorm) {
          best = combined
        }
      }

      // Cluster probes from theory audit tensions
      const clusters: { label: string; rankingBase: Partial<RankingWeights> }[] = [
        {
          label: 'cluster: more circle (secDom↑ cadenceFit↑ diatonic↑)',
          rankingBase: { secondaryDominant: 2, cadenceFit: 1.5, diatonicFunction: 1.5 },
        },
        {
          label: 'cluster: less home lock (homeTriad↓ completeFour↓)',
          rankingBase: { homeTriad: 0.5, completeFourPart: 0.5 },
        },
        {
          label: 'cluster: barbershop color (colorPen↓ seventh↑)',
          rankingBase: { colorChordPenalty: 0.5, seventh: 2 },
        },
        {
          label: 'cluster: finals triad (finalComplete↑ songFinal↑ seventh↓)',
          rankingBase: { finalComplete: 2, songFinalHome: 2, seventh: 0.5 },
        },
        {
          label: 'cluster: less unforced minor',
          rankingBase: { unforcedMinorPenalty: 2, passingSoftPenalty: 1.5 },
        },
        {
          label: 'cluster: JSON×0.5 on sweep keys',
          rankingBase: Object.fromEntries(
            SWEEP_KEYS.map((k) => [k, (defaults.ranking as RankingWeights)[k] * 0.5]),
          ) as Partial<RankingWeights>,
        },
        {
          label: 'cluster: JSON×1 on sweep keys',
          rankingBase: Object.fromEntries(
            SWEEP_KEYS.map((k) => [k, (defaults.ranking as RankingWeights)[k]]),
          ) as Partial<RankingWeights>,
        },
      ]
      for (const c of clusters) {
        const t = await runTrial(c.label, goldIds, holdoutIds, {
          rankingBase: c.rankingBase,
        })
        trials.push(t)
        log(t)
        if (
          legal(t) &&
          t.holdout.pillarNorm > best.holdout.pillarNorm + HOLD_EPS
        ) {
          best = t
        }
      }

      const legalTrials = trials.filter(legal)
      const byHold = [...legalTrials].sort(
        (a, b) => b.holdout.pillarNorm - a.holdout.pillarNorm,
      )
      // eslint-disable-next-line no-console
      console.log('\n=== TOP LEGAL (holdout hwy) ===')
      for (const t of byHold.slice(0, 8)) {
        // eslint-disable-next-line no-console
        console.log(
          `  ${t.holdout.pillarNorm.toFixed(3)} / gold ${t.gold.pillarNorm.toFixed(3)}  ${t.label}`,
        )
      }

      const improved = byHold.filter(
        (t) => t.holdout.pillarNorm > baseline.holdout.pillarNorm + HOLD_EPS,
      )
      // eslint-disable-next-line no-console
      console.log(
        `\nBaseline holdout hwy=${baseline.holdout.pillarNorm.toFixed(3)} ` +
          `gold=${baseline.gold.pillarNorm.toFixed(3)}`,
      )
      // eslint-disable-next-line no-console
      console.log(
        improved.length
          ? `Winners (≥+${HOLD_EPS} holdout, gold≥${GOLD_FLOOR}): ${improved.length}`
          : 'NO legal weight trial beat holdout baseline — weights still flat on expanded corpus.',
      )
      if (best.label !== baseline.label) {
        // eslint-disable-next-line no-console
        console.log(`Best legal: ${best.label}`)
        // eslint-disable-next-line no-console
        console.log(`  holdout ${fmt(best.holdout)}  gold ${fmt(best.gold)}`)
        // eslint-disable-next-line no-console
        console.log('  per-tag Δhwy vs baseline:')
        for (const id of corpusIds()) {
          const b = baseline.perTag[String(id)]!
          const n = best.perTag[String(id)]!
          const d = n.pillarNorm - b.pillarNorm
          if (Math.abs(d) >= 0.01) {
            // eslint-disable-next-line no-console
            console.log(
              `    ${id}: ${b.pillarNorm.toFixed(3)} → ${n.pillarNorm.toFixed(3)} (${d >= 0 ? '+' : ''}${d.toFixed(3)})`,
            )
          }
        }
      }

      // Always keep the smoke assertion: baseline still legal.
      expect(baseline.gold.pillarNorm).toBeGreaterThanOrEqual(GOLD_FLOOR)
    },
    900_000,
  )
})
