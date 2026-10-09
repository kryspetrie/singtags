/**
 * Path A / C1 probe: upper bound if Guided locked every low-conf Strong to gold.
 *
 * Reads work/polecat-honest-loop/latest.json (or --file) strongDump + confidence.
 * - Auto@lock: only high-conf ticks (thr default 0.75)
 * - Guided+oracle: high-conf as coach, low-conf forced to chart root hit
 *
 * Usage:
 *   node scripts/arranging/guidedOracleUpperBound.mjs
 *   node scripts/arranging/guidedOracleUpperBound.mjs --file work/polecat-honest-loop/m2b-keep.json
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SITE = resolve(__dirname, '../..')
const args = process.argv.slice(2)
const fileIdx = args.indexOf('--file')
const thrIdx = args.indexOf('--thr')
const thr = thrIdx >= 0 ? Number(args[thrIdx + 1]) : 0.75
const file = resolve(
  SITE,
  fileIdx >= 0 ? args[fileIdx + 1] : 'work/polecat-honest-loop/latest.json',
)

if (!existsSync(file)) {
  console.error('Missing', file, '— run polecatHonestScore.mjs --save first')
  process.exit(1)
}

const data = JSON.parse(readFileSync(file, 'utf8'))
let autoHit = 0
let autoN = 0
let guidedHit = 0
let guidedN = 0
let lowN = 0

for (const tag of data.perTag ?? []) {
  for (const s of tag.strongDump ?? []) {
    const conf = typeof s.confidence === 'number' ? s.confidence : 0
    guidedN++
    if (conf >= thr) {
      autoN++
      if (s.rootOk) {
        autoHit++
        guidedHit++
      }
    } else {
      lowN++
      // Oracle lock: treat as hit
      guidedHit++
    }
  }
}

const auto = autoN ? autoHit / autoN : 0
const guided = guidedN ? guidedHit / guidedN : 0
const full = data.micro?.pmnRootHit ?? null

console.log(`[guidedOracleUpperBound] file=${file}`)
console.log(`  thr=${thr} autoN=${autoN} lowN=${lowN} total=${guidedN}`)
console.log(`  full pmn (dump)=${full}`)
console.log(`  Auto@lock pmnConf≈${auto.toFixed(3)}`)
console.log(`  Guided+oracle upper bound pmn≈${guided.toFixed(3)}`)
console.log(
  `  Lift vs full if all amber gold-locked: ${full != null ? (guided - full).toFixed(3) : 'n/a'}`,
)
