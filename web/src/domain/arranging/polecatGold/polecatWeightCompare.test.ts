/**
 * Focused compare of sweep winners vs baseline (manual run).
 * @vitest-environment node
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it } from 'vitest'
import { loadCorpusIndex } from './corpus'
import { evalGoldSequence, type EvalWeightOpts } from './sequenceEval'
import type { PolecatGoldSequence } from './types'

const FIX_DIR = resolve(__dirname, 'fixtures')

function loadGold(tagId: number): PolecatGoldSequence {
  return JSON.parse(readFileSync(resolve(FIX_DIR, `${tagId}.json`), 'utf8'))
}

async function dump(label: string, opts: EvalWeightOpts) {
  const idx = loadCorpusIndex()
  const ids = [...idx.gold, ...idx.holdout]
  // eslint-disable-next-line no-console
  console.log(`\n=== ${label} ===`)
  let gSum = 0
  let hSum = 0
  let gN = 0
  let hN = 0
  for (const id of ids) {
    const s = await evalGoldSequence(loadGold(id), opts)
    const role = idx.gold.includes(id) ? 'G' : 'H'
    // eslint-disable-next-line no-console
    console.log(
      `  ${role} ${id} hwy=${s.pillarNorm.toFixed(3)} strict=${s.strictPillarNorm.toFixed(3)}`,
    )
    if (role === 'G') {
      gSum += s.pillarNorm
      gN++
    } else {
      hSum += s.pillarNorm
      hN++
    }
  }
  // eslint-disable-next-line no-console
  console.log(
    `  micro gold=${(gSum / gN).toFixed(3)} holdout=${(hSum / hN).toFixed(3)}`,
  )
}

describe('polecat weight compare', () => {
  it(
    'baseline vs candidates',
    async () => {
      await dump('baseline', {})
      await dump('cadenceBias=off', { pathWeights: { cadenceBias: 'off' } })
      await dump('diatonicFunction=3 only', {
        rankingBase: { diatonicFunction: 3 },
      })
      await dump('sweep best (diatonic=3 seventh=3 unforcedMinor=0.25)', {
        rankingBase: {
          diatonicFunction: 3,
          seventh: 3,
          unforcedMinorPenalty: 0.25,
        },
      })
    },
    180_000,
  )
})
