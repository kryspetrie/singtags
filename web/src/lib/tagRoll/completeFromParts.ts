/**
 * Complete sparse melody + harmony parts into Sketch + empty TBB fills.
 * Skips moments outside barbershop vocabulary / that cannot keep locked pitches.
 */
import type { IdGenerator } from '../../ports/IdGenerator'
import {
  chooseSmoothVoicing,
  completeSparseStack,
  filledLeapExcess,
  type SparseHarmonyRole,
  type SparseSkipReason,
} from '../../domain/arranging/sparseStackComplete'
import type { ContestProfile } from '../../domain/arranging/contestProfile'
import type { TonalityMode } from '../../domain/arranging/types'
import { absoluteChordLabel } from '../../domain/arranging/chordAnalysisBar'
import { applyHarmonyToNotes } from './harmonizer/applyHarmony'
import {
  trySketchQualityFromNature,
  upsertSketchSpan,
  type HarmonySketchSpan,
} from './harmonySketch'
import { melodyPartIdOf } from './melodyNoteRoles'
import type { TagRollNote, TagRollPart, TagRollProject } from './types'

/** Inclusive-start exclusive-end tick window. */
export type TickInterval = { startTick: number; endTick: number }

/** null = whole project. */
export type CompleteFromPartsRange = readonly TickInterval[] | null

export type DetectedHolePref = {
  id?: string
  startTick: number
  endTick: number
  rootPc: number
  quality: string
}

export type CompleteFromPartsFilled = {
  kind: 'filled'
  startTick: number
  endTick: number
  label: string
  filledParts: string[]
}

export type CompleteFromPartsLocked = {
  kind: 'locked'
  startTick: number
  endTick: number
  label: string
}

export type CompleteFromPartsSkipped = {
  kind: 'skipped'
  startTick: number
  endTick: number
  reason: SparseSkipReason
  label: string
}

export type CompleteFromPartsItem =
  | CompleteFromPartsFilled
  | CompleteFromPartsLocked
  | CompleteFromPartsSkipped

export type CompleteFromPartsResult = {
  notes: TagRollNote[]
  sketch: HarmonySketchSpan[]
  filled: number
  locked: number
  skipped: number
  items: CompleteFromPartsItem[]
}

const SKIP_LABEL: Record<SparseSkipReason, string> = {
  unrecognized: 'Unrecognized',
  outside_vocab: 'Outside vocabulary',
  no_completion: 'No completion with locked notes',
}

export function skipReasonLabel(reason: SparseSkipReason): string {
  return SKIP_LABEL[reason]
}

function partByName(parts: readonly TagRollPart[], name: string): TagRollPart | undefined {
  return parts.find((p) => p.name === name)
}

function coveringNote(
  notes: readonly TagRollNote[],
  partId: string | undefined,
  tick: number,
): TagRollNote | undefined {
  if (!partId) return undefined
  return (
    notes.find((n) => n.partId === partId && n.startTick === tick) ??
    notes.find(
      (n) =>
        n.partId === partId &&
        n.startTick <= tick &&
        tick < n.startTick + n.durationTicks,
    )
  )
}

/**
 * One slice per overlap of the sung parts. A half note over two quarters
 * becomes two slices, so empty parts get a note for each shorter rhythm.
 */
function harmonyFillSlices(
  notes: readonly TagRollNote[],
  melodyPartId: string,
  harmonyPartIds: readonly string[],
  range: CompleteFromPartsRange,
): Array<{ startTick: number; endTick: number; melody: TagRollNote }> {
  const partIds = new Set([melodyPartId, ...harmonyPartIds])
  const ticks = new Set<number>()
  for (const n of notes) {
    if (!partIds.has(n.partId)) continue
    ticks.add(n.startTick)
    ticks.add(n.startTick + n.durationTicks)
  }
  const sorted = [...ticks].sort((a, b) => a - b)
  const out: Array<{ startTick: number; endTick: number; melody: TagRollNote }> = []
  for (let i = 0; i < sorted.length - 1; i++) {
    const startTick = sorted[i]!
    const endTick = sorted[i + 1]!
    if (endTick <= startTick) continue
    if (!tickInIntervals(startTick, range)) continue
    const melody = coveringNote(notes, melodyPartId, startTick)
    if (!melody) continue
    out.push({ startTick, endTick, melody })
  }
  return out
}

