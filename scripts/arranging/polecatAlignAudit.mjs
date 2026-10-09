/**
 * A1: Strong ↔ chart tick-alignment audit.
 * Compares chart-label clocks (onset / mid / end / nearest-stack-mid)
 * and coach lookup (onset vs mid) for pmnRootHit flips.
 *
 *   node scripts/arranging/polecatAlignAudit.mjs
 *   → work/polecat-honest-loop/align-audit.json
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SITE = resolve(__dirname, '../..')
const WEB = resolve(SITE, 'web')
const WORK = resolve(SITE, 'work/polecat-honest-loop')
const OUT = resolve(WORK, 'align-audit.json')
const requireFromWeb = createRequire(resolve(WEB, 'package.json'))
mkdirSync(WORK, { recursive: true })

/** Focus tags from plan + all for micro summary */
const FOCUS = new Set([90003, 90004, 90011, 90008])

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
  for (const s of refTicks) {
    if (s.startTick <= tick && (!best || s.startTick >= best.startTick)) best = s
  }
  return best
}

function nearestByMidpoint(refTicks, tick) {
  let best = null
  let bestDist = Infinity
  for (const s of refTicks) {
    const mid = (s.startTick + s.endTick) / 2
    const d = Math.abs(mid - tick)
    if (d < bestDist) {
      bestDist = d
      best = s
    }
  }
  return best ? { stack: best, dist: bestDist } : null
}

