<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    peaks: number[]
    currentTime: number
    duration: number
    /** Loop region start (seconds). */
    markA: number
    /** Loop region end (seconds). */
    markB: number
    /** When false, scrubbing and bracket drag are disabled. */
    interactive?: boolean
  }>(),
  {
    peaks: () => [],
    markA: 0,
    markB: 0,
    interactive: true,
  },
)

const emit = defineEmits<{
  seek: [number]
  'update:markA': [number]
  'update:markB': [number]
}>()

/**
 * Track (waveform + playhead) is inset.
 * Brackets use a wider span so defaults sit in the gutters — visually before
 * the track start and after the track end — keeping the playhead easy to grab.
 */
const TRACK_PAD = 42
const BRACKET_INSET = 10
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

function clampTime(t: number): number {
  if (props.duration <= 0) return 0
  return Math.min(props.duration, Math.max(0, t))
}

function layout(): { w: number; h: number; trackInner: number; bracketInner: number } | null {
  const wrap = wrapRef.value
  if (!wrap) return null
  const w = wrap.clientWidth
  const h = wrap.clientHeight
  if (w < 2 || h < 2) return null
  return {
    w,
    h,
    trackInner: Math.max(1, w - TRACK_PAD * 2),
    bracketInner: Math.max(1, w - BRACKET_INSET * 2),
  }
}

/** Playhead / waveform X for a time. */
function xTrack(t: number, w: number, trackInner: number): number {
  if (props.duration <= 0) return TRACK_PAD
  return TRACK_PAD + (clampTime(t) / props.duration) * trackInner
}

/** Loop bracket X — spans into gutters outside the track. */
function xBracket(t: number, w: number, bracketInner: number): number {
  if (props.duration <= 0) return BRACKET_INSET
  return BRACKET_INSET + (clampTime(t) / props.duration) * bracketInner
}

function clientXLocal(clientX: number): number {
  const wrap = wrapRef.value
  if (!wrap) return 0
  return clientX - wrap.getBoundingClientRect().left
}

function timeFromTrackX(x: number, trackInner: number): number {
  if (props.duration <= 0) return 0
  return clampTime(((x - TRACK_PAD) / trackInner) * props.duration)
}

function timeFromBracketX(x: number, bracketInner: number): number {
  if (props.duration <= 0) return 0
  return clampTime(((x - BRACKET_INSET) / bracketInner) * props.duration)
}

