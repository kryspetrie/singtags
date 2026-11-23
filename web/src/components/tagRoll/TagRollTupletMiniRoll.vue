<script setup lang="ts">
/**
 * Draft-local tuplet piano roll — same lane/note paint + place/drag/audition
 * feel as TagRollViewport, constrained to equal slots (no free ticks / resize).
 *
 * Intentional differences (called out in the modal lead):
 * - Columns are tuplet slots, not binary time
 * - One pitch per slot (clicking another pitch in a slot moves it)
 * - No duration handles; Delete clears a slot to a rest
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { midiPitchLabel } from '../../lib/tagRoll/keySignature'
import { keyAtTick } from '../../lib/tagRoll/keyMap'
import { paintNoteBoxLabel } from '../../lib/tagRoll/noteBoxLabel'
import { fillNoteColorBands } from '../../lib/tagRoll/overlapNotePaint'
import { pianoRollLaneColor } from '../../lib/tagRoll/pianoRollLanes'
import { midiInScale } from '../../lib/tagRoll/scaleHighlight'
import { tupletBadgeLabel } from '../../lib/tagRoll/tupletChrome'
import {
  buildTupletMiniLayout,
  midiAtY,
  moveSlotBetweenColumns,
  scrollYToCenterMidi,
  slotIndexAtX,
  slotRect,
  tupletMiniMidiRange,
  type TupletMiniLayout,
} from '../../lib/tagRoll/tupletMiniRoll'
import type { TupletEditorDraft, TupletEditorSlot } from '../../lib/tagRoll/tupletEditor'
import type { TagRollProject } from '../../lib/tagRoll/types'

const props = defineProps<{
  draft: TupletEditorDraft
  project: TagRollProject
  selectedSlot: number
}>()

const emit = defineEmits<{
  'update:slots': [slots: TupletEditorSlot[]]
  'update:selectedSlot': [index: number]
  auditionNote: [midi: number]
  previewPitch: [midi: number | null]
}>()

const rootRef = ref<HTMLElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const cssW = ref(320)
const cssH = ref(280)
const scrollY = ref(0)
const dpr = ref(1)
const hoverCursor = ref<'crosshair' | 'grab' | 'grabbing'>('crosshair')

/** Match TagRollViewport drag slop. */
const DRAG_SLOP = 6

type Gesture = {
  kind: 'move'
  pointerId: number
  slotIndex: number
  originMidi: number
  curMidi: number
  startClientX: number
  startClientY: number
  moved: boolean
  /** True when this gesture created/replaced the pitch on pointer down. */
  isNew: boolean
}

let gesture: Gesture | null = null
/** Working slot list during a drag (avoids stale props between frames). */
let gestureSlots: TupletEditorSlot[] | null = null
let raf = 0

const midiRange = computed(() =>
  tupletMiniMidiRange(props.draft.slots.map((s) => s.midi)),
)

const layout = computed((): TupletMiniLayout =>
  buildTupletMiniLayout({
    slotCount: props.draft.actualNotes,
    width: cssW.value,
    midiMin: midiRange.value.midiMin,
    midiMax: midiRange.value.midiMax,
  }),
)

const partColor = computed(() => {
  const part = props.project.parts.find((p) => p.id === props.draft.partId)
  return part?.color || cssVar('--accent', '#3d6bb3')
})

const allSlotsEmpty = computed(() => props.draft.slots.every((s) => s.midi == null))

function cssVar(name: string, fallback: string): string {
  const el = rootRef.value
  if (!el) return fallback
  return getComputedStyle(el).getPropertyValue(name).trim() || fallback
}

function clampScroll(y: number): number {
  const max = Math.max(0, layout.value.bodyH - Math.max(0, cssH.value - layout.value.headerH))
  return Math.max(0, Math.min(max, y))
}

function scheduleDraw(): void {
  if (raf) return
  raf = requestAnimationFrame(() => {
    raf = 0
    draw()
  })
}

function resize(): void {
  const root = rootRef.value
  const canvas = canvasRef.value
  if (!root || !canvas) return
  const rect = root.getBoundingClientRect()
  cssW.value = Math.max(120, Math.floor(rect.width))
  cssH.value = Math.max(160, Math.floor(rect.height))
  dpr.value = Math.min(2.5, window.devicePixelRatio || 1)
  canvas.width = Math.floor(cssW.value * dpr.value)
  canvas.height = Math.floor(cssH.value * dpr.value)
  canvas.style.width = `${cssW.value}px`
  canvas.style.height = `${cssH.value}px`
  scrollY.value = clampScroll(scrollY.value)
  scheduleDraw()
}

