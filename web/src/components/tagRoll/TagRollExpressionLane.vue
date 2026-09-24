<script setup lang="ts">
/**
 * Time-aligned Mods lane: tempo, key, fermatas, rit/accel.
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { newLocalId } from '../../offline/localLibraryDb'
import { pxToTicks, ticksToPx } from '../../lib/tagRoll/normalize'
import { snapTick } from '../../lib/tagRoll/snap'
import { bpmAtTick, isRampStickyMarker, measureTicks } from '../../lib/tagRoll/tempoMap'
import { keyAtTick, keyMarkerLabel } from '../../lib/tagRoll/keyMap'
import {
  MAJOR_KEY_CHOICES,
  MINOR_KEY_CHOICES,
  keyChoiceById,
  keyChoiceId,
} from '../../lib/tagRoll/keySignature'
import { drawLaneTimeGrid } from '../../lib/tagRoll/laneTimeGrid'
import {
  beatsToTicks,
  ticksToBeatsDisplay,
} from '../../lib/tagRoll/expressionBeats'
import { tagRollTip, tipByShortcutId } from '../../lib/tagRoll/shortcuts'
import {
  hitExpressionAtX,
  hitKeyMarkerAtX,
  hitTempoMarkerAtX,
} from '../../lib/tagRoll/expressionLaneHitTest'
import { fermataVisualCenterTick } from '../../lib/tagRoll/expressionDisplay'
import {
  TAG_ROLL_PPQ,
  type TagRollExpression,
  type TagRollKeyMarker,
  type TagRollProject,
  type TagRollTempoMarker,
} from '../../lib/tagRoll/types'
import { usePreferencesStore } from '../../stores/preferences'
import { useTagRollStore } from '../../stores/tagRoll'
import TagRollBottomLaneShell from './TagRollBottomLaneShell.vue'
import TagRollBpmInput from './TagRollBpmInput.vue'

const LANE_H = 72
const HANDLE_W = 10
const DRAG_SLOP = 4
const BAND_TOP = 22
const BAND_H = 40
const BAND_BOTTOM = BAND_TOP + BAND_H

const props = defineProps<{
  project: TagRollProject
  /** View mode: show lane but block place/edit. */
  readOnly?: boolean
  /** Left gutter (px) so the lane bg extends under the piano tote while the canvas stays aligned. */
  leftGutterPx?: number
}>()

const leftGutterPx = computed(() => Math.max(64, props.leftGutterPx ?? 112))

const store = useTagRollStore()
const prefs = usePreferencesStore()
const collapsed = computed(() => prefs.tagRollExpressionLaneCollapsed)

const modViewOptions = [
  { value: '', label: 'Select' },
  { value: 'tempo', label: 'Tempo' },
  { value: 'key', label: 'Key' },
  { value: 'fermata', label: 'Fermata' },
  { value: 'rit', label: 'Rit.' },
  { value: 'accel', label: 'Accel.' },
] as const

function onModView(v: string): void {
  if (props.readOnly) return
  if (v === 'tempo' || v === 'key' || v === 'fermata' || v === 'rit' || v === 'accel') {
    store.setExpressionTool(v)
  } else {
    store.setExpressionTool(null)
  }
}

const canvasRef = ref<HTMLCanvasElement | null>(null)
const wrapRef = ref<HTMLElement | null>(null)
const cssW = ref(640)

const cellW = computed(() => props.project.view.cellW)
const scrollX = computed(() => props.project.view.scrollX)
const selectedId = computed(() => store.selectedExpressionId)
const tool = computed(() => (props.readOnly ? null : store.expressionTool))
const readOnly = computed(() => !!props.readOnly)

const selectedExpr = computed(() => {
  const id = selectedId.value
  if (!id) return null
  return props.project.expressions.find((e) => e.id === id) ?? null
})

const selectedTempo = computed(() => {
  const id = selectedId.value
  if (!id) return null
  return props.project.tempoMarkers.find((m) => m.id === id) ?? null
})

