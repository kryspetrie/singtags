<script setup lang="ts">
/**
 * Canvas piano-roll viewport: grid, notes, pan/zoom, compose editing, playhead scrub.
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  TAG_ROLL_CELL_H_MAX,
  TAG_ROLL_CELL_H_MIN,
  TAG_ROLL_CELL_W_MAX,
  TAG_ROLL_CELL_W_MIN,
  TAG_ROLL_MIDI_MAX,
  TAG_ROLL_MIDI_MIN,
  TAG_ROLL_RULER_H,
  TAG_ROLL_RULER_H_COMPOSE,
  type TagRollNote,
  type TagRollProject,
} from '../../lib/tagRoll/types'
import { midiToY, pxToTicks, ticksToPx, yToMidi } from '../../lib/tagRoll/normalize'
import {
  hitChordCursorEdge,
  rangeFromDragTicks,
  resizeChordCursor,
  type ChordCursorEdge,
} from '../../lib/tagRoll/chordCursorHit'
import { clampCellW, minCellWToFillRoll } from '../../lib/tagRoll/zoomFill'
import { snapTick, TAG_ROLL_HANDLE_CELL_W } from '../../lib/tagRoll/snap'
import {
  hitNoteResizeEdge,
  resizeNoteByEdge,
  type NoteResizeEdge,
} from '../../lib/tagRoll/noteResize'
import { beatTicks, measureTicks } from '../../lib/tagRoll/tempoMap'
import {
  applyAngleZoom,
  pointerAngleAbs,
  pointerDistance,
} from '../../lib/tagRoll/zoomPan'
import { pickPreferredHit } from '../../lib/tagRoll/hitTest'
import { composeEmptyClickAction } from '../../lib/tagRoll/composeClickPolicy'
import {
  normalizeScreenBox,
  noteIdsInMarquee,
} from '../../lib/tagRoll/selection'
import { midiInScale } from '../../lib/tagRoll/scaleHighlight'
import { keyAtTick } from '../../lib/tagRoll/keyMap'
import { focusPartGhosts } from '../../lib/tagRoll/partGhosts'
import {
  easeInOutCosine,
  listPortamentoLinks,
} from '../../lib/tagRoll/portamento'
import { strokeMelodyPassLinks } from '../../lib/tagRoll/melodyPass'
import { useTagRollStore } from '../../stores/tagRoll'

const RESIZE_EDGE = 8
const DRAG_SLOP = 6
const PLAYHEAD_HIT = 10
const LYRIC_MIN_W = 22
const LYRIC_MIN_H = 11

type GhostNote = {
  midi: number
  startTick: number
  durationTicks: number
  color: string
}

type ChordCursorHighlight = {
  startTick: number
  endTick: number
}

const props = defineProps<{
  project: TagRollProject
  selectedNoteIds: string[]
  ghostNotes?: GhostNote[]
  /** Vertical stack highlight for the chord currently under coach focus. */
  chordCursor?: ChordCursorHighlight | null
  /**
   * Extra header band below the ruler (e.g. Harmony strip) reserved from the pitch plane.
   * Notes / hit-tests start below rulerH + headerExtraH.
   */
  headerExtraH?: number
}>()

const emit = defineEmits<{
  scroll: [scrollX: number, scrollY: number]
  playhead: [tick: number]
  select: [noteId: string | null, opts?: { additive?: boolean }]
  selectMany: [noteIds: string[], opts?: { additive?: boolean }]
  move: [payload: { id: string; midi: number; startTick: number }]
  moveGroup: [
    updates: Array<{ id: string; midi: number; startTick: number }>,
  ]
  resize: [payload: { id: string; startTick: number; durationTicks: number }]
  cellSize: [payload: { cellW: number; cellH: number }]
  auditionColumn: [payload: { tick: number; movePlayhead: boolean }]
  auditionNote: [midi: number]
  previewPitch: [midi: number | null]
  beginGesture: []
  pointerHud: [payload: { tick: number; midi: number } | null]
  marqueeActive: [active: boolean]
  /** Ruler drag-select / edge resize; null clears (click-away). */
  chordCursorChange: [range: { startTick: number; endTick: number } | null]
}>()

const store = useTagRollStore()
/** Shift held → preview hand cursor before drag (Compose / Lyrics edit mode). */
const shiftHeld = ref(false)

function onShiftKey(e: KeyboardEvent): void {
  if (e.key !== 'Shift') return
  shiftHeld.value = e.type === 'keydown'
}

function clearShiftHeld(): void {
  shiftHeld.value = false
}

function onPointerLeave(): void {
  emit('pointerHud', null)
  cursorEdgeHover.value = false
}

const selectedIdSet = computed(() => new Set(props.selectedNoteIds))
const primarySelectedId = computed(() =>
  props.selectedNoteIds.length
    ? props.selectedNoteIds[props.selectedNoteIds.length - 1]!
    : null,
)

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
const rulerH = computed(() =>
  mode.value === 'compose' ? TAG_ROLL_RULER_H_COMPOSE : TAG_ROLL_RULER_H,
)
/** Ruler + reserved chrome (Harmony strip) — pitch plane starts here. */
const headerBandH = computed(() => rulerH.value + Math.max(0, props.headerExtraH ?? 0))

