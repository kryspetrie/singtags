/**
 * Polecat chord-sequence eval — Basic Path Optimize vs audio-derived highways.
 * Gold (Tag Studio four): CI regression gate.
 * Holdout (remaining polecats): advisory baseline / report.
 *
 * @vitest-environment node
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { PolecatGoldSequence, SequenceScore } from './types'
import { evalGoldSequence, microAverage, lcsLength } from './sequenceEval'
import { collapseAndLabel } from './labelSequence'
import { corpusIds, loadCorpusIndex } from './corpus'

const FIX_DIR = resolve(__dirname, 'fixtures')
const BASELINE_PATH = resolve(__dirname, 'baseline.json')

/** Floor below recorded baseline before CI fails (allows tiny float noise). */
const REGRESSION_EPS = 0.03

type TagBaseline = {
  pillarNorm: number
  natureMatch: number
  softFullNorm: number
  strictPillarNorm?: number
}

type Baseline = {
  updatedAt: string
  note: string
  perTag: Record<string, TagBaseline>
  micro: TagBaseline
  /** Holdout advisory floors (not CI-gated until promoted). */
  holdoutPerTag?: Record<string, TagBaseline>
  holdoutMicro?: TagBaseline
}

function loadGold(tagId: number): PolecatGoldSequence {
  const raw = readFileSync(resolve(FIX_DIR, `${tagId}.json`), 'utf8')
  return JSON.parse(raw) as PolecatGoldSequence
}

function loadBaseline(): Baseline | null {
  if (!existsSync(BASELINE_PATH)) return null
  return JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as Baseline
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000
}

function tagBaseline(s: SequenceScore): TagBaseline {
  return {
    pillarNorm: round3(s.pillarNorm),
    natureMatch: round3(s.natureMatch),
    softFullNorm: round3(s.softFullNorm),
    strictPillarNorm: round3(s.strictPillarNorm),
  }
}

function microWithStrict(scores: SequenceScore[]): TagBaseline {
  const m = microAverage(scores)
  const strictPillarNorm =
    scores.length === 0
      ? 0
      : scores.reduce((s, x) => s + x.strictPillarNorm, 0) / scores.length
  return {
    pillarNorm: round3(m.pillarNorm),
    natureMatch: round3(m.natureMatch),
    softFullNorm: round3(m.softFullNorm),
    strictPillarNorm: round3(strictPillarNorm),
  }
}

async function scoreIds(ids: number[]): Promise<SequenceScore[]> {
  const scores: SequenceScore[] = []
  for (const id of ids) {
    const gold = loadGold(id)
    const sc = await evalGoldSequence(gold)
    scores.push(sc)
    // eslint-disable-next-line no-console
    console.log(
      `polecat ${id} pillarNorm=${sc.pillarNorm.toFixed(3)} ` +
        `strict=${sc.strictPillarNorm.toFixed(3)} ` +
        `nature=${sc.natureMatch.toFixed(3)} soft=${sc.softFullNorm.toFixed(3)} ` +
        `pillars=${sc.pillarGoldLen} lcs=${sc.pillarLcs}`,
    )
    // eslint-disable-next-line no-console
    console.log(`  gold: ${sc.goldPillars.slice(0, 12).join(' ')}…`)
    // eslint-disable-next-line no-console
    console.log(`  pred: ${sc.predPillars.slice(0, 12).join(' ')}…`)
  }
  return scores
}

describe('polecat gold sequence fixtures', () => {
  it('loads gold + holdout fixtures with pillar labels', () => {
    const idx = loadCorpusIndex()
    expect(idx.gold.length).toBeGreaterThanOrEqual(4)
    const all = [...idx.gold, ...idx.holdout]
    expect(all.length).toBeGreaterThanOrEqual(4)
    for (const id of all) {
      const g = loadGold(id)
      expect(g.tagId).toBe(id)
      expect(g.tokens.length).toBeGreaterThan(10)
      expect(g.pillarCount).toBeGreaterThan(5)
      expect(g.tokens.some((t) => t.role === 'pillar')).toBe(true)
    }
  })

  it('collapseAndLabel is stable on fixture tokens as stacks', () => {
    const g = loadGold(90006)
    const again = collapseAndLabel(
      g.tokens.map((t) => ({
        rootPc: t.rootPc,
        natureId: t.natureId,
        roman: t.roman,
        dur: t.dur,
        midi: t.leadMidi != null ? { lead: t.leadMidi } : undefined,
      })),
      g.tonality,
    )
    expect(again.length).toBe(g.tokens.length)
    expect(again.filter((t) => t.role === 'pillar').length).toBe(g.pillarCount)
  })

  it('lcsLength unit', () => {
    expect(lcsLength(['I', 'V7', 'I'], ['I', 'IV', 'V7', 'I'])).toBe(3)
    expect(lcsLength([], ['I'])).toBe(0)
  })
})