const selectedKey = computed(() => {
  const id = selectedId.value
  if (!id) return null
  return (props.project.keyMarkers ?? []).find((m) => m.id === id) ?? null
})

const keyMarkers = computed(() => props.project.keyMarkers ?? [])

type Gesture =
  | { kind: 'pan'; originX: number; startClientX: number; moved: boolean }
  | {
      kind: 'ramp'
      id: string
      edge: 'start' | 'end' | 'body'
      originStart: number
      originEnd: number
      grabTick: number
      history: boolean
    }
  | {
      kind: 'create-ramp'
      rampKind: 'rit' | 'accel'
      anchorTick: number
      endTick: number
    }
  | { kind: 'tempo'; id: string; originTick: number; grabTick: number; history: boolean }
  | { kind: 'key'; id: string; originTick: number; grabTick: number; history: boolean }
  | { kind: 'fermata'; id: string; originTick: number; grabTick: number; history: boolean }

let gesture: Gesture | null = null

/** User-facing tempo markers (hide synthetic rit/accel sticky ends). */
const visibleTempoMarkers = computed(() =>
  props.project.tempoMarkers.filter((m) => !isRampStickyMarker(m.id)),
)

function clampTick(tick: number): number {
  return Math.max(0, Math.min(props.project.lengthTicks, tick))
}

function localPoint(e: PointerEvent): { x: number; y: number } | null {
  const rect = canvasRef.value?.getBoundingClientRect()
  if (!rect) return null
  return { x: e.clientX - rect.left, y: e.clientY - rect.top }
}

function tickAtX(lx: number): number {
  return clampTick(pxToTicks(lx + scrollX.value, cellW.value))
}

function xAtTick(tick: number): number {
  return -scrollX.value + ticksToPx(tick, cellW.value)
}

/** Fermata glyph sits over note / snap-cell center, not the onset grid line. */
function xAtFermata(tick: number): number {
  return xAtTick(
    fermataVisualCenterTick(tick, props.project.notes, props.project.snapTicks),
  )
}

function hitTempo(lx: number): TagRollTempoMarker | null {
  return hitTempoMarkerAtX(visibleTempoMarkers.value, lx, xAtTick)
}

function hitKey(lx: number): TagRollKeyMarker | null {
  return hitKeyMarkerAtX(keyMarkers.value, lx, xAtTick)
}

function prevailingBpmAt(tick: number, excludeId?: string): number {
  const exprs = excludeId
    ? props.project.expressions.filter((e) => e.id !== excludeId)
    : props.project.expressions
  return Math.round(
    bpmAtTick(tick, props.project.tempoMarkers, exprs, props.project.bpm),
  )
}

function rampEndBpm(kind: 'rit' | 'accel', startBpm: number): number {
  return kind === 'rit'
    ? Math.max(40, Math.round(startBpm * 0.7))
    : Math.min(220, Math.round(startBpm * 1.3))
}

function commitRamp(kind: 'rit' | 'accel', a: number, b: number): void {
  const startTick = Math.min(a, b)
  const endTick = Math.max(a, b)
  const minSpan = Math.max(props.project.snapTicks, TAG_ROLL_PPQ)
  const end = Math.max(startTick + minSpan, endTick)
  const startBpm = prevailingBpmAt(startTick)
  store.addExpression({
    id: newLocalId('tre'),
    kind,
    startTick,
    endTick: end,
    startBpm,
    endBpm: rampEndBpm(kind, startBpm),
  })
}

function hitExpression(lx: number): {
  expr: TagRollExpression
  edge?: 'start' | 'end' | 'body'
} | null {
  return hitExpressionAtX(props.project.expressions, lx, xAtTick, HANDLE_W, 16, xAtFermata)
}

function resize(): void {
  const el = wrapRef.value
  if (!el) return
  cssW.value = Math.max(1, Math.floor(el.getBoundingClientRect().width))
  draw()
}

