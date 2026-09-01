<script setup lang="ts">
/**
 * Canvas waveform with playhead, A–B loop brackets, and pointer seek/drag handling.
 */
import { onMounted, onUnmounted, ref, watch } from 'vue'
import {
  barCountFor,
  BRACKET_ARM,
  BRACKET_GRIP_W,
  BRACKET_LINE_W,
  BRACKET_STEM_W,
  bracketHitX,
  clampMarkA,
  clampMarkB,
  clampTime,
  loopEdgeFromPointerX,
  timeToX,
  waveformLayout,
  xToTime,
  type WaveformLayout,
  bracketCenterX,
} from '../lib/waveformLayout'

const props = withDefaults(
  defineProps<{
    peaks: number[]
    currentTime: number
    duration: number
    markA: number
    markB: number
    interactive?: boolean
    /** Fill parent height (fullscreen / landscape player). */
    fillContainer?: boolean
  }>(),
  {
    peaks: () => [],
    markA: 0,
    markB: 0,
    interactive: true,
    fillContainer: false,
  },
)

const emit = defineEmits<{
  seek: [number]
  'update:markA': [number]
  'update:markB': [number]
}>()

const CURSOR_HIT = 22
const BRACKET_HIT = 30
const DRAG_SLOP = 6

const canvasRef = ref<HTMLCanvasElement | null>(null)
const wrapRef = ref<HTMLElement | null>(null)

type DragKind = 'cursor' | 'a' | 'b' | null
const drag = ref<DragKind>(null)
const pending = ref<DragKind>(null)
const downX = ref(0)
const dragging = ref(false)

function cssVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}

function readLayout(): WaveformLayout | null {
  const wrap = wrapRef.value
  if (!wrap) return null
  return waveformLayout(wrap.clientWidth, wrap.clientHeight)
}

function xAt(lay: WaveformLayout, t: number): number {
  return timeToX(t, props.duration, lay.gutterPad, lay.trackInner)
}

function timeAt(lay: WaveformLayout, x: number): number {
  return xToTime(x, props.duration, lay.gutterPad, lay.trackInner)
}

function clientXLocal(clientX: number): number {
  const wrap = wrapRef.value
  if (!wrap) return 0
  return clientX - wrap.getBoundingClientRect().left
}

function draw(): void {
  const canvas = canvasRef.value
  const lay = readLayout()
  if (!canvas || !lay) return
  const { w, h, gutterPad, trackInner } = lay
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  canvas.width = Math.floor(w * dpr)
  canvas.height = Math.floor(h * dpr)
  canvas.style.width = `${w}px`
  canvas.style.height = `${h}px`
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

  const inactive = cssVar('--border', '#d0cbc3')
  const played = cssVar('--accent', '#0f6b5c')
  const bracketCol = cssVar('--accent', '#0f6b5c')
  const gutter = cssVar('--bg', '#f3f1ec')

  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = cssVar('--surface', '#fff')
  ctx.fillRect(0, 0, w, h)

  // Cream gutters — brackets live here; waveform stays between the borders.
  ctx.fillStyle = gutter
  ctx.fillRect(0, 0, gutterPad, h)
  ctx.fillRect(w - gutterPad, 0, gutterPad, h)
  ctx.strokeStyle = inactive
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(gutterPad, 0)
  ctx.lineTo(gutterPad, h)
  ctx.moveTo(w - gutterPad, 0)
  ctx.lineTo(w - gutterPad, h)
  ctx.stroke()

  const peaks = props.peaks
  const hasRegion = props.duration > 0 && props.markB > props.markA
  const xLoopA = props.duration > 0 ? xAt(lay, props.markA) : gutterPad
  const xLoopB = props.duration > 0 ? xAt(lay, props.markB) : w - gutterPad

  if (peaks.length && hasRegion) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.42)'
    ctx.fillRect(xLoopA, 0, Math.max(0, xLoopB - xLoopA), h)
  }

  if (peaks.length) {
    const barCount = barCountFor(peaks.length, trackInner)
    const step = peaks.length / barCount
    const barW = trackInner / barCount

    for (let i = 0; i < barCount; i++) {
      const idx = Math.min(peaks.length - 1, Math.floor(i * step))
      const amp = peaks[idx] ?? 0.2
      const bh = Math.max(2, amp * h * 0.78)
      const x = gutterPad + i * barW
      const y = (h - bh) / 2
      const mid = (i + 0.5) / barCount
      const t = props.duration > 0 ? mid * props.duration : 0
      const on = hasRegion
        ? t >= props.markA && t <= props.markB && t <= props.currentTime
        : props.duration > 0 && mid <= props.currentTime / props.duration
      ctx.fillStyle = on ? played : inactive
      const gap = Math.max(0.4, barW * 0.2)
      const rw = Math.max(1, barW - gap)
      const r = Math.min(2, rw / 2)
      ctx.beginPath()
      ctx.roundRect(x + gap / 2, y, rw, bh, r)
      ctx.fill()
    }
  }

  if (props.duration > 0 && peaks.length) {
    drawBracket(ctx, xLoopA, h, 'left', bracketCol)
    drawBracket(ctx, xLoopB, h, 'right', bracketCol)

    const px = xAt(lay, props.currentTime)
    const top = 4
    const bot = h - 4
    const stem = 3
    const cap = 10

    ctx.strokeStyle = 'rgba(255,255,255,0.9)'
    ctx.lineWidth = stem + 4
    ctx.lineCap = 'butt'
    ctx.beginPath()
    ctx.moveTo(px, top)
    ctx.lineTo(px, bot)
    ctx.stroke()
    ctx.lineWidth = 5
    ctx.beginPath()
    ctx.moveTo(px - cap / 2, top)
    ctx.lineTo(px + cap / 2, top)
    ctx.moveTo(px - cap / 2, bot)
    ctx.lineTo(px + cap / 2, bot)
    ctx.stroke()

    ctx.strokeStyle = '#1a1a1a'
    ctx.lineWidth = stem
    ctx.beginPath()
    ctx.moveTo(px, top)
    ctx.lineTo(px, bot)
    ctx.stroke()
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(px - cap / 2, top)
    ctx.lineTo(px + cap / 2, top)
    ctx.moveTo(px - cap / 2, bot)
    ctx.lineTo(px + cap / 2, bot)
    ctx.stroke()
  }
}

