<script setup lang="ts">
/**
 * Canvas piano-roll viewport: grid, notes, pan/zoom, and mode-aware editing.
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  TAG_ROLL_CELL_H_MAX,
  TAG_ROLL_CELL_H_MIN,
  TAG_ROLL_CELL_W_MAX,
  TAG_ROLL_CELL_W_MIN,
  TAG_ROLL_MIDI_MAX,
  TAG_ROLL_MIDI_MIN,
  TAG_ROLL_PPQ,
  type TagRollNote,
  type TagRollProject,
} from '../../lib/tagRoll/types'
import { midiToY, pxToTicks, ticksToPx, yToMidi } from '../../lib/tagRoll/normalize'
import { snapTick, TAG_ROLL_HANDLE_CELL_W } from '../../lib/tagRoll/snap'
import {
  applyAngleZoom,
  pointerAngleAbs,
  pointerDistance,
} from '../../lib/tagRoll/zoomPan'

const RULER_H = 16
const RESIZE_EDGE = 8
const DRAG_SLOP = 6
const LYRIC_MIN_W = 22
const LYRIC_MIN_H = 11

type GhostNote = {
  midi: number
  startTick: number
  durationTicks: number
  color: string
}

const props = defineProps<{
  project: TagRollProject
  selectedNoteId: string | null
  ghostNotes?: GhostNote[]
}>()

const emit = defineEmits<{
  scroll: [scrollX: number, scrollY: number]
  playhead: [tick: number]
  select: [noteId: string | null]
  add: [payload: { midi: number; startTick: number }]
  move: [payload: { id: string; midi: number; startTick: number }]
  resize: [payload: { id: string; durationTicks: number }]
  cellSize: [payload: { cellW: number; cellH: number }]
  auditionColumn: [payload: { tick: number; movePlayhead: boolean }]
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const wrapRef = ref<HTMLElement | null>(null)
const cssW = ref(640)
const cssH = ref(360)

const cellW = computed(() => props.project.view.cellW)
const cellH = computed(() => props.project.view.cellH)
const scrollX = computed(() => props.project.view.scrollX)
const scrollY = computed(() => props.project.view.scrollY)
const lockPiano = computed(() => props.project.view.lockPiano)
const mode = computed(() => props.project.view.mode)

const gridW = computed(() => ticksToPx(props.project.lengthTicks, cellW.value))
const gridH = computed(
  () => (TAG_ROLL_MIDI_MAX - TAG_ROLL_MIDI_MIN + 1) * cellH.value,
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
      /** On click (no move): set playhead and optionally clear selection. */
      onClick: 'playhead' | 'deselect-playhead' | 'none'
    }
  | {
      kind: 'add'
      startClientX: number
      startClientY: number
      midi: number
      startTick: number
      moved: boolean
      panOriginX: number
      panOriginY: number
    }
  | {
      kind: 'move'
      id: string
      originMidi: number
      originStartTick: number
      grabMidi: number
      grabTick: number
    }
  | {
      kind: 'resize'
      id: string
      originDuration: number
      noteStartTick: number
      startClientX: number
    }
  | {
      kind: 'ruler'
      startClientX: number
      startClientY: number
      shiftKey: boolean
      moved: boolean
    }
  | {
      kind: 'select-click'
      noteId: string
      startClientX: number
      startClientY: number
      moved: boolean
    }

let gesture: Gesture | null = null
let pinchActive = false
let pinchStartDist = 0
let pinchStartAngle = 0
let pinchStartCells = { cellW: 28, cellH: 14 }

function maxScrollX(): number {
  return Math.max(0, gridW.value - cssW.value)
}
function maxScrollY(): number {
  return Math.max(0, gridH.value - cssH.value)
}

function clampScroll(x: number, y: number): { x: number; y: number } {
  return {
    x: Math.max(0, Math.min(maxScrollX(), x)),
    y: lockPiano.value ? scrollY.value : Math.max(0, Math.min(maxScrollY(), y)),
  }
}

function clampTick(tick: number): number {
  return Math.max(0, Math.min(props.project.lengthTicks, tick))
}

function localPoint(e: PointerEvent): { x: number; y: number } | null {
  const rect = canvasRef.value?.getBoundingClientRect()
  if (!rect) return null
  return { x: e.clientX - rect.left, y: e.clientY - rect.top }
}

function gridFromLocal(lx: number, ly: number): { tick: number; midi: number } {
  return {
    tick: clampTick(pxToTicks(lx + scrollX.value, cellW.value)),
    midi: yToMidi(ly + scrollY.value, cellH.value),
  }
}