function rootOk(coach, chart) {
  return !!(coach && chart && coach.rootPc === chart.rootPc)
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
    const { createSequentialIdGenerator } = await mod(
      '/src/adapters/arranging/persistence/systemServices.ts',
    )
    const { romanForChord } = await mod('/src/domain/arranging/secondaryDominant.ts')

    const FIX_DIR = resolve(WEB, 'src/domain/arranging/polecatGold/fixtures')
    const index = JSON.parse(readFileSync(resolve(FIX_DIR, 'index.json'), 'utf8'))
    const ids = [...(index.gold ?? []), ...(index.holdout ?? [])].sort((a, b) => a - b)

    const policies = [
      'current', // chart@mid, coach@onset  (today)
      'onset', // chart@onset, coach@onset
      'mid', // chart@mid, coach@mid
      'end', // chart@end-1, coach@onset
      'nearestMid', // chart nearest stack mid to onset, coach@onset
      'onsetCoachMid', // chart@onset, coach@mid
    ]

    const perTag = []
    const global = {
      n: 0,
      byPolicy: Object.fromEntries(policies.map((p) => [p, { hit: 0, n: 0 }])),
      flipFromCurrent: Object.fromEntries(
        policies.filter((p) => p !== 'current').map((p) => [p, { missToHit: 0, hitToMiss: 0 }]),
      ),
      orphanStacks: { n: 0, orphan: 0 },
    }

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
      const beat = ppq
      const coachStacks = [...out.stacks]
        .filter((s) => s.natureId && s.rootPc != null)
        .sort((a, b) => a.startTick - b.startTick)

      const ref = (stacksDoc.stacks || []).filter(
        (s) => s.roman && s.natureId != null && s.rootPc != null,
      )
      const refTicks = ref.map((s) => ({
        startTick: secToTick(Number(s.t0), bpm, ppq),
        endTick: Math.max(
          secToTick(Number(s.t1), bpm, ppq),
          secToTick(Number(s.t0), bpm, ppq) + 1,
        ),
        rootPc: s.rootPc,
        roman: s.roman,
        midTick: (() => {
          const a = secToTick(Number(s.t0), bpm, ppq)
          const b = Math.max(
            secToTick(Number(s.t1), bpm, ppq),
            secToTick(Number(s.t0), bpm, ppq) + 1,
          )
          return (a + b) / 2
        })(),
      }))

      const strongs = (out.melody || arr.melody)
        .filter((m) => m.role === 'pmn')
        .sort((a, b) => a.startTick - b.startTick)

      // Orphan: no Strong covers stack midpoint (hold-aware; onset-distance was misleading).
      let orphan = 0
      for (const s of refTicks) {
        global.orphanStacks.n++
        const covered = strongs.some((note) => {
          const end = note.startTick + Math.max(1, note.durationTicks)
          return note.startTick <= s.midTick && s.midTick < end
        })
        if (!covered) orphan++
      }
      global.orphanStacks.orphan += orphan

      const tagStats = {
        tagId: id,
        focus: FOCUS.has(id),
        strongN: 0,
        byPolicy: Object.fromEntries(policies.map((p) => [p, { hit: 0, n: 0 }])),
        flipFromCurrent: Object.fromEntries(
          policies.filter((p) => p !== 'current').map((p) => [p, { missToHit: 0, hitToMiss: 0 }]),
        ),
        orphanStacks: orphan,
        refStacks: refTicks.length,
        rows: [],
      }

      for (const note of strongs) {
        const onset = note.startTick
        const mid = note.startTick + Math.floor(Math.max(1, note.durationTicks) / 2)
        const end = note.startTick + Math.max(1, note.durationTicks) - 1

        const chartOnset = refCovering(refTicks, onset)
        const chartMid = refCovering(refTicks, mid)
        const chartEnd = refCovering(refTicks, end)
        const near = nearestByMidpoint(refTicks, onset)
        const chartNearest = near?.stack ?? null

        const coachOnset = stackCovering(coachStacks, onset)
        const coachMid = stackCovering(coachStacks, mid)

        const evals = {
          current: rootOk(coachOnset, chartMid),
          onset: rootOk(coachOnset, chartOnset),
          mid: rootOk(coachMid, chartMid),
          end: rootOk(coachOnset, chartEnd),
          nearestMid: rootOk(coachOnset, chartNearest),
          onsetCoachMid: rootOk(coachMid, chartOnset),
        }

        tagStats.strongN++
        global.n++
        for (const p of policies) {
          tagStats.byPolicy[p].n++
          global.byPolicy[p].n++
          if (evals[p]) {
            tagStats.byPolicy[p].hit++
            global.byPolicy[p].hit++
          }
        }
        const cur = evals.current
        for (const p of policies) {
          if (p === 'current') continue
          if (!cur && evals[p]) {
            tagStats.flipFromCurrent[p].missToHit++
            global.flipFromCurrent[p].missToHit++
          }
          if (cur && !evals[p]) {
            tagStats.flipFromCurrent[p].hitToMiss++
            global.flipFromCurrent[p].hitToMiss++
          }
        }

        if (FOCUS.has(id)) {
          const roman = (cov) =>
            cov
              ? romanForChord({
                  rootPc: cov.rootPc,
                  natureId: cov.natureId ?? 'Mm7',
                  tonality,
                  mode,
                })
              : null
          tagStats.rows.push({
            onset,
            mid,
            end,
            midi: note.midi,
            chart: {
              onset: chartOnset?.roman ?? null,
              mid: chartMid?.roman ?? null,
              end: chartEnd?.roman ?? null,
              nearestMid: chartNearest?.roman ?? null,
              nearestDist: near?.dist ?? null,
            },
            coach: {
              onset: roman(coachOnset),
              mid: roman(coachMid),
              onsetRoot: coachOnset?.rootPc ?? null,
              midRoot: coachMid?.rootPc ?? null,
            },
            evals,
          })
        }
      }

      const rates = {}
      for (const p of policies) {
        const { hit, n } = tagStats.byPolicy[p]
        rates[p] = n ? Math.round((hit / n) * 1000) / 1000 : 0
      }
      tagStats.rates = rates
      perTag.push(tagStats)

      const focusMark = FOCUS.has(id) ? ' *' : ''
      process.stdout.write(
        `${id}${focusMark} n=${tagStats.strongN} ` +
          policies.map((p) => `${p}=${rates[p].toFixed(3)}`).join(' ') +
          ` orphan=${orphan}/${refTicks.length}\n`,
      )
    }

    const micro = {}
    for (const p of policies) {
      const xs = perTag.map((t) => t.rates[p])
      micro[p] = Math.round((xs.reduce((a, b) => a + b, 0) / (xs.length || 1)) * 1000) / 1000
    }

    const summary = {
      micro,
      globalHits: Object.fromEntries(
        policies.map((p) => {
          const { hit, n } = global.byPolicy[p]
          return [p, { hit, n, rate: n ? Math.round((hit / n) * 1000) / 1000 : 0 }]
        }),
      ),
      flipFromCurrent: global.flipFromCurrent,
      orphanStacks: {
        ...global.orphanStacks,
        rate:
          global.orphanStacks.n > 0
            ? Math.round((global.orphanStacks.orphan / global.orphanStacks.n) * 1000) / 1000
            : 0,
      },
      focus: perTag
        .filter((t) => t.focus)
        .map((t) => ({
          tagId: t.tagId,
          rates: t.rates,
          flipFromCurrent: t.flipFromCurrent,
          orphanStacks: t.orphanStacks,
          refStacks: t.refStacks,
        })),
    }

    writeFileSync(
      OUT,
      JSON.stringify({ summary, perTag: perTag.map(({ rows, ...rest }) => ({ ...rest, rows })) }, null, 2),
    )

    console.log('\n=== MICRO pmnRoot by chart/coach clock ===')
    for (const p of policies) {
      const flip = global.flipFromCurrent[p]
      const flipStr = flip
        ? `  miss→hit=${flip.missToHit} hit→miss=${flip.hitToMiss} net=${flip.missToHit - flip.hitToMiss}`
        : '  (baseline)'
      console.log(`  ${p.padEnd(14)} micro=${micro[p].toFixed(3)} pooled=${summary.globalHits[p].rate.toFixed(3)}${flipStr}`)
    }
    console.log(
      `orphan chart stacks (no Strong onset within ½ beat of mid): ${summary.orphanStacks.orphan}/${summary.orphanStacks.n} (${summary.orphanStacks.rate})`,
    )
    console.log(`wrote ${OUT}`)
  } finally {
    await server.close()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
