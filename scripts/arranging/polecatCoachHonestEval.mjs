/**
 * Honest Coach reevaluation vs polecat chart chords.
 *
 * For each polecat:
 *   1. Key = blown_pc from pitch_stacks (fallback: metadata tonality)
 *   2. Melody = Lead from pitch_studio.json (harmony cleared)
 *   3. Infer pillars + Path Optimize Basic (risk:0, classic)
 *   4. Compare predicted collapsed romans vs reference stack romans (STRICT)
 *
 * Also scores the existing "cheat" harness (gold pillars + highway LCS) for contrast.
 *
 * Usage (from repo root, Vite deps in web/):
 *   node scripts/arranging/polecatCoachHonestEval.mjs
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SITE = resolve(__dirname, '../..')
const WEB = resolve(SITE, 'web')
const WORK = resolve(SITE, 'work/polecat-coach-honest')
const requireFromWeb = createRequire(resolve(WEB, 'package.json'))

mkdirSync(WORK, { recursive: true })

const PC_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']

function findPitchStudio(id) {
  const root = resolve(SITE, 'polecats')
  for (const dir of readdirSync(root, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue
    if (!dir.name.includes(` ${id}`) && !dir.name.endsWith(`- ${id}`)) continue
    const studio = join(root, dir.name, 'pitch_studio.json')
    const stacks = join(root, dir.name, 'pitch_stacks.json')
    if (existsSync(studio) && existsSync(stacks)) {
      return { studio, stacks, folder: join(root, dir.name) }
    }
  }
  return null
}

function collapseRomans(items) {
  const out = []
  for (const it of items) {
    if (!it?.roman) continue
    if (out[out.length - 1] === it.roman) continue
    out.push(it.roman)
  }
  return out
}

function collapseStrict(items) {
  const out = []
  for (const it of items) {
    const key = `${it.roman}|${it.natureId}|${it.rootPc}`
    const last = out[out.length - 1]
    if (last && last.key === key) continue
    out.push({ ...it, key })
  }
  return out.map(({ key: _k, ...rest }) => rest)
}

/** LCS length for string arrays */
function lcsLength(a, b) {
  const n = a.length
  const m = b.length
  const dp = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0))
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1])
    }
  }
  return dp[n][m]
}

/** Greedy LCS alignment of roman sequences → side-by-side rows */
function alignSequences(gold, pred) {
  const n = gold.length
  const m = pred.length
  const dp = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0))
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      dp[i][j] =
        gold[i - 1] === pred[j - 1]
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1])
    }
  }
  const rows = []
  let i = n
  let j = m
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && gold[i - 1] === pred[j - 1]) {
      rows.push({ gold: gold[i - 1], pred: pred[j - 1], match: true })
      i--
      j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      rows.push({ gold: '—', pred: pred[j - 1], match: false })
      j--
    } else {
      rows.push({ gold: gold[i - 1], pred: '—', match: false })
      i--
    }
  }
  return rows.reverse()
}