function draw(): void {
  const canvas = canvasRef.value
  const lay = layout()
  if (!canvas || !lay) return
  const { w, h, trackInner, bracketInner } = lay
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

  // Gutters outside the track (where default brackets live)
  ctx.fillStyle = gutter
  ctx.fillRect(0, 0, TRACK_PAD, h)
  ctx.fillRect(w - TRACK_PAD, 0, TRACK_PAD, h)
  ctx.strokeStyle = inactive
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(TRACK_PAD, 0)
  ctx.lineTo(TRACK_PAD, h)
  ctx.moveTo(w - TRACK_PAD, 0)
  ctx.lineTo(w - TRACK_PAD, h)
  ctx.stroke()

  const peaks = props.peaks
  if (peaks.length) {
    const barCount = Math.min(peaks.length, Math.max(40, Math.floor(trackInner / 2.5)))
    const step = peaks.length / barCount
    const barW = trackInner / barCount
    const progress = props.duration > 0 ? props.currentTime / props.duration : 0
    const a = props.duration > 0 ? props.markA / props.duration : 0
    const b = props.duration > 0 ? props.markB / props.duration : 1
    const x0 = xTrack(props.markA, w, trackInner)
    const x1 = xTrack(props.markB, w, trackInner)

    if (props.duration > 0 && props.markB > props.markA) {
      ctx.fillStyle = 'rgba(15, 107, 92, 0.14)'
      const washL = Math.max(TRACK_PAD, x0)
      const washR = Math.min(w - TRACK_PAD, x1)
      ctx.fillRect(washL, 0, Math.max(0, washR - washL), h)
    }

    for (let i = 0; i < barCount; i++) {
      const idx = Math.min(peaks.length - 1, Math.floor(i * step))
      const amp = peaks[idx] ?? 0.2
      const bh = Math.max(2, amp * h * 0.78)
      const x = TRACK_PAD + i * barW
      const y = (h - bh) / 2
      const mid = (i + 0.5) / barCount
      const inRegion = mid >= a && mid <= b
      const on = mid <= progress
      ctx.fillStyle = on ? played : inactive
      ctx.globalAlpha = inRegion ? 1 : 0.4
      const gap = Math.max(0.4, barW * 0.2)
      const rw = Math.max(1, barW - gap)
      const r = Math.min(2, rw / 2)
      ctx.beginPath()
      ctx.roundRect(x + gap / 2, y, rw, bh, r)
      ctx.fill()
      ctx.globalAlpha = 1
    }
  }

  if (props.duration > 0 && peaks.length) {
    drawBracket(ctx, xBracket(props.markA, w, bracketInner), h, 'left', bracketCol)
    drawBracket(ctx, xBracket(props.markB, w, bracketInner), h, 'right', bracketCol)
  }

  // Playhead — tall “I” (no knob/circle)
  if (props.duration > 0 && peaks.length) {
    const px = xTrack(props.currentTime, w, trackInner)
    const top = 4
    const bot = h - 4
    const stem = 3
    const cap = 10

    // Soft white halo for contrast on dark bars
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

function drawBracket(
  ctx: CanvasRenderingContext2D,
  x: number,
  h: number,
  side: 'left' | 'right',
  color: string,
): void {
  const gripW = 14
  const arm = 14
  const top = 6
  const bot = h - 6

  ctx.fillStyle = 'rgba(15, 107, 92, 0.14)'
  ctx.fillRect(x - gripW / 2 - 4, 0, gripW + 8, h)

  ctx.fillStyle = color
  ctx.fillRect(x - 2.5, top, 5, bot - top)

  ctx.strokeStyle = color
  ctx.lineWidth = 4
  ctx.lineCap = 'butt'
  ctx.beginPath()
  if (side === 'left') {
    ctx.moveTo(x + arm, top)
    ctx.lineTo(x, top)
    ctx.lineTo(x, bot)
    ctx.lineTo(x + arm, bot)
  } else {
    ctx.moveTo(x - arm, top)
    ctx.lineTo(x, top)
    ctx.lineTo(x, bot)
    ctx.lineTo(x - arm, bot)
  }
  ctx.stroke()

  const gy = h * 0.3
  const gh = h * 0.4
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.roundRect(x - gripW / 2, gy, gripW, gh, 5)
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'
  ctx.lineWidth = 1.5
  for (const dx of [-3, 0, 3]) {
    ctx.beginPath()
    ctx.moveTo(x + dx, gy + 8)
    ctx.lineTo(x + dx, gy + gh - 8)
    ctx.stroke()
  }
}

function hitTest(clientX: number): DragKind | 'seek' {
  const lay = layout()
  if (!lay || props.duration <= 0) return 'seek'
  const { w, trackInner, bracketInner } = lay
  const x = clientXLocal(clientX)
  const nearCursor = Math.abs(x - xTrack(props.currentTime, w, trackInner)) < CURSOR_HIT
  const nearA = Math.abs(x - xBracket(props.markA, w, bracketInner)) < BRACKET_HIT
  const nearB = Math.abs(x - xBracket(props.markB, w, bracketInner)) < BRACKET_HIT

  if (nearCursor) return 'cursor'
  if (nearA && nearB) {
    return Math.abs(x - xBracket(props.markA, w, bracketInner)) <=
      Math.abs(x - xBracket(props.markB, w, bracketInner))
      ? 'a'
      : 'b'
  }
  if (nearA) return 'a'
  if (nearB) return 'b'
  return 'seek'
}

function onPointerDown(e: PointerEvent): void {
  if (!props.interactive) return
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  downX.value = e.clientX
  dragging.value = false
  const hit = hitTest(e.clientX)
  const lay = layout()
  if (!lay) return

  if (hit === 'seek') {
    // Tap waveform → jump here, then keep scrubbing while held
    emit('seek', timeFromTrackX(clientXLocal(e.clientX), lay.trackInner))
    pending.value = 'cursor'
    drag.value = 'cursor'
    dragging.value = true
    return
  }

  pending.value = hit
  // Brackets start dragging after slop; cursor can start immediately on move
  drag.value = hit === 'a' || hit === 'b' ? hit : null
}

function onPointerMove(e: PointerEvent): void {
  if (!props.interactive) return
  const lay = layout()
  if (!lay) return
  if (!dragging.value && Math.abs(e.clientX - downX.value) > DRAG_SLOP) {
    dragging.value = true
    if (pending.value === 'cursor') drag.value = 'cursor'
    else if (pending.value && !drag.value) drag.value = pending.value
  }
  if (!drag.value) return
  const x = clientXLocal(e.clientX)
  if (drag.value === 'cursor') emit('seek', timeFromTrackX(x, lay.trackInner))
  else if (drag.value === 'a') emit('update:markA', timeFromBracketX(x, lay.bracketInner))
  else if (drag.value === 'b') emit('update:markB', timeFromBracketX(x, lay.bracketInner))
}

function onPointerUp(): void {
  drag.value = null
  pending.value = null
  dragging.value = false
}

function onKey(e: KeyboardEvent): void {
  if (!props.interactive || props.duration <= 0) return
  const step = e.shiftKey ? 5 : 1
  if (e.key === 'ArrowLeft') {
    e.preventDefault()
    emit('seek', clampTime(props.currentTime - step))
  } else if (e.key === 'ArrowRight') {
    e.preventDefault()
    emit('seek', clampTime(props.currentTime + step))
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
    :class="{ inert: !interactive }"
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
@media (min-width: 720px) {
  .wave {
    height: 128px;
  }
}
</style>