const gridW = computed(() => ticksToPx(props.project.lengthTicks, cellW.value))
const gridH = computed(
  () => (TAG_ROLL_MIDI_MAX - TAG_ROLL_MIDI_MIN + 1) * cellH.value,
)

function minCellW(): number {
  return minCellWToFillRoll(cssW.value, props.project.lengthTicks, props.project.ppq)
}

function clampZoomW(w: number): number {
  return clampCellW(w, Math.max(TAG_ROLL_CELL_W_MIN, minCellW()))
}

function ensureFillWidth(): void {
  const min = minCellW()
  if (cellW.value < min) {
    emit('cellSize', { cellW: min, cellH: cellH.value })
  }
}

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
      onClick: 'playhead' | 'deselect' | 'none'
    }
  | {
      kind: 'playhead'
      startClientX: number
      startClientY: number
      moved: boolean
    }
  | {
      kind: 'move'
      id: string
      originMidi: number
      originStartTick: number
      grabMidi: number
      grabTick: number
      lastMidi: number
      isNew: boolean
      historyStarted: boolean
    }
  | {
      kind: 'move-group'
      ids: string[]
      origins: Map<string, { midi: number; startTick: number }>
      grabMidi: number
      grabTick: number
      lastMidi: number
      historyStarted: boolean
    }
  | {
      kind: 'resize'
      id: string
      edge: NoteResizeEdge
      originDuration: number
      noteStartTick: number
      startClientX: number
      historyStarted: boolean
    }
  | {
      kind: 'chord-range'
      originTick: number
      startClientX: number
      startClientY: number
      moved: boolean
    }
  | {
      kind: 'select-click'
      noteId: string
      midi: number
      startClientX: number
      startClientY: number
      moved: boolean
      additive: boolean
    }
  | {
      kind: 'marquee'
      startLx: number
      startLy: number
      curLx: number
      curLy: number
      moved: boolean
      additive: boolean
    }
  | {
      kind: 'chord-cursor'
      edge: ChordCursorEdge
      otherTick: number
    }

let gesture: Gesture | null = null
let pinchActive = false
let pinchStartDist = 0
let pinchStartAngle = 0
let pinchStartCells = { cellW: 28, cellH: 14 }
let marqueePreview: { x: number; y: number; w: number; h: number } | null = null
const marqueeUi = ref(false)
const cursorEdgeHover = ref(false)

