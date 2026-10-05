<script setup lang="ts">
/**
 * View-mode sheet surface — VexFlow continuous / page score.
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import type { ChordAnalysisSegment } from '../../domain/arranging/chordAnalysisBar'
import { sketchLabel } from '../../lib/tagRoll/harmonySketch'
import {
  buildSheetChordMarkBoxes,
  type SheetChordMarkSpan,
} from '../../lib/tagRoll/sheetChordMarks'
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
import { followPlayheadContentScrollX } from '../../lib/tagRoll/followPlayheadScroll'

const PLAYHEAD_HIT = 10
const DRAG_SLOP = 6
const RULER_H = 28
/** Title / credits band reserved inside page 1 (and continuous when engraved header on). */
const SHEET_TITLE_BAND_MIN_PX = 92

function estimateSheetTitleBandPx(
  project: TagRollProject,
  show: boolean,
  sizeScale = 1,
): number {
  if (!show) return 0
  const hasTitle = !!project.title?.trim()
  const hasSub = !!project.subtitle?.trim()
  const hasCredits = !!(project.composer?.trim() || project.arranger?.trim())
  if (!hasTitle && !hasSub && !hasCredits) return 0
  const s = Math.max(0.4, sizeScale)
  let h = 28
  if (hasTitle) h += 28
  if (hasSub) h += 20
  if (hasCredits) h += 22
  return Math.round(Math.max(SHEET_TITLE_BAND_MIN_PX, h) * s)
}

