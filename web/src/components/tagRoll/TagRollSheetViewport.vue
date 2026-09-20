<script setup lang="ts">
/**
 * View-mode sheet surface — VexFlow (Bravura) continuous horizontal score.
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  TAG_ROLL_SHEET_ZOOM_MIN,
  type TagRollProject,
} from '../../lib/tagRoll/types'
import {
  renderVexSheetScore,
  type VexScoreLayoutResult,
} from '../../lib/tagRoll/sheetScore/renderVexScore'
import { isRampStickyMarker } from '../../lib/tagRoll/tempoMap'
import { clampSheetZoom, minPxPerBeatToFillSheet } from '../../lib/tagRoll/zoomFill'
import { pointerDistance } from '../../lib/tagRoll/zoomPan'

const PLAYHEAD_HIT = 10
const DRAG_SLOP = 6
const RULER_H = 28

const props = defineProps<{
  project: TagRollProject
}>()

const emit = defineEmits<{
  scroll: [scrollX: number, scrollY: number]
  playhead: [tick: number]
  sheetZoom: [zoom: number]
}>()

const wrapRef = ref<HTMLElement | null>(null)
const scoreHostRef = ref<HTMLElement | null>(null)
const cssW = ref(640)
const cssH = ref(360)
const layout = ref<VexScoreLayoutResult | null>(null)
const renderError = ref<string | null>(null)
let renderGen = 0

const sheetZoom = computed(() => props.project.view.sheetZoom)
const showLyrics = computed(() => props.project.view.sheetShowLyrics !== false)
const scrollX = computed(() => props.project.view.sheetScrollX)
const scrollY = computed(() => props.project.view.sheetScrollY)

function minZoom(): number {
  return minPxPerBeatToFillSheet(
    cssW.value,
    props.project.lengthTicks,
    props.project.timeSignature,
    props.project.ppq,
  )
}

function clampZoom(z: number): number {
  return clampSheetZoom(z, Math.max(TAG_ROLL_SHEET_ZOOM_MIN, minZoom()))
}

function emitZoom(z: number): void {
  const next = clampZoom(z)
  if (next === sheetZoom.value) return
  emit('sheetZoom', next)
}

/** If the viewport grew, bump zoom so measures still fill the width. */
function ensureFillWidth(): void {
  const min = minZoom()
  if (sheetZoom.value < min) emitZoom(min)
}

/** Vertical offset so a short score sits centered in the viewport. */
const centerPadY = computed(() => {
  const h = layout.value?.height ?? 0
  const avail = Math.max(0, cssH.value - RULER_H)
  if (h <= 0 || h >= avail) return 0
  return Math.floor((avail - h) / 2)
})

const scrollerTransform = computed(
  () => `translate(${-scrollX.value}px, ${centerPadY.value - scrollY.value}px)`,
)

type Ptr = { id: number; x: number; y: number }
const pointers = new Map<number, Ptr>()

type Gesture =
  | {
      kind: 'pan'
      originX: number
      originY: number
      startClientX: number
      startClientY: number
      moved: boolean
    }
  | { kind: 'playhead'; grabOffsetTicks: number }
  | { kind: 'pinch'; startDist: number; startZoom: number }

let gesture: Gesture | null = null

function clampTick(tick: number): number {
  return Math.max(0, Math.min(props.project.lengthTicks, tick))
}

function localPoint(e: PointerEvent): { x: number; y: number } | null {
  const wrap = wrapRef.value
  if (!wrap) return null
  const r = wrap.getBoundingClientRect()
  return { x: e.clientX - r.left, y: e.clientY - r.top }
}

function playheadScreenX(): number {
  const lay = layout.value
  if (!lay) return RULER_H
  return lay.tickToX(props.project.view.playheadTick) - scrollX.value
}

function maxScrollX(): number {
  const w = layout.value?.width ?? cssW.value
  return Math.max(0, w - cssW.value)
}

function maxScrollY(): number {
  const h = (layout.value?.height ?? cssH.value) + RULER_H
  // When centered, no vertical scroll needed.
  if (centerPadY.value > 0) return 0
  return Math.max(0, h - cssH.value)
}