function maxScrollX(): number {
  return Math.max(0, gridW.value - cssW.value)
}
function maxScrollY(): number {
  // Pitch plane sits below the header band; scroll range is pitch-grid vs pitch viewport.
  const pitchH = Math.max(0, cssH.value - headerBandH.value)
  return Math.max(0, gridH.value - pitchH)
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

/** Canvas Y of pitch-grid origin (below header band) for the current scroll. */
function pitchOriginY(): number {
  return headerBandH.value - scrollY.value
}

function localPoint(e: PointerEvent): { x: number; y: number } | null {
  const rect = canvasRef.value?.getBoundingClientRect()
  if (!rect) return null
  return { x: e.clientX - rect.left, y: e.clientY - rect.top }
}

function gridFromLocal(lx: number, ly: number): { tick: number; midi: number } {
  return {
    tick: clampTick(pxToTicks(lx + scrollX.value, cellW.value)),
    midi: yToMidi(ly - headerBandH.value + scrollY.value, cellH.value),
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
    y: pitchOriginY() + midiToY(n.midi, ch),
    w: Math.max(2, ticksToPx(n.durationTicks, cw)),
    h: ch,
  }
}

function hitNotesAt(lx: number, ly: number): TagRollNote[] {
  const hits: TagRollNote[] = []
  // Lyrics mode: always allow picking any part so click can switch the lyric target.
  const focus =
    mode.value !== 'lyrics' && props.project.view.focusActivePart
  const activePartId = props.project.view.activePartId
  for (const n of props.project.notes) {
    if (focus && activePartId && n.partId !== activePartId) continue
    const r = noteRect(n)
    if (lx >= r.x && lx < r.x + r.w && ly >= r.y && ly < r.y + r.h) hits.push(n)
  }
  return hits
}

function hitNote(lx: number, ly: number): TagRollNote | null {
  const hits = hitNotesAt(lx, ly)
  // Lyrics: prefer the topmost/shortest hit so a visible non-active part can be chosen.
  if (mode.value === 'lyrics') {
    return pickPreferredHit(hits, props.project.notes, null)
  }
  return pickPreferredHit(
    hits,
    props.project.notes,
    props.project.view.activePartId,
  )
}

function hitResizeEdge(n: TagRollNote, lx: number, ly: number): NoteResizeEdge | null {
  return hitNoteResizeEdge(
    lx,
    ly,
    noteRect(n),
    RESIZE_EDGE,
    cellW.value >= TAG_ROLL_HANDLE_CELL_W,
  )
}

function playheadScreenX(): number {
  return -scrollX.value + ticksToPx(props.project.view.playheadTick, cellW.value)
}

function hitPlayhead(lx: number, ly: number): boolean {
  if (ly < headerBandH.value) return false
  return Math.abs(lx - playheadScreenX()) <= PLAYHEAD_HIT
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
    minW: Math.max(TAG_ROLL_CELL_W_MIN, minCellW()),
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
  onClick: 'playhead' | 'deselect' | 'none' = 'none',
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
  ensureFillWidth()
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
  const text = styles.getPropertyValue('--text').trim() || '#2a241c'
  const accent = styles.getPropertyValue('--accent').trim() || '#1d6a9f'
  const surface = styles.getPropertyValue('--surface').trim() || '#fff'

  ctx.fillStyle = bg
  ctx.fillRect(0, 0, cssW.value, cssH.value)

  const ox = -scrollX.value
  const oy = pitchOriginY()
  const cw = cellW.value
  const ch = cellH.value
  const ts = props.project.timeSignature
  const mTicks = measureTicks(ts)
  const bTicks = beatTicks(ts)
  const snap = Math.max(1, props.project.snapTicks)

  // Snap subdivision lines (subtle)
  for (let t = 0; t <= props.project.lengthTicks; t += snap) {
    if (t % bTicks === 0) continue
    const x = ox + ticksToPx(t, cw)
    if (x < -1 || x > cssW.value + 1) continue
    ctx.strokeStyle = muted
    ctx.globalAlpha = 0.18
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(x + 0.5, 0)
    ctx.lineTo(x + 0.5, cssH.value)
    ctx.stroke()
    ctx.globalAlpha = 1
  }

  // Beat lines (light)
  for (let t = 0; t <= props.project.lengthTicks; t += bTicks) {
    if (t % mTicks === 0) continue
    const x = ox + ticksToPx(t, cw)
    if (x < -1 || x > cssW.value + 1) continue
    ctx.strokeStyle = muted
    ctx.globalAlpha = 0.4
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(x + 0.5, 0)
    ctx.lineTo(x + 0.5, cssH.value)
    ctx.stroke()
    ctx.globalAlpha = 1
  }

  // Measure barlines (strong)
  for (let t = 0; t <= props.project.lengthTicks; t += mTicks) {
    const x = ox + ticksToPx(t, cw)
    if (x < -2 || x > cssW.value + 2) continue
    ctx.strokeStyle = text
    ctx.globalAlpha = 0.55
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.moveTo(x + 0.5, 0)
    ctx.lineTo(x + 0.5, cssH.value)
    ctx.stroke()
    ctx.globalAlpha = 1
  }

  const scaleKey = keyAtTick(props.project.view.playheadTick, props.project.keyMarkers, {
    tonality: props.project.tonality,
    tonalityMode: props.project.tonalityMode ?? 'major',
    preferFlats: props.project.preferFlats,
  })

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
    if (!midiInScale(m, scaleKey.tonality, scaleKey.tonalityMode)) {
      ctx.fillStyle = muted
      ctx.globalAlpha = 0.1
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

  // Inspect range: full-height band from ruler drag-select (not coach nav).
  const cursor = props.chordCursor
  if (cursor && cursor.endTick > cursor.startTick) {
    const x0 = -scrollX.value + ticksToPx(cursor.startTick, cellW.value)
    const x1 = -scrollX.value + ticksToPx(cursor.endTick, cellW.value)
    const x = Math.max(0, x0)
    const w = Math.max(2, Math.min(cssW.value, x1) - x)
    if (w > 0 && x < cssW.value) {
      const bandTop = headerBandH.value
      const bandH = Math.max(0, cssH.value - bandTop)
      ctx.fillStyle = accent
      ctx.globalAlpha = 0.1
      ctx.fillRect(x, bandTop, w, bandH)
      ctx.globalAlpha = 0.45
      ctx.strokeStyle = accent
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(x + 0.5, bandTop)
      ctx.lineTo(x + 0.5, cssH.value)
      ctx.moveTo(x + w - 0.5, bandTop)
      ctx.lineTo(x + w - 0.5, cssH.value)
      ctx.stroke()
      ctx.globalAlpha = 0.7
      ctx.fillStyle = accent
      const hw = 2
      ctx.fillRect(x - hw, bandTop, hw * 2, bandH)
      ctx.fillRect(x + w - hw, bandTop, hw * 2, bandH)
      ctx.globalAlpha = 1
    }
  }

  // Harmonize preview ghosts (filled translucent).
  for (const g of props.ghostNotes ?? []) {
    const r = noteRect(g)
    if (r.x + r.w < 0 || r.x > cssW.value || r.y + r.h < 0 || r.y > cssH.value) continue
    ctx.globalAlpha = 0.38
    ctx.fillStyle = g.color || accent
    ctx.fillRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2)
    ctx.globalAlpha = 1
  }

  // Other-part reference ghosts when "Current only" is on (dashed).
  for (const g of focusPartGhosts(props.project)) {
    const r = noteRect(g)
    if (r.x + r.w < 0 || r.x > cssW.value || r.y + r.h < 0 || r.y > cssH.value) continue
    ctx.globalAlpha = 0.2
    ctx.fillStyle = g.color || muted
    ctx.fillRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2)
    ctx.globalAlpha = 0.65
    ctx.strokeStyle = g.color || muted
    ctx.lineWidth = 1
    ctx.setLineDash([3, 3])
    ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1)
    ctx.setLineDash([])
    ctx.globalAlpha = 1
  }

  const selectedIds = selectedIdSet.value
  const focusActive = props.project.view.focusActivePart
  const activePartId = props.project.view.activePartId
  for (const n of props.project.notes) {
    const faded = focusActive && !!activePartId && n.partId !== activePartId
    if (faded) continue // drawn as part ghosts above
    const part = props.project.parts.find((p) => p.id === n.partId)
    const r = noteRect(n)
    if (r.x + r.w < 0 || r.x > cssW.value || r.y + r.h < 0 || r.y > cssH.value) continue
    const selected = selectedIds.has(n.id)
    ctx.globalAlpha = 1
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

    if (selected) {
      ctx.strokeStyle = accent
      ctx.lineWidth = selected && n.id === primarySelectedId.value ? 2 : 1.5
      ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1)
    }
  }

  // Portamento overlays — ease-in-out curves across each same-part overlap.
  for (const link of listPortamentoLinks(props.project.notes)) {
    const faded =
      focusActive && !!activePartId && link.to.partId !== activePartId
    const part = props.project.parts.find((p) => p.id === link.to.partId)
    const color = part?.color || accent
    const x0 = -scrollX.value + ticksToPx(link.startTick, cw)
    const x1 = -scrollX.value + ticksToPx(link.endTick, cw)
    if (x1 < -2 || x0 > cssW.value + 2) continue
    const yFrom = pitchOriginY() + midiToY(link.from.midi, ch) + ch / 2
    const yTo = pitchOriginY() + midiToY(link.to.midi, ch) + ch / 2
    const span = Math.max(1, x1 - x0)
    const steps = Math.max(8, Math.min(48, Math.round(span / 3)))
    ctx.save()
    ctx.globalAlpha = faded ? 0.28 : 0.9
    ctx.strokeStyle = color
    ctx.lineWidth = faded ? 1.5 : 2.25
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      const e = easeInOutCosine(t)
      const x = x0 + span * t
      const y = yFrom + (yTo - yFrom) * e
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
    // Soft under-glow so curves read over dense notes.
    if (!faded) {
      ctx.globalAlpha = 0.22
      ctx.lineWidth = 5
      ctx.stroke()
    }
    ctx.restore()
  }

  strokeMelodyPassLinks(ctx, props.project, {
    scrollX: scrollX.value,
    scrollY: scrollY.value - headerBandH.value,
    cellW: cw,
    cellH: ch,
    cssW: cssW.value,
    cssH: cssH.value,
    accent,
    ticksToPx,
    midiToY,
  })

  const primaryId = primarySelectedId.value
  if (primaryId && selectedIds.size === 1) {
    const selectedNote = props.project.notes.find((n) => n.id === primaryId)
    if (selectedNote) {
      const r = noteRect(selectedNote)
      if (cw >= TAG_ROLL_HANDLE_CELL_W) {
        ctx.fillStyle = accent
        ctx.fillRect(r.x + 1, r.y + 2, RESIZE_EDGE - 1, Math.max(2, r.h - 4))
        ctx.fillRect(r.x + r.w - RESIZE_EDGE, r.y + 2, RESIZE_EDGE - 1, Math.max(2, r.h - 4))
      }
    }
  }

  if (marqueePreview && marqueePreview.w > 0 && marqueePreview.h > 0) {
    ctx.fillStyle = accent
    ctx.globalAlpha = 0.12
    ctx.fillRect(marqueePreview.x, marqueePreview.y, marqueePreview.w, marqueePreview.h)
    ctx.globalAlpha = 1
    ctx.strokeStyle = accent
    ctx.lineWidth = 1
    ctx.setLineDash([4, 3])
    ctx.strokeRect(
      marqueePreview.x + 0.5,
      marqueePreview.y + 0.5,
      marqueePreview.w - 1,
      marqueePreview.h - 1,
    )
    ctx.setLineDash([])
  }

  // Header band (ruler + reserved Harmony strip) — covers scrolled pitch under chrome.
  ctx.fillStyle = surface
  ctx.globalAlpha = 0.96
  ctx.fillRect(0, 0, cssW.value, headerBandH.value)
  ctx.globalAlpha = 1
  // Ruler strip
  ctx.fillStyle = surface
  ctx.globalAlpha = 0.92
  ctx.fillRect(0, 0, cssW.value, rulerH.value)
  ctx.globalAlpha = 1
  ctx.strokeStyle = border
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(0, rulerH.value + 0.5)
  ctx.lineTo(cssW.value, rulerH.value + 0.5)
  ctx.stroke()
  if (headerBandH.value > rulerH.value) {
    ctx.beginPath()
    ctx.moveTo(0, headerBandH.value + 0.5)
    ctx.lineTo(cssW.value, headerBandH.value + 0.5)
    ctx.stroke()
  }
  ctx.fillStyle = muted
  ctx.font = '600 11px sans-serif'
  ctx.textBaseline = 'middle'
  for (let t = 0; t <= props.project.lengthTicks; t += mTicks) {
    const x = ox + ticksToPx(t, cw)
    if (x < -20 || x > cssW.value + 20) continue
    // Short bar tick in the ruler
    ctx.strokeStyle = text
    ctx.globalAlpha = 0.7
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(x + 0.5, 2)
    ctx.lineTo(x + 0.5, rulerH.value - 1)
    ctx.stroke()
    ctx.globalAlpha = 1
    const measureNum = Math.floor(t / mTicks) + 1
    ctx.fillStyle = text
    ctx.globalAlpha = 0.85
    ctx.fillText(String(measureNum), x + 4, rulerH.value / 2)
    ctx.globalAlpha = 1
  }

  // Playhead
  const phX = playheadScreenX()
  if (phX >= -2 && phX <= cssW.value + 2) {
    ctx.strokeStyle = accent
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(phX + 0.5, rulerH.value)
    ctx.lineTo(phX + 0.5, cssH.value)
    ctx.stroke()
    ctx.fillStyle = accent
    ctx.beginPath()
    ctx.moveTo(phX, 2)
    ctx.lineTo(phX + 5, rulerH.value - 2)
    ctx.lineTo(phX - 5, rulerH.value - 2)
    ctx.closePath()
    ctx.fill()
  }
}