const props = defineProps<{
  project: TagRollProject
  /** Tag Roll transport is running — drives in-measure playback highlights. */
  playing?: boolean
  /** Live Detected lane segments (for optional sheet chord boxes). */
  detectSegments?: readonly ChordAnalysisSegment[]
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
const sheetLayout = computed(() => props.project.view.sheetLayout ?? 'continuous')
const measureSizing = computed(() => props.project.view.sheetMeasureSizing ?? 'dynamic')
const showLyrics = computed(() => props.project.view.sheetShowLyrics !== false)
const scrollX = computed(() => props.project.view.sheetScrollX)
const scrollY = computed(() => props.project.view.sheetScrollY)

const showEngravedHeader = computed(
  () => props.project.view.sheetShowEngravedHeader !== false,
)

const hasMetaHeader = computed(
  () =>
    showEngravedHeader.value &&
    !!(
      props.project.title?.trim() ||
      props.project.subtitle?.trim() ||
      props.project.composer?.trim() ||
      props.project.arranger?.trim()
    ),
)
const showEngravedFooter = computed(
  () => props.project.view.sheetShowEngravedFooter !== false,
)

const hasMetaFooter = computed(
  () => showEngravedFooter.value && !!props.project.sheetNote?.trim(),
)

const isPageLayout = computed(() => sheetLayout.value === 'page')

const sheetSizeScale = computed(() => props.project.view.sheetScoreScale ?? 1)

/** Title band reserved in the score (page 1 / strip). 0 when header off. */
const titleBandPx = computed(() =>
  estimateSheetTitleBandPx(props.project, hasMetaHeader.value, sheetSizeScale.value),
)

const sheetSizeStyle = computed(
  () => ({ '--sheet-size': String(sheetSizeScale.value) }) as Record<string, string>,
)

/**
 * Extra scroll chrome above the SVG host.
 * Page mode: title sits inside page 1 (already in layout height) — don't double-count.
 * Continuous: title sits above the SVG strip.
 */
const metaHeaderH = computed(() =>
  isPageLayout.value ? 0 : titleBandPx.value,
)
const metaFooterH = computed(() =>
  hasMetaFooter.value && !isPageLayout.value
    ? Math.round(36 * sheetSizeScale.value)
    : 0,
)

function minZoom(): number {
  if (sheetLayout.value === 'page') return TAG_ROLL_SHEET_ZOOM_MIN
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

/** If the viewport grew, bump zoom so measures still fill the width (equal continuous only). */
function ensureFillWidth(): void {
  if (sheetLayout.value === 'page') return
  // Dynamic sizing: don't force equal-based fill — that crushed Equal vs Dynamic contrast.
  if (measureSizing.value === 'dynamic') return
  const min = minZoom()
  if (sheetZoom.value < min) emitZoom(min)
}

/** Drop scroll that would leave empty space past the score after zoom/resize. */
function ensureScrollInBounds(): void {
  const next = clampScroll(scrollX.value, scrollY.value)
  if (next.x !== scrollX.value || next.y !== scrollY.value) {
    emit('scroll', next.x, next.y)
  }
}

/** Media-bar ± time zoom — uses measured cssW so the fill floor cannot drift. */
function nudgeTimeZoom(delta: number): void {
  emitZoom(sheetZoom.value + delta)
}

const scoreContentH = computed(() => {
  const h = layout.value?.height ?? 0
  return h + metaHeaderH.value + metaFooterH.value
})

const marginsPx = computed(
  () =>
    layout.value?.marginsPx ?? {
      left: Math.round((props.project.view.sheetMarginLeftIn ?? 0.3) * 96),
      right: Math.round((props.project.view.sheetMarginRightIn ?? 0.3) * 96),
      top: Math.round((props.project.view.sheetMarginTopIn ?? 0.3) * 96),
      bottom: Math.round((props.project.view.sheetMarginBottomIn ?? 0.3) * 96),
    },
)

const pageTitleStyle = computed(() => ({
  width: `${layout.value?.pages[0]?.width ?? 816}px`,
  height: `${titleBandPx.value}px`,
  paddingLeft: `${marginsPx.value.left}px`,
  paddingRight: `${marginsPx.value.right}px`,
  boxSizing: 'border-box' as const,
}))

const pageFooterStyle = computed(() => {
  const pages = layout.value?.pages
  if (!pages?.length) return {}
  const last = pages[pages.length - 1]!
  const bottom = Math.max(28, marginsPx.value.bottom)
  return {
    width: `${last.width}px`,
    paddingLeft: `${marginsPx.value.left}px`,
    paddingRight: `${marginsPx.value.right}px`,
    boxSizing: 'border-box' as const,
    transform: `translate(0, ${last.y + last.height - bottom}px)`,
  }
})

const continuousMetaPadStyle = computed(() => ({
  paddingLeft: `${marginsPx.value.left}px`,
  paddingRight: `${marginsPx.value.right}px`,
  boxSizing: 'border-box' as const,
}))

/** Vertical offset so a short score sits centered in the viewport. */
const centerPadY = computed(() => {
  const h = scoreContentH.value
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

/** Content coords inside the VexFlow host (below meta header). */
function contentPointFromLocal(local: { x: number; y: number }): { x: number; y: number } {
  return {
    x: local.x + scrollX.value,
    y: local.y - RULER_H - centerPadY.value + scrollY.value - metaHeaderH.value,
  }
}

const playheadTick = computed(() => props.project.view.playheadTick)

const playheadPoint = computed((): { x: number; y: number } => {
  const lay = layout.value
  if (!lay) return { x: 0, y: 0 }
  return lay.tickToPoint(playheadTick.value)
})

type PlaybackHighlight = {
  id: string
  x: number
  y: number
  w: number
  h: number
}

/** Highlight the engraved measure that currently contains the playhead. */
const playbackHighlights = computed((): PlaybackHighlight[] => {
  if (
    !props.playing ||
    props.project.view.sheetPlaybackHighlight === false ||
    !layout.value
  ) {
    return []
  }
  const lay = layout.value
  const t = playheadTick.value
  let m =
    lay.measures.find((row) => t >= row.startTick && t < row.endTick) ?? null
  if (!m && lay.measures.length) {
    m = lay.measures[lay.measures.length - 1]!
  }
  if (!m) return []
  return [
    {
      id: `meas-${m.measureIndex}`,
      x: m.x,
      y: m.y,
      w: Math.max(8, m.width),
      h: lay.systemBodyHeight,
    },
  ]
})

function playheadScreenX(): number {
  return playheadPoint.value.x - scrollX.value
}

function playheadHit(local: { x: number; y: number }): boolean {
  const lay = layout.value
  if (!lay) return false
  if (local.y <= RULER_H) return Math.abs(local.x - playheadScreenX()) <= PLAYHEAD_HIT
  const pt = playheadPoint.value
  const content = contentPointFromLocal(local)
  const rowH = lay.systemBodyHeight
  return (
    Math.abs(content.x - pt.x) <= PLAYHEAD_HIT &&
    content.y >= pt.y - 4 &&
    content.y <= pt.y + rowH + 4
  )
}

function tickFromLocal(local: { x: number; y: number }): number {
  const lay = layout.value
  if (!lay) return 0
  const c = contentPointFromLocal(local)
  return lay.pointToTick(c.x, c.y)
}

function maxScrollX(): number {
  const w = layout.value?.width ?? cssW.value
  return Math.max(0, w - cssW.value)
}

function maxScrollY(): number {
  const h = scoreContentH.value + RULER_H
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
      sheetLayout: sheetLayout.value,
      measureSizing: measureSizing.value,
      pageWidthIn: props.project.view.sheetPageWidthIn ?? 8.5,
      pageHeightIn: props.project.view.sheetPageHeightIn ?? 11,
      pageDpi: props.project.view.sheetPageDpi ?? 96,
      headerBandPx: isPageLayout.value ? titleBandPx.value : 0,
      noteColors: props.project.view.sheetNoteColors === true,
      staveGap: props.project.view.sheetStaveGap ?? 'normal',
      measureScale: props.project.view.sheetMeasureScale ?? 1,
      noteSpacing: props.project.view.sheetNoteSpacing ?? 1,
      beatStretch: props.project.view.sheetBeatStretch ?? 1,
      staveGapFine: props.project.view.sheetStaveGapFine ?? 1,
      systemGap: props.project.view.sheetSystemGap ?? 1,
      topMargin: props.project.view.sheetTopMargin ?? 1,
      lyricSize: props.project.view.sheetLyricSize ?? 12,
      lyricOffsets: props.project.view.sheetLyricOffsets ?? {},
      paddingScale: props.project.view.sheetPadding ?? 1,
      minBarWidth: props.project.view.sheetMinBarWidth ?? 1,
      clefGutter: props.project.view.sheetClefGutter ?? 1,
      timeFactor: props.project.view.sheetTimeFactor ?? 1,
      bottomMargin: props.project.view.sheetBottomMargin ?? 1,
      musicFont: props.project.view.sheetMusicFont,
      textFont: props.project.view.sheetTextFont,
      staffLineWeight: props.project.view.sheetStaffLineWeight ?? 1,
      showPartNames: props.project.view.sheetPartNames === true,
      marginLeftIn: props.project.view.sheetMarginLeftIn ?? 0.3,
      marginRightIn: props.project.view.sheetMarginRightIn ?? 0.3,
      marginTopIn: props.project.view.sheetMarginTopIn ?? 0.3,
      marginBottomIn: props.project.view.sheetMarginBottomIn ?? 0.3,
      engravingScale: props.project.view.sheetEngravingScale ?? 1,
      scoreScale: props.project.view.sheetScoreScale ?? 1,
    })
    if (gen !== renderGen) return
    layout.value = next
    // Drop stale vertical scroll when content now fits centered.
    if (centerPadY.value > 0 && scrollY.value !== 0) {
      emit('scroll', scrollX.value, 0)
    }
    ensureScrollInBounds()
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
  ensureScrollInBounds()
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

  if (local.y <= RULER_H || playheadHit(local)) {
    const tickAt = tickFromLocal(local)
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
    emit('playhead', clampTick(tickFromLocal(local)))
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
  | { kind: 'fermata'; left: number; top: number }
  | { kind: 'tempo'; left: number; top: number; bpm: number }
  | {
      kind: 'rit' | 'accel'
      left: number
      top: number
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
    const pt = lay.tickToPoint(m.tick)
    out.push({ kind: 'tempo', left: pt.x, top: pt.y, bpm: m.bpm })
  }

  for (const ex of props.project.expressions) {
    if (ex.kind === 'fermata') {
      const pt = lay.tickToPoint(ex.tick)
      out.push({ kind: 'fermata', left: pt.x, top: pt.y })
    } else {
      const a = lay.tickToPoint(ex.startTick)
      const b = lay.tickToPoint(ex.endTick)
      out.push({
        kind: ex.kind,
        left: Math.min(a.x, b.x),
        top: a.y,
        width: Math.abs(b.x - a.x),
        label: ex.kind === 'rit' ? 'rit.' : 'accel.',
        startBpm: ex.startBpm,
        endBpm: ex.endBpm,
      })
    }
  }
  return out
})

const chordMarkBoxes = computed(() => {
  const lay = layout.value
  if (!lay) return []
  const showSketch = props.project.view.sheetShowSketchChords === true
  const showDetected = props.project.view.sheetShowDetectedChords === true
  if (!showSketch && !showDetected) return []

  const spans: SheetChordMarkSpan[] = []
  const preferFlats = props.project.preferFlats
  const tonality = props.project.tonality
  const mode = props.project.tonalityMode ?? 'major'
  const s = Math.max(0.55, props.project.view.sheetScoreScale ?? 1)

  // When both lanes are on, stack Sketch above Detected; otherwise sit on the staff.
  const sketchRow = showSketch && showDetected ? 1 : 0
  if (showSketch) {
    for (const span of props.project.harmonySketch ?? []) {
      if (!span.locked) continue
      spans.push({
        id: span.id,
        startTick: span.startTick,
        endTick: span.endTick,
        label: sketchLabel(span, preferFlats, tonality, mode),
        variant: 'sketch',
        row: sketchRow,
      })
    }
  }
  if (showDetected) {
    for (const seg of props.detectSegments ?? []) {
      if (seg.rootPc == null) continue
      const label = (seg.displayName || seg.name || '').trim()
      if (!label) continue
      spans.push({
        id: seg.id,
        startTick: seg.startTick,
        endTick: seg.endTick,
        label,
        variant: 'detected',
        row: 0,
      })
    }
  }

  return buildSheetChordMarkBoxes(lay, spans, {
    boxHeight: Math.round(18 * s),
    gapAboveStaff: Math.round(8 * s),
  })
})

let ro: ResizeObserver | null = null
let measureRerenderTimer: ReturnType<typeof setTimeout> | null = null

onMounted(() => {
  measure()
  ro = new ResizeObserver(() => {
    measure()
    // Page layout packs to viewport width — reflow after resize settles.
    if (sheetLayout.value === 'page') {
      if (measureRerenderTimer) clearTimeout(measureRerenderTimer)
      measureRerenderTimer = setTimeout(() => void rerender(), 80)
    }
  })
  if (wrapRef.value) ro.observe(wrapRef.value)
  window.addEventListener('resize', measure)
  void nextTick(() => void rerender())
})

onUnmounted(() => {
  ro?.disconnect()
  window.removeEventListener('resize', measure)
  if (measureRerenderTimer) clearTimeout(measureRerenderTimer)
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
    props.project.view.sheetLayout,
    props.project.view.sheetMeasureSizing,
    props.project.view.sheetPageWidthIn,
    props.project.view.sheetPageHeightIn,
    props.project.view.sheetPageDpi,
    props.project.view.sheetShowLyrics,
    props.project.view.sheetNoteColors,
    props.project.view.sheetStaveGap,
    props.project.view.sheetMeasureScale,
    props.project.view.sheetNoteSpacing,
    props.project.view.sheetBeatStretch,
    props.project.view.sheetStaveGapFine,
    props.project.view.sheetSystemGap,
    props.project.view.sheetTopMargin,
    props.project.view.sheetLyricSize,
    props.project.view.sheetLyricOffsets,
    props.project.view.sheetShowEngravedHeader,
    props.project.view.sheetShowEngravedFooter,
    props.project.view.sheetPadding,
    props.project.view.sheetMinBarWidth,
    props.project.view.sheetClefGutter,
    props.project.view.sheetTimeFactor,
    props.project.view.sheetBottomMargin,
    props.project.view.sheetMusicFont,
    props.project.view.sheetTextFont,
    props.project.view.sheetStaffLineWeight,
    props.project.view.sheetPartNames,
    props.project.view.sheetMarginLeftIn,
    props.project.view.sheetMarginRightIn,
    props.project.view.sheetMarginTopIn,
    props.project.view.sheetMarginBottomIn,
    props.project.view.sheetEngravingScale,
    props.project.view.sheetScoreScale,
    props.project.expressions,
    props.project.tempoMarkers,
    props.project.title,
    props.project.subtitle,
    props.project.composer,
    props.project.arranger,
    props.project.sheetNote,
  ],
  () => {
    ensureFillWidth()
    void rerender()
  },
  { deep: true },
)

defineExpose({
  cssH,
  cssW,
  nudgeTimeZoom,
  /** Keep the playhead on-screen (same jump-scroll policy as the piano roll). */
  followPlayheadIntoView(tick: number, opts?: { focusRatio?: number }): void {
    const lay = layout.value
    if (!lay) return
    const pt = lay.tickToPoint(Math.max(0, tick))
    const nextX = followPlayheadContentScrollX({
      playheadContentX: pt.x,
      scrollX: scrollX.value,
      viewportW: cssW.value,
      contentW: lay.width,
      focusRatio: opts?.focusRatio,
    })
    let nextY = scrollY.value
    if (sheetLayout.value === 'page' && centerPadY.value <= 0) {
      const contentY = pt.y + metaHeaderH.value
      const viewTop = scrollY.value
      const viewBot = scrollY.value + Math.max(1, cssH.value - RULER_H)
      const margin = 24
      if (contentY < viewTop + margin) {
        nextY = Math.max(0, contentY - margin)
      } else if (contentY + lay.systemBodyHeight > viewBot - margin) {
        nextY = contentY + lay.systemBodyHeight - (cssH.value - RULER_H) + margin
      }
    }
    const clamped = clampScroll(nextX ?? scrollX.value, nextY)
    if (clamped.x !== scrollX.value || clamped.y !== scrollY.value) {
      emit('scroll', clamped.x, clamped.y)
    }
  },
})
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
      <!-- Continuous: title above the strip. Page: title is inside page 1 (below). -->
      <header
        v-if="hasMetaHeader && !isPageLayout"
        class="sheet-meta-header"
        :style="{ ...continuousMetaPadStyle, ...sheetSizeStyle }"
      >
        <p v-if="project.title?.trim()" class="meta-title">{{ project.title }}</p>
        <p v-if="project.subtitle?.trim()" class="meta-subtitle">{{ project.subtitle }}</p>
        <div
          v-if="project.composer?.trim() || project.arranger?.trim()"
          class="meta-credits"
        >
          <span class="meta-composer">{{ project.composer }}</span>
          <span class="meta-arranger">{{ project.arranger }}</span>
        </div>
      </header>
      <div class="score-body" :style="sheetSizeStyle">
        <div
          v-for="pg in layout?.pages ?? []"
          :key="`page-${pg.index}`"
          class="page-frame"
          :style="{
            width: `${pg.width}px`,
            height: `${pg.height}px`,
            transform: `translate(0, ${pg.y}px)`,
          }"
          aria-hidden="true"
        >
          <span class="page-label">Page {{ pg.index + 1 }}</span>
        </div>
        <header
          v-if="hasMetaHeader && isPageLayout"
          class="sheet-meta-header on-page"
          :style="{ ...pageTitleStyle, ...sheetSizeStyle }"
        >
          <p v-if="project.title?.trim()" class="meta-title">{{ project.title }}</p>
          <p v-if="project.subtitle?.trim()" class="meta-subtitle">{{ project.subtitle }}</p>
          <div
            v-if="project.composer?.trim() || project.arranger?.trim()"
            class="meta-credits"
          >
            <span class="meta-composer">{{ project.composer }}</span>
            <span class="meta-arranger">{{ project.arranger }}</span>
          </div>
        </header>
        <div ref="scoreHostRef" class="score-host" />
        <div class="expr-layer" aria-hidden="true">
          <div
            v-for="(m, i) in exprMarks"
            :key="i"
            class="expr-mark"
            :class="m.kind"
            :style="{
              left: `${m.left}px`,
              top: `${m.top}px`,
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
          <div
            v-for="box in chordMarkBoxes"
            :key="box.id"
            class="chord-mark"
            :class="box.variant"
            :style="{
              left: `${box.left}px`,
              top: `${box.top}px`,
              width: `${box.width}px`,
            }"
            :title="box.label"
          >
            {{ box.label }}
          </div>
        </div>
        <div
          v-for="h in playbackHighlights"
          :key="h.id"
          class="playback-measure"
          :style="{
            width: `${h.w}px`,
            height: `${h.h}px`,
            transform: `translate(${h.x}px, ${h.y}px)`,
          }"
        />
        <div
          v-if="layout"
          class="playhead"
          :style="{
            height: `${layout.systemBodyHeight}px`,
            left: `${playheadPoint.x}px`,
            top: `${playheadPoint.y}px`,
          }"
        />
        <footer
          v-if="hasMetaFooter && isPageLayout && layout?.pages?.length"
          class="sheet-meta-footer on-page"
          :style="pageFooterStyle"
        >
          <p class="meta-note">{{ project.sheetNote }}</p>
        </footer>
      </div>
      <footer
        v-if="hasMetaFooter && !isPageLayout"
        class="sheet-meta-footer"
        :style="{ ...continuousMetaPadStyle, ...sheetSizeStyle }"
      >
        <p class="meta-note">{{ project.sheetNote }}</p>
      </footer>
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
  /* Match page paper — Continuous strip should read as white score paper. */
  background: #fff;
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
  background: #f3f3f3;
  border-bottom: 1px solid #e0e0e0;
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
.sheet-meta-header {
  box-sizing: border-box;
  min-width: 100%;
  padding: 10px 28px 6px;
  text-align: center;
  color: #1a1a1a;
}
.sheet-meta-header.on-page {
  position: absolute;
  left: 0;
  top: 0;
  z-index: 2;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  pointer-events: none;
}
.meta-title {
  margin: 0;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: calc(1.35rem * var(--sheet-size, 1));
  font-weight: 700;
  letter-spacing: 0.01em;
  line-height: 1.2;
}
.meta-subtitle {
  margin: calc(4px * var(--sheet-size, 1)) 0 0;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: calc(0.95rem * var(--sheet-size, 1));
  font-style: italic;
  color: #3d3a34;
}
.meta-credits {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  margin-top: calc(10px * var(--sheet-size, 1));
  font-size: calc(0.82rem * var(--sheet-size, 1));
  color: #3d3a34;
}
.meta-composer {
  text-align: left;
}
.meta-arranger {
  text-align: right;
  margin-left: auto;
}
.sheet-meta-footer {
  box-sizing: border-box;
  min-width: 100%;
  padding: 8px 28px 12px;
  text-align: center;
}
.sheet-meta-footer.on-page {
  position: absolute;
  left: 0;
  top: 0;
  z-index: 2;
  min-width: 0;
  pointer-events: none;
}
.meta-note {
  margin: 0;
  font-size: calc(0.78rem * var(--sheet-size, 1));
  color: #5a564e;
  font-style: italic;
}
.score-body {
  position: relative;
  min-width: 100%;
}
.page-frame {
  position: absolute;
  left: 0;
  top: 0;
  z-index: 0;
  box-sizing: border-box;
  background: #fff;
  border: 1px solid color-mix(in srgb, var(--border) 70%, #bbb);
  box-shadow: 0 2px 10px color-mix(in srgb, #000 12%, transparent);
  pointer-events: none;
}
.page-label {
  position: absolute;
  right: 10px;
  bottom: 8px;
  font-size: 0.68rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #8a857c;
}
.score-host {
  position: relative;
  z-index: 1;
  min-width: 100%;
  background: transparent;
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
}
.chord-mark {
  position: absolute;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: calc(16px * var(--sheet-size, 1));
  padding: 0.1em 0.35em;
  border-radius: 4px;
  border: 1px solid color-mix(in srgb, #1a1a1a 35%, transparent);
  background: color-mix(in srgb, #fff 92%, #e8e4dc);
  color: #1a1a1a;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: calc(0.72rem * var(--sheet-size, 1));
  font-weight: 700;
  letter-spacing: 0.01em;
  line-height: 1.15;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.chord-mark.sketch {
  border-color: color-mix(in srgb, #1d6a9f 55%, transparent);
  background: color-mix(in srgb, #dceaf5 70%, #fff);
  color: #143d5c;
}
.chord-mark.detected {
  border-color: color-mix(in srgb, #6a5a3a 45%, transparent);
  background: color-mix(in srgb, #f5efe3 85%, #fff);
  border-style: dashed;
  color: #4a4030;
  font-weight: 650;
}
.expr-mark.fermata {
  transform: translateX(-50%);
  line-height: 1;
}
.ferm {
  display: block;
  font-size: calc(48px * var(--sheet-size, 1));
  line-height: 1;
  color: #1a1a1a;
}
.expr-mark.tempo {
  transform: translateX(-2px);
  margin-top: calc(4px * var(--sheet-size, 1));
}
.tempo-mark {
  display: inline-block;
  font-size: calc(14px * var(--sheet-size, 1));
  font-weight: 700;
  letter-spacing: 0.01em;
  color: #1a1a1a;
  background: color-mix(in srgb, #fff 88%, transparent);
  padding: 0 3px;
  border-radius: 3px;
  white-space: nowrap;
}
.expr-mark.rit,
.expr-mark.accel {
  margin-top: calc(18px * var(--sheet-size, 1));
  height: calc(22px * var(--sheet-size, 1));
  min-width: 4.5em;
}
.expr-mark.rit::after,
.expr-mark.accel::after {
  content: '';
  position: absolute;
  left: 2.5em;
  right: 0;
  top: calc(8px * var(--sheet-size, 1));
  border-top: calc(2px * var(--sheet-size, 1)) dashed #3d3a34;
}
.ramp-label {
  position: absolute;
  top: calc(-2px * var(--sheet-size, 1));
  left: 0;
  font-size: calc(14px * var(--sheet-size, 1));
  font-weight: 700;
  font-style: italic;
  letter-spacing: 0.02em;
  color: #3d3a34;
  background: color-mix(in srgb, #fff 85%, transparent);
  padding: 0 3px;
  border-radius: 3px;
  white-space: nowrap;
}
.ramp-bpm {
  position: absolute;
  top: calc(10px * var(--sheet-size, 1));
  font-size: calc(11px * var(--sheet-size, 1));
  font-weight: 650;
  color: #3d3a34;
  background: color-mix(in srgb, #fff 88%, transparent);
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
.playback-measure {
  position: absolute;
  top: 0;
  left: 0;
  border-radius: 4px;
  pointer-events: none;
  z-index: 1;
  background: color-mix(in srgb, #c45c26 16%, transparent);
  box-shadow: inset 0 0 0 2px color-mix(in srgb, #c45c26 45%, transparent);
}
.playhead {
  position: absolute;
  width: 2px;
  margin-left: -1px;
  background: #c45c26;
  pointer-events: none;
  z-index: 2;
  /* No transform transition — system wraps must teleport (not CR then LF). */
  transition: none;
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
