/**
 * Classic Tags chord-sequence eval — advisory corpus (no CI gold gate yet).
 *
 * @vitest-environment node
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { PolecatGoldSequence, SequenceScore } from '../polecatGold/types'
import { evalGoldSequence, microAverage } from '../polecatGold/sequenceEval'
import { classicCorpusIds, loadClassicIndex } from './corpus'

const FIX_DIR = resolve(__dirname, 'fixtures')
const BASELINE_PATH = resolve(__dirname, 'baseline.json')

type TagBaseline = {
  pillarNorm: number
  natureMatch: number
  softFullNorm: number
  strictPillarNorm?: number
}

type Baseline = {
  updatedAt: string
  note: string
  micro: TagBaseline
  perTag: Record<string, TagBaseline>
}

function loadGold(tagId: number): PolecatGoldSequence {
  return JSON.parse(readFileSync(resolve(FIX_DIR, `${tagId}.json`), 'utf8'))
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

describe('classic tags sequence corpus', () => {
  it('loads fixtures when built', () => {
    const idx = loadClassicIndex()
    if (!idx.corpus.length) {
      // eslint-disable-next-line no-console
      console.warn('classicGold fixtures empty — run build_classic_sequences.py')
      return
    }
    expect(idx.corpus.length).toBeGreaterThan(10)
    for (const id of idx.corpus.slice(0, 5)) {
      const g = loadGold(id)
      expect(g.tagId).toBe(id)
      expect(g.pillarCount).toBeGreaterThan(3)
    }
  })

  it(
    'Basic Optimize pillar-LCS — advisory baseline for Classic corpus',
    async () => {
      const ids = classicCorpusIds()
      if (!ids.length) {
        // eslint-disable-next-line no-console
        console.warn('skip: no classic fixtures')
        return
      }

      const scores: SequenceScore[] = []
      for (const id of ids) {
        const sc = await evalGoldSequence(loadGold(id))
        scores.push(sc)
        if (sc.pillarNorm < 0.9 || ids.length <= 20) {
          // eslint-disable-next-line no-console
          console.log(
            `classic ${id} hwy=${sc.pillarNorm.toFixed(3)} strict=${sc.strictPillarNorm.toFixed(3)} ` +
              `${sc.title?.slice(0, 40) ?? ''}`,
          )
        }
      }

      const micro = microWithStrict(scores)
      // eslint-disable-next-line no-console
      console.log(
        `classic micro n=${scores.length} hwy=${micro.pillarNorm} ` +
          `strict=${micro.strictPillarNorm} nature=${micro.natureMatch}`,
      )

      const soft = scores.filter((s) => s.pillarNorm < 0.9).length
      const sat = scores.filter((s) => s.pillarNorm >= 0.99).length
      // eslint-disable-next-line no-console
      console.log(`  saturated(≥0.99)=${sat} soft(<0.90)=${soft}`)

      const next: Baseline = {
        updatedAt: new Date().toISOString(),
        note: 'Classic Tags advisory baseline — default Basic Path Optimize.',
        micro,
        perTag: Object.fromEntries(scores.map((s) => [String(s.tagId), tagBaseline(s)])),
      }
      // Always refresh advisory baseline snapshot for the corpus doc.
      writeFileSync(BASELINE_PATH, JSON.stringify(next, null, 2) + '\n')

      const prev = existsSync(BASELINE_PATH)
        ? (JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as Baseline)
        : null
      void prev
      expect(micro.pillarNorm).toBeGreaterThan(0.5)
      expect(scores.length).toBe(ids.length)
    },
    600_000,
  )
})