function startMoveGesture(
  _e: PointerEvent,
  note: TagRollNote,
  local: { x: number; y: number },
  isNew: boolean,
): void {
  emit('select', note.id)
  const g = gridFromLocal(local.x, local.y)
  gesture = {
    kind: 'move',
    id: note.id,
    originMidi: note.midi,
    originStartTick: note.startTick,
    grabMidi: g.midi,
    grabTick: g.tick,
    lastMidi: note.midi,
    isNew,
    historyStarted: isNew, // addNote already recorded history
  }
  if (isNew) emit('previewPitch', note.midi)
}

function startGroupMove(
  note: TagRollNote,
  local: { x: number; y: number },
  ids: string[],
): void {
  const g = gridFromLocal(local.x, local.y)
  const origins = new Map<string, { midi: number; startTick: number }>()
  for (const id of ids) {
    const n = props.project.notes.find((x) => x.id === id)
    if (n) origins.set(id, { midi: n.midi, startTick: n.startTick })
  }
  gesture = {
    kind: 'move-group',
    ids: [...origins.keys()],
    origins,
    grabMidi: g.midi,
    grabTick: g.tick,
    lastMidi: note.midi,
    historyStarted: false,
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

  const cursorEdge = hitChordCursorEdge(local.x, local.y, props.chordCursor, {
    rulerH: headerBandH.value,
    cssH: cssH.value,
    scrollX: scrollX.value,
    cellW: cellW.value,
    ticksToPx,
  })
  if (cursorEdge && props.chordCursor) {
    const c = props.chordCursor
    gesture = {
      kind: 'chord-cursor',
      edge: cursorEdge,
      otherTick: cursorEdge === 'start' ? c.endTick : c.startTick,
    }
    return
  }

  if (local.y < rulerH.value) {
    // Ruler: click → playhead + clear range; drag → inspect range select.
    const raw = clampTick(pxToTicks(local.x + scrollX.value, cellW.value))
    const tick = snapTick(raw, props.project.snapTicks)
    gesture = {
      kind: 'chord-range',
      originTick: tick,
      startClientX: e.clientX,
      startClientY: e.clientY,
      moved: false,
    }
    if (props.selectedNoteIds.length) emit('select', null)
    emit('playhead', tick)
    return
  }

  // Body interactions dismiss a ruler inspect range (except edge resize above).
  if (props.chordCursor) emit('chordCursorChange', null)

  // Compose: playhead only via the ruler — ignore body playhead grabs.
  if (mode.value !== 'compose' && hitPlayhead(local.x, local.y)) {
    gesture = {
      kind: 'playhead',
      startClientX: e.clientX,
      startClientY: e.clientY,
      moved: false,
    }
    if (props.selectedNoteIds.length) emit('select', null)
    return
  }

  const m = mode.value
  const hit = hitNote(local.x, local.y)
  // Compose/Lyrics: Shift+drag or Hand tool pans; Ctrl/Cmd adds to selection.
  // View: empty-drag already pans; Shift (or Ctrl/Cmd) adds to selection.
  const additive =
    m === 'view' ? e.shiftKey || e.ctrlKey || e.metaKey : e.ctrlKey || e.metaKey
  const panTool = store.pointerTool === 'pan'

  if ((e.shiftKey || panTool) && (m === 'compose' || m === 'lyrics')) {
    startPan(e, 'none')
    return
  }

  if (m === 'lyrics') {
    if (hit) {
      gesture = {
        kind: 'select-click',
        noteId: hit.id,
        midi: hit.midi,
        startClientX: e.clientX,
        startClientY: e.clientY,
        moved: false,
        additive: false,
      }
      return
    }
    startPan(e, 'playhead')
    return
  }

  if (m === 'view') {
    // Read-only: pan / playhead / audition only — no note selection or edits.
    if (hit) {
      emit('auditionNote', hit.midi)
    }
    startPan(e, local.y <= rulerH.value ? 'playhead' : 'none')
    return
  }

  // compose mode
  if (hit) {
    const resizeEdge = hitResizeEdge(hit, local.x, local.y)
    if (
      resizeEdge &&
      hit.id === primarySelectedId.value &&
      props.selectedNoteIds.length === 1
    ) {
      gesture = {
        kind: 'resize',
        id: hit.id,
        edge: resizeEdge,
        originDuration: hit.durationTicks,
        noteStartTick: hit.startTick,
        startClientX: e.clientX,
        historyStarted: false,
      }
      return
    }
    if (additive) {
      gesture = {
        kind: 'select-click',
        noteId: hit.id,
        midi: hit.midi,
        startClientX: e.clientX,
        startClientY: e.clientY,
        moved: false,
        additive: true,
      }
      return
    }
    if (selectedIdSet.value.has(hit.id) && props.selectedNoteIds.length > 1) {
      startGroupMove(hit, local, props.selectedNoteIds)
      return
    }
    startMoveGesture(e, hit, local, false)
    return
  }

  // Empty grid → marquee (drag) or deselect/place (click).
  marqueePreview = null
  marqueeUi.value = true
  emit('marqueeActive', true)
  gesture = {
    kind: 'marquee',
    startLx: local.x,
    startLy: local.y,
    curLx: local.x,
    curLy: local.y,
    moved: false,
    additive,
  }
}

function onPointerMove(e: PointerEvent): void {
  if (!pointers.has(e.pointerId)) {
    // Hover HUD when not capturing this pointer.
    const local = localPoint(e)
    if (!local || local.y < headerBandH.value) {
      emit('pointerHud', null)
      cursorEdgeHover.value = false
    } else {
      const grid = gridFromLocal(local.x, local.y)
      emit('pointerHud', { tick: grid.tick, midi: grid.midi })
      cursorEdgeHover.value = !!hitChordCursorEdge(local.x, local.y, props.chordCursor, {
        rulerH: headerBandH.value,
        cssH: cssH.value,
        scrollX: scrollX.value,
        cellW: cellW.value,
        ticksToPx,
      })
    }
    return
  }
  pointers.set(e.pointerId, { id: e.pointerId, x: e.clientX, y: e.clientY })

  {
    const local = localPoint(e)
    if (local && local.y >= headerBandH.value) {
      const grid = gridFromLocal(local.x, local.y)
      emit('pointerHud', { tick: grid.tick, midi: grid.midi })
    }
  }

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

  if (gesture.kind === 'playhead') {
    const local = localPoint(e)
    if (!local) return
    const pdx = e.clientX - gesture.startClientX
    const pdy = e.clientY - gesture.startClientY
    if (Math.abs(pdx) + Math.abs(pdy) > DRAG_SLOP) gesture.moved = true
    const tick = clampTick(pxToTicks(local.x + scrollX.value, cellW.value))
    emit('playhead', tick)
    return
  }

  if (gesture.kind === 'chord-range') {
    const local = localPoint(e)
    if (!local) return
    const pdx = e.clientX - gesture.startClientX
    const pdy = e.clientY - gesture.startClientY
    if (Math.abs(pdx) + Math.abs(pdy) <= DRAG_SLOP) return
    gesture.moved = true
    const raw = clampTick(pxToTicks(local.x + scrollX.value, cellW.value))
    const tick = snapTick(raw, props.project.snapTicks)
    const next = rangeFromDragTicks(
      gesture.originTick,
      tick,
      props.project.lengthTicks,
      Math.max(1, props.project.snapTicks),
    )
    emit('chordCursorChange', next)
    return
  }

  if (gesture.kind === 'select-click') {
    const pdx = e.clientX - gesture.startClientX
    const pdy = e.clientY - gesture.startClientY
    if (Math.abs(pdx) + Math.abs(pdy) > DRAG_SLOP) {
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

  if (gesture.kind === 'marquee') {
    const local = localPoint(e)
    if (!local) return
    const pdx = local.x - gesture.startLx
    const pdy = local.y - gesture.startLy
    if (Math.abs(pdx) + Math.abs(pdy) > DRAG_SLOP) gesture.moved = true
    gesture.curLx = local.x
    gesture.curLy = local.y
    marqueePreview = normalizeScreenBox(
      gesture.startLx,
      gesture.startLy,
      gesture.curLx,
      gesture.curLy,
    )
    draw()
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
    if (
      !gesture.historyStarted &&
      (nextMidi !== gesture.originMidi || nextTick !== gesture.originStartTick)
    ) {
      emit('beginGesture')
      gesture.historyStarted = true
    }
    emit('move', { id: gesture.id, midi: nextMidi, startTick: nextTick })
    if (nextMidi !== gesture.lastMidi) {
      gesture.lastMidi = nextMidi
      emit('previewPitch', nextMidi)
    }
    return
  }

  if (gesture.kind === 'move-group') {
    const local = localPoint(e)
    if (!local) return
    const g = gridFromLocal(local.x, local.y)
    const deltaMidi = g.midi - gesture.grabMidi
    const deltaTicks = g.tick - gesture.grabTick
    const snap = props.project.snapTicks
    const updates: Array<{ id: string; midi: number; startTick: number }> = []
    let previewMidi = gesture.lastMidi
    let anyMoved = false
    for (const id of gesture.ids) {
      const origin = gesture.origins.get(id)
      if (!origin) continue
      const nextMidi = Math.max(
        TAG_ROLL_MIDI_MIN,
        Math.min(TAG_ROLL_MIDI_MAX, origin.midi + deltaMidi),
      )
      const nextTick = snapTick(clampTick(origin.startTick + deltaTicks), snap)
      if (nextMidi !== origin.midi || nextTick !== origin.startTick) anyMoved = true
      updates.push({ id, midi: nextMidi, startTick: nextTick })
      if (id === gesture.ids[0]) previewMidi = nextMidi
    }
    if (!anyMoved) return
    if (!gesture.historyStarted) {
      emit('beginGesture')
      gesture.historyStarted = true
    }
    emit('moveGroup', updates)
    if (previewMidi !== gesture.lastMidi) {
      gesture.lastMidi = previewMidi
      emit('previewPitch', previewMidi)
    }
    return
  }

  if (gesture.kind === 'resize') {
    const pdx = e.clientX - gesture.startClientX
    const deltaTicks = pxToTicks(pdx, cellW.value)
    const next = resizeNoteByEdge(
      gesture.edge,
      deltaTicks,
      { startTick: gesture.noteStartTick, durationTicks: gesture.originDuration },
      { snapTicks: props.project.snapTicks, lengthTicks: props.project.lengthTicks },
    )
    if (
      !gesture.historyStarted &&
      (next.durationTicks !== gesture.originDuration ||
        next.startTick !== gesture.noteStartTick)
    ) {
      emit('beginGesture')
      gesture.historyStarted = true
    }
    emit('resize', {
      id: gesture.id,
      startTick: next.startTick,
      durationTicks: next.durationTicks,
    })
  }

  if (gesture.kind === 'chord-cursor') {
    const local = localPoint(e)
    if (!local) return
    const raw = clampTick(pxToTicks(local.x + scrollX.value, cellW.value))
    const tick = snapTick(raw, props.project.snapTicks)
    const next = resizeChordCursor(
      gesture.edge,
      tick,
      gesture.otherTick,
      props.project.lengthTicks,
      Math.max(1, props.project.snapTicks),
    )
    emit('chordCursorChange', next)
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
  emit('previewPitch', null)
  if (!g) return

  if (g.kind === 'playhead') {
    if (!g.moved) {
      const local = localPoint(e)
      if (local) {
        // Click playhead grab without drag: audition column.
        const tick = clampTick(pxToTicks(local.x + scrollX.value, cellW.value))
        emit('auditionColumn', { tick, movePlayhead: true })
      }
    }
    return
  }

  if (g.kind === 'chord-range') {
    if (!g.moved) {
      // Click ruler without drag: clear inspect range + audition.
      emit('chordCursorChange', null)
      emit('auditionColumn', { tick: g.originTick, movePlayhead: true })
    }
    return
  }

  if (g.kind === 'pan') {
    if (!g.moved) {
      const local = localPoint(e)
      if (!local || local.y < headerBandH.value) return
      if (g.onClick === 'deselect') emit('select', null)
      // Body click moves playhead only outside compose (compose uses ruler only).
      if (g.onClick === 'playhead') {
        emit('playhead', gridFromLocal(local.x, local.y).tick)
      }
    }
    return
  }

  if (g.kind === 'select-click') {
    if (!g.moved) {
      emit('select', g.noteId, g.additive ? { additive: true } : undefined)
      emit('auditionNote', g.midi)
    }
    return
  }

  if (g.kind === 'marquee') {
    marqueePreview = null
    marqueeUi.value = false
    emit('marqueeActive', false)
    draw()
    if (!g.moved) {
      const hasSel = props.selectedNoteIds.length > 0
      if (composeEmptyClickAction(hasSel, { forcePlace: g.additive }) === 'deselect') {
        emit('select', null)
        return
      }
      const grid = gridFromLocal(g.startLx, g.startLy)
      const note = store.addNote({
        midi: grid.midi,
        startTick: snapTick(grid.tick, props.project.snapTicks),
      })
      if (note) emit('auditionNote', note.midi)
      return
    }
    const box = normalizeScreenBox(g.startLx, g.startLy, g.curLx, g.curLy)
    const partFilter =
      props.project.view.focusActivePart && props.project.view.activePartId
        ? props.project.view.activePartId
        : null
    const ids = noteIdsInMarquee(props.project.notes, noteRect, box, {
      partId: partFilter,
    })
    emit('selectMany', ids, g.additive ? { additive: true } : undefined)
    return
  }

  if (g.kind === 'move') {
    // Click without drag on existing note → also sound it.
    if (!g.isNew) {
      const note = props.project.notes.find((n) => n.id === g.id)
      if (note && note.midi === g.originMidi && note.startTick === g.originStartTick) {
        emit('auditionNote', note.midi)
      }
    }
  }
}

function onWheel(e: WheelEvent): void {
  e.preventDefault()
  // Shift+wheel: pan pitch. Trackpad horizontal / Alt+wheel: pan time.
  if (e.shiftKey) {
    const next = clampScroll(scrollX.value, scrollY.value + e.deltaY)
    emit('scroll', next.x, next.y)
    return
  }
  if (e.altKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
    const next = clampScroll(scrollX.value + (e.deltaX || e.deltaY), scrollY.value)
    emit('scroll', next.x, next.y)
    return
  }

  // Default wheel: horizontal zoom (cellW), keep tick under cursor stable.
  // Scale by delta magnitude so trackpads don't apply a full 10% step per pixel.
  const rect = canvasRef.value?.getBoundingClientRect()
  const localX = rect ? e.clientX - rect.left : cssW.value / 2
  const tickUnder = pxToTicks(localX + scrollX.value, cellW.value)
  const t = Math.max(-1.25, Math.min(1.25, e.deltaY / 100))
  const factor = Math.exp(-t * 0.028)
  const nextW = clampZoomW(Math.round(cellW.value * factor))
  if (nextW === cellW.value) return
  emit('cellSize', { cellW: nextW, cellH: cellH.value })
  const newScrollX = Math.max(0, ticksToPx(tickUnder, nextW) - localX)
  emit('scroll', newScrollX, scrollY.value)
}

let ro: ResizeObserver | null = null

onMounted(() => {
  resize()
  if (typeof ResizeObserver !== 'undefined' && wrapRef.value) {
    ro = new ResizeObserver(() => resize())
    ro.observe(wrapRef.value)
  }
  window.addEventListener('resize', resize)
  window.addEventListener('keydown', onShiftKey)
  window.addEventListener('keyup', onShiftKey)
  window.addEventListener('blur', clearShiftHeld)
})

onUnmounted(() => {
  ro?.disconnect()
  window.removeEventListener('resize', resize)
  window.removeEventListener('keydown', onShiftKey)
  window.removeEventListener('keyup', onShiftKey)
  window.removeEventListener('blur', clearShiftHeld)
  pointers.clear()
  gesture = null
  emit('previewPitch', null)
})

watch(
  () => [
    props.project.view.scrollX,
    props.project.view.scrollY,
    props.project.view.cellW,
    props.project.view.cellH,
    props.project.view.playheadTick,
    props.project.view.mode,
    props.project.view.focusActivePart,
    props.project.tonality,
    props.project.tonalityMode,
    props.project.keyMarkers,
    props.project.lengthTicks,
    props.project.timeSignature,
    props.project.snapTicks,
    props.project.notes,
    props.project.parts,
    props.project.melodyPasses,
    props.selectedNoteIds,
    props.ghostNotes,
    props.chordCursor,
    cssW.value,
    cssH.value,
  ],
  () => {
    ensureFillWidth()
    draw()
  },
  { flush: 'post', deep: true },
)

defineExpose({ cssH, cssW, resize, draw })
</script>

<template>
  <div
    ref="wrapRef"
    class="viewport"
    :class="{
      compose: project.view.mode === 'compose',
      marquee: marqueeUi,
      'chord-edge': cursorEdgeHover,
      pan:
        (store.pointerTool === 'pan' || shiftHeld) &&
        project.view.mode !== 'view',
    }"
    @wheel="onWheel"
    @pointerleave="onPointerLeave"
  >
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
.viewport.compose {
  cursor: crosshair;
}
.viewport.compose:active {
  cursor: grabbing;
}
.viewport.pan,
.viewport.pan.compose {
  cursor: grab;
}
.viewport.pan:active,
.viewport.pan.compose:active {
  cursor: grabbing;
}
.viewport.marquee {
  cursor: crosshair;
}
.viewport.chord-edge {
  cursor: ew-resize;
}
.viewport:active {
  cursor: grabbing;
}
.viewport.marquee:active {
  cursor: crosshair;
}
.viewport.chord-edge:active {
  cursor: ew-resize;
}
.roll-canvas {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
