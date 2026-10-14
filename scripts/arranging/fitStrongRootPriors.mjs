/**
 * Offline fit (C2 / M4b): Strong-aligned chart roots → prior + transition tables.
 * Chart labels never enter Auto Coach at runtime — only emitted tables do.
 *
 *   node scripts/arranging/fitStrongRootPriors.mjs [--corpus polecat|classic|both]
 *     [--confusion] [--loo]
 *     [--blend-keep PATH]  // keep PATH keys on conflict; add fitted-only keys (C2 additive)
 *     [--keep-transitions] // do not overwrite strongRootTransitions.generated.ts
 *   → web/src/domain/arranging/strongRootPriors.generated.ts
 *   → web/src/domain/arranging/strongRootTransitions.generated.ts
 *   → work/polecat-honest-loop/prior-confusion.json (with --confusion)
 *   → work/polecat-honest-loop/c2-fit-report.json
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SITE = resolve(__dirname, '../..')
const WEB = resolve(SITE, 'web')
const LIBRARY = resolve(SITE, 'library')
const WORK = resolve(SITE, 'work/polecat-honest-loop')
const OUT_PRIORS = resolve(WEB, 'src/domain/arranging/strongRootPriors.generated.ts')
const OUT_TRANS = resolve(WEB, 'src/domain/arranging/strongRootTransitions.generated.ts')
const requireFromWeb = createRequire(resolve(WEB, 'package.json'))
const dumpConfusion = process.argv.includes('--confusion')
const doLoo = process.argv.includes('--loo')
const keepTransitions = process.argv.includes('--keep-transitions')
const corpusIdx = process.argv.indexOf('--corpus')
const corpusArg =
  corpusIdx >= 0 ? String(process.argv[corpusIdx + 1] || 'both') : 'both'
const blendIdx = process.argv.indexOf('--blend-keep')
const blendKeepPath =
  blendIdx >= 0 ? resolve(SITE, String(process.argv[blendIdx + 1] || '')) : null
mkdirSync(WORK, { recursive: true })

/** Parse `STRONG_ROOT_PRIOR_TABLE` from a generated .ts file. */
function loadPriorTable(path) {
  if (!existsSync(path)) throw new Error(`blend-keep missing: ${path}`)
  const text = readFileSync(path, 'utf8')
  /** @type {Record<string, number>} */
  const table = {}
  for (const m of text.matchAll(/"([^"]+)":\s*(\d+),/g)) {
    table[m[1]] = Number(m[2])
  }
  return table
}

function findPitchStudio(id) {
  const roots = [resolve(SITE, 'polecats'), LIBRARY]
  for (const root of roots) {
    if (!existsSync(root)) continue
    for (const dir of readdirSync(root, { withFileTypes: true })) {
      if (!dir.isDirectory()) continue
      if (!dir.name.includes(` ${id}`) && !dir.name.endsWith(`-${id}`)) continue
      const studio = join(root, dir.name, 'pitch_studio.json')
      const stacks = join(root, dir.name, 'pitch_stacks.json')
      if (existsSync(studio) && existsSync(stacks)) {
        return { studio, stacks, root }
      }
    }
  }
  return null
}

function classicIds() {
  const p = resolve(SITE, 'work/classic_tag_ids.json')
  if (!existsSync(p)) return []
  const doc = JSON.parse(readFileSync(p, 'utf8'))
  return (doc.ids || []).map(Number)
}