function holeAtTick(
  holes: readonly DetectedHolePref[],
  tick: number,
): DetectedHolePref | null {
  return holes.find((h) => h.startTick <= tick && tick < h.endTick) ?? null
}

/** Merge overlapping/adjacent intervals, sorted. */
export function mergeTickIntervals(
  spans: readonly TickInterval[],
): TickInterval[] {
  const sorted = [...spans]
    .filter((s) => s.endTick > s.startTick)
    .sort((a, b) => a.startTick - b.startTick || a.endTick - b.endTick)
  if (!sorted.length) return []
  const out: TickInterval[] = [{ ...sorted[0]! }]
  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i]!
    const last = out[out.length - 1]!
    if (cur.startTick <= last.endTick) {
      last.endTick = Math.max(last.endTick, cur.endTick)
    } else {
      out.push({ ...cur })
    }
  }
  return out
}

export function tickInIntervals(
  tick: number,
  range: CompleteFromPartsRange,
): boolean {
  if (!range) return true
  return range.some((r) => tick >= r.startTick && tick < r.endTick)
}

export function intervalOverlapsRange(
  startTick: number,
  endTick: number,
  range: CompleteFromPartsRange,
): boolean {
  if (!range) return true
  return range.some((r) => startTick < r.endTick && endTick > r.startTick)
}

/**
 * Prefer Sketch selection intervals (merged), else inspect/chord cursor, else whole project.
 * Multi-span selection is a union of intervals — not a min–max hull.
 */
export function resolveCompleteFromPartsRange(opts: {
  sketchSpans?: readonly { startTick: number; endTick: number }[] | null
  inspectRange?: { startTick: number; endTick: number } | null
}): CompleteFromPartsRange {
  const spans = opts.sketchSpans?.filter((s) => s.endTick > s.startTick) ?? []
  if (spans.length) {
    return mergeTickIntervals(spans)
  }
  const cur = opts.inspectRange
  if (cur && cur.endTick > cur.startTick) {
    return [{ startTick: cur.startTick, endTick: cur.endTick }]
  }
  return null
}

/** Filter Detected holes that pass the vocab gate and optional tick range. */
export function filterLockableDetectedHoles(
  holes: readonly DetectedHolePref[],
  range: CompleteFromPartsRange,
): DetectedHolePref[] {
  return holes.filter((h) => {
    if (!intervalOverlapsRange(h.startTick, h.endTick, range)) return false
    return trySketchQualityFromNature(h.quality) != null && Number.isFinite(h.rootPc)
  })
}

/** True when any melody onset in range has a covering Tenor/Bari/Bass note. */
export function hasSparseHarmonyInScope(opts: {
  project: TagRollProject
  range?: CompleteFromPartsRange
}): boolean {
  const p = opts.project
  const melodyPartId = melodyPartIdOf(p)
  if (!melodyPartId) return false
  const tenor = partByName(p.parts, 'Tenor')
  const bari = partByName(p.parts, 'Bari')
  const bass = partByName(p.parts, 'Bass')
  const range = opts.range ?? null
  for (const melody of p.notes) {
    if (melody.partId !== melodyPartId) continue
    if (!tickInIntervals(melody.startTick, range)) continue
    const tick = melody.startTick
    if (
      coveringNote(p.notes, tenor?.id, tick) ||
      coveringNote(p.notes, bari?.id, tick) ||
      coveringNote(p.notes, bass?.id, tick)
    ) {
      return true
    }
  }
  return false
}

/**
 * For each melody onset in range with Detected pref and/or sparse TBB:
 * - Sparse: lock Sketch when vocab-ok and fill empty TBB.
 * - Detected-only (no sparse): lock Sketch only — do not invent TTBB.
 */