function centerOnDraft(): void {
  const midis = props.draft.slots.map((s) => s.midi).filter((m): m is number => m != null)
  const target = midis.length
    ? Math.round(midis.reduce((a, b) => a + b, 0) / midis.length)
    : 60
  const bodyH = Math.max(1, cssH.value - layout.value.headerH)
  scrollY.value = scrollYToCenterMidi(layout.value, target, bodyH)
}

function localPoint(e: PointerEvent): { x: number; y: number } | null {
  const canvas = canvasRef.value
  if (!canvas) return null
  const r = canvas.getBoundingClientRect()
  return { x: e.clientX - r.left, y: e.clientY - r.top }
}

function setSlots(next: TupletEditorSlot[]): void {
  emit('update:slots', next)
}

function selectSlot(i: number): void {
  emit('update:selectedSlot', i)
}

/** True when pointer is over the sounding note blob in that column. */
function hitNoteInSlot(slotIndex: number, midi: number): boolean {
  const existing = props.draft.slots[slotIndex]?.midi
  return existing != null && existing === midi
}

function updateHoverCursor(local: { x: number; y: number } | null): void {
  if (gesture) {
    hoverCursor.value = 'grabbing'
    return
  }
  if (!local || local.y < layout.value.headerH) {
    hoverCursor.value = 'crosshair'
    return
  }
  const slot = slotIndexAtX(layout.value, local.x)
  const midi = midiAtY(layout.value, local.y, scrollY.value)
  if (slot != null && midi != null && hitNoteInSlot(slot, midi)) {
    hoverCursor.value = 'grab'
    return
  }
  hoverCursor.value = 'crosshair'
}