function noteRect(n: Pick<TagRollNote, 'midi' | 'startTick' | 'durationTicks'>): {
  x: number
  y: number
  w: number
  h: number
} {
  const cw = cellW.value
  const ch = cellH.value
  return {
    x: -scrollX.value + ticksToPx(n.startTick, cw),
    y: -scrollY.value + midiToY(n.midi, ch),
    w: Math.max(2, ticksToPx(n.durationTicks, cw)),
    h: ch,
  }
}

function hitNote(lx: number, ly: number): TagRollNote | null {
  const notes = props.project.notes
  for (let i = notes.length - 1; i >= 0; i--) {
    const n = notes[i]!
    const r = noteRect(n)
    if (lx >= r.x && lx < r.x + r.w && ly >= r.y && ly < r.y + r.h) return n
  }
  return null
}

function hitResizeEdge(n: TagRollNote, lx: number, ly: number): boolean {
  if (cellW.value < TAG_ROLL_HANDLE_CELL_W) return false
  const r = noteRect(n)
  if (ly < r.y || ly >= r.y + r.h) return false
  return lx >= r.x + r.w - RESIZE_EDGE && lx < r.x + r.w
}

function clearPinch(): void {
  pinchActive = false
  pinchStartDist = 0
}

function beginPinch(): void {
  const pts = [...pointers.values()]
  if (pts.length < 2) return
  const a = pts[0]!
  const b = pts[1]!
  pinchActive = true
  pinchStartDist = pointerDistance(a, b)
  pinchStartAngle = pointerAngleAbs(a, b)
  pinchStartCells = { cellW: cellW.value, cellH: cellH.value }
  gesture = null
}

function applyPinch(): void {
  const pts = [...pointers.values()]
  if (!pinchActive || pts.length < 2 || !(pinchStartDist > 1)) return
  const a = pts[0]!
  const b = pts[1]!
  const next = applyAngleZoom({
    start: pinchStartCells,
    startDist: pinchStartDist,
    currentDist: pointerDistance(a, b),
    angleRad: pinchStartAngle,
    minW: TAG_ROLL_CELL_W_MIN,
    maxW: TAG_ROLL_CELL_W_MAX,
    minH: TAG_ROLL_CELL_H_MIN,
    maxH: TAG_ROLL_CELL_H_MAX,
  })
  if (next.cellW !== cellW.value || next.cellH !== cellH.value) {
    emit('cellSize', { cellW: next.cellW, cellH: next.cellH })
  }
}

function startPan(
  e: PointerEvent,
  onClick: 'playhead' | 'deselect-playhead' | 'none' = 'none',
): void {
  gesture = {
    kind: 'pan',
    originX: scrollX.value,
    originY: scrollY.value,
    startClientX: e.clientX,
    startClientY: e.clientY,
    moved: false,
    onClick,
  }
}

function resize(): void {
  const el = wrapRef.value
  if (!el) return
  const r = el.getBoundingClientRect()
  cssW.value = Math.max(1, Math.floor(r.width))
  cssH.value = Math.max(1, Math.floor(r.height))
  draw()
}