/**
 * `x` is the loop edge = inner face of this bracket’s full bounding box
 * (right edge of left bracket, left edge of right bracket).
 * Green region / progress start on that same X.
 */
function drawBracket(
  ctx: CanvasRenderingContext2D,
  x: number,
  h: number,
  side: 'left' | 'right',
  color: string,
): void {
  const gripW = BRACKET_GRIP_W
  const stemW = BRACKET_STEM_W
  const arm = BRACKET_ARM
  const lineW = BRACKET_LINE_W
  const top = 6
  const bot = h - 6
  const gy = h * 0.3
  const gh = h * 0.4
  const cx = bracketCenterX(x, side)

  ctx.fillStyle = color
  ctx.fillRect(cx - stemW / 2, top, stemW, bot - top)

  // Continuous inward L with round joins (original silhouette, no broken corners).
  ctx.strokeStyle = color
  ctx.lineWidth = lineW
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  if (side === 'left') {
    ctx.moveTo(cx + arm, top)
    ctx.lineTo(cx, top)
    ctx.lineTo(cx, bot)
    ctx.lineTo(cx + arm, bot)
  } else {
    ctx.moveTo(cx - arm, top)
    ctx.lineTo(cx, top)
    ctx.lineTo(cx, bot)
    ctx.lineTo(cx - arm, bot)
  }
  ctx.stroke()

  ctx.fillStyle = color
  ctx.beginPath()
  ctx.roundRect(cx - gripW / 2, gy, gripW, gh, 5)
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'
  ctx.lineWidth = 1.5
  ctx.lineCap = 'butt'
  for (const dx of [-3, 0, 3]) {
    ctx.beginPath()
    ctx.moveTo(cx + dx, gy + 8)
    ctx.lineTo(cx + dx, gy + gh - 8)
    ctx.stroke()
  }
}

function hitTest(clientX: number, lay: WaveformLayout): DragKind | 'seek' {
  if (props.duration <= 0) return 'seek'
  const x = clientXLocal(clientX)
  const xA = bracketHitX(xAt(lay, props.markA), 'left')
  const xB = bracketHitX(xAt(lay, props.markB), 'right')
  const nearA = Math.abs(x - xA) < BRACKET_HIT
  const nearB = Math.abs(x - xB) < BRACKET_HIT
  const nearCursor = Math.abs(x - xAt(lay, props.currentTime)) < CURSOR_HIT

  // Brackets win over playhead so loop handles stay draggable when stacked.
  if (nearA && nearB) {
    const mid = (xA + xB) / 2
    return x <= mid ? 'a' : 'b'
  }
  if (nearA) return 'a'
  if (nearB) return 'b'
  if (nearCursor) return 'cursor'
  return 'seek'
}

