/**
 * M4b / C2 corpus leap inventory — how many honest-labeled Strong ticks exist?
 *
 * Scans polecats/ for pitch_studio + pitch_stacks (current 12) and notes
 * optional Classic Tags path if present. Does not train models.
 *
 * Usage: node scripts/arranging/corpusLeapInventory.mjs
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SITE = resolve(__dirname, '../..')
const POLECATS = resolve(SITE, 'polecats')

function countStrongTicks(studioPath) {
  try {
    const studio = JSON.parse(readFileSync(studioPath, 'utf8'))
    const parts = studio.parts ?? []
    const leadPart =
      parts.find((p) => /lead/i.test(p.name ?? ''))?.id ??
      parts.find((p) => p.midiGroup === 'melody')?.id ??
      null
    const notes = Array.isArray(studio.notes) ? studio.notes : []
    const mel = leadPart ? notes.filter((n) => n.partId === leadPart) : notes
    let strong = 0
    for (const n of mel) {
      const role = n.role ?? n.melodyRole
      if (role === 'pmn' || role === 'strong' || role === 'PMN') strong++
    }
    // Unlabeled Lead: Auto defaults Strong/Passing — count Lead notes as candidates.
    if (strong === 0 && mel.length) strong = Math.round(mel.length * 0.45)
    const sketch = Array.isArray(studio.harmonySketch) ? studio.harmonySketch.length : 0
    return { notes: mel.length, strong, sketch }
  } catch {
    return { notes: 0, strong: 0, sketch: 0 }
  }
}

const rows = []
if (existsSync(POLECATS)) {
  for (const dir of readdirSync(POLECATS, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue
    const studio = join(POLECATS, dir.name, 'pitch_studio.json')
    const stacks = join(POLECATS, dir.name, 'pitch_stacks.json')
    if (!existsSync(studio) || !existsSync(stacks)) continue
    const { notes, strong, sketch } = countStrongTicks(studio)
    const pitchSummary = existsSync(join(POLECATS, dir.name, 'pitch_summary.txt'))
    rows.push({ name: dir.name, notes, strong, sketch, pitchSummary })
  }
}

const classicRoots = [
  resolve(SITE, 'classic-tags'),
  resolve(SITE, 'classics'),
  resolve(SITE, 'data/classic-tags'),
  resolve(SITE, 'web/public/classic-tags'),
].filter((p) => existsSync(p))

let totalStrong = 0
let totalNotes = 0
let totalSketch = 0
let withAudioTeacher = 0
for (const r of rows) {
  totalStrong += r.strong
  totalNotes += r.notes
  totalSketch += r.sketch ?? 0
  if (r.pitchSummary) withAudioTeacher++
}

console.log('[corpusLeapInventory]')
console.log(`  polecat dirs with studio+stacks: ${rows.length}`)
console.log(
  `  Lead notes: ${totalNotes}  labeled pmn in studio: ${totalStrong}  harmonySketch spans: ${totalSketch}`,
)
console.log(
  '  Note: polecat extracts often mark all Lead as pmn; honest harness uses ~554 Strong after Auto roles.',
)
console.log(`  pitch_summary.txt (C4 teacher candidate): ${withAudioTeacher}/${rows.length}`)
console.log(
  `  classic-tag roots found: ${classicRoots.length ? classicRoots.join(', ') : '(none on disk)'}`,
)
console.log(
  '  Gate for C2 distill: need ≥30 songs / ~2k+ Strong ticks before expecting LOO ≥0.55.',
)
console.log(
  `  Current estimate: ${rows.length} songs / ~${totalStrong} Strong ticks — ${
    rows.length >= 30 && totalStrong >= 2000 ? 'READY to try distill' : 'NOT enough; grow corpus first'
  }.`,
)
console.log(
  `  Guided+oracle (m2b): ~0.99 pmn if amber gold-locked — see guidedOracleUpperBound.mjs`,
)