function polecatIds() {
  const FIX_DIR = resolve(WEB, 'src/domain/arranging/polecatGold/fixtures')
  const index = JSON.parse(readFileSync(resolve(FIX_DIR, 'index.json'), 'utf8'))
  return [...(index.gold ?? []), ...(index.holdout ?? [])].map(Number)
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

    const wantClassic = corpusArg === 'classic' || corpusArg === 'both'
    const wantPolecat = corpusArg === 'polecat' || corpusArg === 'both'
    /** @type {{ id: number; source: string }[]} */
    const idList = []
    if (wantPolecat) for (const id of polecatIds()) idList.push({ id, source: 'polecat' })
    if (wantClassic) for (const id of classicIds()) idList.push({ id, source: 'classic' })

    const conf = new Map()
    /** @type {Map<string, number>} */
    const transitions = new Map()
    let samples = 0
    let tagsUsed = 0
    let tagsSkipped = 0
    /** @type {Record<string, { miss: Record<string, number>; n: number; source: string }>} */
    const confusionByTag = {}
    /** @type {{ id: number; source: string; keys: string[]; chartDeg: number }[]} */
    const looRows = []

    for (const { id, source: corpusSource } of idList) {
      const paths = findPitchStudio(id)
      if (!paths) {
        tagsSkipped++
        continue
      }
      const stacksDoc = JSON.parse(readFileSync(paths.stacks, 'utf8'))
      const blownPc = stacksDoc.preprocess?.blown_pitch?.blown_pc
      const tonality =
        typeof blownPc === 'number' ? blownPc : Number(stacksDoc.tonality)
      const mode = stacksDoc.mode === 'minor' ? 'minor' : 'major'
      if (mode === 'minor') {
        tagsSkipped++
        continue
      }
      const raw = JSON.parse(readFileSync(paths.studio, 'utf8'))
      const source = normalizeTagRollProject({
        ...raw,
        tonality,
        tonalityMode: mode,
        preferFlats: [1, 3, 5, 8, 10].includes(tonality),
      })
      if (!source) {
        tagsSkipped++
        continue
      }
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
      confusionByTag[id] = { miss: {}, n: 0, source: corpusSource }
      let tagSamples = 0
      for (let i = 0; i < melody.length; i++) {
        const note = melody[i]
        const next = melody[i + 1]
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
        looRows.push({ id, source: corpusSource, keys, chartDeg })

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
        tagSamples++
        prevChartDeg = String(chartDeg)
        prevMidi = note.midi
      }
      if (tagSamples > 0) tagsUsed++
      else tagsSkipped++
    }

    const minSupport = { full: 3, mid: 3, short: 4, bare: 5 }
    const supportFn = (parts) => {
      if (parts >= 7) return 2
      if (parts >= 6) return minSupport.full
      if (parts >= 5) return minSupport.mid
      if (parts >= 4) return minSupport.short
      return minSupport.bare
    }
    let table = tableFromConf(conf, supportFn, 0.36)
    let blendMeta = null
    if (blendKeepPath) {
      const keep = loadPriorTable(blendKeepPath)
      const fittedOnly = Object.keys(table).filter((k) => keep[k] == null).length
      const conflicts = Object.keys(table).filter(
        (k) => keep[k] != null && keep[k] !== table[k],
      ).length
      // Keep-table wins on conflict; add fitted keys the keep table lacks.
      table = { ...table, ...keep }
      blendMeta = {
        keepPath: blendKeepPath,
        keepEntries: Object.keys(keep).length,
        fittedOnlyAdded: fittedOnly,
        conflictsKept: conflicts,
      }
    }

    const priorKeys = Object.keys(table).sort()
    const priorBody = priorKeys.map((k) => `  ${JSON.stringify(k)}: ${table[k]},`).join('\n')
    const blendNote = blendMeta
      ? ` * blend-keep=${blendMeta.keepPath} (+${blendMeta.fittedOnlyAdded} fitted-only; ${blendMeta.conflictsKept} conflicts→keep)\n`
      : ''
    writeFileSync(
      OUT_PRIORS,
      `/**\n` +
        ` * Generated by scripts/arranging/fitStrongRootPriors.mjs — do not hand-edit.\n` +
        ` * corpus=${corpusArg} tags=${tagsUsed} samples=${samples} entries=${priorKeys.length}\n` +
        blendNote +
        ` */\n` +
        `export const STRONG_ROOT_PRIOR_TABLE: Readonly<Record<string, number>> = {\n` +
        `${priorBody}\n` +
        `}\n`,
    )

    const transObj = {}
    let transTotal = 0
    for (const [, c] of transitions) transTotal += c
    for (const [k, c] of [...transitions.entries()].sort((a, b) => b[1] - a[1])) {
      if (c < 3) continue
      transObj[k] = Math.round((c / Math.max(1, transTotal)) * 1000) / 1000
    }
    if (!keepTransitions) {
      const transBody = Object.keys(transObj)
        .sort()
        .map((k) => `  ${JSON.stringify(k)}: ${transObj[k]},`)
        .join('\n')
      writeFileSync(
        OUT_TRANS,
        `/**\n` +
          ` * Generated by scripts/arranging/fitStrongRootPriors.mjs — Strong-home transitions.\n` +
          ` * corpus=${corpusArg} Values are empirical frequencies (sum ≈ 1 over kept edges).\n` +
          ` */\n` +
          `export const STRONG_ROOT_TRANSITIONS: Readonly<Record<string, number>> = {\n` +
          `${transBody}\n` +
          `}\n`,
      )
    } else {
      console.log(`kept transitions file (--keep-transitions): ${OUT_TRANS}`)
    }

    // In-sample table hit (richest matching key)
    let inHit = 0
    let inN = 0
    for (const row of looRows) {
      inN++
      let pred = null
      for (const key of row.keys) {
        if (table[key] != null) {
          pred = table[key]
          break
        }
      }
      if (pred === row.chartDeg) inHit++
    }

    let looHit = null
    if (doLoo && looRows.length) {
      /** @type {Map<number, Map<string, Record<number, number>>>} */
      const perTag = new Map()
      for (const row of looRows) {
        if (!perTag.has(row.id)) perTag.set(row.id, new Map())
        const m = perTag.get(row.id)
        for (const key of row.keys) {
          if (!m.has(key)) m.set(key, {})
          const h = m.get(key)
          h[row.chartDeg] = (h[row.chartDeg] || 0) + 1
        }
      }
      /** @type {Map<number, Record<string, number>>} */
      const looTables = new Map()
      for (const tagId of perTag.keys()) {
        const local = new Map()
        for (const [key, hist] of conf.entries()) {
          const copy = { ...hist }
          const sub = perTag.get(tagId)?.get(key)
          if (sub) {
            for (const [d, c] of Object.entries(sub)) {
              copy[d] = (copy[d] || 0) - c
              if (copy[d] <= 0) delete copy[d]
            }
          }
          if (Object.keys(copy).length) local.set(key, copy)
        }
        looTables.set(tagId, tableFromConf(local, supportFn, 0.36))
      }
      let lh = 0
      let ln = 0
      for (const row of looRows) {
        const looTable = looTables.get(row.id) || {}
        let pred = null
        for (const key of row.keys) {
          if (looTable[key] != null) {
            pred = looTable[key]
            break
          }
        }
        ln++
        if (pred === row.chartDeg) lh++
      }
      looHit = ln ? lh / ln : null
    }

    const report = {
      corpus: corpusArg,
      tagsUsed,
      tagsSkipped,
      samples,
      priorEntries: priorKeys.length,
      transitionEntries: Object.keys(transObj).length,
      transitionsWritten: !keepTransitions,
      blend: blendMeta,
      inSamplePriorHit: inN ? inHit / inN : null,
      looPriorHit: looHit,
      note: 'LOO is table-lookup only (not full proposeStrongRoots). Gate C2: loo≥0.55 on classic+polecat; ship via --blend-keep m2b (not raw swap).',
    }
    writeFileSync(resolve(WORK, 'c2-fit-report.json'), JSON.stringify(report, null, 2))

    console.log(
      `wrote priors ${priorKeys.length} + transitions ${Object.keys(transObj).length} from ${samples} samples (${tagsUsed} tags, corpus=${corpusArg})`,
    )
    if (looHit != null) console.log(`  LOO prior-table hit=${looHit.toFixed(3)} (n=${looRows.length})`)
    console.log(`  report → ${resolve(WORK, 'c2-fit-report.json')}`)

    if (dumpConfusion) {
      const out = {}
      for (const [id, info] of Object.entries(confusionByTag)) {
        const top = Object.entries(info.miss)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 12)
        out[id] = { n: info.n, source: info.source, topMisses: Object.fromEntries(top) }
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
