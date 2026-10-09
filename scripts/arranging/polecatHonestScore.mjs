/**
 * Honest Auto Coach score vs all polecats (Lead + blown-pitch key + roles).
 * No gold / chart pillars as Coach input.
 *
 * Metrics:
 *   - timeHit: fraction of ref stacks whose roman equals Coach at stack midpoint
 *   - timeStrict: same for natureId@rootPc
 *   - pmnRootHit: root match on Strong-aligned ref moments
 *   - orphanRate: chart stacks whose mid is not covered by any Strong note
 *     (onset ≤ mid < onset+dur). Onset-distance orphans were a metric artifact
 *     for long holds (even all-Lead-as-Strong left ~0.3–0.65 "orphans").
 *   - romanLcs: collapsed roman LCS / ref len (sequence; advisory)
 *   - slices (M0): pmnEdge / pmnMid; missBySd; missByWindow (prevChart→curChart)
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

function refCovering(refTicks, tick) {
  let best = null
  for (const s of refTicks) {
    if (s.startTick <= tick && tick < s.endTick && (!best || s.startTick >= best.startTick)) {
      best = s
    }
  }
  if (best) return best
  // Fallback: nearest onset at or before tick
  for (const s of refTicks) {
    if (s.startTick <= tick && (!best || s.startTick >= best.startTick)) best = s
  }
  return best
}

function secToTick(sec, bpm, ppq) {
  return Math.round(sec * (bpm / 60) * ppq)
}

function scaleDegree(midi, tonality) {
  return (((midi % 12) - tonality) % 12 + 12) % 12
}

function bumpCount(map, key, n = 1) {
  map[key] = (map[key] || 0) + n
}

function topEntries(map, limit = 12) {
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([k, v]) => ({ k, n: v }))
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
    const { pathOptimize } = await mod('/src/application/arranging/PathOptimize.ts')
    const { assignMelodyRoles } = await mod('/src/domain/arranging/melodyRoles.ts')
    const { proposeRootForStrongNote } = await mod(
      '/src/domain/arranging/proposeStrongRoots.ts',
    )
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
      // Auto inputs only: Lead + key; empty pillars; roles defaulted inside pathOptimize
      arr = {
        ...arr,
        stacks: [],
        pillars: [],
        tonality,
        tonalityMode: mode,
        preferFlats: [1, 3, 5, 8, 10].includes(tonality),
        // Force defaults — pitch extracts mark every Lead note Strong.
        melody: assignMelodyRoles(
          arr.melody,
          {
            ppq: arr.ppq,
            tonality,
            promoteChangePoints: true,
            promoteCoverage: true,
          },
          { force: true },
        ),
      }
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
      const refTicks = ref
        .map((s) => ({
          startTick: secToTick(Number(s.t0), bpm, ppq),
          endTick: Math.max(
            secToTick(Number(s.t1), bpm, ppq),
            secToTick(Number(s.t0), bpm, ppq) + 1,
          ),
          rootPc: s.rootPc,
          natureId: s.natureId,
          roman: s.roman,
        }))
        .sort((a, b) => a.startTick - b.startTick)

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
        if (cov && cov.rootPc === s.rootPc && cov.natureId === s.natureId) {
          timeStrict++
        }
      }
      const n = ref.length || 1

      // PMN rootHit: Strong notes vs chart @ Strong midpoint (A1 policy).
      // Coach lookup also uses midpoint (equiv. onset for roots; see align-audit).
      const strongs = (out.melody || arr.melody)
        .filter((m) => m.role === 'pmn')
        .sort((a, b) => a.startTick - b.startTick)
      const phraseGap = Math.floor(ppq * 1.5)
      const phraseEdgeOf = new Map()
      {
        let phrase = 0
        const phraseOf = []
        for (let i = 0; i < strongs.length; i++) {
          const n = strongs[i]
          if (i > 0) {
            const prev = strongs[i - 1]
            const gap = n.startTick - (prev.startTick + prev.durationTicks)
            if (gap > phraseGap) phrase += 1
          }
          phraseOf[i] = phrase
        }
        const first = new Set()
        const last = new Set()
        for (let i = 0; i < strongs.length; i++) {
          const p = phraseOf[i]
          if (i === 0 || phraseOf[i - 1] !== p) first.add(strongs[i].id)
          if (i === strongs.length - 1 || phraseOf[i + 1] !== p) last.add(strongs[i].id)
        }
        for (const n of strongs) {
          phraseEdgeOf.set(
            n.id,
            first.has(n.id) ? 'start' : last.has(n.id) ? 'end' : 'mid',
          )
        }
      }
      let pmnRootHit = 0
      let pmnN = 0
      let edgeHit = 0
      let edgeN = 0
      let midHit = 0
      let midN = 0
      let confHit = 0
      let confN = 0
      const CONF_THR = 0.75
      const strongDump = []
      let prevRootPc = null
      let prevStrongMidi = null
      for (let si = 0; si < strongs.length; si++) {
        const note = strongs[si]
        const next = strongs[si + 1]
        const tick = note.startTick + Math.floor(Math.max(1, note.durationTicks) / 2)
        const chart = refCovering(refTicks, tick)
        if (!chart) continue
        pmnN++
        // Coach @ Strong onset (stack covering); chart @ mid — A1 confirmed
        // onset↔mid coach roots match pooled; keep onset for stack identity.
        const cov = stackCovering(coachStacks, note.startTick)
        const hit = !!(cov && cov.rootPc === chart.rootPc)
        if (hit) pmnRootHit++
        const edge = phraseEdgeOf.get(note.id) || 'mid'
        if (edge === 'mid') {
          midN++
          if (hit) midHit++
        } else {
          edgeN++
          if (hit) edgeHit++
        }
        const segmentEndTick = next
          ? next.startTick
          : note.startTick + Math.max(1, note.durationTicks)
        const prop = proposeRootForStrongNote({
          note,
          melody: out.melody || arr.melody,
          tonality,
          mode,
          prevRootPc,
          nextStrongMidi: next?.midi ?? null,
          phraseEdge: edge === 'mid' ? null : edge,
          ppq,
          prevStrongMidi,
          segmentEndTick,
        })
        const confidence =
          typeof prop.confidence === 'number' ? prop.confidence : 0
        if (confidence >= CONF_THR) {
          confN++
          if (hit) confHit++
        }
        const coachRoman = cov
          ? romanForChord({
              rootPc: cov.rootPc,
              natureId: cov.natureId,
              tonality,
              mode,
            })
          : null
        const prevRow = strongDump[strongDump.length - 1]
        strongDump.push({
          tick: note.startTick,
          midi: note.midi,
          sd: scaleDegree(note.midi, tonality),
          phraseEdge: edge,
          chart: chart.roman,
          coach: coachRoman,
          rootOk: hit,
          prevChart: prevRow?.chart ?? null,
          confidence: Math.round(confidence * 1000) / 1000,
        })
        prevRootPc = cov?.rootPc ?? prop.rootPc
        prevStrongMidi = note.midi
      }
      const pmnDenom = pmnN || 1
      const pmnConfident =
        confN > 0 ? Math.round((confHit / confN) * 1000) / 1000 : null

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
      const chartChanges = refRomans.length || 1
      const densityRatio = pmnN / chartChanges

      // Orphan stacks: no Strong *covers* chart stack midpoint (hold-aware).
      let orphan = 0
      for (const s of refTicks) {
        const midTick = (s.startTick + s.endTick) / 2
        const covered = strongs.some((note) => {
          const end = note.startTick + Math.max(1, note.durationTicks)
          return note.startTick <= midTick && midTick < end
        })
        if (!covered) orphan++
      }
      const orphanRateTag = refTicks.length ? orphan / refTicks.length : 0

      const natures = {}
      for (const s of coachStacks) {
        natures[s.natureId] = (natures[s.natureId] || 0) + 1
      }

      perTag.push({
        tagId: id,
        title: stacksDoc.title || source.title,
        tonality,
        blown_pc: blownPc,
        pillars: out.pillars?.length ?? 0,
        stacks: coachStacks.length,
        timeHit: Math.round((timeHit / n) * 1000) / 1000,
        timeStrict: Math.round((timeStrict / n) * 1000) / 1000,
        pmnRootHit: Math.round((pmnRootHit / pmnDenom) * 1000) / 1000,
        pmnEdge: edgeN ? Math.round((edgeHit / edgeN) * 1000) / 1000 : null,
        pmnMid: midN ? Math.round((midHit / midN) * 1000) / 1000 : null,
        pmnConfident,
        confN,
        edgeN,
        midN,
        pmnN,
        chartChanges,
        densityRatio: Math.round(densityRatio * 100) / 100,
        orphanStacks: orphan,
        orphanRate: Math.round(orphanRateTag * 1000) / 1000,
        romanNorm: Math.round(romanNorm * 1000) / 1000,
        refLen: ref.length,
        predLen: coachStacks.length,
        refRomans,
        predRomans,
        natures,
        strongDump,
      })
      process.stdout.write(
        `${id} time=${(timeHit / n).toFixed(3)} pmnRoot=${(pmnRootHit / pmnDenom).toFixed(3)} ` +
          `edge=${edgeN ? (edgeHit / edgeN).toFixed(3) : '-'} mid=${midN ? (midHit / midN).toFixed(3) : '-'} ` +
          `strict=${(timeStrict / n).toFixed(3)} roman=${romanNorm.toFixed(3)} ` +
          `stacks=${coachStacks.length}/${ref.length} strongs=${pmnN}/${chartChanges} ` +
          `dens=${densityRatio.toFixed(2)} orphan=${orphanRateTag.toFixed(3)}\n`,
      )
      // Compact strong-note dump (chart vs coach)
      const dumpLine = strongDump
        .slice(0, 16)
        .map((d) => `${d.tick}:${d.chart}/${d.coach ?? '-'}${d.rootOk ? '' : '!'}`)
        .join(' ')
      if (dumpLine) process.stdout.write(`  strong ${dumpLine}${strongDump.length > 16 ? ' …' : ''}\n`)
    }

    const avg = (xs) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1)
    const orphanN = perTag.reduce((a, t) => a + (t.orphanStacks || 0), 0)
    const orphanDenom = perTag.reduce((a, t) => a + (t.refLen || 0), 0) || 1
    const edgeHitAll = perTag.reduce(
      (a, t) => a + (t.pmnEdge != null ? t.pmnEdge * t.edgeN : 0),
      0,
    )
    const edgeNAll = perTag.reduce((a, t) => a + (t.edgeN || 0), 0) || 1
    const midHitAll = perTag.reduce(
      (a, t) => a + (t.pmnMid != null ? t.pmnMid * t.midN : 0),
      0,
    )
    const midNAll = perTag.reduce((a, t) => a + (t.midN || 0), 0) || 1
    const confHitAll = perTag.reduce(
      (a, t) => a + (t.pmnConfident != null ? t.pmnConfident * t.confN : 0),
      0,
    )
    const confNAll = perTag.reduce((a, t) => a + (t.confN || 0), 0)
    const missBySd = {}
    const hitBySd = {}
    const missByWindow = {}
    const missByPair = {}
    for (const t of perTag) {
      for (const row of t.strongDump || []) {
        const sdKey = `^${row.sd}`
        if (row.rootOk) bumpCount(hitBySd, sdKey)
        else {
          bumpCount(missBySd, sdKey)
          bumpCount(missByPair, `${row.chart}→${row.coach ?? '-'}`)
          if (row.prevChart) bumpCount(missByWindow, `${row.prevChart}→${row.chart}`)
        }
      }
    }
    const micro = {
      timeHit: Math.round(avg(perTag.map((t) => t.timeHit)) * 1000) / 1000,
      timeStrict: Math.round(avg(perTag.map((t) => t.timeStrict)) * 1000) / 1000,
      pmnRootHit: Math.round(avg(perTag.map((t) => t.pmnRootHit)) * 1000) / 1000,
      pmnEdge: Math.round((edgeHitAll / edgeNAll) * 1000) / 1000,
      pmnMid: Math.round((midHitAll / midNAll) * 1000) / 1000,
      pmnConfident:
        confNAll > 0 ? Math.round((confHitAll / confNAll) * 1000) / 1000 : null,
      confCoverage:
        Math.round(
          (confNAll / Math.max(1, perTag.reduce((a, t) => a + (t.pmnN || 0), 0))) *
            1000,
        ) / 1000,
      orphanRate: Math.round((orphanN / orphanDenom) * 1000) / 1000,
      romanNorm: Math.round(avg(perTag.map((t) => t.romanNorm)) * 1000) / 1000,
    }
    const slices = {
      missBySd: topEntries(missBySd),
      hitBySd: topEntries(hitBySd),
      missByWindow: topEntries(missByWindow),
      missByPair: topEntries(missByPair),
    }
    const result = {
      label,
      at: new Date().toISOString(),
      micro,
      slices,
      perTag: perTag.map((t) => ({
        tagId: t.tagId,
        title: t.title,
        timeHit: t.timeHit,
        timeStrict: t.timeStrict,
        pmnRootHit: t.pmnRootHit,
        pmnEdge: t.pmnEdge,
        pmnMid: t.pmnMid,
        pmnConfident: t.pmnConfident,
        confN: t.confN,
        pmnN: t.pmnN,
        chartChanges: t.chartChanges,
        densityRatio: t.densityRatio,
        orphanStacks: t.orphanStacks,
        orphanRate: t.orphanRate,
        romanNorm: t.romanNorm,
        stacks: t.stacks,
        natures: t.natures,
        predRomans: t.predRomans,
        strongDump: t.strongDump,
      })),
    }
    console.log(
      `\n[${label}] MICRO timeHit=${micro.timeHit} pmnRootHit=${micro.pmnRootHit} ` +
        `pmnEdge=${micro.pmnEdge} pmnMid=${micro.pmnMid} ` +
        `pmnConf=${micro.pmnConfident ?? '-'}(@${micro.confCoverage ?? '-'}) ` +
        `orphanRate=${micro.orphanRate} timeStrict=${micro.timeStrict} romanLcs=${micro.romanNorm}`,
    )
    console.log(
      `  missBySd ${slices.missBySd.map((x) => `${x.k}:${x.n}`).join(' ') || '-'}`,
    )
    console.log(
      `  missWin  ${slices.missByWindow.map((x) => `${x.k}:${x.n}`).join(' ') || '-'}`,
    )
    console.log(
      `  missPair ${slices.missByPair.map((x) => `${x.k}:${x.n}`).join(' ') || '-'}`,
    )

    writeFileSync(resolve(WORK, 'latest.json'), JSON.stringify(result, null, 2))
    if (doSave) {
      writeFileSync(resolve(WORK, `${label}.json`), JSON.stringify(result, null, 2))
      appendFileSync(
        resolve(WORK, 'PASSLOG.md'),
        `\n## ${label} (${result.at})\n\n` +
          `- timeHit **${micro.timeHit}** · pmnRootHit **${micro.pmnRootHit}** · ` +
          `pmnEdge **${micro.pmnEdge}** · pmnMid **${micro.pmnMid}** · ` +
          `pmnConf **${micro.pmnConfident ?? '-'}** (cov **${micro.confCoverage ?? '-'}**) · ` +
          `orphanRate **${micro.orphanRate}** · timeStrict **${micro.timeStrict}** · ` +
          `romanLcs **${micro.romanNorm}**\n` +
          `- missBySd: ${slices.missBySd.map((x) => `${x.k}:${x.n}`).join(' ') || '-'}\n` +
          `- missWin: ${slices.missByWindow.map((x) => `${x.k}:${x.n}`).join(' ') || '-'}\n` +
          `- missPair: ${slices.missByPair.map((x) => `${x.k}:${x.n}`).join(' ') || '-'}\n` +
          perTag
            .map(
              (t) =>
                `  - ${t.tagId}: time=${t.timeHit} pmnRoot=${t.pmnRootHit} ` +
                `edge=${t.pmnEdge ?? '-'} mid=${t.pmnMid ?? '-'} orphan=${t.orphanRate} ` +
                `strict=${t.timeStrict} roman=${t.romanNorm} ` +
                `pred=${t.predRomans.slice(0, 12).join(' ')}${t.predRomans.length > 12 ? '…' : ''}`,
            )
            .join('\n') +
          '\n',
      )
    }
    // Ranking: timeHit, pmnRootHit, orphanRate, timeStrict, romanNorm
    writeFileSync(
      resolve(WORK, 'score.txt'),
      `${micro.timeHit}\t${micro.pmnRootHit}\t${micro.orphanRate}\t${micro.timeStrict}\t${micro.romanNorm}\t${label}\n`,
    )
  } finally {
    await server.close()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
