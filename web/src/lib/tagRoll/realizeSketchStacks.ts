/**
 * Realize locked My Chords (harmony sketch) as TTBB stacks on the piano roll.
 * One stack per Lead melody note that falls under a locked sketch span.
 */
import type { IdGenerator } from '../../ports/IdGenerator'
import type { VoicingPitches } from '../../domain/arranging/chords/chords'
import { applyHarmonyToNotes } from './harmonizer/applyHarmony'
import { authoritativeSketch, natureToSketchQuality } from './harmonySketch'
import { optimizeSketchHearPath, sketchHearVoicing } from './sketchHearVoicing'
import type {
  HarmonySketchQuality,
  HarmonySketchSpan,
  TagRollNote,
  TagRollPart,
} from './types'

export type RealizeSketchStacksResult = {
  notes: TagRollNote[]
  /** Melody notes that received a TTBB stack. */
  applied: number
  /** Locked sketch spans that covered at least one realized melody note. */
  spansUsed: number
}

function sketchCoveringTick(
  locked: readonly HarmonySketchSpan[],
  tick: number,
): HarmonySketchSpan | null {
  return locked.find((s) => s.startTick <= tick && tick < s.endTick) ?? null
}

/**
 * For each Lead note under a locked sketch chord, write Tenor/Bari/Bass (and keep Lead)
 * using a globally optimized inversion path (VL + ring, I/V home-bass starts).
 */
export function realizeSketchStacksToNotes(opts: {
  notes: readonly TagRollNote[]
  parts: readonly TagRollPart[]
  sketch: readonly HarmonySketchSpan[]
  melodyPartId: string
  /** When set, only spans with these ids are used (selection). */
  spanIds?: readonly string[] | null
  /** Detected hole fills — included in the inversion path so My Chords voicings match. */
  detectSpans?: readonly Pick<HarmonySketchSpan, 'id' | 'startTick' | 'endTick' | 'rootPc' | 'quality'>[] | null
  tonality?: number
  idGen: IdGenerator
}): RealizeSketchStacksResult {
  const lockedAll = authoritativeSketch(opts.sketch)
  const locked =
    opts.spanIds?.length
      ? lockedAll.filter((s) => opts.spanIds!.includes(s.id))
      : lockedAll
  if (!locked.length) {
    return { notes: [...opts.notes], applied: 0, spansUsed: 0 }
  }

  const melodyNotes = opts.notes
    .filter((n) => n.partId === opts.melodyPartId)
    .sort((a, b) => a.startTick - b.startTick || a.id.localeCompare(b.id))

  type Step = {
    melody: TagRollNote
    span: HarmonySketchSpan
    quality: HarmonySketchQuality
  }
  const steps: Step[] = []
  for (const melody of melodyNotes) {
    const span = sketchCoveringTick(locked, melody.startTick)
    if (!span) continue
    steps.push({
      melody,
      span,
      quality: natureToSketchQuality(span.quality) as HarmonySketchQuality,
    })
  }
  if (!steps.length) {
    return { notes: [...opts.notes], applied: 0, spansUsed: 0 }
  }

  // Path context: locked My Chords + Detected fills on the timeline.
  type PathRef = {
    id: string
    startTick: number
    rootPc: number
    quality: HarmonySketchQuality
    leadMidi: number
    stepIndex: number | null
  }
  const byTick = new Map<number, PathRef>()
  for (const d of opts.detectSpans ?? []) {
    const mel =
      melodyNotes.find((m) => m.startTick <= d.startTick && d.startTick < m.startTick + m.durationTicks) ??
      melodyNotes.find((m) => m.startTick === d.startTick)
    byTick.set(d.startTick, {
      id: d.id,
      startTick: d.startTick,
      rootPc: d.rootPc,
      quality: natureToSketchQuality(d.quality),
      leadMidi: mel?.midi ?? 60,
      stepIndex: null,
    })
  }
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i]!
    byTick.set(s.span.startTick, {
      id: s.span.id,
      startTick: s.span.startTick,
      rootPc: s.span.rootPc,
      quality: s.quality,
      leadMidi: s.melody.midi,
      stepIndex: i,
    })
  }
  const combined = [...byTick.values()].sort(
    (a, b) => a.startTick - b.startTick || a.id.localeCompare(b.id),
  )
  const path = optimizeSketchHearPath(
    combined.map((c) => ({
      rootPc: c.rootPc,
      quality: c.quality,
      leadMidi: c.leadMidi,
    })),
    { tonality: opts.tonality ?? 0 },
  )
  const voicingByStep = new Map<number, VoicingPitches>()
  for (let i = 0; i < combined.length; i++) {
    const ref = combined[i]!
    const v = path[i]
    if (v && ref.stepIndex != null) voicingByStep.set(ref.stepIndex, v)
  }

  let notes = [...opts.notes]
  let applied = 0
  const usedSpanIds = new Set<string>()
  let prevVoicing: VoicingPitches | null = null

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]!
    let voicing = voicingByStep.get(i) ?? null
    if (!voicing) {
      voicing = sketchHearVoicing({
        rootPc: step.span.rootPc,
        quality: step.quality,
        leadMidi: step.melody.midi,
        prev: prevVoicing,
      })
    }
    if (!voicing) continue

    const pitches = {
      tenor: voicing.tenor,
      bari: voicing.bari,
      bass: voicing.bass,
      lead: step.melody.midi,
    }
    notes = applyHarmonyToNotes({
      notes,
      parts: opts.parts,
      melody: notes.find((n) => n.id === step.melody.id) ?? step.melody,
      pitches,
      idGen: opts.idGen,
    })
    prevVoicing = {
      bass: pitches.bass,
      bari: pitches.bari,
      lead: pitches.lead,
      tenor: pitches.tenor,
    }
    applied++
    usedSpanIds.add(step.span.id)
  }

  return { notes, applied, spansUsed: usedSpanIds.size }
}
