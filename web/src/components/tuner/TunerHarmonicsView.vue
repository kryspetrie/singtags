/**
 * Analyze · Harmonics — relative energy of partials 1…N for strongest F0.
 */
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type { FftSpectrumView } from '../../audio/tuner/fftPeaks'
import { harmonicSeriesFromLogBins } from '../../domain/tuner/harmonicSeries'
import type { DigitalTunerPrefs } from '../../lib/preferences/digitalTuner'
import {
  cancelScheduledTunerPaint,
  readTunerCanvasTheme,
  scheduleTunerPaint,
  sizeTunerCanvas,
} from '../../lib/tuner/canvasPaint'

const props = defineProps<{
  spectrum: FftSpectrumView | null
  paused: boolean
  prefs: DigitalTunerPrefs
}>()

const emit = defineEmits<{
  togglePause: []
  patch: [Partial<DigitalTunerPrefs>]
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const paintKey = {}
let ro: ResizeObserver | null = null

const series = computed(() => {
  const s = props.spectrum
  if (!s?.bins?.length) return []
  const f0 = s.peaks[0]?.hz
  if (!(f0 && f0 > 0)) return []
  return harmonicSeriesFromLogBins(s.bins, {
    f0Hz: f0,
    fMinHz: s.fMinHz,
    fMaxHz: s.fMaxHz,
    maxPartials: 8,
  })
})

const f0Label = computed(() => {
  const p = props.spectrum?.peaks[0]
  if (!p) return 'Sing to measure overtone balance'
  return `f0 ≈ ${p.hz.toFixed(1)} Hz${p.note ? ` (${p.note})` : ''} — ring / overtone balance`
})

function paint(): void {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d', { alpha: false })
  if (!ctx) return
  const { cssW: w, cssH: h } = sizeTunerCanvas(canvas, ctx, { maxDpr: 1.75, maxPixels: 360_000 })
  const theme = readTunerCanvasTheme(canvas)
  ctx.fillStyle = theme.surface
  ctx.fillRect(0, 0, w, h)

  const parts = series.value
  if (!parts.length) {
    ctx.fillStyle = theme.muted
    ctx.font = '600 13px ui-sans-serif, system-ui, sans-serif'
    ctx.fillText('Waiting for a clear fundamental…', 12, h / 2)
    return
  }

  const pad = 12
  const gap = 6
  const barW = (w - pad * 2 - gap * (parts.length - 1)) / parts.length
  const base = h - 28
  const maxH = h - 48

  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]!
    const x = pad + i * (barW + gap)
    const bh = Math.max(2, p.energy * maxH)
    ctx.fillStyle =
      p.n === 1
        ? theme.accent
        : `color-mix(in srgb, ${theme.accent} ${Math.round(35 + p.energy * 45)}%, ${theme.text})`
    ctx.fillRect(x, base - bh, barW, bh)
    ctx.fillStyle = theme.muted
    ctx.font = '600 11px ui-sans-serif, system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(String(p.n), x + barW / 2, h - 10)
  }
}

function requestPaint(): void {
  scheduleTunerPaint(paintKey, paint)
}

watch(
  () => [props.spectrum, props.paused, series.value] as const,
  () => requestPaint(),
)

onMounted(() => {
  requestPaint()
  if (canvasRef.value && typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(() => requestPaint())
    ro.observe(canvasRef.value)
  }
})
onUnmounted(() => {
  cancelScheduledTunerPaint(paintKey)
  ro?.disconnect()
})
</script>

<template>
  <section class="harm" aria-label="Harmonic energy">
    <div class="head">
      <p class="label">{{ f0Label }}</p>
      <button type="button" class="btn" @click="emit('togglePause')">
        {{ paused ? 'Resume' : 'Pause' }}
      </button>
    </div>
    <canvas ref="canvasRef" class="canvas" role="img" aria-label="Partial energy bars" />
    <p class="hint">
      Teaching view for ring and overtone balance — not an instrument harmonic trainer.
    </p>
  </section>
</template>

<style scoped>
.harm {
  display: grid;
  gap: 0.45rem;
}
.head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.label {
  margin: 0;
  flex: 1;
  font-size: 0.9rem;
  font-weight: 650;
}
.btn {
  min-height: 36px;
  padding: 0.25rem 0.65rem;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--surface);
  font: inherit;
  cursor: pointer;
}
.canvas {
  display: block;
  width: 100%;
  height: 12rem;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--surface);
}
.hint {
  margin: 0;
  font-size: 0.8rem;
  color: var(--muted);
}
</style>
