/** Harmony-sketch span edits, selection, and clipboard for Tag Studio. */

import { lazyFn, type StoreDeps } from './deps'

import { applyHarmony } from '../../application/tagRoll/applyHarmony'

import { ensureLengthForNote, ensureLengthForTick } from '../../lib/tagRoll/snap'

import { clipboardSpansAtPlayhead, spansToClipboard } from '../../lib/tagRoll/sketchClipboard'

import { measureTicks } from '../../lib/tagRoll/tempoMap'

import {
  natureToSketchQuality,
  absorbHarmonySpanRemoval,
  removeSketchSpan,
  type HarmonyAbsorbNeighbor,
  splitSketchSpanAt,
  sortSpans,
  upsertSketchSpan,
} from '../../lib/tagRoll/harmonySketch'

import type { HarmonySketchQuality, HarmonySketchSpan } from '../../lib/tagRoll/types'

import { svc } from './runtime'

export function createTagRollHarmonySketchActions(deps: StoreDeps) {

  const chordsLaneFocused = deps.chordsLaneFocused
  const clearNoteSelection = lazyFn(() => deps.clearNoteSelection)
  const current = deps.current
  const patchProject = lazyFn(() => deps.patchProject)
  const pushHistory = lazyFn(() => deps.pushHistory)
  const scheduleSave = lazyFn(() => deps.scheduleSave)
  const selectedExpressionId = deps.selectedExpressionId
  const selectedNoteIds = deps.selectedNoteIds
  const selectedSketchSpanIds = deps.selectedSketchSpanIds
  const selectedSketchSpans = deps.selectedSketchSpans
  const sketchClipboard = deps.sketchClipboard

  function setHarmonySketch(spans: HarmonySketchSpan[]): void {
    patchProject({ harmonySketch: sortSpans(spans) })
  }

  /**
   * Canonical declare: upsert a locked user sketch span (optionally realize TTBB this window).
   * Callers that care about Coach pillars should sync after this returns.
   */
  function declareHarmonySpan(opts: {
    startTick: number
    endTick: number
    rootPc: number
    quality: string
    id?: string
    /** Telemetry / future history labels */
    windowKind?: 'melodyNote' | 'detectHole' | 'freeSpan'
    alsoRealize?: {
      melodyNoteId: string
      pitches: { tenor: number; bari: number; bass: number; lead: number }
    }
  }): string | null {
    const p = current.value
    if (!p) return null
    pushHistory()
    const sketchNext = upsertSketchSpan(p.harmonySketch ?? [], {
      id: opts.id,
      startTick: opts.startTick,
      endTick: Math.max(opts.startTick + 1, opts.endTick),
      rootPc: opts.rootPc,
      quality: natureToSketchQuality(opts.quality),
      source: 'user',
      locked: true,
    })
    let notes = p.notes
    if (opts.alsoRealize) {
      const result = applyHarmony({
        project: { ...p, harmonySketch: sketchNext },
        melodyNoteId: opts.alsoRealize.melodyNoteId,
        pitches: opts.alsoRealize.pitches,
        idGen: svc().idGen,
      })
      if (result.ok) notes = result.notes
    }
    const id =
      opts.id ??
      sketchNext.find((s) => s.startTick === opts.startTick && s.endTick === opts.endTick)?.id ??
      sketchNext[sketchNext.length - 1]?.id ??
      null
    const mTicks = measureTicks(p.timeSignature)
    const lengthTicks = ensureLengthForNote(
      p.lengthTicks,
      opts.startTick,
      Math.max(1, opts.endTick - opts.startTick),
      mTicks,
    )
    current.value = {
      ...p,
      notes,
      harmonySketch: sketchNext,
      lengthTicks,
      updatedAt: svc().clock.now(),
    }
    scheduleSave()
    return id
  }

  function upsertHarmonySketchSpan(
    patch: Omit<HarmonySketchSpan, 'id'> & { id?: string },
  ): string | null {
    return declareHarmonySpan({
      startTick: patch.startTick,
      endTick: patch.endTick,
      rootPc: patch.rootPc,
      quality: patch.quality,
      id: patch.id,
      windowKind: 'freeSpan',
    })
  }

  function removeHarmonySketchSpan(id: string): void {
    const p = current.value
    if (!p) return
    patchProject({ harmonySketch: removeSketchSpan(p.harmonySketch ?? [], id) })
    selectedSketchSpanIds.value = selectedSketchSpanIds.value.filter((x: any) => x !== id)
  }

  /**
   * Delete a Sketch/Detected cell and leave empty time (neighbors keep their widths).
   */
  function absorbHarmonySpan(
    removal: { id: string; startTick: number; endTick: number },
    adjacent: { left?: HarmonyAbsorbNeighbor | null; right?: HarmonyAbsorbNeighbor | null },
  ): void {
    const p = current.value
    if (!p) return
    pushHistory()
    patchProject({
      harmonySketch: absorbHarmonySpanRemoval(p.harmonySketch ?? [], removal, adjacent),
    })
    selectedSketchSpanIds.value = selectedSketchSpanIds.value.filter((x: any) => x !== removal.id)
  }

  function clearSketchSelection(): void {
    selectedSketchSpanIds.value = []
    // Sketch chrome / inspectSelectNone must not stick after selection clear.
    chordsLaneFocused.value = false
  }

  function setChordsLaneFocused(on: boolean): void {
    chordsLaneFocused.value = !!on
    if (on) clearNoteSelection()
  }

  function selectSketchSpans(ids: readonly string[], opts?: { additive?: boolean }): void {
    const unique = [...new Set(ids.filter(Boolean))]
    if (opts?.additive && selectedSketchSpanIds.value.length) {
      const set = new Set(selectedSketchSpanIds.value)
      for (const id of unique) {
        if (set.has(id)) set.delete(id)
        else set.add(id)
      }
      selectedSketchSpanIds.value = [...set]
    } else {
      selectedSketchSpanIds.value = unique
    }
    if (selectedSketchSpanIds.value.length) {
      chordsLaneFocused.value = true
    } else {
      chordsLaneFocused.value = false
    }
    selectedNoteIds.value = []
    selectedExpressionId.value = null
  }

  function copySelectedSketchSpans(): boolean {
    const clip = spansToClipboard(selectedSketchSpans.value)
    if (!clip) return false
    sketchClipboard.value = clip
    return true
  }

  function cutSelectedSketchSpans(): boolean {
    if (!copySelectedSketchSpans()) return false
    const ids = [...selectedSketchSpanIds.value]
    pushHistory()
    let sketch = current.value?.harmonySketch ?? []
    for (const id of ids) sketch = removeSketchSpan(sketch, id)
    patchProject({ harmonySketch: sketch })
    selectedSketchSpanIds.value = []
    return true
  }

  function pasteSketchSpansAtPlayhead(): boolean {
    const p = current.value
    const clip = sketchClipboard.value
    if (!p || !clip?.spans.length) return false
    pushHistory()
    const placed = clipboardSpansAtPlayhead(clip, p.view.playheadTick ?? 0, p.lengthTicks)
    let sketch = p.harmonySketch ?? []
    const created: string[] = []
    for (const s of placed) {
      sketch = upsertSketchSpan(sketch, {
        startTick: s.startTick,
        endTick: s.endTick,
        rootPc: s.rootPc,
        quality: s.quality,
        source: 'user',
        locked: true,
      })
      const hit = sketch.find(
        (x: any) => x.startTick === s.startTick && x.endTick === s.endTick && x.rootPc === s.rootPc,
      )
      if (hit) created.push(hit.id)
    }
    patchProject({ harmonySketch: sketch })
    selectedSketchSpanIds.value = created
    return created.length > 0
  }

  function deleteSelectedSketchSpans(opts?: {
    /** Prefer this list (includes synthetic Detect ids + neighbors). */
    removals?: ReadonlyArray<{
      id: string
      startTick: number
      endTick: number
      left?: HarmonyAbsorbNeighbor | null
      right?: HarmonyAbsorbNeighbor | null
    }>
  }): void {
    if (!selectedSketchSpanIds.value.length && !opts?.removals?.length) return
    pushHistory()
    let sketch = current.value?.harmonySketch ?? []
    const removals = [...(opts?.removals ?? [])].sort((a, b) => b.startTick - a.startTick)
    if (removals.length) {
      for (const rem of removals) {
        sketch = absorbHarmonySpanRemoval(
          sketch,
          { id: rem.id, startTick: rem.startTick, endTick: rem.endTick },
          { left: rem.left, right: rem.right },
        )
      }
    } else {
      for (const id of selectedSketchSpanIds.value) sketch = removeSketchSpan(sketch, id)
    }
    patchProject({ harmonySketch: sketch })
    selectedSketchSpanIds.value = []
  }

  /**
   * Split the single selected Sketch span at the playhead (same chord left + right).
   * Returns the new right-span id, or null when the playhead is not strictly inside.
   */
  function splitSelectedSketchAtPlayhead(): string | null {
    const p = current.value
    if (!p || selectedSketchSpanIds.value.length !== 1) return null
    const id = selectedSketchSpanIds.value[0]!
    const tick = p.view.playheadTick
    const next = splitSketchSpanAt(p.harmonySketch ?? [], id, tick)
    if (!next) return null
    const right = next.find((s) => s.startTick === Math.round(tick) && s.id !== id)
    pushHistory()
    patchProject({ harmonySketch: next })
    // Keep both halves selected so the cut is obvious; focus stays at playhead.
    const leftStill = next.find((s) => s.id === id)
    selectedSketchSpanIds.value = [leftStill?.id, right?.id].filter(Boolean) as string[]
    chordsLaneFocused.value = true
    return right?.id ?? null
  }

  function moveSketchSpansGeometry(
    payloads: Array<{ id: string; startTick: number; endTick: number }>,
  ): void {
    const p = current.value
    if (!p || !payloads.length) return
    let sketch = p.harmonySketch ?? []
    let maxEnd = 0
    for (const payload of payloads) {
      const hit = sketch.find((s: any) => s.id === payload.id)
      if (!hit) continue
      sketch = upsertSketchSpan(sketch, {
        ...hit,
        startTick: payload.startTick,
        endTick: payload.endTick,
        locked: true,
      })
      maxEnd = Math.max(maxEnd, payload.endTick)
    }
    const lengthTicks = ensureLengthForTick(
      p.lengthTicks,
      maxEnd,
      measureTicks(p.timeSignature),
      1,
    )
    patchProject({ harmonySketch: sketch, lengthTicks })
  }

  function lockHarmonySketchSpan(id: string, quality?: HarmonySketchQuality): void {
    const p = current.value
    if (!p) return
    const spans = (p.harmonySketch ?? []).map((s: any) =>
      s.id === id
        ? {
            ...s,
            locked: true,
            source: s.source === 'detect' ? ('user' as const) : s.source,
            quality: quality ?? s.quality,
          }
        : s,
    )
    patchProject({ harmonySketch: sortSpans(spans) })
  }

  /**
   * Promote Detected (or other) holes into locked Sketch in one history step.
   */
  function lockDetectedAsMyChords(
    holes: readonly {
      id?: string
      startTick: number
      endTick: number
      rootPc: number
      quality: HarmonySketchQuality
    }[],
  ): number {
    const p = current.value
    if (!p || !holes.length) return 0
    pushHistory()
    let sketch = p.harmonySketch ?? []
    for (const h of holes) {
      sketch = upsertSketchSpan(sketch, {
        id: h.id,
        startTick: h.startTick,
        endTick: h.endTick,
        rootPc: h.rootPc,
        quality: h.quality,
        source: 'user',
        locked: true,
        pillar: true,
      })
    }
    current.value = {
      ...p,
      harmonySketch: sortSpans(sketch),
      updatedAt: svc().clock.now(),
    }
    scheduleSave()
    return holes.length
  }

  /** Toggle structural pillar on a Declared/locked span (or lock+pillar a Detected hole). */
  function toggleSketchPillar(
    target: {
      id?: string
      startTick: number
      endTick: number
      rootPc: number
      quality: HarmonySketchQuality
    },
    force?: boolean,
  ): boolean {
    const p = current.value
    if (!p) return false
    const sketch = p.harmonySketch ?? []
    const hit =
      (target.id ? sketch.find((s: any) => s.id === target.id) : null) ??
      sketch.find(
        (s: any) =>
          s.locked &&
          s.startTick === target.startTick &&
          s.endTick === target.endTick,
      )
    const nextPillar = force ?? !(hit && hit.locked && hit.pillar !== false)
    pushHistory()
    const next = upsertSketchSpan(sketch, {
      id: hit?.id ?? target.id,
      startTick: target.startTick,
      endTick: target.endTick,
      rootPc: target.rootPc,
      quality: target.quality,
      source: hit?.source === 'coach' ? 'coach' : 'user',
      locked: true,
      pillar: nextPillar,
    })
    current.value = {
      ...p,
      harmonySketch: sortSpans(next),
      updatedAt: svc().clock.now(),
    }
    scheduleSave()
    return nextPillar
  }

  const actions = {
    setHarmonySketch,
    declareHarmonySpan,
    upsertHarmonySketchSpan,
    removeHarmonySketchSpan,
    absorbHarmonySpan,
    clearSketchSelection,
    setChordsLaneFocused,
    selectSketchSpans,
    copySelectedSketchSpans,
    cutSelectedSketchSpans,
    pasteSketchSpansAtPlayhead,
    deleteSelectedSketchSpans,
    splitSelectedSketchAtPlayhead,
    moveSketchSpansGeometry,
    lockHarmonySketchSpan,
    lockDetectedAsMyChords,
    toggleSketchPillar,
  }
  Object.assign(deps, actions)

  function bindWatches(): void {}

  return { actions, bindWatches }

}