function draw(): void {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const L = layout.value
  const w = cssW.value
  const h = cssH.value
  const sy = scrollY.value

  ctx.setTransform(dpr.value, 0, 0, dpr.value, 0, 0)
  ctx.clearRect(0, 0, w, h)

  const bg = cssVar('--bg', '#f6f4ef')
  const surface = cssVar('--surface', '#fff')
  const border = cssVar('--border', '#cfc8bc')
  const muted = cssVar('--muted', '#6b6560')
  const text = cssVar('--text', '#1a1a1a')
  const accent = cssVar('--accent', '#3d6bb3')
  const color = partColor.value

  const keyFallback = {
    tonality: props.project.tonality ?? 0,
    tonalityMode: (props.project.tonalityMode ?? 'major') as 'major' | 'minor',
    preferFlats: props.project.preferFlats,
  }
  const scaleKey = keyAtTick(props.draft.startTick, props.project.keyMarkers, keyFallback)
  const scaleOn = props.project.view.scaleHighlight !== false

  // Body background
  ctx.fillStyle = bg
  ctx.fillRect(0, L.headerH, w, Math.max(0, h - L.headerH))

  // Pitch lanes (same helper as main roll)
  for (let m = L.midiMin; m <= L.midiMax; m++) {
    const r = slotRect(L, 0, m, sy)
    if (r.y + r.h < L.headerH || r.y > h) continue
    const pc = ((m % 12) + 12) % 12
    const isBlack = pc === 1 || pc === 3 || pc === 6 || pc === 8 || pc === 10
    const lane = pianoRollLaneColor({
      background: bg,
      accent,
      isBlack,
      inScale: scaleOn && midiInScale(m, scaleKey.tonality, scaleKey.tonalityMode),
    })
    if (lane) {
      ctx.fillStyle = lane
      ctx.fillRect(0, r.y, w, r.h)
    }
  }

  // Tuplet band chrome (same dashed language as main-roll containers)
  {
    const bandX = L.gutterW
    const bandW = L.slotCount * L.slotW
    const bandY = L.headerH
    const bandH = Math.max(0, h - L.headerH)
    ctx.save()
    ctx.globalAlpha = 0.14
    ctx.fillStyle = color
    ctx.fillRect(bandX, bandY, bandW, bandH)
    ctx.globalAlpha = 0.7
    ctx.strokeStyle = color
    ctx.lineWidth = 1.5
    ctx.setLineDash([4, 3])
    ctx.strokeRect(bandX + 0.5, bandY + 0.5, Math.max(0, bandW - 1), Math.max(0, bandH - 1))
    ctx.setLineDash([])
    ctx.globalAlpha = 0.9
    ctx.font = '700 11px system-ui, sans-serif'
    ctx.fillStyle = color
    ctx.textBaseline = 'top'
    ctx.fillText(
      tupletBadgeLabel({
        actualNotes: props.draft.actualNotes,
        normalNotes: props.draft.normalNotes,
      }),
      bandX + 4,
      bandY + 4,
    )
    ctx.restore()
  }

  // Slot column lines
  for (let i = 0; i <= L.slotCount; i++) {
    const x = L.gutterW + i * L.slotW
    ctx.strokeStyle = i === 0 || i === L.slotCount ? text : muted
    ctx.globalAlpha = i === 0 || i === L.slotCount ? 0.45 : 0.28
    ctx.lineWidth = i === 0 || i === L.slotCount ? 1.5 : 1
    ctx.beginPath()
    ctx.moveTo(x + 0.5, L.headerH)
    ctx.lineTo(x + 0.5, h)
    ctx.stroke()
    ctx.globalAlpha = 1
  }

  // Row lines
  for (let m = L.midiMin; m <= L.midiMax; m++) {
    const r = slotRect(L, 0, m, sy)
    if (r.y + r.h < L.headerH || r.y > h) continue
    ctx.strokeStyle = border
    ctx.globalAlpha = 0.55
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(L.gutterW, r.y + r.h + 0.5)
    ctx.lineTo(w, r.y + r.h + 0.5)
    ctx.stroke()
    ctx.globalAlpha = 1
  }

  // Selected column tint
  if (props.selectedSlot >= 0 && props.selectedSlot < L.slotCount) {
    const x = L.gutterW + props.selectedSlot * L.slotW
    ctx.fillStyle = accent
    ctx.globalAlpha = 0.07
    ctx.fillRect(x, L.headerH, L.slotW, Math.max(0, h - L.headerH))
    ctx.globalAlpha = 1
  }

  // Notes (gesture preview pitch applied)
  const displaySlots = props.draft.slots.map((s, i) => {
    if (gesture?.kind === 'move' && gesture.slotIndex === i) {
      return { ...s, midi: gesture.curMidi }
    }
    return s
  })

  for (let i = 0; i < displaySlots.length; i++) {
    const slot = displaySlots[i]!
    if (slot.midi == null) continue
    const r = slotRect(L, i, slot.midi, sy)
    if (r.y + r.h < L.headerH - 2 || r.y > h + 2) continue
    // Match main-roll tuplet member dimming slightly so band chrome owns the story.
    ctx.globalAlpha = 0.92
    fillNoteColorBands(ctx, {
      x: r.x + 1,
      y: r.y + 1,
      w: r.w - 2,
      h: r.h - 2,
      colors: [color],
    })
    ctx.strokeStyle = surface
    ctx.lineWidth = 1
    ctx.strokeRect(r.x + 1.5, r.y + 1.5, r.w - 3, r.h - 3)
    ctx.globalAlpha = 1
    paintNoteBoxLabel(ctx, {
      midi: slot.midi,
      startTick: props.draft.startTick,
      lyric: slot.lyric,
      x: r.x,
      y: r.y,
      w: r.w,
      h: r.h,
      fillStyle: surface,
      keyMarkers: props.project.keyMarkers,
      keyFallback,
      showNoteName: props.project.view.showNoteNames !== false,
      showNoteLyric: props.project.view.showNoteLyrics !== false,
    })
    if (props.selectedSlot === i) {
      ctx.strokeStyle = accent
      ctx.lineWidth = 2
      ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1)
    }
  }

  // Header (slot numbers — like a mini ruler for equal divisions)
  ctx.fillStyle = surface
  ctx.fillRect(0, 0, w, L.headerH)
  ctx.strokeStyle = border
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(0, L.headerH + 0.5)
  ctx.lineTo(w, L.headerH + 0.5)
  ctx.stroke()

  ctx.font = '650 11px system-ui, sans-serif'
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'center'
  for (let i = 0; i < L.slotCount; i++) {
    const x = L.gutterW + i * L.slotW + L.slotW / 2
    ctx.fillStyle = props.selectedSlot === i ? text : muted
    ctx.fillText(String(i + 1), x, L.headerH / 2)
  }

  // Gutter pitch labels (C notes) — modal has no tote keyboard
  ctx.textAlign = 'right'
  ctx.font = '650 10px system-ui, sans-serif'
  for (let m = L.midiMin; m <= L.midiMax; m++) {
    const pc = ((m % 12) + 12) % 12
    if (pc !== 0) continue
    const r = slotRect(L, 0, m, sy)
    if (r.y + r.h < L.headerH || r.y > h) continue
    ctx.fillStyle = muted
    ctx.fillText(midiPitchLabel(m, scaleKey.preferFlats), L.gutterW - 4, r.y + r.h / 2)
  }

  ctx.strokeStyle = border
  ctx.beginPath()
  ctx.moveTo(L.gutterW + 0.5, 0)
  ctx.lineTo(L.gutterW + 0.5, h)
  ctx.stroke()
}