function onPointerDown(e: PointerEvent): void {
  if (!props.interactive) return
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  downX.value = e.clientX
  dragging.value = false
  const lay = readLayout()
  if (!lay) return
  const hit = hitTest(e.clientX, lay)

  if (hit === 'seek') {
    emit('seek', timeAt(lay, clientXLocal(e.clientX)))
    pending.value = 'cursor'
    drag.value = 'cursor'
    dragging.value = true
    return
  }

  pending.value = hit
  drag.value = hit === 'a' || hit === 'b' ? hit : null
}

function onPointerMove(e: PointerEvent): void {
  if (!props.interactive) return
  const lay = readLayout()
  if (!lay) return
  if (!dragging.value && Math.abs(e.clientX - downX.value) > DRAG_SLOP) {
    dragging.value = true
    if (pending.value === 'cursor') drag.value = 'cursor'
    else if (pending.value && !drag.value) drag.value = pending.value
  }
  if (!drag.value) return
  const x = clientXLocal(e.clientX)
  if (drag.value === 'cursor') emit('seek', timeAt(lay, x))
  else if (drag.value === 'a') {
    const newA = clampMarkA(
      timeAt(lay, loopEdgeFromPointerX(x, 'left')),
      props.markB,
      props.duration,
    )
    emit('update:markA', newA)
    // Inner bbox edge of left bracket pushes the playhead when dragged over it.
    if (newA > props.currentTime) emit('seek', newA)
  } else if (drag.value === 'b') {
    const newB = clampMarkB(
      timeAt(lay, loopEdgeFromPointerX(x, 'right')),
      props.markA,
      props.duration,
    )
    emit('update:markB', newB)
    // Inner bbox edge of right bracket pushes the playhead when dragged over it.
    if (newB < props.currentTime) emit('seek', newB)
  }
}

function onPointerUp(): void {
  drag.value = null
  pending.value = null
  dragging.value = false
}

function onKey(e: KeyboardEvent): void {
  if (!props.interactive || props.duration <= 0) return
  const step = e.shiftKey ? 5 : 1
  const t = props.currentTime
  if (e.key === 'ArrowLeft') {
    e.preventDefault()
    emit('seek', clampTime(t - step, props.duration))
  } else if (e.key === 'ArrowRight') {
    e.preventDefault()
    emit('seek', clampTime(t + step, props.duration))
  } else if (e.key === 'Home') {
    e.preventDefault()
    emit('seek', props.markA)
  } else if (e.key === 'End') {
    e.preventDefault()
    emit('seek', Math.max(0, props.markB - 0.05))
  }
}

function onResize(): void {
  draw()
}

watch(
  () => [props.peaks, props.currentTime, props.duration, props.markA, props.markB],
  () => draw(),
  { deep: true },
)

let resizeObs: ResizeObserver | null = null

onMounted(() => {
  draw()
  window.addEventListener('resize', onResize)
  if (typeof ResizeObserver !== 'undefined' && wrapRef.value) {
    resizeObs = new ResizeObserver(() => draw())
    resizeObs.observe(wrapRef.value)
  }
})
onUnmounted(() => {
  window.removeEventListener('resize', onResize)
  resizeObs?.disconnect()
  resizeObs = null
})
</script>

<template>
  <div
    ref="wrapRef"
    class="wave"
    :class="{ inert: !interactive, fill: fillContainer }"
    role="slider"
    :aria-valuemin="0"
    :aria-valuemax="duration || 0"
    :aria-valuenow="currentTime"
    :aria-disabled="!interactive"
    aria-label="Waveform: drag to scrub, or drag loop brackets"
    :tabindex="interactive ? 0 : -1"
    @pointerdown.prevent="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
    @keydown="onKey"
  >
    <canvas ref="canvasRef" />
  </div>
</template>

<style scoped>
.wave {
  position: relative;
  width: 100%;
  height: 104px;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid var(--border);
  background: var(--surface);
  touch-action: none;
  cursor: pointer;
  -webkit-user-select: none;
  user-select: none;
}
.wave.inert {
  opacity: 0.45;
  cursor: not-allowed;
  pointer-events: none;
}
.wave:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
canvas {
  display: block;
  width: 100%;
  height: 100%;
}
.wave.fill {
  height: 100%;
  min-height: 6rem;
}
@media (min-width: 720px) {
  .wave {
    height: 128px;
  }
  .wave.fill {
    height: 100%;
  }
}
</style>
