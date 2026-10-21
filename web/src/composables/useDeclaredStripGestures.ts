/**
 * Chords-lane pointer gestures: drag-to-define, select, multi-select, move/resize.
 */
import { ref, type Ref } from 'vue'
import type { ChordAnalysisSegment } from '../domain/arranging/chordAnalysisBar'
import {
  hitStripResizeEdge,
  moveSketchSpan,
  resizeSketchSpanByEdge,
  STRIP_DRAG_SLOP_PX,
  stripSegW,
  stripSegX,
  stripTickFromLocalX,
  type StripResizeEdge,
} from '../lib/tagRoll/harmonyStripGestures'
import { snapTick } from '../lib/tagRoll/snap'

export type DeclaredStripGesture =
  | {
      kind: 'resize'
      id: string
      edge: StripResizeEdge
      origin: { startTick: number; endTick: number }
      startClientX: number
      preview: { startTick: number; endTick: number }
    }
  | {
      kind: 'move'
      ids: string[]
      origins: Record<string, { startTick: number; endTick: number }>
      startClientX: number
      moved: boolean
      /** True when this pointerdown re-clicked an already-selected single span (edit on release). */
      editOnRelease: boolean
      previews: Record<string, { startTick: number; endTick: number }>
    }
  | {
      kind: 'place'
      startClientX: number
      startTick: number
      endTick: number
      moved: boolean
    }
  | {
      kind: 'marquee'
      startClientX: number
      startTick: number
      endTick: number
      additive: boolean
    }

/** Inclusive range of Sketch spans between two ids, ordered by startTick. */
export function sketchSpanIdsBetween(
  spans: readonly { id: string; startTick: number; endTick: number }[],
  aId: string,
  bId: string,
): string[] {
  const sorted = [...spans].sort(
    (a, b) => a.startTick - b.startTick || a.endTick - b.endTick || a.id.localeCompare(b.id),
  )
  const ia = sorted.findIndex((s) => s.id === aId)
  const ib = sorted.findIndex((s) => s.id === bId)
  if (ia < 0 && ib < 0) return []
  if (ia < 0) return [bId]
  if (ib < 0) return [aId]
  const lo = Math.min(ia, ib)
  const hi = Math.max(ia, ib)
  return sorted.slice(lo, hi + 1).map((s) => s.id)
}