function draw(): void {
  const canvas = canvasRef.value
  if (!canvas) return
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
  canvas.width = Math.floor(cssW.value * dpr)
  canvas.height = Math.floor(cssH.value * dpr)
  canvas.style.width = `${cssW.value}px`
  canvas.style.height = `${cssH.value}px`
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

  const styles = getComputedStyle(canvas)
  const bg = styles.getPropertyValue('--bg').trim() || '#f6f4ef'
  const border = styles.getPropertyValue('--border').trim() || '#d0cbc2'
  const muted = styles.getPropertyValue('--muted').trim() || '#887f72'
  const accent = styles.getPropertyValue('--accent').trim() || '#1d6a9f'
  const surface = styles.getPropertyValue('--surface').trim() || '#fff'

  ctx.fillStyle = bg
  ctx.fillRect(0, 0, cssW.value, cssH.value)

  const ox = -scrollX.value
  const oy = -scrollY.value
  const cw = cellW.value
  const ch = cellH.value
  const beats = Math.ceil(props.project.lengthTicks / TAG_ROLL_PPQ)

  for (let b = 0; b <= beats; b++) {
    const x = ox + b * cw
    if (x < -1 || x > cssW.value + 1) continue
    const isMeasure = b % 4 === 0
    ctx.strokeStyle = isMeasure ? border : muted
    ctx.globalAlpha = isMeasure ? 1 : 0.35
    ctx.lineWidth = isMeasure ? 1.25 : 1
    ctx.beginPath()
    ctx.moveTo(x + 0.5, 0)
    ctx.lineTo(x + 0.5, cssH.value)
    ctx.stroke()
    ctx.globalAlpha = 1
  }

  for (let m = TAG_ROLL_MIDI_MIN; m <= TAG_ROLL_MIDI_MAX; m++) {
    const y = oy + midiToY(m, ch)
    if (y + ch < 0 || y > cssH.value) continue
    const pc = ((m % 12) + 12) % 12
    const isBlack = pc === 1 || pc === 3 || pc === 6 || pc === 8 || pc === 10
    if (isBlack) {
      ctx.fillStyle = muted
      ctx.globalAlpha = 0.12
      ctx.fillRect(0, y, cssW.value, ch)
      ctx.globalAlpha = 1
    }
    ctx.strokeStyle = border
    ctx.globalAlpha = 0.55
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, y + ch + 0.5)
    ctx.lineTo(cssW.value, y + ch + 0.5)
    ctx.stroke()
    ctx.globalAlpha = 1
  }

  for (const g of props.ghostNotes ?? []) {
    const r = noteRect(g)
    if (r.x + r.w < 0 || r.x > cssW.value || r.y + r.h < 0 || r.y > cssH.value) continue
    ctx.globalAlpha = 0.38
    ctx.fillStyle = g.color || accent
    ctx.fillRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2)
    ctx.globalAlpha = 1
  }

  const selectedId = props.selectedNoteId
  let selectedNote: TagRollNote | null = null
  for (const n of props.project.notes) {
    const part = props.project.parts.find((p) => p.id === n.partId)
    const r = noteRect(n)
    if (r.x + r.w < 0 || r.x > cssW.value || r.y + r.h < 0 || r.y > cssH.value) continue
    ctx.fillStyle = part?.color || accent
    ctx.fillRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2)
    ctx.strokeStyle = surface
    ctx.lineWidth = 1
    ctx.strokeRect(r.x + 1.5, r.y + 1.5, r.w - 3, r.h - 3)

    if (n.lyric && r.w > LYRIC_MIN_W && r.h > LYRIC_MIN_H) {
      ctx.fillStyle = surface
      ctx.font = `${Math.max(8, Math.min(r.h - 3, 11))}px sans-serif`
      ctx.textBaseline = 'middle'
      ctx.fillText(n.lyric.slice(0, 16), r.x + 4, r.y + r.h / 2, Math.max(4, r.w - 8))
    }

    if (n.id === selectedId) selectedNote = n
  }

  if (selectedNote) {
    const r = noteRect(selectedNote)
    ctx.strokeStyle = accent
    ctx.lineWidth = 2
    ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1)
    if (cw >= TAG_ROLL_HANDLE_CELL_W) {
      ctx.fillStyle = accent
      ctx.fillRect(r.x + r.w - RESIZE_EDGE, r.y + 2, RESIZE_EDGE - 1, Math.max(2, r.h - 4))
    }
  }

  // Ruler strip
  ctx.fillStyle = surface
  ctx.globalAlpha = 0.92
  ctx.fillRect(0, 0, cssW.value, RULER_H)
  ctx.globalAlpha = 1
  ctx.strokeStyle = border
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(0, RULER_H + 0.5)
  ctx.lineTo(cssW.value, RULER_H + 0.5)
  ctx.stroke()
  ctx.fillStyle = muted
  ctx.font = '10px sans-serif'
  ctx.textBaseline = 'middle'
  for (let b = 0; b <= beats; b++) {
    if (b % 4 !== 0) continue
    const x = ox + b * cw
    if (x < -20 || x > cssW.value + 20) continue
    ctx.fillText(String(b / 4 + 1), x + 3, RULER_H / 2)
  }

  // Playhead
  const phX = ox + ticksToPx(props.project.view.playheadTick, cw)
  if (phX >= -2 && phX <= cssW.value + 2) {
    ctx.strokeStyle = accent
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(phX + 0.5, RULER_H)
    ctx.lineTo(phX + 0.5, cssH.value)
    ctx.stroke()
    ctx.fillStyle = accent
    ctx.beginPath()
    ctx.moveTo(phX, 2)
    ctx.lineTo(phX + 5, RULER_H - 2)
    ctx.lineTo(phX - 5, RULER_H - 2)
    ctx.closePath()
    ctx.fill()
  }
}

