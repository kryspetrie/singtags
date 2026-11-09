/** Apply harmony, passing tones, and complete-from-parts into Tag Studio notes. */

import { lazyFn, type StoreDeps } from './deps'

import { applyHarmony } from '../../application/tagRoll/applyHarmony'

import {
  isHarmonySketchQuality,
  natureToSketchQuality,
  carveInsertSketchSpan,
  sketchPatchFromMelodyNote,
  sketchSpanAtTick,
  sortSpans,
} from '../../lib/tagRoll/harmonySketch'

import { realizeSketchStacksToNotes } from '../../lib/tagRoll/realizeSketchStacks'

import {
  completeFromPartsToNotes,
  type CompleteFromPartsItem,
  type CompleteFromPartsRange,
  type DetectedHolePref,
} from '../../lib/tagRoll/completeFromParts'

import type { ContestProfile } from '../../domain/arranging/contestProfile'

import type { TagRollNote, TagRollProject } from '../../lib/tagRoll/types'

import { svc } from './runtime'

export function createTagRollHarmonyApplyActions(deps: StoreDeps) {

  const clearNoteSelection = lazyFn(() => deps.clearNoteSelection)
  const current = deps.current
  const declareHarmonySpan = lazyFn(() => deps.declareHarmonySpan)
  const pushHistory = lazyFn(() => deps.pushHistory)
  const scheduleSave = lazyFn(() => deps.scheduleSave)
  const selectedSketchSpanIds = deps.selectedSketchSpanIds

  /**
   * Upsert harmony notes for every non-melody part in the stack.
   * Places at the melody note under the cursor (same start + duration).
   * Existing notes are moved into the stack; notes spanning the insert are broken.
   */
  function upsertHarmonyNotes(opts: {
    melodyNoteId: string
    pitches: { tenor: number; bari: number; bass: number; lead: number }
  }): void {
    const p = current.value
    if (!p) return
    const melody = p.notes.find((n: any) => n.id === opts.melodyNoteId)
    if (!melody) return
    pushHistory()
    const result = applyHarmony({
      project: p,
      melodyNoteId: opts.melodyNoteId,
      pitches: opts.pitches,
      idGen: svc().idGen,
    })
    if (!result.ok) return
    current.value = { ...p, notes: result.notes, updatedAt: svc().clock.now() }
    scheduleSave()
  }

  /** Batch TTBB upserts in one history step (Sketch unchanged). */
  function upsertHarmonyNotesMany(
    ops: readonly {
      melodyNoteId: string
      pitches: { tenor: number; bari: number; bass: number; lead: number }
    }[],
  ): number {
    const p = current.value
    if (!p || !ops.length) return 0
    pushHistory()
    let notes = p.notes
    let applied = 0
    for (const op of ops) {
      const result = applyHarmony({
        project: { ...p, notes },
        melodyNoteId: op.melodyNoteId,
        pitches: op.pitches,
        idGen: svc().idGen,
      })
      if (!result.ok) continue
      notes = result.notes
      applied += 1
    }
    if (!applied) return 0
    current.value = { ...p, notes, updatedAt: svc().clock.now() }
    scheduleSave()
    return applied
  }

  /** Carve short Sketch chords for passing NCTs (no note changes). */
  function carvePassingSketchSpans(
    ops: readonly {
      startTick: number
      endTick: number
      rootPc: number
      natureId: string
    }[],
  ): number {
    const p = current.value
    if (!p || !ops.length) return 0
    pushHistory()
    let sketch = p.harmonySketch ?? []
    for (const op of ops) {
      const startTick = Math.max(0, Math.round(op.startTick))
      const endTick = Math.max(startTick + 1, Math.round(op.endTick))
      sketch = carveInsertSketchSpan(sketch, {
        startTick,
        endTick,
        rootPc: op.rootPc,
        quality: op.natureId,
        locked: true,
        pillar: false,
        source: 'coach',
      })
    }
    current.value = {
      ...p,
      harmonySketch: sketch,
      updatedAt: svc().clock.now(),
    }
    scheduleSave()
    return ops.length
  }

  /**
   * Passing / NCT resolve: carve Sketch chords at each melody window and realize
   * TTBB in one history step. Inserts are non-pillar; covering remnants keep home.
   */
  function applyPassingSketchAndStacks(
    ops: readonly {
      melodyNoteId: string
      pitches: { tenor: number; bari: number; bass: number; lead: number }
      rootPc: number
      natureId: string
      startTick: number
      endTick: number
    }[],
  ): number {
    const p = current.value
    if (!p || !ops.length) return 0
    pushHistory()
    let sketch = p.harmonySketch ?? []
    let notes = p.notes
    let applied = 0
    for (const op of ops) {
      const startTick = Math.max(0, Math.round(op.startTick))
      const endTick = Math.max(startTick + 1, Math.round(op.endTick))
      sketch = carveInsertSketchSpan(sketch, {
        startTick,
        endTick,
        rootPc: op.rootPc,
        quality: op.natureId,
        locked: true,
        pillar: false,
        source: 'coach',
      })
      const result = applyHarmony({
        project: { ...p, notes, harmonySketch: sketch },
        melodyNoteId: op.melodyNoteId,
        pitches: op.pitches,
        idGen: svc().idGen,
      })
      if (result.ok) {
        notes = result.notes
        applied += 1
      }
    }
    if (!applied) return 0
    current.value = {
      ...p,
      notes,
      harmonySketch: sketch,
      updatedAt: svc().clock.now(),
    }
    scheduleSave()
    return applied
  }

  /**
   * Harmonize commit: declare locked sketch for the melody window;
   * optionally realize TTBB in the same history step.
   * Pass `window` for held-post / harmonic-moment slices (not the full Lead note).
   */
  function commitHarmonizeAtMelody(opts: {
    melodyNoteId: string
    rootPc: number
    quality: string
    mode: 'chord' | 'chord+stack'
    pitches?: { tenor: number; bari: number; bass: number; lead: number }
    /** Override sketch/realize span (inspect range, selected Sketch, held-post). */
    window?: { startTick: number; durationTicks: number }
    /** Prefer this Sketch span id when replacing a selection. */
    spanId?: string
  }): void {
    const p = current.value
    if (!p) return
    const melody = p.notes.find((n: any) => n.id === opts.melodyNoteId)
    if (!melody) return
    const startTick = opts.window?.startTick ?? melody.startTick
    const durationTicks = opts.window?.durationTicks ?? melody.durationTicks
    const existing =
      (opts.spanId
        ? (p.harmonySketch ?? []).find((s: any) => s.id === opts.spanId)
        : null) ?? sketchSpanAtTick(p.harmonySketch ?? [], startTick)
    const patch = sketchPatchFromMelodyNote({
      melodyStartTick: startTick,
      melodyDurationTicks: durationTicks,
      rootPc: opts.rootPc,
      quality: opts.quality,
      id: existing?.id,
    })
    declareHarmonySpan({
      startTick: patch.startTick,
      endTick: patch.endTick,
      rootPc: patch.rootPc,
      quality: patch.quality,
      id: patch.id,
      windowKind: opts.window ? 'freeSpan' : 'melodyNote',
      alsoRealize:
        opts.mode === 'chord+stack' && opts.pitches
          ? { melodyNoteId: opts.melodyNoteId, pitches: opts.pitches }
          : undefined,
    })
  }

  /**
   * Realize locked Sketch as TTBB stacks under Lead melody notes.
   * When sketch spans are selected, only those spans are used; otherwise all locked.
   * Preserves covering TBB only when sparse harmony already exists at the onset.
   */
  function realizeHarmonySketchStacks(opts?: {
    detectSpans?: readonly {
      id: string
      startTick: number
      endTick: number
      rootPc: number
      quality: string
    }[]
  }): { applied: number; spansUsed: number } {
    const p = current.value
    if (!p) return { applied: 0, spansUsed: 0 }
    const melodyPartId =
      p.view.melodyPartId ?? p.parts.find((x: any) => x.name === 'Lead')?.id ?? null
    if (!melodyPartId) return { applied: 0, spansUsed: 0 }
    const spanIds = selectedSketchSpanIds.value.length ? selectedSketchSpanIds.value : null
    const detectSpans =
      opts?.detectSpans?.map((d) => ({
        id: d.id,
        startTick: d.startTick,
        endTick: d.endTick,
        rootPc: d.rootPc,
        quality: isHarmonySketchQuality(d.quality)
          ? d.quality
          : natureToSketchQuality(d.quality),
      })) ?? null
    const result = realizeSketchStacksToNotes({
      notes: p.notes,
      parts: p.parts,
      sketch: p.harmonySketch ?? [],
      melodyPartId,
      spanIds,
      detectSpans,
      tonality: p.tonality,
      idGen: svc().idGen,
    })
    if (result.applied === 0) return { applied: 0, spansUsed: result.spansUsed }
    pushHistory()
    current.value = {
      ...p,
      notes: result.notes,
      updatedAt: svc().clock.now(),
    }
    scheduleSave()
    return { applied: result.applied, spansUsed: result.spansUsed }
  }

  /**
   * Lock Detected (where vocab-ok) into Sketch; with sparse TBB, fill empty parts.
   * Skips unrecognized / outside-vocab / no-completion moments.
   */
  function completeFromParts(opts: {
    detectHoles?: readonly DetectedHolePref[]
    range?: CompleteFromPartsRange
    profile: ContestProfile
  }): {
    filled: number
    locked: number
    skipped: number
    items: CompleteFromPartsItem[]
  } {
    const p = current.value
    if (!p) return { filled: 0, locked: 0, skipped: 0, items: [] }
    const result = completeFromPartsToNotes({
      project: p,
      detectHoles: opts.detectHoles,
      range: opts.range ?? null,
      profile: opts.profile,
      idGen: svc().idGen,
    })
    if (result.filled === 0 && result.locked === 0 && result.skipped === 0) {
      return { filled: 0, locked: 0, skipped: 0, items: [] }
    }
    if (result.filled === 0 && result.locked === 0) {
      return {
        filled: 0,
        locked: 0,
        skipped: result.skipped,
        items: result.items,
      }
    }
    pushHistory()
    current.value = {
      ...p,
      notes: result.notes,
      harmonySketch: sortSpans(result.sketch),
      updatedAt: svc().clock.now(),
    }
    scheduleSave()
    return {
      filled: result.filled,
      locked: result.locked,
      skipped: result.skipped,
      items: result.items,
    }
  }

  /**
   * Replace document notes from an external coach/bridge merge.
   * Preserves selection clearing; optional meta patches (title/bpm/tonality/length).
   */
  function replaceNotesFromExternal(
    notes: TagRollNote[],
    meta?: Partial<
      Pick<TagRollProject, 'title' | 'bpm' | 'tonality' | 'tonalityMode' | 'preferFlats' | 'lengthTicks'>
    >,
  ): void {
    const p = current.value
    if (!p) return
    pushHistory()
    current.value = {
      ...p,
      ...meta,
      notes: notes.map((n) => ({ ...n })),
      updatedAt: svc().clock.now(),
    }
    clearNoteSelection()
    scheduleSave()
  }

  const actions = {
    upsertHarmonyNotes,
    upsertHarmonyNotesMany,
    carvePassingSketchSpans,
    applyPassingSketchAndStacks,
    commitHarmonizeAtMelody,
    realizeHarmonySketchStacks,
    completeFromParts,
    replaceNotesFromExternal,
  }
  Object.assign(deps, actions)

  function bindWatches(): void {}

  return { actions, bindWatches }

}
