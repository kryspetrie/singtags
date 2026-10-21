/**
 * Compare sparse Mill Stream (Lead+Bass, Lead+Tenor) detection and Fill-parts
 * against the user's corrected full chart.
 *
 *   npx vite-node scripts/millStreamSparseLab.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { createAllocateIdGenerator } from '../src/adapters/system/systemServices'
import { tagStudioToArrangement } from '../src/application/arranging/syncTagRoll'
import { identifyNatureFromMidi } from '../src/domain/arranging/chordCompletion'
import { DEFAULT_CONTEST_PROFILE } from '../src/domain/arranging/contestProfile'
import { absoluteChordLabel } from '../src/domain/arranging/chordAnalysisBar'
import { completeFromPartsToNotes } from '../src/lib/tagRoll/completeFromParts'
import { stacksToDetectHoles } from '../src/lib/tagRoll/harmonyStrip'
import { normalizeTagRollProject } from '../src/lib/tagRoll/normalize'
import type { TagRollNote, TagRollProject } from '../src/lib/tagRoll/types'

const OUT = resolve(process.cwd(), 'public/mill-stream-lab')
const USER = process.argv[2] ?? '/tmp/mill-user.json'

const HARMONY = ['Tenor', 'Bari', 'Bass'] as const

type Voice = 'tenor' | 'bari' | 'bass' | 'lead'
type StackMidi = Partial<Record<Voice, number>>

function load(path: string): TagRollProject {
  const p = normalizeTagRollProject(JSON.parse(readFileSync(path, 'utf8')))
  if (!p) throw new Error(`bad project ${path}`)
  return p
}

function partId(project: TagRollProject, name: string): string {
  const p = project.parts.find((x) => x.name === name)
  if (!p) throw new Error(`missing ${name}`)
  return p.id
}

function melodyId(project: TagRollProject): string {
  return project.view.melodyPartId || partId(project, 'Lead')
}

function covering(notes: readonly TagRollNote[], id: string, tick: number): number | null {
  const n =
    notes.find((x) => x.partId === id && x.startTick === tick) ??
    notes.find((x) => x.partId === id && x.startTick <= tick && tick < x.startTick + x.durationTicks)
  return n?.midi ?? null
}

function stackAt(project: TagRollProject, tick: number): StackMidi {
  const out: StackMidi = {}
  const lead = covering(project.notes, melodyId(project), tick)
  if (lead != null) out.lead = lead
  for (const name of ['Tenor', 'Bari', 'Bass'] as const) {
    const id = project.parts.find((p) => p.name === name)?.id
    if (!id) continue
    const midi = covering(project.notes, id, tick)
    if (midi != null) out[name === 'Tenor' ? 'tenor' : name === 'Bari' ? 'bari' : 'bass'] = midi
  }
  return out
}

function pc(m: number): number {
  return ((m % 12) + 12) % 12
}

function idOf(project: TagRollProject, midi: StackMidi) {
  if (midi.lead == null) return null
  return identifyNatureFromMidi({
    midi: { lead: midi.lead, tenor: midi.tenor, bari: midi.bari, bass: midi.bass },
    profile: DEFAULT_CONTEST_PROFILE,
    tonality: project.tonality,
    mode: project.tonalityMode ?? 'major',
  })
}

function labelOf(project: TagRollProject, hit: { rootPc: number; natureId: string } | null): string {
  if (!hit) return '—'
  return absoluteChordLabel(hit.rootPc, hit.natureId, project.preferFlats, {
    tonality: project.tonality,
    tonalityMode: project.tonalityMode ?? 'major',
  })
}

function sparseCopy(src: TagRollProject, keep: string[], id: string, title: string): TagRollProject {
  const ids = new Set(src.parts.filter((p) => keep.includes(p.name)).map((p) => p.id))
  const next = normalizeTagRollProject({
    ...src,
    id,
    title,
    notes: src.notes.filter((n) => ids.has(n.partId)),
    harmonySketch: [],
  })
  if (!next) throw new Error(`normalize failed ${title}`)
  return next
}

function detectHoles(project: TagRollProject) {
  let n = 0
  const arr = tagStudioToArrangement(project, { next: (prefix) => `${prefix}_lab_${n++}` })
  return stacksToDetectHoles(arr.stacks, project.lengthTicks)
}

function fill(project: TagRollProject, id: string, title: string): TagRollProject {
  const holes = detectHoles(project)
  const result = completeFromPartsToNotes({
    project,
    detectHoles: holes,
    profile: DEFAULT_CONTEST_PROFILE,
    idGen: createAllocateIdGenerator(),
  })
  const next = normalizeTagRollProject({
    ...project,
    id,
    title,
    notes: result.notes,
    harmonySketch: result.sketch,
  })
  if (!next) throw new Error(`normalize failed ${title}`)
  return next
}

type Row = {
  tick: number
  gt: string
  detected: string
  filled: string
  gtNature: string
  gtRoot: number | null
  detNature: string
  detRoot: number | null
  filledNature: string
  filledRoot: number | null
  natureHit: boolean
  filledNatureHit: boolean
  voicePc: number
  voiceN: number
  voiceMidi: number
}

function score(gt: TagRollProject, sparse: TagRollProject, filled: TagRollProject): Row[] {
  const lead = melodyId(gt)
  const onsets = gt.notes
    .filter((n) => n.partId === lead)
    .map((n) => n.startTick)
    .sort((a, b) => a - b)
  const rows: Row[] = []
  for (const tick of onsets) {
    const full = stackAt(gt, tick)
    const harmonyCount = HARMONY.filter((name) => {
      const key = name === 'Tenor' ? 'tenor' : name === 'Bari' ? 'bari' : 'bass'
      return full[key] != null
    }).length
    if (harmonyCount < 2 || full.lead == null) continue
    const gtId = idOf(gt, full)
    const det = stackAt(sparse, tick)
    const detId = idOf(sparse, det)
    const after = stackAt(filled, tick)
    const afterId = idOf(filled, after)
    let voiceN = 0
    let voicePc = 0
    let voiceMidi = 0
    for (const key of ['tenor', 'bari', 'bass'] as const) {
      if (full[key] == null) continue
      voiceN++
      if (after[key] == null) continue
      if (pc(after[key]!) === pc(full[key]!)) voicePc++
      if (after[key] === full[key]) voiceMidi++
    }
    rows.push({
      tick,
      gt: labelOf(gt, gtId),
      detected: labelOf(sparse, detId),
      filled: labelOf(filled, afterId),
      gtNature: gtId?.natureId ?? '',
      gtRoot: gtId?.rootPc ?? null,
      detNature: detId?.natureId ?? '',
      detRoot: detId?.rootPc ?? null,
      filledNature: afterId?.natureId ?? '',
      filledRoot: afterId?.rootPc ?? null,
      natureHit: !!gtId && !!detId && detId.natureId === gtId.natureId && detId.rootPc === gtId.rootPc,
      filledNatureHit:
        !!gtId && !!afterId && afterId.natureId === gtId.natureId && afterId.rootPc === gtId.rootPc,
      voicePc,
      voiceN,
      voiceMidi,
    })
  }
  return rows
}

function pct(n: number, d: number): string {
  if (!d) return '—'
  return `${((100 * n) / d).toFixed(1)}% (${n}/${d})`
}

function summarize(name: string, rows: Row[], fillStats: { filled: number; skipped: number; locked: number }) {
  const det = rows.filter((r) => r.natureHit).length
  const fin = rows.filter((r) => r.filledNatureHit).length
  const voiceN = rows.reduce((s, r) => s + r.voiceN, 0)
  const voicePc = rows.reduce((s, r) => s + r.voicePc, 0)
  const voiceMidi = rows.reduce((s, r) => s + r.voiceMidi, 0)
  const stacksPc = rows.filter((r) => r.voiceN > 0 && r.voicePc === r.voiceN).length
  const stacksMidi = rows.filter((r) => r.voiceN > 0 && r.voiceMidi === r.voiceN).length
  const barTicks = (ground.timeSignature.numerator * ground.ppq) / (ground.timeSignature.denominator / 4)
  const misses = rows.filter((r) => !r.filledNatureHit).map((r) => {
    const bar = Math.floor(r.tick / barTicks) + 1
    const beat = Math.floor((r.tick % barTicks) / ground.ppq) + 1
    return { ...r, bar, beat }
  })
  return {
    name,
    onsets: rows.length,
    detectNature: pct(det, rows.length),
    filledNature: pct(fin, rows.length),
    voicePitchClass: pct(voicePc, voiceN),
    voiceExactMidi: pct(voiceMidi, voiceN),
    stacksAllVoicesPc: pct(stacksPc, rows.length),
    stacksAllVoicesMidi: pct(stacksMidi, rows.length),
    fillStats,
    regressions: misses
      .filter((r) => r.natureHit)
      .map((r) => ({ bar: r.bar, beat: r.beat, ground: r.gt, filled: r.filled })),
    misses: misses.map((r) => ({
      bar: r.bar,
      beat: r.beat,
      ground: r.gt,
      detected: r.detected,
      filled: r.filled,
      gtNature: r.gtNature,
      gtRoot: r.gtRoot,
      detNature: r.detNature,
      detRoot: r.detRoot,
      filledNature: r.filledNature,
      filledRoot: r.filledRoot,
      voices: `${r.voicePc}/${r.voiceN} pc`,
    })),
  }
}

const idPrefix = process.argv[3] ?? 'mill'
const label = process.argv[4] ?? 'Mill Stream'
const outDir = process.argv[5] ? resolve(process.argv[5]) : OUT
const groundTitle = process.argv[4] ? `${label} · full` : 'Mill Stream · full (your copy)'

const ground = load(USER)
const bassSparse = sparseCopy(ground, ['Lead', 'Bass'], `${idPrefix}-bass-sparse`, `${label} · Lead + Bass`)
const tenorSparse = sparseCopy(ground, ['Lead', 'Tenor'], `${idPrefix}-tenor-sparse`, `${label} · Lead + Tenor`)

function runFill(sparse: TagRollProject, id: string, title: string) {
  const holes = detectHoles(sparse)
  const result = completeFromPartsToNotes({
    project: sparse,
    detectHoles: holes,
    profile: DEFAULT_CONTEST_PROFILE,
    idGen: createAllocateIdGenerator(),
  })
  const next = normalizeTagRollProject({
    ...sparse,
    id,
    title,
    notes: result.notes,
    harmonySketch: result.sketch,
  })
  if (!next) throw new Error(title)
  const barTicks = (ground.timeSignature.numerator * ground.ppq) / (ground.timeSignature.denominator / 4)
  return {
    project: next,
    stats: { filled: result.filled, skipped: result.skipped, locked: result.locked },
    skips: result.items
      .filter((item) => item.kind === 'skipped')
      .map((item) => ({
        bar: Math.floor(item.startTick / barTicks) + 1,
        beat: Math.floor((item.startTick % barTicks) / ground.ppq) + 1,
        reason: item.reason,
      })),
  }
}

const bassFilled = runFill(bassSparse, `${idPrefix}-bass-filled`, `${label} · Lead + Bass filled`)
const tenorFilled = runFill(tenorSparse, `${idPrefix}-tenor-filled`, `${label} · Lead + Tenor filled`)

const report = {
  sourceId: ground.id,
  sourceTitle: ground.title,
  notes: ground.notes.length,
  lengthTicks: ground.lengthTicks,
  melodyPart: ground.parts.find((p) => p.id === melodyId(ground))?.name ?? 'Lead',
  bass: {
    ...summarize('Lead + Bass', score(ground, bassSparse, bassFilled.project), bassFilled.stats),
    skips: bassFilled.skips,
  },
  tenor: {
    ...summarize('Lead + Tenor', score(ground, tenorSparse, tenorFilled.project), tenorFilled.stats),
    skips: tenorFilled.skips,
  },
}

mkdirSync(outDir, { recursive: true })
const projects = [
  { ...ground, id: `${idPrefix}-ground`, title: groundTitle, harmonySketch: [] },
  bassSparse,
  tenorSparse,
  bassFilled.project,
  tenorFilled.project,
]
for (const p of projects) {
  writeFileSync(resolve(outDir, `${p.id}.json`), `${JSON.stringify(p)}\n`)
}
const reportJson = `${JSON.stringify(report, null, 2)}\n`
writeFileSync(resolve(outDir, `${idPrefix}-report.json`), reportJson)
if (idPrefix === 'mill') writeFileSync(resolve(outDir, 'report.json'), reportJson)
console.log(JSON.stringify(report, null, 2))
