<script setup lang="ts">
/**
 * Canvas piano-roll viewport: grid + playhead + pan (Phase 1 — empty notes).
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  TAG_ROLL_MIDI_MAX,
  TAG_ROLL_MIDI_MIN,
  TAG_ROLL_PPQ,
  type TagRollProject,
} from '../../lib/tagRoll/types'
import { midiToY, ticksToPx } from '../../lib/tagRoll/normalize'

const props = defineProps<{
  project: TagRollProject
}>()

const emit = defineEmits<{
  scroll: [scrollX: number, scrollY: number]
  playhead: [tick: number]
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

const gridW = computed(() => ticksToPx(props.project.lengthTicks, cellW.value))
const gridH = computed(
  () => (TAG_ROLL_MIDI_MAX - TAG_ROLL_MIDI_MIN + 1) * cellH.value,
)

let panPtr: number | null = null
let panStartX = 0
let panStartY = 0
let panOriginX = 0
let panOriginY = 0
let moved = false

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

  // Beat / measure vertical lines
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

  // Semitone horizontals + black-key tint
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

  // Notes (Phase 1 may be empty; draw when present)
  for (const n of props.project.notes) {
    const part = props.project.parts.find((p) => p.id === n.partId)
    const x = ox + ticksToPx(n.startTick, cw)
    const w = Math.max(2, ticksToPx(n.durationTicks, cw))
    const y = oy + midiToY(n.midi, ch)
    if (x + w < 0 || x > cssW.value || y + ch < 0 || y > cssH.value) continue
    ctx.fillStyle = part?.color || accent
    ctx.fillRect(x + 1, y + 1, w - 2, ch - 2)
    ctx.strokeStyle = surface
    ctx.strokeRect(x + 1.5, y + 1.5, w - 3, ch - 3)
  }

  // Playhead
  const phX = ox + ticksToPx(props.project.view.playheadTick, cw)
  if (phX >= -2 && phX <= cssW.value + 2) {
    ctx.strokeStyle = accent
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(phX + 0.5, 0)
    ctx.lineTo(phX + 0.5, cssH.value)
    ctx.stroke()
  }
}

function onPointerDown(e: PointerEvent): void {
  if (e.button !== 0) return
  const canvas = canvasRef.value
  if (!canvas) return
  canvas.setPointerCapture(e.pointerId)
  panPtr = e.pointerId
  panStartX = e.clientX
  panStartY = e.clientY
  panOriginX = scrollX.value
  panOriginY = scrollY.value
  moved = false
}

function onPointerMove(e: PointerEvent): void {
  if (panPtr !== e.pointerId) return
  const dx = e.clientX - panStartX
  const dy = e.clientY - panStartY
  if (Math.abs(dx) + Math.abs(dy) > 3) moved = true
  const next = clampScroll(panOriginX - dx, panOriginY - dy)
  emit('scroll', next.x, next.y)
}

function onPointerUp(e: PointerEvent): void {
  if (panPtr !== e.pointerId) return
  panPtr = null
  if (!moved) {
    // Click sets playhead
    const rect = canvasRef.value?.getBoundingClientRect()
    if (rect) {
      const x = e.clientX - rect.left + scrollX.value
      const tick = Math.max(
        0,
        Math.min(
          props.project.lengthTicks,
          Math.round((x / cellW.value) * TAG_ROLL_PPQ),
        ),
      )
      emit('playhead', tick)
    }
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
})

watch(
  () => [
    props.project.view.scrollX,
    props.project.view.scrollY,
    props.project.view.cellW,
    props.project.view.cellH,
    props.project.view.playheadTick,
    props.project.lengthTicks,
    props.project.notes.length,
    props.project.parts.map((p) => p.color).join(','),
    cssW.value,
    cssH.value,
  ],
  () => draw(),
  { flush: 'post' },
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
