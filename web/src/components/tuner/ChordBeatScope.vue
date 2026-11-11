/**
 * Chord beat / relative scope — Lissajous of live F0 vs JI (Assisted pin).
 */
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type { ChordStackScore } from '../../domain/tuner/chordStack'
import {
  advanceBeatScope,
  beatScopePoint,
  centsBetweenHz,
} from '../../domain/tuner/chordBeatScope'
import { noteFromHz } from '../../domain/tuner/noteFromHz'
import {
  cancelScheduledTunerPaint,
  readTunerCanvasTheme,
  scheduleTunerPaint,
  sizeTunerCanvas,
} from '../../lib/tuner/canvasPaint'

const props = withDefaults(
  defineProps<{
    score: ChordStackScore | null
    peaksHz: number[]
    a4Hz: number
    windowCents?: number
    active?: boolean
    reducedMotion?: boolean
  }>(),
  { windowCents: 5, active: true, reducedMotion: false },
)

const canvasRef = ref<HTMLCanvasElement | null>(null)
const paintKey = {}
let raf = 0
let livePhase = 0
let refPhase = 0
let lastTs = 0
let ro: ResizeObserver | null = null

const pinRequired = computed(() => !!props.score?.assistedPinRequired || !props.score)

/** Prefer first scored tone with JI error; else lowest peak vs nearest ET. */
const cents = computed((): number | null => {
  const tones = props.score?.tones
  if (tones?.length) {
    const t = tones.find((x) => Number.isFinite(x.errorCentsVsJi)) ?? tones[0]
    return t?.errorCentsVsJi ?? null
  }
  const hz = props.peaksHz[0]
  if (!(hz > 0)) return null
  const n = noteFromHz(hz, props.a4Hz)
  if (!n) return null
  const targetHz = props.a4Hz * 2 ** ((n.midi - 69) / 12)
  return centsBetweenHz(hz, targetHz)
})

const locked = computed(() => {
  if (cents.value == null) return false
  return Math.abs(cents.value) < (props.windowCents ?? 5)
})

const status = computed(() => {
  if (pinRequired.value) return 'Pin nature and root in Settings to lock beat-scope colors.'
  if (cents.value == null) return 'Sing a chord tone — beat slows when locked to JI.'
  const a = Math.abs(cents.value)
  const win = props.windowCents ?? 5
  if (a < win) return 'Locked — relative phase nearly still.'
  return `${cents.value > 0 ? '▲' : '▼'} ${a.toFixed(0)}¢ vs JI — watching beat.`
})

/** Continuous motion only while unlocked and motion is allowed. */
function animates(): boolean {
  return (
    !props.reducedMotion &&
    props.active !== false &&
    !pinRequired.value &&
    cents.value != null &&
    !locked.value
  )
}

function paint(ts: number): void {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d', { alpha: false })
  if (!ctx) return
  const { cssW: w, cssH: h } = sizeTunerCanvas(canvas, ctx, { maxDpr: 1.75, maxPixels: 280_000 })
  const theme = readTunerCanvasTheme(canvas)
  const motion = !props.reducedMotion && props.active !== false && !pinRequired.value
  const dt = motion && lastTs ? (ts - lastTs) / 1000 : 0
  lastTs = ts

  const sample = advanceBeatScope(
    livePhase,
    refPhase,
    pinRequired.value ? null : cents.value,
    Math.min(0.05, Math.max(0, dt)),
    props.windowCents ?? 5,
  )
  livePhase = sample.livePhase01
  refPhase = sample.refPhase01

  ctx.fillStyle = theme.surface
  ctx.fillRect(0, 0, w, h)

  const cx = w / 2
  const cy = h / 2
  const r = Math.min(w, h) * 0.38

  ctx.strokeStyle = theme.border
  ctx.globalAlpha = 0.45
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(cx - r, cy)
  ctx.lineTo(cx + r, cy)
  ctx.moveTo(cx, cy - r)
  ctx.lineTo(cx, cy + r)
  ctx.stroke()
  ctx.globalAlpha = 1

  const pt = beatScopePoint(refPhase, livePhase)
  const x = cx + pt.x * r
  const y = cy - pt.y * r
  ctx.fillStyle = sample.locked ? theme.accent : theme.text
  ctx.beginPath()
  ctx.arc(x, y, sample.locked ? 7 : 5, 0, Math.PI * 2)
  ctx.fill()

  // Trail cross-hair ghost
  ctx.strokeStyle = sample.locked
    ? `color-mix(in srgb, ${theme.accent} 55%, transparent)`
    : `color-mix(in srgb, ${theme.muted} 50%, transparent)`
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(cx, cy)
  ctx.lineTo(x, y)
  ctx.stroke()
}

function requestPaint(ts?: number): void {
  scheduleTunerPaint(paintKey, () => paint(ts ?? performance.now()))
}

function stopLoop(): void {
  if (raf) cancelAnimationFrame(raf)
  raf = 0
}

function ensureLoop(): void {
  if (raf) return
  const tick = (ts: number) => {
    raf = 0
    paint(ts)
    if (animates()) raf = requestAnimationFrame(tick)
  }
  raf = requestAnimationFrame(tick)
}

watch(
  () =>
    [props.score, props.peaksHz, props.active, props.reducedMotion, cents.value, locked.value] as const,
  () => {
    if (animates()) ensureLoop()
    else {
      stopLoop()
      requestPaint()
    }
  },
)

onMounted(() => {
  if (animates()) ensureLoop()
  else requestPaint()
  if (canvasRef.value && typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(() => {
      if (animates()) ensureLoop()
      else requestPaint()
    })
    ro.observe(canvasRef.value)
  }
})
onUnmounted(() => {
  stopLoop()
  cancelScheduledTunerPaint(paintKey)
  ro?.disconnect()
})
</script>

<template>
  <section class="beat" aria-label="Chord beat scope">
    <p class="status" role="status">{{ status }}</p>
    <canvas ref="canvasRef" class="canvas" role="img" aria-label="Relative phase vs JI" />
  </section>
</template>

<style scoped>
.beat {
  display: grid;
  gap: 0.35rem;
}
.status {
  margin: 0;
  font-size: 0.85rem;
  color: var(--muted);
}
.canvas {
  display: block;
  width: 100%;
  height: 9rem;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--surface);
}
</style>
