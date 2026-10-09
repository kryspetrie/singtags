/**
 * Offline fit: Strong-aligned chart roots → prior table + transition matrix.
 * Chart labels never enter Auto Coach at runtime — only emitted tables do.
 *
 *   node scripts/arranging/fitStrongRootPriors.mjs [--confusion]
 *   → web/src/domain/arranging/strongRootPriors.generated.ts
 *   → web/src/domain/arranging/strongRootTransitions.generated.ts
 *   → work/polecat-honest-loop/prior-confusion.json (with --confusion)
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SITE = resolve(__dirname, '../..')
const WEB = resolve(SITE, 'web')
const WORK = resolve(SITE, 'work/polecat-honest-loop')
const OUT_PRIORS = resolve(WEB, 'src/domain/arranging/strongRootPriors.generated.ts')
const OUT_TRANS = resolve(WEB, 'src/domain/arranging/strongRootTransitions.generated.ts')
const requireFromWeb = createRequire(resolve(WEB, 'package.json'))
const dumpConfusion = process.argv.includes('--confusion')
mkdirSync(WORK, { recursive: true })

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

function secToTick(sec, bpm, ppq) {
  return Math.round(sec * (bpm / 60) * ppq)
}

function refCovering(refTicks, tick) {
  let best = null
  for (const s of refTicks) {
    if (s.startTick <= tick && tick < s.endTick && (!best || s.startTick >= best.startTick)) {
      best = s
    }
  }
  if (best) return best
  for (const s of refTicks) {
    if (s.startTick <= tick && (!best || s.startTick >= best.startTick)) best = s
  }
  return best
}

function bareDeg(sd) {
  if (sd === 0 || sd === 4 || sd === 7) return 0
  if (sd === 5 || sd === 9) return 5
  if (sd === 2 || sd === 11) return 7
  if (sd === 3 || sd === 8) return 0
  return null
}

function snapHomeDeg(deg) {
  if (deg === 0 || deg === 4) return 0
  if (deg === 5 || deg === 9) return deg === 9 ? 9 : 5
  if (deg === 7 || deg === 2 || deg === 11) return deg === 2 ? 2 : 7
  return deg
}

/** eighth | quarter | longer */
function durBucket(durationTicks, beat) {
  if (durationTicks < beat / 2) return 'e'
  if (durationTicks < beat * 1.5) return 'q'
  return 'l'
}

/** step | leap | x (no prev) */
function intervalClass(prevMidi, midi) {
  if (prevMidi == null) return 'x'
  return Math.abs(midi - prevMidi) <= 2 ? 's' : 'L'
}

/** 0 | 1 | 2+ bars from phrase-local first strong */
function barsFromStart(noteTick, phraseStartTick, bar) {
  const bars = Math.floor((noteTick - phraseStartTick) / bar)
  if (bars <= 0) return '0'
  if (bars === 1) return '1'
  return '2'
}

function bump(map, key, deg) {
  if (!map.has(key)) map.set(key, {})
  const bucket = map.get(key)
  bucket[deg] = (bucket[deg] || 0) + 1
}