export function useDeclaredStripGestures(opts: {
  trackEl: Ref<HTMLElement | null>
  declared: Ref<readonly ChordAnalysisSegment[]>
  selectedIds: Ref<readonly string[]>
  scrollX: Ref<number>
  cellW: Ref<number>
  ppq: Ref<number>
  snapTicks: Ref<number>
  lengthTicks: Ref<number>
  readOnly?: Ref<boolean> | boolean
  onBeginGesture: () => void
  onSelect: (ids: string[], opts?: { additive?: boolean }) => void
  onClearSelection: () => void
  /** Drag-defined empty span → open chord editor for this window. */
  onPlaceRange: (startTick: number, endTick: number) => void
  /** Click without drag on a span → open Chords (or blank typeahead in the lane). */
  onEdit: (seg: ChordAnalysisSegment) => void
  onGeometry: (payload: { id: string; startTick: number; endTick: number }) => void
  onGeometryMany: (payloads: Array<{ id: string; startTick: number; endTick: number }>) => void
  onFocusRange: (startTick: number, endTick: number) => void
  /** Grow project length when place/resize goes past the current end. */
  onNeedLength?: (tick: number) => void
}) {
  const gesture = ref<DeclaredStripGesture | null>(null)
  /** Anchor for Shift+click range select (last plain click). */
  const selectionAnchorId = ref<string | null>(null)
  /** Hovered resize edge for cursor + handle highlight. */
  const hoverEdge = ref<{ id: string; edge: StripResizeEdge } | null>(null)

  function isReadOnly(): boolean {
    const r = opts.readOnly
    return typeof r === 'boolean' ? r : !!r?.value
  }

  function localXInTrack(clientX: number): number | null {
    const track = opts.trackEl.value
    if (!track) return null
    return clientX - track.getBoundingClientRect().left
  }

  function findAtLocalX(localX: number): ChordAnalysisSegment | null {
    const tick = stripTickFromLocalX(localX, opts.scrollX.value, opts.cellW.value, opts.ppq.value)
    let hit =
      opts.declared.value.find((s) => s.startTick <= tick && tick < s.endTick) ?? null
    if (hit) return hit
    for (const seg of opts.declared.value) {
      const x = stripSegX(seg.startTick, opts.scrollX.value, opts.cellW.value, opts.ppq.value)
      const w = stripSegW(seg.startTick, seg.endTick, opts.cellW.value, opts.ppq.value)
      if (localX >= x && localX < x + w) return seg
    }
    return null
  }

  function previewFor(seg: ChordAnalysisSegment): { startTick: number; endTick: number } | null {
    const g = gesture.value
    if (!g) return null
    if (g.kind === 'resize' && g.id === seg.id) return g.preview
    if (g.kind === 'move') return g.previews[seg.id] ?? null
    return null
  }

  function placePreview(): { startTick: number; endTick: number } | null {
    const g = gesture.value
    if (!g || (g.kind !== 'place' && g.kind !== 'marquee')) return null
    const a = Math.min(g.startTick, g.endTick)
    const b = Math.max(g.startTick, g.endTick)
    if (b <= a) return null
    return { startTick: a, endTick: b }
  }

  function onPointerDown(e: PointerEvent): void {
    if (e.button !== 0 || isReadOnly()) return
    const track = opts.trackEl.value
    if (!track) return
    const localX = localXInTrack(e.clientX)
    if (localX == null) return
    const additive = e.ctrlKey || e.metaKey
    const rangeSelect = e.shiftKey && !additive
    const tick = stripTickFromLocalX(localX, opts.scrollX.value, opts.cellW.value, opts.ppq.value)
    const hit = findAtLocalX(localX)

    if (hit) {
      const x = stripSegX(hit.startTick, opts.scrollX.value, opts.cellW.value, opts.ppq.value)
      const w = stripSegW(hit.startTick, hit.endTick, opts.cellW.value, opts.ppq.value)
      const edge = hitStripResizeEdge(localX, x, w)
      const already = opts.selectedIds.value.includes(hit.id)

      let moveIds: string[]
      if (rangeSelect) {
        const anchor =
          selectionAnchorId.value ??
          opts.selectedIds.value[0] ??
          hit.id
        if (!selectionAnchorId.value) selectionAnchorId.value = anchor
        const ids = sketchSpanIdsBetween(opts.declared.value, anchor, hit.id)
        const next = ids.length ? ids : [hit.id]
        opts.onSelect(next)
        moveIds = next
      } else if (additive) {
        opts.onSelect([hit.id], { additive: true })
        moveIds = [...opts.selectedIds.value]
      } else if (!already) {
        opts.onSelect([hit.id])
        selectionAnchorId.value = hit.id
        moveIds = [...opts.selectedIds.value]
      } else {
        if (opts.selectedIds.value.length === 1) {
          selectionAnchorId.value = hit.id
        }
        moveIds = [...opts.selectedIds.value]
      }

      if (!moveIds.length) {
        // Toggled off the only selection — no drag
        e.preventDefault()
        return
      }

      opts.onBeginGesture()
      track.setPointerCapture(e.pointerId)

      if (edge && moveIds.length === 1 && moveIds[0] === hit.id) {
        gesture.value = {
          kind: 'resize',
          id: hit.id,
          edge,
          origin: { startTick: hit.startTick, endTick: hit.endTick },
          startClientX: e.clientX,
          preview: { startTick: hit.startTick, endTick: hit.endTick },
        }
      } else {
        const origins: Record<string, { startTick: number; endTick: number }> = {}
        const previews: Record<string, { startTick: number; endTick: number }> = {}
        for (const id of moveIds) {
          const seg = opts.declared.value.find((s) => s.id === id)
          if (!seg) continue
          origins[id] = { startTick: seg.startTick, endTick: seg.endTick }
          previews[id] = { startTick: seg.startTick, endTick: seg.endTick }
        }
        gesture.value = {
          kind: 'move',
          ids: Object.keys(origins),
          origins,
          startClientX: e.clientX,
          moved: false,
          // Single-cell click (no drag) opens the Chords panel; blanks use lane typeahead.
          // Range / additive clicks never open the editor on release.
          editOnRelease: !additive && !rangeSelect && moveIds.length === 1,
          previews,
        }
      }
      e.preventDefault()
      return
    }

    // Empty: start place-drag or marquee (additive → marquee select)
    const snapped = snapTick(tick, opts.snapTicks.value)
    track.setPointerCapture(e.pointerId)
    if (additive) {
      gesture.value = {
        kind: 'marquee',
        startClientX: e.clientX,
        startTick: snapped,
        endTick: snapped,
        additive: true,
      }
    } else {
      opts.onClearSelection()
      selectionAnchorId.value = null
      opts.onBeginGesture()
      gesture.value = {
        kind: 'place',
        startClientX: e.clientX,
        startTick: snapped,
        endTick: snapped,
        moved: false,
      }
    }
    e.preventDefault()
  }

  function onPointerMove(e: PointerEvent): void {
    const g = gesture.value
    if (!g) {
      updateCursor(e.clientX)
      return
    }
    const localX = localXInTrack(e.clientX)
    if (localX == null) return
    const tick = snapTick(
      stripTickFromLocalX(localX, opts.scrollX.value, opts.cellW.value, opts.ppq.value),
      opts.snapTicks.value,
    )

    if (g.kind === 'place' || g.kind === 'marquee') {
      if (Math.abs(e.clientX - g.startClientX) > STRIP_DRAG_SLOP_PX) {
        if (g.kind === 'place') g.moved = true
      }
      // Allow placing past the current length — caller grows the timeline.
      g.endTick = Math.max(0, tick)
      if (g.endTick > opts.lengthTicks.value) opts.onNeedLength?.(g.endTick)
      return
    }

    const dx = e.clientX - g.startClientX
    const dTicks = Math.round((dx / opts.cellW.value) * opts.ppq.value)
    if (g.kind === 'resize') {
      const room = Math.max(opts.lengthTicks.value, g.origin.endTick + Math.max(0, dTicks) + opts.snapTicks.value)
      if (room > opts.lengthTicks.value) opts.onNeedLength?.(room)
      g.preview = resizeSketchSpanByEdge(g.edge, dTicks, g.origin, {
        snapTicks: opts.snapTicks.value,
        lengthTicks: Math.max(opts.lengthTicks.value, room),
      })
    } else {
      if (Math.abs(dx) > STRIP_DRAG_SLOP_PX) g.moved = true
      for (const id of g.ids) {
        const origin = g.origins[id]
        if (!origin) continue
        const moved = moveSketchSpan(dTicks, origin, {
          snapTicks: opts.snapTicks.value,
          lengthTicks: Math.max(
            opts.lengthTicks.value,
            origin.endTick + Math.max(0, dTicks) + opts.snapTicks.value,
          ),
        })
        if (moved.endTick > opts.lengthTicks.value) opts.onNeedLength?.(moved.endTick)
        g.previews[id] = moved
      }
    }
  }

  function onPointerUp(e: PointerEvent): void {
    const g = gesture.value
    const track = opts.trackEl.value
    if (track?.hasPointerCapture(e.pointerId)) track.releasePointerCapture(e.pointerId)
    gesture.value = null
    if (!g) return

    if (g.kind === 'place') {
      let start = Math.min(g.startTick, g.endTick)
      let end = Math.max(g.startTick, g.endTick)
      if (!g.moved || end - start < opts.snapTicks.value) {
        // Click without drag: one snap unit (or measure-sized window via caller if they expand)
        start = g.startTick
        end = Math.min(opts.lengthTicks.value, start + Math.max(opts.snapTicks.value, 1))
      }
      if (end <= start) return
      // Drag across existing chords → select them (then Delete/Backspace removes).
      if (g.moved) {
        const hits = opts.declared.value.filter((s) => s.startTick < end && start < s.endTick)
        if (hits.length) {
          const ids = hits.map((s) => s.id)
          opts.onSelect(ids)
          selectionAnchorId.value = ids[0] ?? null
          opts.onFocusRange(
            Math.min(...hits.map((s) => s.startTick)),
            Math.max(...hits.map((s) => s.endTick)),
          )
          return
        }
      }
      opts.onPlaceRange(start, end)
      opts.onFocusRange(start, end)
      return
    }

    if (g.kind === 'marquee') {
      const lo = Math.min(g.startTick, g.endTick)
      const hi = Math.max(g.startTick, g.endTick)
      const hitIds = opts.declared.value
        .filter((s) => s.startTick < hi && lo < s.endTick)
        .map((s) => s.id)
      if (hitIds.length) opts.onSelect(hitIds, { additive: g.additive })
      else if (!g.additive) {
        opts.onClearSelection()
        selectionAnchorId.value = null
      }
      return
    }

    if (g.kind === 'move' && !g.moved) {
      // Click (no drag): park playhead at the chord start for easy playback.
      // Single selected chord → open Chords panel (or blank typeahead).
      const segs = g.ids
        .map((id) => opts.declared.value.find((s) => s.id === id))
        .filter((s): s is ChordAnalysisSegment => s != null)
      if (segs.length) {
        const start = Math.min(...segs.map((s) => s.startTick))
        const end = Math.max(...segs.map((s) => s.endTick))
        opts.onFocusRange(start, end)
      }
      const seg = segs[0]
      if (seg && g.ids.length === 1 && g.editOnRelease) opts.onEdit(seg)
      return
    }

    if (g.kind === 'resize') {
      const next = g.preview
      if (next.startTick !== g.origin.startTick || next.endTick !== g.origin.endTick) {
        opts.onGeometry({ id: g.id, startTick: next.startTick, endTick: next.endTick })
        opts.onFocusRange(next.startTick, next.endTick)
      }
      return
    }

    // group move
    const payloads: Array<{ id: string; startTick: number; endTick: number }> = []
    for (const id of g.ids) {
      const origin = g.origins[id]
      const next = g.previews[id]
      if (!origin || !next) continue
      if (next.startTick !== origin.startTick || next.endTick !== origin.endTick) {
        payloads.push({ id, startTick: next.startTick, endTick: next.endTick })
      }
    }
    if (payloads.length === 1) {
      opts.onGeometry(payloads[0]!)
      opts.onFocusRange(payloads[0]!.startTick, payloads[0]!.endTick)
    } else if (payloads.length > 1) {
      opts.onGeometryMany(payloads)
      const lo = Math.min(...payloads.map((p) => p.startTick))
      const hi = Math.max(...payloads.map((p) => p.endTick))
      opts.onFocusRange(lo, hi)
    }
  }

  function onPointerCancel(e: PointerEvent): void {
    const track = opts.trackEl.value
    if (track?.hasPointerCapture(e.pointerId)) track.releasePointerCapture(e.pointerId)
    gesture.value = null
  }

  function updateCursor(clientX: number): void {
    const localX = localXInTrack(clientX)
    const track = opts.trackEl.value
    if (localX == null || !track) {
      hoverEdge.value = null
      return
    }
    for (const seg of opts.declared.value) {
      const x = stripSegX(seg.startTick, opts.scrollX.value, opts.cellW.value, opts.ppq.value)
      const w = stripSegW(seg.startTick, seg.endTick, opts.cellW.value, opts.ppq.value)
      if (localX < x || localX >= x + w) continue
      const edge = hitStripResizeEdge(localX, x, w)
      if (edge) {
        hoverEdge.value = { id: seg.id, edge }
        track.style.cursor = 'pointer'
        return
      }
      hoverEdge.value = null
      track.style.cursor = 'grab'
      return
    }
    hoverEdge.value = null
    track.style.cursor = 'pointer'
  }

  function clearHover(): void {
    hoverEdge.value = null
    const track = opts.trackEl.value
    if (track) track.style.cursor = 'pointer'
  }

  return {
    gesture,
    hoverEdge,
    previewFor,
    placePreview,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    clearHover,
  }
}