function clampScroll(x: number, y: number): { x: number; y: number } {
  return {
    x: Math.max(0, Math.min(maxScrollX(), x)),
    y: Math.max(0, Math.min(maxScrollY(), y)),
  }
}

async function rerender(): Promise<void> {
  const host = scoreHostRef.value
  if (!host) return
  const gen = ++renderGen
  renderError.value = null
  try {
    const next = await renderVexSheetScore({
      host,
      project: props.project,
      pxPerBeat: sheetZoom.value,
      showLyrics: showLyrics.value,
    })
    if (gen !== renderGen) return
    layout.value = next
    // Drop stale vertical scroll when content now fits centered.
    if (centerPadY.value > 0 && scrollY.value !== 0) {
      emit('scroll', scrollX.value, 0)
    }
  } catch (e) {
    if (gen !== renderGen) return
    renderError.value = e instanceof Error ? e.message : 'Sheet render failed'
    layout.value = null
  }
}

function measure(): void {
  const wrap = wrapRef.value
  if (!wrap) return
  cssW.value = Math.max(1, Math.floor(wrap.clientWidth))
  cssH.value = Math.max(1, Math.floor(wrap.clientHeight))
  ensureFillWidth()
}

function onPointerDown(e: PointerEvent): void {
  if (e.button !== 0) return
  const wrap = wrapRef.value
  if (!wrap) return
  wrap.setPointerCapture(e.pointerId)
  const local = localPoint(e)
  if (!local) return
  pointers.set(e.pointerId, { id: e.pointerId, x: e.clientX, y: e.clientY })

  if (pointers.size === 2) {
    const pts = [...pointers.values()]
    gesture = {
      kind: 'pinch',
      startDist: pointerDistance(pts[0]!, pts[1]!),
      startZoom: sheetZoom.value,
    }
    return
  }

  const phX = playheadScreenX()
  if (local.y <= RULER_H || Math.abs(local.x - phX) <= PLAYHEAD_HIT) {
    const lay = layout.value
    const tickAt = lay
      ? (() => {
          let lo = 0
          let hi = props.project.lengthTicks
          const target = local.x + scrollX.value
          for (let i = 0; i < 24; i++) {
            const mid = (lo + hi) / 2
            if (lay.tickToX(mid) < target) lo = mid
            else hi = mid
          }
          return (lo + hi) / 2
        })()
      : 0
    gesture = {
      kind: 'playhead',
      grabOffsetTicks: tickAt - props.project.view.playheadTick,
    }
    emit('playhead', clampTick(tickAt))
    return
  }

  gesture = {
    kind: 'pan',
    originX: scrollX.value,
    originY: scrollY.value,
    startClientX: e.clientX,
    startClientY: e.clientY,
    moved: false,
  }
}

function onPointerMove(e: PointerEvent): void {
  const p = pointers.get(e.pointerId)
  if (p) {
    p.x = e.clientX
    p.y = e.clientY
  }

  if (gesture?.kind === 'pinch' && pointers.size >= 2) {
    const pts = [...pointers.values()]
    const dist = pointerDistance(pts[0]!, pts[1]!)
    if (gesture.startDist > 0) {
      const factor = dist / gesture.startDist
      emitZoom(Math.round(gesture.startZoom * factor))
    }
    return
  }

  if (!gesture) return

  if (gesture.kind === 'playhead') {
    const local = localPoint(e)
    if (!local) return
    const lay = layout.value
    if (!lay) return
    let lo = 0
    let hi = props.project.lengthTicks
    const target = local.x + scrollX.value
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2
      if (lay.tickToX(mid) < target) lo = mid
      else hi = mid
    }
    emit('playhead', clampTick((lo + hi) / 2))
    return
  }

  if (gesture.kind === 'pan') {
    const dx = e.clientX - gesture.startClientX
    const dy = e.clientY - gesture.startClientY
    if (!gesture.moved && Math.hypot(dx, dy) > DRAG_SLOP) gesture.moved = true
    if (!gesture.moved) return
    const next = clampScroll(gesture.originX - dx, gesture.originY - dy)
    emit('scroll', next.x, next.y)
  }
}