function tableFromConf(conf, minSupport, minRate) {
  /** @type {Record<string, number>} */
  const table = {}
  for (const [key, hist] of conf.entries()) {
    const total = Object.values(hist).reduce((a, b) => a + b, 0)
    const parts = key.split('|').length
    const need =
      typeof minSupport === 'function'
        ? minSupport(parts)
        : parts >= 6
          ? minSupport.full
          : parts >= 5
            ? minSupport.mid
            : parts >= 4
              ? minSupport.short
              : minSupport.bare
    if (total < need) continue
    const best = Object.entries(hist).sort((a, b) => b[1] - a[1])[0]
    if (best[1] / total < minRate) continue
    table[key] = Number(best[0])
  }
  return table
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
    const mod = (r) => server.ssrLoadModule(r)
    const { normalizeTagRollProject } = await mod('/src/lib/tagRoll/normalize.ts')
    const { tagStudioToArrangement } = await mod('/src/application/arranging/syncTagRoll.ts')
    const { assignMelodyRoles } = await mod('/src/domain/arranging/melodyRoles.ts')
    const { createSequentialIdGenerator } = await mod(
      '/src/adapters/arranging/persistence/systemServices.ts',
    )

    const FIX_DIR = resolve(WEB, 'src/domain/arranging/polecatGold/fixtures')
    const index = JSON.parse(readFileSync(resolve(FIX_DIR, 'index.json'), 'utf8'))
    const ids = [...(index.gold ?? []), ...(index.holdout ?? [])]

    const conf = new Map()
    /** @type {Map<string, number>} */
    const transitions = new Map()
    let samples = 0
    /** @type {Record<string, { miss: Record<string, number>; n: number }>} */
    const confusionByTag = {}

    for (const id of ids) {
      const paths = findPitchStudio(id)
      if (!paths) continue
      const stacksDoc = JSON.parse(readFileSync(paths.stacks, 'utf8'))
      const blownPc = stacksDoc.preprocess?.blown_pitch?.blown_pc
      const tonality =
        typeof blownPc === 'number' ? blownPc : Number(stacksDoc.tonality)
      const mode = stacksDoc.mode === 'minor' ? 'minor' : 'major'
      if (mode === 'minor') continue
      const raw = JSON.parse(readFileSync(paths.studio, 'utf8'))
      const source = normalizeTagRollProject({
        ...raw,
        tonality,
        tonalityMode: mode,
        preferFlats: [1, 3, 5, 8, 10].includes(tonality),
      })
      if (!source) continue
      const idGen = createSequentialIdGenerator()
      const arr = tagStudioToArrangement(source, idGen)
      const ppq = arr.ppq || 480
      const beat = ppq
      const bar = beat * 4
      const phraseGap = Math.floor(beat * 1.5)
      const melody = assignMelodyRoles(
        arr.melody,
        { ppq, tonality, promoteChangePoints: true, promoteCoverage: true },
        { force: true },
      )
        .filter((m) => m.role === 'pmn')
        .sort((a, b) => a.startTick - b.startTick)
      const bpm = Number(source.bpm) || Number(stacksDoc.bpm) || 60
      const refTicks = (stacksDoc.stacks || [])
        .filter((s) => s.rootPc != null)
        .map((s) => ({
          startTick: secToTick(Number(s.t0), bpm, ppq),
          endTick: Math.max(
            secToTick(Number(s.t1), bpm, ppq),
            secToTick(Number(s.t0), bpm, ppq) + 1,
          ),
          rootPc: s.rootPc,
        }))

      // Phrase starts among strongs
      const phraseStartTick = []
      let pStart = melody[0]?.startTick ?? 0
      for (let i = 0; i < melody.length; i++) {
        if (i > 0) {
          const prev = melody[i - 1]
          const gap = melody[i].startTick - (prev.startTick + prev.durationTicks)
          if (gap > phraseGap) pStart = melody[i].startTick
        }
        phraseStartTick[i] = pStart
      }

      let prevChartDeg = 'x'
      let prevMidi = null
      confusionByTag[id] = { miss: {}, n: 0 }
      for (let i = 0; i < melody.length; i++) {
        const note = melody[i]
        const next = melody[i + 1]
        // A1 policy: chart label @ Strong midpoint (same as polecatHonestScore).
        const chart = refCovering(
          refTicks,
          note.startTick + Math.floor(Math.max(1, note.durationTicks) / 2),
        )
        if (!chart) continue
        const sd = (((note.midi % 12) - tonality) % 12 + 12) % 12
        const chartDeg = snapHomeDeg((((chart.rootPc - tonality) % 12) + 12) % 12)
        const prevDeg = prevChartDeg
        const nextBare =
          next != null
            ? bareDeg((((next.midi % 12) - tonality) % 12 + 12) % 12) ?? 'x'
            : 'x'
        const phraseEdge =
          i === 0 || phraseStartTick[i] === note.startTick
            ? 's'
            : i === melody.length - 1
              ? 'e'
              : 'm'
        const beatInBar = Math.floor((note.startTick / beat) % 4)
        const dur = durBucket(note.durationTicks, beat)
        const iv = intervalClass(prevMidi, note.midi)
        const bfs = barsFromStart(note.startTick, phraseStartTick[i], bar)

        const keys = [
          // richest first
          `sd${sd}|p${prevDeg}|n${nextBare}|${phraseEdge}|b${beatInBar}|d${dur}|i${iv}|f${bfs}`,
          `sd${sd}|p${prevDeg}|${phraseEdge}|d${dur}|i${iv}`,
          `sd${sd}|p${prevDeg}|${phraseEdge}|d${dur}`,
          `sd${sd}|p${prevDeg}|n${nextBare}|${phraseEdge}|b${beatInBar}`,
          `sd${sd}|p${prevDeg}|n${nextBare}|${phraseEdge}`,
          `sd${sd}|p${prevDeg}|${phraseEdge}|f${bfs}`,
          `sd${sd}|p${prevDeg}|${phraseEdge}`,
          `sd${sd}|p${prevDeg}|d${dur}`,
          `sd${sd}|p${prevDeg}`,
          `sd${sd}|${phraseEdge}|f${bfs}`,
          `sd${sd}|${phraseEdge}`,
        ]
        for (const key of keys) bump(conf, key, chartDeg)

        // Bare "pred" for confusion dump (offline diagnostic)
        const bare = bareDeg(sd) ?? 0
        if (bare !== chartDeg) {
          const mk = `sd${sd}->${bare}≠${chartDeg}|p${prevDeg}|${phraseEdge}`
          confusionByTag[id].miss[mk] = (confusionByTag[id].miss[mk] || 0) + 1
        }
        confusionByTag[id].n++

        if (prevChartDeg !== 'x') {
          const tk = `${prevChartDeg}->${chartDeg}`
          transitions.set(tk, (transitions.get(tk) || 0) + 1)
        }
        samples++
        prevChartDeg = String(chartDeg)
        prevMidi = note.midi
      }
    }

    const minSupport = { full: 3, mid: 3, short: 4, bare: 5 }
    const table = tableFromConf(conf, (parts) => {
      if (parts >= 7) return 2
      if (parts >= 6) return minSupport.full
      if (parts >= 5) return minSupport.mid
      if (parts >= 4) return minSupport.short
      return minSupport.bare
    }, 0.36)

    const priorKeys = Object.keys(table).sort()
    const priorBody = priorKeys.map((k) => `  ${JSON.stringify(k)}: ${table[k]},`).join('\n')
    writeFileSync(
      OUT_PRIORS,
      `/**\n` +
        ` * Generated by scripts/arranging/fitStrongRootPriors.mjs — do not hand-edit.\n` +
        ` * samples=${samples} entries=${priorKeys.length}\n` +
        ` */\n` +
        `export const STRONG_ROOT_PRIOR_TABLE: Readonly<Record<string, number>> = {\n` +
        `${priorBody}\n` +
        `}\n`,
    )

    // Transition probs (counts → log-friendly weights)
    const transObj = {}
    let transTotal = 0
    for (const [, c] of transitions) transTotal += c
    for (const [k, c] of [...transitions.entries()].sort((a, b) => b[1] - a[1])) {
      if (c < 3) continue
      transObj[k] = Math.round((c / Math.max(1, transTotal)) * 1000) / 1000
    }
    const transBody = Object.keys(transObj)
      .sort()
      .map((k) => `  ${JSON.stringify(k)}: ${transObj[k]},`)
      .join('\n')
    writeFileSync(
      OUT_TRANS,
      `/**\n` +
        ` * Generated by scripts/arranging/fitStrongRootPriors.mjs — Strong-home transitions.\n` +
        ` * Values are empirical frequencies (sum ≈ 1 over kept edges).\n` +
        ` */\n` +
        `export const STRONG_ROOT_TRANSITIONS: Readonly<Record<string, number>> = {\n` +
        `${transBody}\n` +
        `}\n`,
    )

    console.log(
      `wrote priors ${priorKeys.length} + transitions ${Object.keys(transObj).length} from ${samples} samples`,
    )

    if (dumpConfusion) {
      const out = {}
      for (const [id, info] of Object.entries(confusionByTag)) {
        const top = Object.entries(info.miss)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 12)
        out[id] = { n: info.n, topMisses: Object.fromEntries(top) }
      }
      writeFileSync(resolve(WORK, 'prior-confusion.json'), JSON.stringify(out, null, 2))
      console.log(`wrote ${resolve(WORK, 'prior-confusion.json')}`)
    }
  } finally {
    await server.close()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