function draw(): void {
  const canvas = canvasRef.value
  if (!canvas) return
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
  canvas.width = Math.floor(cssW.value * dpr)
  canvas.height = Math.floor(LANE_H * dpr)
  canvas.style.width = `${cssW.value}px`
  canvas.style.height = `${LANE_H}px`
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

  const styles = getComputedStyle(canvas)
  const bg = styles.getPropertyValue('--surface').trim() || '#fff'
  const border = styles.getPropertyValue('--border').trim() || '#d0cbc2'
  const muted = styles.getPropertyValue('--muted').trim() || '#887f72'
  const accent = styles.getPropertyValue('--accent').trim() || '#1d6a9f'
  const text = styles.getPropertyValue('--text').trim() || '#222'

  ctx.fillStyle = bg
  ctx.fillRect(0, 0, cssW.value, LANE_H)

  drawLaneTimeGrid(ctx, {
    scrollX: scrollX.value,
    cellW: cellW.value,
    lengthTicks: props.project.lengthTicks,
    timeSignature: props.project.timeSignature,
    height: LANE_H,
    width: cssW.value,
    measureColor: text,
    beatColor: muted,
  })

  ctx.strokeStyle = border
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(0, 0.5)
  ctx.lineTo(cssW.value, 0.5)
  ctx.stroke()

  // Rit / accel bands (under markers)
  for (const e of props.project.expressions) {
    if (e.kind !== 'rit' && e.kind !== 'accel') continue
    const on = e.id === selectedId.value
    const x0 = xAtTick(e.startTick)
    const x1 = xAtTick(e.endTick)
    if (x1 < -4 || x0 > cssW.value + 4) continue
    const color = e.kind === 'rit' ? '#b45309' : '#057a55'
    const w = Math.max(8, x1 - x0)
    ctx.fillStyle = color
    ctx.globalAlpha = on ? 0.32 : 0.18
    roundRect(ctx, x0, BAND_TOP, w, BAND_H, 6)
    ctx.fill()
    ctx.globalAlpha = 1
    ctx.strokeStyle = color
    ctx.lineWidth = on ? 2.5 : 1.75
    roundRect(ctx, x0 + 0.5, BAND_TOP + 0.5, w - 1, BAND_H - 1, 6)
    ctx.stroke()
    ctx.lineWidth = on ? 3 : 2
    ctx.beginPath()
    ctx.moveTo(x0 + 1.5, BAND_TOP + 4)
    ctx.lineTo(x0 + 1.5, BAND_BOTTOM - 4)
    ctx.moveTo(x1 - 1.5, BAND_TOP + 4)
    ctx.lineTo(x1 - 1.5, BAND_BOTTOM - 4)
    ctx.stroke()
    ctx.fillStyle = text
    ctx.font = '650 12px ui-sans-serif, system-ui, sans-serif'
    ctx.textBaseline = 'middle'
    const kind = e.kind === 'rit' ? 'rit.' : 'accel.'
    const label = `${kind}  ${e.startBpm} → ${e.endBpm}`
    ctx.fillText(label, x0 + 10, BAND_TOP + BAND_H / 2, Math.max(24, w - 16))
  }

  // In-progress drag create preview
  if (gesture?.kind === 'create-ramp') {
    const x0 = xAtTick(Math.min(gesture.anchorTick, gesture.endTick))
    const x1 = xAtTick(Math.max(gesture.anchorTick, gesture.endTick))
    const color = gesture.rampKind === 'rit' ? '#b45309' : '#057a55'
    const w = Math.max(8, x1 - x0)
    ctx.fillStyle = color
    ctx.globalAlpha = 0.28
    roundRect(ctx, x0, BAND_TOP, w, BAND_H, 6)
    ctx.fill()
    ctx.globalAlpha = 1
    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.setLineDash([5, 4])
    roundRect(ctx, x0 + 0.5, BAND_TOP + 0.5, w - 1, BAND_H - 1, 6)
    ctx.stroke()
    ctx.setLineDash([])
  }

  // Tempo markers — pill badges (hide synthetic sticky ends)
  for (const m of visibleTempoMarkers.value) {
    const x = xAtTick(m.tick)
    if (x < -40 || x > cssW.value + 40) continue
    const on = m.id === selectedId.value
    const label = `${m.bpm}`
    ctx.font = '700 12px ui-sans-serif, system-ui, sans-serif'
    const tw = ctx.measureText(label).width
    const pw = Math.max(28, tw + 14)
    const ph = 22
    const px = x - 2
    const py = 4
    ctx.fillStyle = on ? accent : bg
    roundRect(ctx, px, py, pw, ph, 5)
    ctx.fill()
    ctx.strokeStyle = on ? accent : muted
    ctx.lineWidth = on ? 2 : 1.5
    roundRect(ctx, px + 0.5, py + 0.5, pw - 1, ph - 1, 5)
    ctx.stroke()
    ctx.strokeStyle = on ? accent : muted
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(x + 0.5, py + ph)
    ctx.lineTo(x + 0.5, LANE_H - 2)
    ctx.stroke()
    ctx.fillStyle = on ? '#fff' : text
    ctx.textBaseline = 'middle'
    ctx.fillText(label, px + (pw - tw) / 2, py + ph / 2)
  }

  // Key markers — lower pills (avoid covering tempo)
  for (const m of keyMarkers.value) {
    const x = xAtTick(m.tick)
    if (x < -40 || x > cssW.value + 40) continue
    const on = m.id === selectedId.value
    const label = keyMarkerLabel(m)
    ctx.font = '700 11px ui-sans-serif, system-ui, sans-serif'
    const tw = ctx.measureText(label).width
    const pw = Math.max(26, tw + 12)
    const ph = 20
    const px = x - 2
    const py = LANE_H - ph - 4
    const color = '#0f766e'
    ctx.fillStyle = on ? color : bg
    roundRect(ctx, px, py, pw, ph, 5)
    ctx.fill()
    ctx.strokeStyle = on ? color : muted
    ctx.lineWidth = on ? 2 : 1.5
    roundRect(ctx, px + 0.5, py + 0.5, pw - 1, ph - 1, 5)
    ctx.stroke()
    ctx.strokeStyle = on ? color : muted
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(x + 0.5, 2)
    ctx.lineTo(x + 0.5, py)
    ctx.stroke()
    ctx.fillStyle = on ? '#fff' : text
    ctx.textBaseline = 'middle'
    ctx.fillText(label, px + (pw - tw) / 2, py + ph / 2)
  }

  // Fermatas — boxed like rit/accel; hold/gap edit in the toolbar when selected.
  for (const e of props.project.expressions) {
    if (e.kind !== 'fermata') continue
    const on = e.id === selectedId.value
    const x = xAtFermata(e.tick)
    if (x < -40 || x > cssW.value + 40) continue
    const boxW = 36
    const boxH = BAND_H
    const bx = x - boxW / 2
    const by = BAND_TOP
    const color = '#5b3d8f'
    ctx.fillStyle = color
    ctx.globalAlpha = on ? 0.32 : 0.18
    roundRect(ctx, bx, by, boxW, boxH, 6)
    ctx.fill()
    ctx.globalAlpha = 1
    ctx.strokeStyle = color
    ctx.lineWidth = on ? 2.5 : 1.75
    roundRect(ctx, bx + 0.5, by + 0.5, boxW - 1, boxH - 1, 6)
    ctx.stroke()
    ctx.fillStyle = on ? color : text
    ctx.strokeStyle = on ? color : text
    ctx.lineWidth = on ? 2.75 : 2.25
    const cy = by + boxH / 2
    ctx.beginPath()
    ctx.arc(x, cy - 4, 11, Math.PI + 0.15, -0.15)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(x, cy + 1, 2.75, 0, Math.PI * 2)
    ctx.fill()
  }

  // Playhead
  const phX = xAtTick(props.project.view.playheadTick)
  if (phX >= -2 && phX <= cssW.value + 2) {
    ctx.strokeStyle = accent
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(phX + 0.5, 0)
    ctx.lineTo(phX + 0.5, LANE_H)
    ctx.stroke()
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

function placeAt(tick: number): void {
  const t = store.expressionTool
  const snap = props.project.snapTicks
  const at = snapTick(tick, snap)
  const localBpm = Math.round(
    bpmAtTick(
      at,
      props.project.tempoMarkers,
      props.project.expressions,
      props.project.bpm,
    ),
  )
  if (t === 'tempo') {
    store.setTempoAtTick(at, localBpm)
    const marker = store.current?.tempoMarkers.find((m) => m.tick === at)
    if (marker) store.selectExpression(marker.id)
    return
  }
  if (t === 'key') {
    const cur = keyAtTick(at, props.project.keyMarkers, {
      tonality: props.project.tonality,
      tonalityMode: props.project.tonalityMode ?? 'major',
      preferFlats: props.project.preferFlats,
    })
    store.setKeyAtTick(at, cur)
    const marker = store.current?.keyMarkers?.find((m) => m.tick === at)
    if (marker) store.selectExpression(marker.id)
    return
  }
  if (t === 'fermata') {
    store.addExpression({
      id: newLocalId('tre'),
      kind: 'fermata',
      tick: at,
      holdTicks: TAG_ROLL_PPQ,
      gapTicks: TAG_ROLL_PPQ / 2,
    })
    return
  }
  if (t === 'rit' || t === 'accel') {
    // Click without drag: one measure at the current tempo.
    const mLen = measureTicks(props.project.timeSignature)
    commitRamp(t, at, at + mLen)
  }
}

function onPointerDown(e: PointerEvent): void {
  if (e.button !== 0) return
  const canvas = canvasRef.value
  if (!canvas) return
  canvas.setPointerCapture(e.pointerId)
  const local = localPoint(e)
  if (!local) return

  if (readOnly.value) {
    // Pan only — no place / drag-edit in View mode.
    gesture = {
      kind: 'pan',
      originX: scrollX.value,
      startClientX: e.clientX,
      moved: false,
    }
    return
  }

  const hitE = hitExpression(local.x)
  if (hitE) {
    store.selectExpression(hitE.expr.id)
    const g = tickAtX(local.x)
    if (hitE.expr.kind === 'fermata') {
      gesture = {
        kind: 'fermata',
        id: hitE.expr.id,
        originTick: hitE.expr.tick,
        grabTick: g,
        history: false,
      }
      return
    }
    gesture = {
      kind: 'ramp',
      id: hitE.expr.id,
      edge: hitE.edge ?? 'body',
      originStart: hitE.expr.startTick,
      originEnd: hitE.expr.endTick,
      grabTick: g,
      history: false,
    }
    return
  }

  const hitT = hitTempo(local.x)
  if (hitT) {
    store.selectExpression(hitT.id)
    gesture = {
      kind: 'tempo',
      id: hitT.id,
      originTick: hitT.tick,
      grabTick: tickAtX(local.x),
      history: false,
    }
    return
  }

  const hitK = hitKey(local.x)
  if (hitK) {
    store.selectExpression(hitK.id)
    gesture = {
      kind: 'key',
      id: hitK.id,
      originTick: hitK.tick,
      grabTick: tickAtX(local.x),
      history: false,
    }
    return
  }

  if (tool.value === 'rit' || tool.value === 'accel') {
    const at = snapTick(tickAtX(local.x), props.project.snapTicks)
    gesture = {
      kind: 'create-ramp',
      rampKind: tool.value,
      anchorTick: at,
      endTick: at,
    }
    return
  }

  if (tool.value) {
    placeAt(tickAtX(local.x))
    return
  }

  gesture = {
    kind: 'pan',
    originX: scrollX.value,
    startClientX: e.clientX,
    moved: false,
  }
}

function onPointerMove(e: PointerEvent): void {
  if (!gesture) return
  if (gesture.kind === 'pan') {
    const dx = e.clientX - gesture.startClientX
    if (Math.abs(dx) > DRAG_SLOP) gesture.moved = true
    store.setScroll(Math.max(0, gesture.originX - dx), props.project.view.scrollY)
    return
  }

  const local = localPoint(e)
  if (!local) return
  const tick = tickAtX(local.x)
  const snap = props.project.snapTicks

  if (gesture.kind === 'ramp') {
    if (!gesture.history) {
      store.pushHistoryCheckpoint()
      gesture.history = true
    }
    const delta = tick - gesture.grabTick
    if (gesture.edge === 'start') {
      const startTick = Math.min(gesture.originEnd - snap, snapTick(gesture.originStart + delta, snap))
      const nextStart = Math.max(0, startTick)
      store.updateExpressionLive(gesture.id, {
        startTick: nextStart,
        startBpm: prevailingBpmAt(nextStart, gesture.id),
      })
    } else if (gesture.edge === 'end') {
      const endTick = Math.max(gesture.originStart + snap, snapTick(gesture.originEnd + delta, snap))
      store.updateExpressionLive(gesture.id, { endTick })
    } else {
      let startTick = snapTick(gesture.originStart + delta, snap)
      let endTick = snapTick(gesture.originEnd + delta, snap)
      const span = gesture.originEnd - gesture.originStart
      startTick = Math.max(0, startTick)
      endTick = startTick + span
      store.updateExpressionLive(gesture.id, {
        startTick,
        endTick,
        startBpm: prevailingBpmAt(startTick, gesture.id),
      })
    }
    return
  }

  if (gesture.kind === 'create-ramp') {
    gesture.endTick = snapTick(tick, snap)
    draw()
    return
  }

  if (gesture.kind === 'fermata') {
    if (!gesture.history) {
      store.pushHistoryCheckpoint()
      gesture.history = true
    }
    const next = snapTick(gesture.originTick + (tick - gesture.grabTick), snap)
    store.updateExpressionLive(gesture.id, { tick: Math.max(0, next) })
    return
  }

  if (gesture.kind === 'tempo') {
    if (gesture.originTick === 0) return
    if (!gesture.history) {
      store.pushHistoryCheckpoint()
      gesture.history = true
    }
    const next = snapTick(gesture.originTick + (tick - gesture.grabTick), snap)
    store.updateTempoMarkerLive(gesture.id, { tick: Math.max(snap, next) })
    return
  }

  if (gesture.kind === 'key') {
    if (gesture.originTick === 0) return
    if (!gesture.history) {
      store.pushHistoryCheckpoint()
      gesture.history = true
    }
    const next = snapTick(gesture.originTick + (tick - gesture.grabTick), snap)
    store.updateKeyMarkerLive(gesture.id, { tick: Math.max(snap, next) })
  }
}

function onPointerUp(): void {
  if (gesture?.kind === 'create-ramp') {
    const { rampKind, anchorTick, endTick } = gesture
    gesture = null
    const mLen = measureTicks(props.project.timeSignature)
    const span = Math.abs(endTick - anchorTick)
    if (span < props.project.snapTicks) {
      // Click / tiny drag → one measure.
      commitRamp(rampKind, anchorTick, anchorTick + mLen)
    } else {
      commitRamp(rampKind, anchorTick, endTick)
    }
    draw()
    return
  }
  gesture = null
}

function onHoldChange(e: Event): void {
  const expr = selectedExpr.value
  if (!expr || expr.kind !== 'fermata') return
  const v = Number((e.target as HTMLInputElement).value)
  if (!Number.isFinite(v)) return
  store.updateExpression(expr.id, { holdTicks: Math.max(1, beatsToTicks(v)) })
}

function onGapChange(e: Event): void {
  const expr = selectedExpr.value
  if (!expr || expr.kind !== 'fermata') return
  const v = Number((e.target as HTMLInputElement).value)
  if (!Number.isFinite(v)) return
  store.updateExpression(expr.id, { gapTicks: Math.max(0, beatsToTicks(v)) })
}

function onTempoBpm(v: number): void {
  const m = selectedTempo.value
  if (!m || !Number.isFinite(v)) return
  store.updateTempoMarker(m.id, { bpm: v })
}

function onRampBpm(which: 'startBpm' | 'endBpm', v: number): void {
  const expr = selectedExpr.value
  if (!expr || (expr.kind !== 'rit' && expr.kind !== 'accel')) return
  if (!Number.isFinite(v)) return
  store.updateExpression(expr.id, { [which]: Math.max(20, Math.min(320, Math.round(v))) })
}

function onKeyChoice(e: Event): void {
  const m = selectedKey.value
  if (!m) return
  const choice = keyChoiceById((e.target as HTMLSelectElement).value)
  if (!choice) return
  store.updateKeyMarker(m.id, {
    tonality: choice.tonality,
    preferFlats: choice.preferFlats,
    tonalityMode: choice.mode,
  })
}

const selectedIsStartTempo = computed(() => selectedTempo.value?.tick === 0)
const selectedIsStartKey = computed(() => selectedKey.value?.tick === 0)

const showInspect = computed(
  () =>
    !readOnly.value &&
    !!(
      selectedTempo.value ||
      selectedKey.value ||
      selectedExpr.value ||
      selectedIsStartTempo.value
    ),
)

function onDeleteSelected(): void {
  const id = selectedId.value
  if (!id) return
  if (props.project.tempoMarkers.some((m) => m.id === id)) {
    store.deleteTempoMarker(id)
  } else if ((props.project.keyMarkers ?? []).some((m) => m.id === id)) {
    store.deleteKeyMarker(id)
  } else {
    store.deleteExpression(id)
  }
}

let ro: ResizeObserver | null = null

onMounted(() => {
  resize()
  if (typeof ResizeObserver !== 'undefined' && wrapRef.value) {
    ro = new ResizeObserver(() => resize())
    ro.observe(wrapRef.value)
  }
})

onUnmounted(() => {
  ro?.disconnect()
  gesture = null
})

watch(
  () => [
    props.project.view.scrollX,
    props.project.view.cellW,
    props.project.view.playheadTick,
    props.project.lengthTicks,
    props.project.timeSignature,
    props.project.tempoMarkers,
    props.project.keyMarkers,
    props.project.expressions,
    selectedId.value,
    cssW.value,
  ],
  () => draw(),
  { flush: 'post', deep: true },
)
</script>

<template>
  <TagRollBottomLaneShell
    v-if="!collapsed"
    label="Mods"
    :left-gutter-px="leftGutterPx"
    :view-options="[...modViewOptions]"
    :view-value="tool ?? ''"
    view-field-label="Add"
    view-aria-label="Mods add tool"
    @update:view="onModView"
  >
    <template v-if="showInspect" #inspect>
      <template v-if="selectedTempo">
        <label class="field">
          <span class="lbl">BPM</span>
          <TagRollBpmInput :model-value="selectedTempo.bpm" aria-label="Tempo BPM" @change="onTempoBpm" />
        </label>
      </template>
      <template v-else-if="selectedKey">
        <label class="field">
          <span class="lbl">Key</span>
          <select
            class="sel"
            :value="keyChoiceId(selectedKey.tonality, selectedKey.preferFlats, selectedKey.tonalityMode)"
            aria-label="Key signature"
            @change="onKeyChoice"
          >
            <optgroup label="Major">
              <option v-for="o in MAJOR_KEY_CHOICES" :key="o.id" :value="o.id">{{ o.label }}</option>
            </optgroup>
            <optgroup label="Minor">
              <option v-for="o in MINOR_KEY_CHOICES" :key="o.id" :value="o.id">{{ o.label }}</option>
            </optgroup>
          </select>
        </label>
      </template>
      <template v-else-if="selectedExpr?.kind === 'fermata'">
        <label class="field">
          <span class="lbl">Hold</span>
          <input
            class="num"
            type="number"
            min="0.25"
            max="16"
            step="0.25"
            :value="ticksToBeatsDisplay(selectedExpr.holdTicks)"
            :title="tagRollTip('Hold length in beats')"
            @change="onHoldChange"
          />
          <span class="unit">beats</span>
        </label>
        <label class="field">
          <span class="lbl">Gap</span>
          <input
            class="num"
            type="number"
            min="0"
            max="16"
            step="0.25"
            :value="ticksToBeatsDisplay(selectedExpr.gapTicks)"
            :title="tagRollTip('Silence after hold, in beats')"
            @change="onGapChange"
          />
          <span class="unit">beats</span>
        </label>
      </template>
      <template v-else-if="selectedExpr && (selectedExpr.kind === 'rit' || selectedExpr.kind === 'accel')">
        <label class="field">
          <span class="lbl">Start</span>
          <TagRollBpmInput
            :model-value="selectedExpr.startBpm"
            aria-label="Ramp start BPM"
            @change="(v) => onRampBpm('startBpm', v)"
          />
        </label>
        <label class="field">
          <span class="lbl">End</span>
          <TagRollBpmInput
            :model-value="selectedExpr.endBpm"
            aria-label="Ramp end BPM"
            @change="(v) => onRampBpm('endBpm', v)"
          />
        </label>
      </template>
      <button
        v-if="selectedId && !selectedIsStartTempo && !selectedIsStartKey"
        type="button"
        class="danger-btn"
        :title="tipByShortcutId('delete', 'Delete selected expression')"
        @click="onDeleteSelected"
      >
        Delete
      </button>
      <span
        v-else-if="selectedIsStartTempo"
        class="hint"
        :title="tagRollTip('Starting tempo cannot be deleted')"
      >
        Start tempo
      </span>
      <span
        v-else-if="selectedIsStartKey"
        class="hint"
        :title="tagRollTip('Starting key cannot be deleted')"
      >
        Start key
      </span>
    </template>
    <div ref="wrapRef" class="lane-wrap">
      <canvas
        ref="canvasRef"
        class="lane-canvas"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
      />
    </div>
  </TagRollBottomLaneShell>
</template>

<style scoped>
.lbl {
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--muted);
  letter-spacing: 0.02em;
}
.hint {
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--muted);
}
.unit {
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--muted);
}
.field {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}
.num {
  width: 3.6rem;
  min-height: 1.6rem;
  padding: 0.1rem 0.3rem;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 0.82rem;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
}
.sel {
  min-height: 1.6rem;
  max-width: 8.5rem;
  padding: 0.1rem 0.3rem;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 0.78rem;
  font-weight: 650;
}
.lane-wrap {
  height: 72px;
  overflow: hidden;
  touch-action: none;
  margin: 0 0.15rem 0.2rem 0;
  border-radius: 8px;
  border: 1px solid var(--border);
}
.lane-canvas {
  display: block;
  width: 100%;
  height: 72px;
  cursor: crosshair;
}
.danger-btn {
  min-height: 1.6rem;
  padding: 0.15rem 0.45rem;
  border: 1px solid color-mix(in srgb, var(--danger, #b42318) 35%, var(--border));
  border-radius: 6px;
  background: var(--surface);
  color: var(--danger, #b42318);
  font: inherit;
  font-size: 0.72rem;
  font-weight: 650;
  cursor: pointer;
}
</style>