function onPointerUp(e: PointerEvent): void {
  pointers.delete(e.pointerId)
  if (pointers.size < 2 && gesture?.kind === 'pinch') gesture = null
  if (pointers.size === 0) gesture = null
  try {
    ;(e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId)
  } catch {
    /* ignore */
  }
}

function onWheel(e: WheelEvent): void {
  e.preventDefault()
  if (e.ctrlKey || e.metaKey) {
    const delta = e.deltaY > 0 ? -4 : 4
    emitZoom(sheetZoom.value + delta)
    return
  }
  if (e.shiftKey) {
    emit('scroll', clampScroll(scrollX.value + e.deltaY, scrollY.value).x, scrollY.value)
    return
  }
  if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
    emit('scroll', clampScroll(scrollX.value + e.deltaX, scrollY.value).x, scrollY.value)
    return
  }
  // Tall score: vertical pan. Short/centered score: zoom.
  if (maxScrollY() > 0) {
    emit('scroll', scrollX.value, clampScroll(scrollX.value, scrollY.value + e.deltaY).y)
    return
  }
  const delta = e.deltaY > 0 ? -3 : 3
  emitZoom(sheetZoom.value + delta)
}

type SheetExprMark =
  | { kind: 'fermata'; left: number }
  | { kind: 'tempo'; left: number; bpm: number }
  | {
      kind: 'rit' | 'accel'
      left: number
      width: number
      label: string
      startBpm: number
      endBpm: number
    }

const exprMarks = computed((): SheetExprMark[] => {
  const lay = layout.value
  if (!lay) return []
  const out: SheetExprMark[] = []

  for (const m of props.project.tempoMarkers) {
    if (isRampStickyMarker(m.id)) continue
    out.push({ kind: 'tempo', left: lay.tickToX(m.tick), bpm: m.bpm })
  }

  for (const ex of props.project.expressions) {
    if (ex.kind === 'fermata') {
      // Align with note onset (notehead), not duration center like the roll lane.
      out.push({ kind: 'fermata', left: lay.tickToX(ex.tick) })
    } else {
      const x0 = lay.tickToX(ex.startTick)
      const x1 = lay.tickToX(ex.endTick)
      out.push({
        kind: ex.kind,
        left: Math.min(x0, x1),
        width: Math.abs(x1 - x0),
        label: ex.kind === 'rit' ? 'rit.' : 'accel.',
        startBpm: ex.startBpm,
        endBpm: ex.endBpm,
      })
    }
  }
  return out
})

let ro: ResizeObserver | null = null

onMounted(() => {
  measure()
  ro = new ResizeObserver(() => measure())
  if (wrapRef.value) ro.observe(wrapRef.value)
  window.addEventListener('resize', measure)
  void nextTick(() => void rerender())
})

onUnmounted(() => {
  ro?.disconnect()
  window.removeEventListener('resize', measure)
  renderGen++
})

watch(
  () => [
    props.project.notes,
    props.project.parts,
    props.project.lengthTicks,
    props.project.clefFamily,
    props.project.preferFlats,
    props.project.tonality,
    props.project.timeSignature.numerator,
    props.project.timeSignature.denominator,
    props.project.view.sheetZoom,
    props.project.view.sheetShowLyrics,
    props.project.expressions,
    props.project.tempoMarkers,
  ],
  () => {
    ensureFillWidth()
    void rerender()
  },
  { deep: true },
)

defineExpose({ cssH, cssW })
</script>