function beginMove(
  e: PointerEvent,
  slotIndex: number,
  midi: number,
  isNew: boolean,
  slots: TupletEditorSlot[],
): void {
  selectSlot(slotIndex)
  gestureSlots = slots
  gesture = {
    kind: 'move',
    pointerId: e.pointerId,
    slotIndex,
    originMidi: midi,
    curMidi: midi,
    startClientX: e.clientX,
    startClientY: e.clientY,
    moved: false,
    isNew,
  }
  hoverCursor.value = 'grabbing'
  scheduleDraw()
}

function onPointerDown(e: PointerEvent): void {
  if (e.button !== 0) return
  const local = localPoint(e)
  if (!local) return
  const L = layout.value
  if (local.y < L.headerH) {
    const slot = slotIndexAtX(L, local.x)
    if (slot != null) selectSlot(slot)
    return
  }
  const slot = slotIndexAtX(L, local.x)
  const midi = midiAtY(L, local.y, scrollY.value)
  if (slot == null || midi == null) return

  canvasRef.value?.setPointerCapture(e.pointerId)

  // Grab existing note blob — select + drag; audition on click-up if unmoved.
  if (hitNoteInSlot(slot, midi)) {
    beginMove(e, slot, midi, false, props.draft.slots.slice())
    return
  }

  // Empty / other pitch in this slot → place/replace (no deselect-first).
  const slots = props.draft.slots.map((s, i) =>
    i === slot ? { ...s, midi } : s,
  )
  setSlots(slots)
  emit('auditionNote', midi)
  beginMove(e, slot, midi, true, slots)
}

function onPointerMove(e: PointerEvent): void {
  if (!gesture || gesture.pointerId !== e.pointerId) {
    updateHoverCursor(localPoint(e))
    return
  }
  const local = localPoint(e)
  if (!local) return
  const dy = Math.abs(e.clientY - gesture.startClientY)
  const dx = Math.abs(e.clientX - gesture.startClientX)
  if (dx + dy > DRAG_SLOP) gesture.moved = true

  let slots = gestureSlots ?? props.draft.slots.slice()
  let dirty = false

  const nextSlot = slotIndexAtX(layout.value, local.x)
  if (nextSlot != null && nextSlot !== gesture.slotIndex) {
    slots = moveSlotBetweenColumns(slots, gesture.slotIndex, nextSlot)
    gesture.slotIndex = nextSlot
    selectSlot(nextSlot)
    dirty = true
  }

  const midi = midiAtY(layout.value, local.y, scrollY.value)
  if (midi != null && midi !== gesture.curMidi) {
    gesture.curMidi = midi
    slots = slots.map((s, i) =>
      i === gesture!.slotIndex ? { ...s, midi } : s,
    )
    emit('previewPitch', midi)
    dirty = true
  }

  if (dirty) {
    gestureSlots = slots
    setSlots(slots)
  }
  scheduleDraw()
}

function onPointerUp(e: PointerEvent): void {
  if (!gesture || gesture.pointerId !== e.pointerId) return
  const g = gesture
  gesture = null
  gestureSlots = null
  try {
    canvasRef.value?.releasePointerCapture(e.pointerId)
  } catch {
    /* ignore */
  }

  emit('previewPitch', null)
  // Click without drag on existing note → short audition (main-roll parity).
  if (!g.moved && !g.isNew) {
    emit('auditionNote', g.originMidi)
  }
  updateHoverCursor(localPoint(e))
  scheduleDraw()
}