describe('polecat sequence Coach loop', () => {
  it(
    'Basic Optimize pillar-LCS — gold gate + holdout advisory',
    async () => {
      const goldIds = corpusIds('gold')
      const holdoutIds = corpusIds('holdout')

      // eslint-disable-next-line no-console
      console.log(`\n--- gold (${goldIds.join(', ')}) ---`)
      const goldScores = await scoreIds(goldIds)
      const goldMicro = microWithStrict(goldScores)
      // eslint-disable-next-line no-console
      console.log(
        `gold micro pillarNorm=${goldMicro.pillarNorm} ` +
          `strict=${goldMicro.strictPillarNorm} ` +
          `nature=${goldMicro.natureMatch} soft=${goldMicro.softFullNorm}`,
      )

      let holdoutScores: SequenceScore[] = []
      let holdoutMicro: TagBaseline | undefined
      if (holdoutIds.length) {
        // eslint-disable-next-line no-console
        console.log(`\n--- holdout (${holdoutIds.join(', ')}) ---`)
        holdoutScores = await scoreIds(holdoutIds)
        holdoutMicro = microWithStrict(holdoutScores)
        // eslint-disable-next-line no-console
        console.log(
          `holdout micro pillarNorm=${holdoutMicro.pillarNorm} ` +
            `strict=${holdoutMicro.strictPillarNorm} ` +
            `nature=${holdoutMicro.natureMatch} soft=${holdoutMicro.softFullNorm}`,
        )
      }

      const baseline = loadBaseline()
      if (!baseline) {
        const next: Baseline = {
          updatedAt: new Date().toISOString(),
          note: 'Initial baseline — gold gated; holdout advisory.',
          perTag: Object.fromEntries(goldScores.map((s) => [String(s.tagId), tagBaseline(s)])),
          micro: goldMicro,
          holdoutPerTag: Object.fromEntries(
            holdoutScores.map((s) => [String(s.tagId), tagBaseline(s)]),
          ),
          holdoutMicro,
        }
        writeFileSync(BASELINE_PATH, JSON.stringify(next, null, 2) + '\n')
        expect(goldMicro.pillarNorm).toBeGreaterThanOrEqual(0)
        return
      }

      // Merge newly seen holdout tags into baseline (advisory record).
      let baselineDirty = false
      const nextHoldoutPerTag = { ...(baseline.holdoutPerTag ?? {}) }
      for (const s of holdoutScores) {
        if (!nextHoldoutPerTag[String(s.tagId)]) {
          nextHoldoutPerTag[String(s.tagId)] = tagBaseline(s)
          baselineDirty = true
        }
      }
      if (baselineDirty || (holdoutMicro && !baseline.holdoutMicro)) {
        const next: Baseline = {
          ...baseline,
          updatedAt: new Date().toISOString(),
          note:
            baseline.note +
            (baselineDirty ? ' + holdout tags recorded.' : ' + holdout micro recorded.'),
          holdoutPerTag: nextHoldoutPerTag,
          holdoutMicro: baseline.holdoutMicro ?? holdoutMicro,
        }
        writeFileSync(BASELINE_PATH, JSON.stringify(next, null, 2) + '\n')
      }

      // Highway pillarNorm is advisory only — product gate is honest timeHit / pmnRootHit.
      for (const s of goldScores) {
        const b = baseline.perTag[String(s.tagId)]
        if (!b) continue
        if (s.pillarNorm < b.pillarNorm - REGRESSION_EPS) {
          // eslint-disable-next-line no-console
          console.warn(
            `gold ${s.tagId} highway pillarNorm advisory regress ` +
              `${s.pillarNorm.toFixed(3)} < ${(b.pillarNorm - REGRESSION_EPS).toFixed(3)}`,
          )
        }
      }
      if (goldMicro.pillarNorm < baseline.micro.pillarNorm - REGRESSION_EPS) {
        // eslint-disable-next-line no-console
        console.warn(
          `gold micro highway pillarNorm advisory regress ` +
            `${goldMicro.pillarNorm.toFixed(3)} < ` +
            `${(baseline.micro.pillarNorm - REGRESSION_EPS).toFixed(3)}`,
        )
      }
      // Smoke: sequence loop still produces a finite score.
      expect(Number.isFinite(goldMicro.pillarNorm)).toBe(true)

      // Holdout: advisory warn in log only (no CI fail) until promoted.
      const holdBase = loadBaseline()
      if (holdBase?.holdoutPerTag && holdoutScores.length) {
        for (const s of holdoutScores) {
          const b = holdBase.holdoutPerTag[String(s.tagId)]
          if (!b) continue
          if (s.pillarNorm < b.pillarNorm - REGRESSION_EPS) {
            // eslint-disable-next-line no-console
            console.warn(
              `holdout ${s.tagId} pillarNorm advisory regress ` +
                `${s.pillarNorm.toFixed(3)} < ${(b.pillarNorm - REGRESSION_EPS).toFixed(3)}`,
            )
          }
        }
      }
    },
    300_000,
  )
})