function onPointerDown(e: PointerEvent): void {
  if (e.button !== 0) return
  const canvas = canvasRef.value
  if (!canvas) return
  canvas.setPointerCapture(e.pointerId)
  pointers.set(e.pointerId, { id: e.pointerId, x: e.clientX, y: e.clientY })

  if (pointers.size === 2) {
    beginPinch()
    return
  }
  if (pointers.size !== 1) return

  const local = localPoint(e)
  if (!local) return

  if (local.y < RULER_H) {
    gesture = {
      kind: 'ruler',
      startClientX: e.clientX,
      startClientY: e.clientY,
      shiftKey: e.shiftKey,
      moved: false,
    }
    return
  }

  const m = mode.value
  const hit = hitNote(local.x, local.y)

  if (m === 'edit') {
    if (hit) {
      emit('select', hit.id)
      if (hitResizeEdge(hit, local.x, local.y)) {
        gesture = {
          kind: 'resize',
          id: hit.id,
          originDuration: hit.durationTicks,
          noteStartTick: hit.startTick,
          startClientX: e.clientX,
        }
      } else {
        const g = gridFromLocal(local.x, local.y)
        gesture = {
          kind: 'move',
          id: hit.id,
          originMidi: hit.midi,
          originStartTick: hit.startTick,
          grabMidi: g.midi,
          grabTick: g.tick,
        }
      }
      return
    }
    startPan(e, 'deselect-playhead')
    return
  }

  if (m === 'add') {
    // Place only on empty cells; note hits are ignored (no select).
    if (hit) {
      startPan(e, 'none')
      return
    }
    const g = gridFromLocal(local.x, local.y)
    gesture = {
      kind: 'add',
      startClientX: e.clientX,
      startClientY: e.clientY,
      midi: g.midi,
      startTick: snapTick(g.tick, props.project.snapTicks),
      moved: false,
      panOriginX: scrollX.value,
      panOriginY: scrollY.value,
    }
    return
  }

  if (m === 'lyrics') {
    if (hit) {
      gesture = {
        kind: 'select-click',
        noteId: hit.id,
        startClientX: e.clientX,
        startClientY: e.clientY,
        moved: false,
      }
      return
    }
    startPan(e, 'playhead')
    return
  }

  // view: pan; click empty → playhead; note click does nothing
  if (hit) {
    startPan(e, 'none')
    return
  }
  startPan(e, 'playhead')
}

function onPointerMove(e: PointerEvent): void {
  if (!pointers.has(e.pointerId)) return
  pointers.set(e.pointerId, { id: e.pointerId, x: e.clientX, y: e.clientY })

  if (pointers.size >= 2) {
    if (!pinchActive) beginPinch()
    applyPinch()
    return
  }

  if (!gesture) return

  if (gesture.kind === 'pan') {
    const pdx = e.clientX - gesture.startClientX
    const pdy = e.clientY - gesture.startClientY
    if (Math.abs(pdx) + Math.abs(pdy) > DRAG_SLOP) gesture.moved = true
    const next = clampScroll(gesture.originX - pdx, gesture.originY - pdy)
    emit('scroll', next.x, next.y)
    return
  }

  if (gesture.kind === 'ruler') {
    const pdx = e.clientX - gesture.startClientX
    const pdy = e.clientY - gesture.startClientY
    if (Math.abs(pdx) + Math.abs(pdy) > DRAG_SLOP) gesture.moved = true
    return
  }

  if (gesture.kind === 'select-click') {
    const pdx = e.clientX - gesture.startClientX
    const pdy = e.clientY - gesture.startClientY
    if (Math.abs(pdx) + Math.abs(pdy) > DRAG_SLOP) {
      // Promote to pan (lyrics: drag away from note)
      gesture = {
        kind: 'pan',
        originX: scrollX.value,
        originY: scrollY.value,
        startClientX: e.clientX - pdx,
        startClientY: e.clientY - pdy,
        moved: true,
        onClick: 'none',
      }
      const next = clampScroll(scrollX.value - pdx, scrollY.value - pdy)
      emit('scroll', next.x, next.y)
    }
    return
  }

  if (gesture.kind === 'add') {
    const pdx = e.clientX - gesture.startClientX
    const pdy = e.clientY - gesture.startClientY
    if (Math.abs(pdx) + Math.abs(pdy) > DRAG_SLOP) {
      gesture.moved = true
      const next = clampScroll(gesture.panOriginX - pdx, gesture.panOriginY - pdy)
      emit('scroll', next.x, next.y)
    }
    return
  }

  if (gesture.kind === 'move') {
    const local = localPoint(e)
    if (!local) return
    const g = gridFromLocal(local.x, local.y)
    const nextMidi = Math.max(
      TAG_ROLL_MIDI_MIN,
      Math.min(TAG_ROLL_MIDI_MAX, gesture.originMidi + (g.midi - gesture.grabMidi)),
    )
    const nextTick = snapTick(
      clampTick(gesture.originStartTick + (g.tick - gesture.grabTick)),
      props.project.snapTicks,
    )
    emit('move', { id: gesture.id, midi: nextMidi, startTick: nextTick })
    return
  }

  if (gesture.kind === 'resize') {
    const pdx = e.clientX - gesture.startClientX
    const deltaTicks = pxToTicks(pdx, cellW.value)
    const raw = gesture.originDuration + deltaTicks
    const snapped = Math.max(
      props.project.snapTicks,
      snapTick(raw, props.project.snapTicks),
    )
    const maxDur = Math.max(
      props.project.snapTicks,
      props.project.lengthTicks - gesture.noteStartTick,
    )
    emit('resize', {
      id: gesture.id,
      durationTicks: Math.min(maxDur, snapped),
    })
  }
}