function clearSelectedSlot(): void {
  const i = props.selectedSlot
  if (i < 0 || i >= props.draft.slots.length) return
  if (props.draft.slots[i]?.midi == null) return
  setSlots(props.draft.slots.map((s, idx) => (idx === i ? { ...s, midi: null } : s)))
  emit('previewPitch', null)
  scheduleDraw()
}

function nudgeSelected(deltaMidi: number): void {
  const i = props.selectedSlot
  if (i < 0 || i >= props.draft.slots.length) return
  const cur = props.draft.slots[i]?.midi
  if (cur == null) return
  const L = layout.value
  const next = Math.max(L.midiMin, Math.min(L.midiMax, cur + deltaMidi))
  if (next === cur) return
  setSlots(props.draft.slots.map((s, idx) => (idx === i ? { ...s, midi: next } : s)))
  emit('auditionNote', next)
  scheduleDraw()
}

function onKeyDown(e: KeyboardEvent): void {
  const t = e.target as HTMLElement | null
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return

  if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault()
    e.stopPropagation()
    clearSelectedSlot()
    return
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault()
    e.stopPropagation()
    nudgeSelected(1)
    return
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    e.stopPropagation()
    nudgeSelected(-1)
    return
  }
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    e.preventDefault()
    e.stopPropagation()
    const dir = e.key === 'ArrowLeft' ? -1 : 1
    const next = Math.max(0, Math.min(props.draft.actualNotes - 1, props.selectedSlot + dir))
    selectSlot(next)
    const midi = props.draft.slots[next]?.midi
    if (midi != null) emit('auditionNote', midi)
    scheduleDraw()
  }
}

function onWheel(e: WheelEvent): void {
  e.preventDefault()
  // Pitch-only plane: wheel pans rows (Shift optional, same direction).
  scrollY.value = clampScroll(scrollY.value + e.deltaY)
  scheduleDraw()
}

let ro: ResizeObserver | null = null

onMounted(() => {
  resize()
  centerOnDraft()
  scheduleDraw()
  ro = new ResizeObserver(() => resize())
  if (rootRef.value) ro.observe(rootRef.value)
  window.addEventListener('keydown', onKeyDown, true)
  // Focus so Delete / arrows work without an extra click.
  rootRef.value?.focus({ preventScroll: true })
})

onUnmounted(() => {
  ro?.disconnect()
  if (raf) cancelAnimationFrame(raf)
  window.removeEventListener('keydown', onKeyDown, true)
  emit('previewPitch', null)
})

watch(
  () => [props.draft.slots, props.draft.actualNotes, props.selectedSlot] as const,
  () => scheduleDraw(),
  { deep: true },
)

watch(
  () => props.draft.actualNotes,
  async () => {
    await nextTick()
    resize()
    centerOnDraft()
  },
)

defineExpose({ clearSelectedSlot, centerOnDraft })
</script>

<template>
  <div
    ref="rootRef"
    class="mini-roll"
    tabindex="0"
    role="application"
    aria-label="Tuplet piano roll"
    :style="{ cursor: hoverCursor }"
    @wheel="onWheel"
  >
    <canvas
      ref="canvasRef"
      class="mini-canvas"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
    />
    <p v-if="allSlotsEmpty" class="empty-hint" aria-live="polite">
      Click a column to place a pitch
    </p>
  </div>
</template>

<style scoped>
.mini-roll {
  position: relative;
  flex: 1 1 auto;
  min-height: 14rem;
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
  background: var(--bg, var(--surface));
  outline: none;
}
.mini-roll:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.mini-canvas {
  display: block;
  width: 100%;
  height: 100%;
  touch-action: none;
  cursor: inherit;
}
.empty-hint {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  margin: 0;
  padding: 0.45rem 0.7rem;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: color-mix(in srgb, var(--surface) 92%, transparent);
  color: var(--muted);
  font-size: 0.88rem;
  font-weight: 600;
  pointer-events: none;
  text-align: center;
  max-width: calc(100% - 2rem);
}
</style>
