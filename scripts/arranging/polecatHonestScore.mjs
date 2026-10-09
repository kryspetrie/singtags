/**
 * Fast honest Coach score vs all polecats (melody + blown-pitch key).
 *
 * Metrics:
 *   - timeHit: fraction of ref stacks whose roman equals Coach at stack midpoint
 *   - timeStrict: same for natureId@rootPc
 *   - romanLcs: collapsed roman LCS / ref len (sequence)
 *
 * Usage:
 *   node scripts/arranging/polecatHonestScore.mjs [--label PASS_NAME] [--save]
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SITE = resolve(__dirname, '../..')
const WEB = resolve(SITE, 'web')
const WORK = resolve(SITE, 'work/polecat-honest-loop')
const requireFromWeb = createRequire(resolve(WEB, 'package.json'))
mkdirSync(WORK, { recursive: true })

const args = process.argv.slice(2)
const labelIdx = args.indexOf('--label')
const label = labelIdx >= 0 ? args[labelIdx + 1] : 'run'
const doSave = args.includes('--save')

function findPitchStudio(id) {
  const root = resolve(SITE, 'polecats')
  for (const dir of readdirSync(root, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue
    if (!dir.name.includes(` ${id}`) && !dir.name.endsWith(`-${id}`)) continue
    const studio = join(root, dir.name, 'pitch_studio.json')
    const stacks = join(root, dir.name, 'pitch_stacks.json')
    if (existsSync(studio) && existsSync(stacks)) return { studio, stacks }
  }
  return null
}

function collapseRomans(romans) {
  const out = []
  for (const r of romans) {
    if (!r) continue
    if (out[out.length - 1] === r) continue
    out.push(r)
  }
  return out
}

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

function stackCovering(stacks, tick) {
  let best = null
  for (const s of stacks) {
    if (s.startTick <= tick && (!best || s.startTick >= best.startTick)) best = s
  }
  return best
}

function secToTick(sec, bpm, ppq) {
  return Math.round(sec * (bpm / 60) * ppq)
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
    const { tagStudioToArrangement } = await mod('/src/application/arranging/syncTagRoll.ts')
    const { inferPillars, confirmAllPillars } = await mod(
      '/src/application/arranging/InferPillars.ts',
    )
    const { pathOptimize } = await mod('/src/application/arranging/PathOptimize.ts')
    const { createSequentialIdGenerator } = await mod(
      '/src/adapters/arranging/persistence/systemServices.ts',
    )
    const { romanForChord } = await mod('/src/domain/arranging/secondaryDominant.ts')

    const FIX_DIR = resolve(WEB, 'src/domain/arranging/polecatGold/fixtures')
    const index = JSON.parse(readFileSync(resolve(FIX_DIR, 'index.json'), 'utf8'))
    const ids = [...(index.gold ?? []), ...(index.holdout ?? [])].sort((a, b) => a - b)

    const perTag = []
    for (const id of ids) {
      const paths = findPitchStudio(id)
      if (!paths) continue
      const stacksDoc = JSON.parse(readFileSync(paths.stacks, 'utf8'))
      const blownPc = stacksDoc.preprocess?.blown_pitch?.blown_pc
      const tonality =
        typeof blownPc === 'number' ? blownPc : Number(stacksDoc.tonality)
      const mode = stacksDoc.mode === 'minor' ? 'minor' : 'major'
      const raw = JSON.parse(readFileSync(paths.studio, 'utf8'))
      const source = normalizeTagRollProject({
        ...raw,
        tonality,
        tonalityMode: mode,
        preferFlats: [1, 3, 5, 8, 10].includes(tonality),
      })
      if (!source) throw new Error(`normalize ${id}`)

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
      const { project: out } = await pathOptimize(
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

      const bpm = Number(source.bpm) || Number(stacksDoc.bpm) || 60
      const ppq = Number(source.ppq) || 480
      const coachStacks = [...out.stacks]
        .filter((s) => s.natureId && s.rootPc != null)
        .sort((a, b) => a.startTick - b.startTick)

      const ref = (stacksDoc.stacks || []).filter(
        (s) => s.roman && s.natureId != null && s.rootPc != null,
      )

      let timeHit = 0
      let timeStrict = 0
      const predAtRef = []
      for (const s of ref) {
        const mid = (Number(s.t0) + Number(s.t1)) / 2
        const tick = secToTick(mid, bpm, ppq)
        const cov = stackCovering(coachStacks, tick)
        const predRoman = cov
          ? romanForChord({
              rootPc: cov.rootPc,
              natureId: cov.natureId,
              tonality,
              mode,
            })
          : null
        predAtRef.push(predRoman)
        if (predRoman === s.roman) timeHit++
        if (
          cov &&
          cov.rootPc === s.rootPc &&
          cov.natureId === s.natureId
        ) {
          timeStrict++
        }
      }
      const n = ref.length || 1
      const refRomans = collapseRomans(ref.map((s) => s.roman))
      const predRomans = collapseRomans(
        coachStacks.map((s) =>
          romanForChord({
            rootPc: s.rootPc,
            natureId: s.natureId,
            tonality,
            mode,
          }),
        ),
      )
      const romanLcs = lcsLength(predRomans, refRomans)
      const romanNorm = refRomans.length ? romanLcs / refRomans.length : 1

      // Nature histogram of coach
      const natures = {}
      for (const s of coachStacks) {
        natures[s.natureId] = (natures[s.natureId] || 0) + 1
      }

      perTag.push({
        tagId: id,
        title: stacksDoc.title || source.title,
        tonality,
        blown_pc: blownPc,
        pillars: arr.pillars.length,
        stacks: coachStacks.length,
        timeHit: Math.round((timeHit / n) * 1000) / 1000,
        timeStrict: Math.round((timeStrict / n) * 1000) / 1000,
        romanNorm: Math.round(romanNorm * 1000) / 1000,
        refLen: ref.length,
        predLen: coachStacks.length,
        refRomans,
        predRomans,
        natures,
      })
      process.stdout.write(
        `${id} time=${(timeHit / n).toFixed(3)} strict=${(timeStrict / n).toFixed(3)} ` +
          `roman=${romanNorm.toFixed(3)} stacks=${coachStacks.length}/${ref.length}\n`,
      )
    }

    const avg = (xs) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1)
    const micro = {
      timeHit: Math.round(avg(perTag.map((t) => t.timeHit)) * 1000) / 1000,
      timeStrict: Math.round(avg(perTag.map((t) => t.timeStrict)) * 1000) / 1000,
      romanNorm: Math.round(avg(perTag.map((t) => t.romanNorm)) * 1000) / 1000,
    }
    const result = {
      label,
      at: new Date().toISOString(),
      micro,
      perTag: perTag.map((t) => ({
        tagId: t.tagId,
        title: t.title,
        timeHit: t.timeHit,
        timeStrict: t.timeStrict,
        romanNorm: t.romanNorm,
        stacks: t.stacks,
        natures: t.natures,
        predRomans: t.predRomans,
      })),
    }
    console.log(
      `\n[${label}] MICRO timeHit=${micro.timeHit} timeStrict=${micro.timeStrict} romanLcs=${micro.romanNorm}`,
    )

    writeFileSync(resolve(WORK, 'latest.json'), JSON.stringify(result, null, 2))
    if (doSave) {
      writeFileSync(resolve(WORK, `${label}.json`), JSON.stringify(result, null, 2))
      appendFileSync(
        resolve(WORK, 'PASSLOG.md'),
        `\n## ${label} (${result.at})\n\n` +
          `- timeHit **${micro.timeHit}** · timeStrict **${micro.timeStrict}** · romanLcs **${micro.romanNorm}**\n` +
          perTag
            .map(
              (t) =>
                `  - ${t.tagId}: time=${t.timeHit} strict=${t.timeStrict} roman=${t.romanNorm} pred=${t.predRomans.slice(0, 12).join(' ')}${t.predRomans.length > 12 ? '…' : ''}`,
            )
            .join('\n') +
          '\n',
      )
    }
    // Primary ranking key for keep/revert: timeHit, then timeStrict, then romanNorm
    writeFileSync(
      resolve(WORK, 'score.txt'),
      `${micro.timeHit}\t${micro.timeStrict}\t${micro.romanNorm}\t${label}\n`,
    )
  } finally {
    await server.close()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