export function completeFromPartsToNotes(opts: {
  project: TagRollProject
  detectHoles?: readonly DetectedHolePref[]
  range?: CompleteFromPartsRange
  profile: ContestProfile
  idGen: IdGenerator
}): CompleteFromPartsResult {
  const p = opts.project
  const melodyPartId = melodyPartIdOf(p)
  if (!melodyPartId) {
    return {
      notes: [...p.notes],
      sketch: [...(p.harmonySketch ?? [])],
      filled: 0,
      locked: 0,
      skipped: 0,
      items: [],
    }
  }

  const tenor = partByName(p.parts, 'Tenor')
  const bari = partByName(p.parts, 'Bari')
  const bass = partByName(p.parts, 'Bass')
  const range = opts.range ?? null
  const holes = opts.detectHoles ?? []
  const mode = (p.tonalityMode ?? 'major') as TonalityMode
  const preferFlats = p.preferFlats

  const harmonyIds = [tenor?.id, bari?.id, bass?.id].filter((id): id is string => !!id)
  const slices = harmonyFillSlices(p.notes, melodyPartId, harmonyIds, range)

  let notes = [...p.notes]
  let sketch = [...(p.harmonySketch ?? [])]
  let carried: { tenor?: number; bari?: number; bass?: number } = {}
  const items: CompleteFromPartsItem[] = []
  let filled = 0
  let locked = 0
  let skipped = 0

  for (const slice of slices) {
    const tick = slice.startTick
    const endTick = slice.endTick
    const melody = slice.melody
    const tOn = coveringNote(notes, tenor?.id, tick)
    const bOn = coveringNote(notes, bari?.id, tick)
    const bsOn = coveringNote(notes, bass?.id, tick)
    const coveringHole = holeAtTick(holes, tick)
    // A chord change under a held note is its own slice. Only a hole that
    // starts here may name that slice; a longer hole must not paint the rest.
    const hole = coveringHole && (coveringHole.startTick === tick || !(tOn || bOn || bsOn))
      ? coveringHole
      : null

    const hasSparse = !!(tOn || bOn || bsOn)
    if (!hasSparse && !hole) continue

    // Bad/unknown hole pref → ignore hole and fall back to sparse ID (if any).
    let preferredQuality = hole ? trySketchQualityFromNature(hole.quality) : null
    let preferredRoot: number | null = hole && preferredQuality != null ? hole.rootPc : null
    let holeForSketch = preferredQuality != null ? hole : null
    if (hole && !preferredQuality) {
      preferredQuality = null
      preferredRoot = null
      holeForSketch = null
      if (!hasSparse) {
        items.push({
          kind: 'skipped',
          startTick: tick,
          endTick,
          reason: 'unrecognized',
          label: skipReasonLabel('unrecognized'),
        })
        skipped++
        continue
      }
    }

    // Detected-only: lock Sketch when vocab-ok; do not invent TTBB.
    if (!hasSparse && holeForSketch && preferredQuality) {
      sketch = upsertSketchSpan(sketch, {
        id: holeForSketch.id,
        startTick: holeForSketch.startTick,
        endTick: holeForSketch.endTick,
        rootPc: holeForSketch.rootPc,
        quality: preferredQuality,
        source: 'user',
        locked: true,
        pillar: true,
      })
      const label = absoluteChordLabel(holeForSketch.rootPc, preferredQuality, preferFlats, {
        tonality: p.tonality,
        tonalityMode: mode,
      })
      items.push({
        kind: 'locked',
        startTick: tick,
        endTick,
        label,
      })
      locked++
      continue
    }

    if (!hasSparse) continue

    const midi = {
      lead: melody.midi,
      ...(tOn ? { tenor: tOn.midi } : {}),
      ...(bOn ? { bari: bOn.midi } : {}),
      ...(bsOn ? { bass: bsOn.midi } : {}),
    }

    const result = completeSparseStack({
      midi,
      tonality: p.tonality,
      mode,
      profile: opts.profile,
      preferredNatureId: preferredQuality,
      preferredRootPc: preferredRoot,
      prevMidi: {
        lead: melody.midi,
        tenor: tOn?.midi ?? carried.tenor,
        bari: bOn?.midi ?? carried.bari,
        bass: bsOn?.midi ?? carried.bass,
      },
    })

    if (!result.ok) {
      if (tOn) carried.tenor = tOn.midi
      if (bOn) carried.bari = bOn.midi
      if (bsOn) carried.bass = bsOn.midi
      items.push({
        kind: 'skipped',
        startTick: tick,
        endTick,
        reason: result.reason,
        label: skipReasonLabel(result.reason),
      })
      skipped++
      continue
    }

    const quality = trySketchQualityFromNature(result.natureId)
    if (!quality) {
      items.push({
        kind: 'skipped',
        startTick: tick,
        endTick,
        reason: 'unrecognized',
        label: skipReasonLabel('unrecognized'),
      })
      skipped++
      continue
    }

    sketch = upsertSketchSpan(sketch, {
      id: holeForSketch && holeForSketch.startTick === tick ? holeForSketch.id : undefined,
      startTick: tick,
      endTick,
      rootPc: result.rootPc,
      quality,
      source: 'user',
      locked: true,
      pillar: true,
    })

    carried = {
      tenor: result.pitches.tenor,
      bari: result.pitches.bari,
      bass: result.pitches.bass,
    }

    const span: TagRollNote = {
      ...melody,
      startTick: tick,
      durationTicks: Math.max(1, endTick - tick),
    }
    notes = applyHarmonyToNotes({
      notes,
      parts: p.parts,
      melody: span,
      cursorTick: tick,
      pitches: {
        tenor: result.pitches.tenor,
        bari: result.pitches.bari,
        bass: result.pitches.bass,
        lead: result.pitches.lead,
      },
      preserveExistingParts: true,
      idGen: opts.idGen,
    })

    const filledParts = result.filledRoles.map(
      (r) => (r === 'tenor' ? 'Tenor' : r === 'bari' ? 'Bari' : 'Bass'),
    )
    const label = absoluteChordLabel(result.rootPc, result.natureId, preferFlats, {
      tonality: p.tonality,
      tonalityMode: mode,
    })
    // Count filled only when ≥1 empty part was written; else Sketch-only lock.
    if (filledParts.length > 0) {
      items.push({
        kind: 'filled',
        startTick: tick,
        endTick,
        label,
        filledParts,
      })
      filled++
    } else {
      items.push({
        kind: 'locked',
        startTick: tick,
        endTick,
        label,
      })
      locked++
    }
  }

  if (tenor && bari && bass) {
    notes = smoothFilledJumps({
      notes,
      originalNotes: p.notes,
      sketch,
      melodyPartId,
      tenorId: tenor.id,
      bariId: bari.id,
      bassId: bass.id,
    })
  }

  return { notes, sketch, filled, locked, skipped, items }
}

