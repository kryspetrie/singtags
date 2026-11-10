<script setup lang="ts">
/**
 * Horizontal phase-comparator strobe — Detail only.
 */
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { advanceStrobePhase } from '../../audio/tuner/strobe'

const props = defineProps<{
  cents: number | null
  inTune: boolean
  active: boolean
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
let phase = 0
let raf = 0
let lastTs = 0
let reducedMotion = false

function paint(width: number, height: number, phase01: number, inTune: boolean): void {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const w = Math.max(1, Math.floor(width * dpr))
  const h = Math.max(1, Math.floor(height * dpr))
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w
    canvas.height = h
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, width, height)
  const styles = getComputedStyle(canvas)
  const accent = styles.getPropertyValue('--accent').trim() || '#2a7'
  const text = styles.getPropertyValue('--text').trim() || '#222'
  const border = styles.getPropertyValue('--border').trim() || '#888'
  const stripeH = Math.max(6, height / 8)
  const band = width
  const shift = phase01 * band
  ctx.globalAlpha = 0.55
  ctx.fillStyle = inTune ? accent : text
  for (let y = 0; y < height + stripeH; y += stripeH * 2) {
    ctx.fillRect(-shift, y, band, stripeH)
    ctx.fillRect(band - shift, y, band, stripeH)
  }
  ctx.globalAlpha = 1
  // Center reference
  ctx.strokeStyle = border
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(width / 2, 0)
  ctx.lineTo(width / 2, height)
  ctx.stroke()
}

function frame(ts: number): void {
  raf = requestAnimationFrame(frame)
  const canvas = canvasRef.value
  if (!canvas || !props.active) return
  const rect = canvas.getBoundingClientRect()
  const dt = lastTs ? (ts - lastTs) / 1000 : 0
  lastTs = ts
  const cents = props.cents
  if (cents == null || reducedMotion) {
    paint(rect.width, rect.height, phase, props.inTune)
    return
  }
  const sample = advanceStrobePhase(phase, cents, dt)
  phase = sample.phase01
  paint(rect.width, rect.height, phase, props.inTune)
}

function onResize(): void {
  const canvas = canvasRef.value
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  paint(rect.width, rect.height, phase, props.inTune)
}

onMounted(() => {
  reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  raf = requestAnimationFrame(frame)
  window.addEventListener('resize', onResize)
})

onUnmounted(() => {
  cancelAnimationFrame(raf)
  window.removeEventListener('resize', onResize)
})

watch(
  () => props.active,
  (on) => {
    if (on) {
      lastTs = 0
      if (!raf) raf = requestAnimationFrame(frame)
    }
  },
)
</script>

<template>
  <div class="strobe" :class="{ in: inTune, idle: cents == null }" aria-hidden="true">
    <canvas ref="canvasRef" class="canvas" />
  </div>
</template>

<style scoped>
.strobe {
  width: min(100%, 28rem);
  height: clamp(4.5rem, 18vw, 7rem);
  margin: 0 auto;
  border-radius: 8px;
  border: 1px solid var(--border);
  overflow: hidden;
  background: var(--surface);
}
.strobe.in {
  border-color: var(--accent);
}
.canvas {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