<template>
  <div
    ref="wrapRef"
    class="sheet-wrap"
    aria-label="Sheet music view"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
    @wheel="onWheel"
  >
    <div class="ruler" aria-hidden="true">
      <div
        v-if="layout"
        class="ph-tri"
        :style="{ transform: `translateX(${playheadScreenX()}px)` }"
      />
    </div>
    <div class="score-scroller" :style="{ transform: scrollerTransform }">
      <div ref="scoreHostRef" class="score-host" />
      <div class="expr-layer" aria-hidden="true">
        <div
          v-for="(m, i) in exprMarks"
          :key="i"
          class="expr-mark"
          :class="m.kind"
          :style="{
            left: `${m.left}px`,
            width: m.kind === 'rit' || m.kind === 'accel' ? `${m.width}px` : undefined,
          }"
        >
          <span v-if="m.kind === 'fermata'" class="ferm">𝄐</span>
          <span v-else-if="m.kind === 'tempo'" class="tempo-mark">♩={{ m.bpm }}</span>
          <template v-else>
            <span class="ramp-label">{{ m.label }}</span>
            <span class="ramp-bpm start">♩={{ m.startBpm }}</span>
            <span class="ramp-bpm end">♩={{ m.endBpm }}</span>
          </template>
        </div>
      </div>
      <div
        v-if="layout"
        class="playhead"
        :style="{
          height: `${layout.height}px`,
          transform: `translateX(${layout.tickToX(project.view.playheadTick)}px)`,
        }"
      />
    </div>
    <p v-if="renderError" class="err" role="alert">{{ renderError }}</p>
  </div>
</template>

<style scoped>
.sheet-wrap {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
  background: #f7f4ee;
  border: 1px solid var(--border);
  border-radius: 8px;
  touch-action: none;
  cursor: grab;
}
.sheet-wrap:active {
  cursor: grabbing;
}
.ruler {
  position: absolute;
  inset: 0 0 auto 0;
  height: 28px;
  z-index: 3;
  background: #efebe3;
  border-bottom: 1px solid #d4cfc4;
  pointer-events: none;
}
.ph-tri {
  position: absolute;
  top: 4px;
  left: 0;
  width: 0;
  height: 0;
  border-left: 6px solid transparent;
  border-right: 6px solid transparent;
  border-top: 10px solid #c45c26;
  margin-left: -6px;
}
.score-scroller {
  position: absolute;
  top: 28px;
  left: 0;
  will-change: transform;
}
.score-host {
  min-width: 100%;
  background: #f7f4ee;
}
.score-host :deep(svg) {
  display: block;
}
.expr-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 1;
}
.expr-mark {
  position: absolute;
  top: 4px;
}
.expr-mark.fermata {
  top: 0;
  transform: translateX(-50%);
  line-height: 1;
}
.ferm {
  display: block;
  font-size: 48px;
  line-height: 1;
  color: #1a1a1a;
}
.expr-mark.tempo {
  transform: translateX(-2px);
}
.tempo-mark {
  display: inline-block;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.01em;
  color: #1a1a1a;
  background: color-mix(in srgb, #f7f4ee 88%, transparent);
  padding: 0 3px;
  border-radius: 3px;
  white-space: nowrap;
}
.expr-mark.rit,
.expr-mark.accel {
  top: 18px;
  height: 22px;
  min-width: 4.5em;
}
.expr-mark.rit::after,
.expr-mark.accel::after {
  content: '';
  position: absolute;
  left: 2.5em;
  right: 0;
  top: 8px;
  border-top: 2px dashed #3d3a34;
}
.ramp-label {
  position: absolute;
  top: -2px;
  left: 0;
  font-size: 14px;
  font-weight: 700;
  font-style: italic;
  letter-spacing: 0.02em;
  color: #3d3a34;
  background: color-mix(in srgb, #f7f4ee 85%, transparent);
  padding: 0 3px;
  border-radius: 3px;
  white-space: nowrap;
}
.ramp-bpm {
  position: absolute;
  top: 10px;
  font-size: 11px;
  font-weight: 650;
  color: #3d3a34;
  background: color-mix(in srgb, #f7f4ee 88%, transparent);
  padding: 0 2px;
  border-radius: 2px;
  white-space: nowrap;
}
.ramp-bpm.start {
  left: 2.5em;
}
.ramp-bpm.end {
  right: 0;
  transform: translateX(40%);
}
.playhead {
  position: absolute;
  top: 0;
  width: 2px;
  margin-left: -1px;
  background: #c45c26;
  pointer-events: none;
  z-index: 2;
}
.err {
  position: absolute;
  left: 12px;
  bottom: 12px;
  margin: 0;
  color: #a33;
  font-size: 0.85rem;
  z-index: 4;
}
</style>