/** Notes that meet, or sit across a rest no longer than a quarter. */
const CONNECT_GAP = 480

function connected(left: TagRollNote, right: TagRollNote): boolean {
  const gap = right.startTick - (left.startTick + left.durationTicks)
  return gap <= CONNECT_GAP
}

function partLine(notes: readonly TagRollNote[], partId: string): TagRollNote[] {
  return notes
    .filter((n) => n.partId === partId)
    .sort((a, b) => a.startTick - b.startTick || a.id.localeCompare(b.id))
}

/**
 * Two passes over every part that was filled in. Where one of those parts
 * leaps past its limit, the filled voices trade chord tones (and a filled
 * bass may change inversion). Sung notes stay put. Each pass looks backward
 * and forward so fixing one jump does not invent the next.
 */
function smoothFilledJumps(opts: {
  notes: TagRollNote[]
  originalNotes: readonly TagRollNote[]
  sketch: readonly HarmonySketchSpan[]
  melodyPartId: string
  tenorId: string
  bariId: string
  bassId: string
}): TagRollNote[] {
  const originalIds = new Set(opts.originalNotes.map((n) => n.id))
  const notes = opts.notes.map((n) => ({ ...n }))
  const partByRole: Record<SparseHarmonyRole, string> = {
    tenor: opts.tenorId,
    bari: opts.bariId,
    bass: opts.bassId,
  }
  const roles: SparseHarmonyRole[] = ['tenor', 'bari', 'bass']
  const ticks = [
    ...new Set(
      notes
        .filter((n) => roles.some((role) => n.partId === partByRole[role]) && !originalIds.has(n.id))
        .map((n) => n.startTick),
    ),
  ].sort((a, b) => a - b)

  for (let pass = 0; pass < 2; pass++) {
    const order = pass === 0 ? ticks : [...ticks].reverse()
    for (const tick of order) {
      const span = opts.sketch.find((s) => s.startTick <= tick && tick < s.endTick)
      const lead = coveringNote(notes, opts.melodyPartId, tick)
      if (!span || !lead) continue

      const locked: Partial<Record<SparseHarmonyRole, number>> = {}
      const prev: Partial<Record<SparseHarmonyRole, number>> = {}
      const next: Partial<Record<SparseHarmonyRole, number>> = {}
      const current: Partial<Record<SparseHarmonyRole, number>> = {}
      let triggered = false

      for (const role of roles) {
        const line = partLine(notes, partByRole[role])
        const cover = coveringNote(notes, partByRole[role], tick)
        const sung = opts.originalNotes.some(
          (n) =>
            n.partId === partByRole[role] &&
            n.startTick <= tick &&
            tick < n.startTick + n.durationTicks,
        )
        if (!cover) continue
        const index = line.findIndex((n) => n.id === cover.id)
        const prevNote = index > 0 && connected(line[index - 1]!, cover) ? line[index - 1] : undefined
        const nextNote =
          index >= 0 && index < line.length - 1 && connected(cover, line[index + 1]!)
            ? line[index + 1]
            : undefined
        if (sung) locked[role] = cover.midi
        else if (!originalIds.has(cover.id)) {
          current[role] = cover.midi
          const oldIn = prevNote ? Math.abs(cover.midi - prevNote.midi) : 0
          const oldOut = nextNote ? Math.abs(nextNote.midi - cover.midi) : 0
          if (filledLeapExcess(role, oldIn) > 0 || filledLeapExcess(role, oldOut) > 0) triggered = true
        }
        if (prevNote) prev[role] = prevNote.midi
        if (nextNote) next[role] = nextNote.midi
      }
      if (!triggered) continue

      const chosen = chooseSmoothVoicing({
        natureId: span.quality,
        rootPc: span.rootPc,
        lead: lead.midi,
        locked,
        prev,
        next,
      })
      if (!chosen) continue

      let oldExcess = 0
      let newExcess = 0
      let blocked = false
      for (const role of roles) {
        if (current[role] == null) continue
        const oldIn = prev[role] != null ? Math.abs(current[role] - prev[role]) : 0
        const oldOut = next[role] != null ? Math.abs(next[role] - current[role]) : 0
        const newIn = prev[role] != null ? Math.abs(chosen[role] - prev[role]) : 0
        const newOut = next[role] != null ? Math.abs(next[role] - chosen[role]) : 0
        oldExcess += filledLeapExcess(role, oldIn) + filledLeapExcess(role, oldOut)
        newExcess += filledLeapExcess(role, newIn) + filledLeapExcess(role, newOut)
        if (prev[role] != null && filledLeapExcess(role, oldIn) === 0 && filledLeapExcess(role, newIn) > 0) {
          blocked = true
        }
        if (next[role] != null && filledLeapExcess(role, oldOut) === 0 && filledLeapExcess(role, newOut) > 0) {
          blocked = true
        }
      }
      if (blocked || newExcess >= oldExcess) continue

      for (const role of roles) {
        if (locked[role] != null) continue
        const note = notes.find(
          (n) => n.partId === partByRole[role] && n.startTick === tick && !originalIds.has(n.id),
        )
        if (note) note.midi = chosen[role]
      }
    }
  }
  return notes
}