async function main() {
  const { createServer } = requireFromWeb('vite')
  const server = await createServer({
    root: WEB,
    server: { middlewareMode: true },
    appType: 'custom',
    configFile: resolve(WEB, 'vite.config.ts'),
  })

  try {
    const mod = (rel) => server.ssrLoadModule(rel)
    const { normalizeTagRollProject } = await mod('/src/lib/tagRoll/normalize.ts')
    const { tagStudioToArrangement, mergeArrangementIntoTagRoll } = await mod(
      '/src/application/arranging/syncTagRoll.ts',
    )
    const { inferPillars, confirmAllPillars } = await mod(
      '/src/application/arranging/InferPillars.ts',
    )
    const { pathOptimize } = await mod('/src/application/arranging/PathOptimize.ts')
    const { createSequentialIdGenerator } = await mod(
      '/src/adapters/arranging/persistence/systemServices.ts',
    )
    const { romanForChord } = await mod('/src/domain/arranging/secondaryDominant.ts')
    // Import sequenceEval directly (corpus.ts uses __dirname — breaks under Vite SSR).
    const { evalGoldSequence } = await mod(
      '/src/domain/arranging/polecatGold/sequenceEval.ts',
    )

    const FIX_DIR = resolve(WEB, 'src/domain/arranging/polecatGold/fixtures')
    const index = JSON.parse(readFileSync(resolve(FIX_DIR, 'index.json'), 'utf8'))
    const ids = [...(index.gold ?? []), ...(index.holdout ?? [])].sort((a, b) => a - b)
    const fixtures = ids.map((tagId) =>
      JSON.parse(readFileSync(resolve(FIX_DIR, `${tagId}.json`), 'utf8')),
    )
    const results = []

    for (const id of ids) {
      const paths = findPitchStudio(id)
      if (!paths) {
        console.warn(`skip ${id}: no pitch_studio/stacks`)
        continue
      }
      const stacksDoc = JSON.parse(readFileSync(paths.stacks, 'utf8'))
      const blown = stacksDoc.preprocess?.blown_pitch ?? {}
      const blownPc = blown.blown_pc
      const tonality =
        typeof blownPc === 'number' ? blownPc : Number(stacksDoc.tonality)
      const mode = stacksDoc.mode === 'minor' ? 'minor' : 'major'
      const keyLabel = `${PC_NAMES[tonality] ?? tonality} ${mode === 'minor' ? 'minor' : 'Major'}`

      const rawStudio = JSON.parse(readFileSync(paths.studio, 'utf8'))
      const source = normalizeTagRollProject({
        ...rawStudio,
        tonality,
        tonalityMode: mode,
        preferFlats: [1, 3, 5, 8, 10].includes(tonality),
      })
      if (!source) throw new Error(`normalize failed for ${id}`)

      // Reference chords from chart stacks (not highway-collapsed)
      const refTokens = (stacksDoc.stacks || [])
        .filter((s) => s.roman && s.natureId != null && s.rootPc != null)
        .map((s) => ({
          roman: s.roman,
          natureId: s.natureId,
          rootPc: s.rootPc,
        }))
      const refCollapsed = collapseStrict(refTokens)
      const refRomans = collapseRomans(refCollapsed)

      // Honest Coach: melody + key only
      const idGen = createSequentialIdGenerator()
      let arr = tagStudioToArrangement(source, idGen)
      arr = {
        ...arr,
        stacks: [],
        pillars: [],
        tonality,
        tonalityMode: mode,
        preferFlats: [1, 3, 5, 8, 10].includes(tonality),
      }
      arr = confirmAllPillars({ ...arr, pillars: inferPillars(arr, { idGen }) })

      const { project: optimized, report } = await pathOptimize(
        arr,
        {
          mode: 'full',
          scope: { kind: 'whole' },
          weights: { risk: 0, cadenceBias: 'moderate', taste: 'classic' },
          maxPasses: 8,
          skipProbe: true,
        },
        { idGen },
      )

      const predStacks = [...optimized.stacks]
        .filter((s) => s.natureId && s.rootPc != null)
        .sort((a, b) => a.startTick - b.startTick)
        .map((s) => {
          const rootPc = s.rootPc
          const natureId = s.natureId
          const roman = romanForChord({
            rootPc,
            natureId,
            tonality,
            mode,
          })
          return { roman, natureId, rootPc }
        })
      const predCollapsed = collapseStrict(predStacks)
      const predRomans = collapseRomans(predCollapsed)

      const romanLcs = lcsLength(predRomans, refRomans)
      const romanNorm = refRomans.length ? romanLcs / refRomans.length : 1
      const strictKeysGold = refCollapsed.map((t) => `${t.natureId}@${t.rootPc}`)
      const strictKeysPred = predCollapsed.map((t) => `${t.natureId}@${t.rootPc}`)
      const strictLcs = lcsLength(strictKeysPred, strictKeysGold)
      const strictNorm = strictKeysGold.length
        ? strictLcs / strictKeysGold.length
        : 1

      // Cheat harness contrast (gold pillars + highway score)
      const gold = fixtures.find((f) => f.tagId === id)
      let cheat = null
      if (gold) {
        const cheatScore = await evalGoldSequence(gold)
        cheat = {
          highwayPillarNorm: cheatScore.pillarNorm,
          strictPillarNorm: cheatScore.strictPillarNorm,
          natureMatch: cheatScore.natureMatch,
          softFullNorm: cheatScore.softFullNorm,
          goldPillars: cheatScore.goldPillars,
          predPillars: cheatScore.predPillars,
        }
      }

      const alignment = alignSequences(refRomans, predRomans)
      const mismatches = alignment.filter((r) => !r.match)

      const row = {
        tagId: id,
        title: stacksDoc.title || source.title || String(id),
        key: keyLabel,
        tonality,
        blown_pc: blownPc,
        blownMatchesTonality: blownPc === stacksDoc.tonality,
        leadNotes: source.notes.filter((n) => {
          const lead =
            source.parts.find((p) => p.id === source.view.melodyPartId) ??
            source.parts.find((p) => p.name === 'Lead')
          return lead && n.partId === lead.id
        }).length,
        inferredPillars: arr.pillars.length,
        coachStacks: optimized.stacks.length,
        changedCount: report.changedCount,
        honest: {
          refRomanLen: refRomans.length,
          predRomanLen: predRomans.length,
          romanLcs,
          romanNorm: Math.round(romanNorm * 1000) / 1000,
          strictNorm: Math.round(strictNorm * 1000) / 1000,
          refRomans,
          predRomans,
          mismatchCount: mismatches.length,
          mismatchSample: mismatches.slice(0, 24),
        },
        cheat,
      }
      results.push(row)

      writeFileSync(
        resolve(WORK, `${id}-alignment.json`),
        JSON.stringify({ tagId: id, title: row.title, alignment, honest: row.honest, cheat }, null, 2),
      )

      // Optional: save Coach trial project for listening
      const merged = mergeArrangementIntoTagRoll(source, optimized, idGen)
      writeFileSync(
        resolve(WORK, `${id}-coach-result.json`),
        JSON.stringify(
          {
            ...merged,
            id: `seed-coach-trial-polecat-${id}`,
            title: `${row.title} — Coach Classic (honest trial)`,
            subtitle: `Key ${keyLabel} from blown pitch · melody-only regenerate`,
            updatedAt: Date.now(),
          },
          null,
          2,
        ),
      )

      console.log(
        `${id} ${row.title.slice(0, 36).padEnd(36)} key=${keyLabel.padEnd(9)} ` +
          `honest roman=${row.honest.romanNorm.toFixed(3)} strict=${row.honest.strictNorm.toFixed(3)} ` +
          `cheat hwy=${cheat ? cheat.highwayPillarNorm.toFixed(3) : 'n/a'} ` +
          `strictPillar=${cheat ? cheat.strictPillarNorm.toFixed(3) : 'n/a'}`,
      )
    }

    const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
    const summary = {
      updatedAt: new Date().toISOString(),
      method:
        'Honest: blown_pc key + Lead melody only + inferPillars + PathOptimize classic. ' +
        'Cheat: existing polecatGold eval (gold pillar roots + highway LCS).',
      n: results.length,
      honestMicro: {
        romanNorm: Math.round(avg(results.map((r) => r.honest.romanNorm)) * 1000) / 1000,
        strictNorm: Math.round(avg(results.map((r) => r.honest.strictNorm)) * 1000) / 1000,
      },
      cheatMicro: {
        highwayPillarNorm:
          Math.round(avg(results.map((r) => r.cheat?.highwayPillarNorm ?? 0)) * 1000) / 1000,
        strictPillarNorm:
          Math.round(avg(results.map((r) => r.cheat?.strictPillarNorm ?? 0)) * 1000) / 1000,
        softFullNorm:
          Math.round(avg(results.map((r) => r.cheat?.softFullNorm ?? 0)) * 1000) / 1000,
      },
      perTag: results.map((r) => ({
        tagId: r.tagId,
        title: r.title,
        key: r.key,
        blown_pc: r.blown_pc,
        honestRoman: r.honest.romanNorm,
        honestStrict: r.honest.strictNorm,
        cheatHwy: r.cheat?.highwayPillarNorm,
        cheatStrictPillar: r.cheat?.strictPillarNorm,
        cheatSoftFull: r.cheat?.softFullNorm,
        refLen: r.honest.refRomanLen,
        predLen: r.honest.predRomanLen,
      })),
    }

    writeFileSync(resolve(WORK, 'summary.json'), JSON.stringify(summary, null, 2))
    writeFileSync(resolve(WORK, 'full.json'), JSON.stringify(results, null, 2))

    // Markdown report
    const lines = [
      '# Polecat Coach honest reevaluation',
      '',
      `Generated: ${summary.updatedAt}`,
      '',
      '## Verdict',
      '',
      'The prior Coach loop **hypertuned a scoreboard**, not barbershop sound:',
      '',
      '1. **Gold-pillar cheat** — eval fed Coach the chart’s pillar *roots*, so root choice was not melody-driven.',
      '2. **Highway LCS** — treated I≡I7≡I6, V≡V7, ii≡II7, iii≡III7, ninth≡seventh as equal. CI gated on highway≈1.0 while strict/full stayed weak.',
      '3. **Honest regenerate** (melody + blown-pitch key only) shows how far Basic Path Optimize actually is from chart chords.',
      '',
      '## Keys (blown pitch)',
      '',
      '| Tag | Title | blown_pc | key | matches metadata |',
      '| ---: | --- | ---: | --- | --- |',
      ...results.map(
        (r) =>
          `| ${r.tagId} | ${r.title} | ${r.blown_pc} | ${r.key} | ${r.blownMatchesTonality ? 'Y' : 'N'} |`,
      ),
      '',
      '## Scores',
      '',
      `| Mode | roman LCS / ref | strict nature@root | notes |`,
      `| --- | ---: | ---: | --- |`,
      `| **Honest micro** | **${summary.honestMicro.romanNorm}** | **${summary.honestMicro.strictNorm}** | melody+key → Coach |`,
      `| Cheat micro (hwy pillar) | ${summary.cheatMicro.highwayPillarNorm} | ${summary.cheatMicro.strictPillarNorm} (pillar) | gold pillars + highway collapse |`,
      `| Cheat softFull (hwy) | ${summary.cheatMicro.softFullNorm} | — | still highway-soft |`,
      '',
      '### Per tag',
      '',
      '| Tag | Title | Honest roman | Honest strict | Cheat hwy | Cheat strict pillar |',
      '| ---: | --- | ---: | ---: | ---: | ---: |',
      ...summary.perTag.map(
        (r) =>
          `| ${r.tagId} | ${r.title} | ${r.honestRoman} | ${r.honestStrict} | ${r.cheatHwy ?? '—'} | ${r.cheatStrictPillar ?? '—'} |`,
      ),
      '',
      '## What to do next (stop digging)',
      '',
      '- **Stop** weight/taste sweeps against highway LCS.',
      '- **Gate** on honest melody→Coach strict/roman match (or human listen), not highway.',
      '- **Remove** gold pillar roots from any product-facing eval; pillars must be inferred or user-set.',
      '- Fix candidate vocabulary / ranking for barbershop Mm7 language using **strict** mismatches in `work/polecat-coach-honest/*-alignment.json`.',
      '',
      `Artifacts: \`${WORK}/\``,
      '',
    ]
    writeFileSync(resolve(WORK, 'REPORT.md'), lines.join('\n'))
    // Also publish under docs for the arranging folder
    writeFileSync(
      resolve(SITE, 'docs/arranging/polecat-coach-honest-reeval-2026-10.md'),
      lines.join('\n'),
    )

    console.log('\n=== MICRO ===')
    console.log(
      `honest roman=${summary.honestMicro.romanNorm} strict=${summary.honestMicro.strictNorm}`,
    )
    console.log(
      `cheat  hwy=${summary.cheatMicro.highwayPillarNorm} strictPillar=${summary.cheatMicro.strictPillarNorm} softFull=${summary.cheatMicro.softFullNorm}`,
    )
    console.log(`\nReport: ${resolve(WORK, 'REPORT.md')}`)
    console.log(
      `Docs: ${resolve(SITE, 'docs/arranging/polecat-coach-honest-reeval-2026-10.md')}`,
    )
  } finally {
    await server.close()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
