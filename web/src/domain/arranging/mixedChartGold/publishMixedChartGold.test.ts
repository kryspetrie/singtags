/**
 * Generate auto-gold fixtures + ambiguity reports for pilot mixed polecats.
 * Run: npx vitest run src/domain/arranging/mixedChartGold/publishMixedChartGold.test.ts
 *
 * @vitest-environment node
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  applyGoldOverrides,
  buildGoldFromChart,
  listAmbiguousOnsets,
  summarizeGold,
  type MixedGoldOverridesFile,
} from './index'
import {
  loadMixedSeedProject,
  tagRollProjectToGoldChart,
} from '../../../lib/tagRoll/mixedChartGoldSeed'

const __dirname = dirname(fileURLToPath(import.meta.url))
const WEB_ROOT = resolve(__dirname, '../../../..')
const SEED_DIR = resolve(WEB_ROOT, 'public/tag-studio/polecat-mixed-seeds')
const FIXTURE_DIR = resolve(__dirname, 'fixtures')
const OVERRIDES_DIR = resolve(WEB_ROOT, '../polecats/mixed-musicxml/gold-overrides')
const REPORT_DIR = resolve(FIXTURE_DIR, 'ambiguity')

/** Phase 0 pilots — expand after locks land. */
const PILOTS = [90001, 90006, 90011] as const

function loadOverrides(tagId: number): MixedGoldOverridesFile | null {
  try {
    const raw = JSON.parse(
      readFileSync(resolve(OVERRIDES_DIR, `${tagId}.json`), 'utf8'),
    ) as MixedGoldOverridesFile
    if (raw.tagId !== tagId || !Array.isArray(raw.overrides)) return null
    return raw
  } catch {
    return null
  }
}

describe('publishMixedChartGold', () => {
  it('writes auto-gold fixtures and ambiguity reports for pilots', () => {
    mkdirSync(FIXTURE_DIR, { recursive: true })
    mkdirSync(REPORT_DIR, { recursive: true })
    mkdirSync(OVERRIDES_DIR, { recursive: true })

    const index: {
      pilots: number[]
      projects: Array<{
        tagId: number
        file: string
        verified: boolean
        lockCoverage: number
        stackOnsets: number
        locked: number
        unlocked: number
      }>
    } = { pilots: [...PILOTS], projects: [] }

    for (const tagId of PILOTS) {
      const raw = JSON.parse(readFileSync(resolve(SEED_DIR, `${tagId}.json`), 'utf8'))
      const project = loadMixedSeedProject(raw)
      const chart = tagRollProjectToGoldChart(project)
      let gold = buildGoldFromChart({ chart, tagId, profile: 'sai11' })
      const ov = loadOverrides(tagId)
      if (ov?.overrides.length) {
        gold = applyGoldOverrides(gold, ov.overrides)
      }

      const sum = summarizeGold(gold)
      const ambiguous = listAmbiguousOnsets(gold)

      writeFileSync(
        resolve(FIXTURE_DIR, `${tagId}.json`),
        `${JSON.stringify(gold, null, 2)}\n`,
      )
      writeFileSync(
        resolve(REPORT_DIR, `${tagId}.json`),
        `${JSON.stringify(
          {
            tagId,
            summary: sum,
            ambiguous: ambiguous.map((o) => ({
              startTick: o.startTick,
              leadMidi: o.leadMidi,
              midi: o.midi,
              auto: { rootPc: o.rootPc, natureId: o.natureId, roman: o.roman },
              confidence: o.confidence,
              alts: o.altCandidates ?? [],
            })),
          },
          null,
          2,
        )}\n`,
      )

      // Starter empty overrides file if missing (manual lock target).
      if (!ov) {
        writeFileSync(
          resolve(OVERRIDES_DIR, `${tagId}.json`),
          `${JSON.stringify({ tagId, overrides: [] }, null, 2)}\n`,
        )
      }

      index.projects.push({
        tagId,
        file: `${tagId}.json`,
        verified: gold.verified,
        lockCoverage: Number(sum.lockCoverage.toFixed(4)),
        stackOnsets: sum.stackOnsets,
        locked: sum.locked,
        unlocked: sum.unlocked,
      })

      expect(sum.stackOnsets).toBeGreaterThan(8)
      expect(gold.onsets.length).toBeGreaterThan(8)
    }

    writeFileSync(resolve(FIXTURE_DIR, 'index.json'), `${JSON.stringify(index, null, 2)}\n`)
    expect(index.projects).toHaveLength(3)
  })
})