function onPointerUp(e: PointerEvent): void {
  if (!pointers.has(e.pointerId)) return
  pointers.delete(e.pointerId)

  if (pointers.size < 2) clearPinch()

  if (pointers.size === 1) {
    const rem = [...pointers.values()][0]!
    gesture = {
      kind: 'pan',
      originX: scrollX.value,
      originY: scrollY.value,
      startClientX: rem.x,
      startClientY: rem.y,
      moved: true,
      onClick: 'none',
    }
    return
  }

  if (pointers.size > 0) return

  const g = gesture
  gesture = null
  if (!g) return

  if (g.kind === 'ruler') {
    if (!g.moved) {
      const local = localPoint(e)
      if (local) {
        const tick = clampTick(pxToTicks(local.x + scrollX.value, cellW.value))
        emit('auditionColumn', { tick, movePlayhead: g.shiftKey })
      }
    }
    return
  }

  if (g.kind === 'pan') {
    if (!g.moved && g.onClick !== 'none') {
      const local = localPoint(e)
      if (!local || local.y < RULER_H) return
      if (g.onClick === 'deselect-playhead') emit('select', null)
      emit('playhead', gridFromLocal(local.x, local.y).tick)
    }
    return
  }

  if (g.kind === 'select-click') {
    if (!g.moved) emit('select', g.noteId)
    return
  }

  if (g.kind === 'add') {
    if (!g.moved) emit('add', { midi: g.midi, startTick: g.startTick })
  }
}

function onWheel(e: WheelEvent): void {
  e.preventDefault()
  const next = clampScroll(scrollX.value + e.deltaX, scrollY.value + e.deltaY)
  emit('scroll', next.x, next.y)
}

let ro: ResizeObserver | null = null

onMounted(() => {
  resize()
  if (typeof ResizeObserver !== 'undefined' && wrapRef.value) {
    ro = new ResizeObserver(() => resize())
    ro.observe(wrapRef.value)
  }
  window.addEventListener('resize', resize)
})

onUnmounted(() => {
  ro?.disconnect()
  window.removeEventListener('resize', resize)
  pointers.clear()
  gesture = null
})

watch(
  () => [
    props.project.view.scrollX,
    props.project.view.scrollY,
    props.project.view.cellW,
    props.project.view.cellH,
    props.project.view.playheadTick,
    props.project.view.mode,
    props.project.lengthTicks,
    props.project.notes,
    props.project.parts,
    props.selectedNoteId,
    props.ghostNotes,
    cssW.value,
    cssH.value,
  ],
  () => draw(),
  { flush: 'post', deep: true },
)

defineExpose({ cssH, resize, draw })
</script>

<template>
  <div ref="wrapRef" class="viewport" @wheel="onWheel">
    <canvas
      ref="canvasRef"
      class="roll-canvas"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
    />
  </div>
</template>

<style scoped>
.viewport {
  position: relative;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: var(--bg);
  touch-action: none;
  cursor: grab;
}
.viewport:active {
  cursor: grabbing;
}
.roll-canvas {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
