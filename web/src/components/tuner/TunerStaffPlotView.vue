/**
 * Analyze · Staff — time × staff pitch with zone coloring (off-by-default teaching view).
 */
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type { PitchHistoryPoint } from '../../composables/useTunerSessionStats'
import { midiToStaffY01, type StaffClef } from '../../domain/tuner/staffIntonation'
import type { DigitalTunerPrefs } from '../../lib/preferences/digitalTuner'
import {
  cancelScheduledTunerPaint,
  readTunerCanvasTheme,
  scheduleTunerPaint,
  sizeTunerCanvas,
} from '../../lib/tuner/canvasPaint'

const props = defineProps<{
  history: PitchHistoryPoint[]
  prefs: DigitalTunerPrefs
  windowCents: number
}>()

const emit = defineEmits<{
  patch: [Partial<DigitalTunerPrefs>]
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const paintKey = {}
let ro: ResizeObserver | null = null

const clef = computed(() => props.prefs.staffClef)

function setClef(next: StaffClef): void {
  emit('patch', { staffClef: next })
}

function paint(): void {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d', { alpha: false })
  if (!ctx) return
  const { cssW: w, cssH: h } = sizeTunerCanvas(canvas, ctx, { maxDpr: 1.75, maxPixels: 420_000 })
  const theme = readTunerCanvasTheme(canvas)
  ctx.fillStyle = theme.surface
  ctx.fillRect(0, 0, w, h)

  const padX = 10
  const padY = 14
  const plotH = h - padY * 2

  // Five staff lines
  ctx.strokeStyle = theme.border
  ctx.globalAlpha = 0.55
  ctx.lineWidth = 1
  for (let i = 0; i < 5; i++) {
    const y = padY + (i / 4) * plotH
    ctx.beginPath()
    ctx.moveTo(padX, y)
    ctx.lineTo(w - padX, y)
    ctx.stroke()
  }
  ctx.globalAlpha = 1

  const pts = props.history.filter((p) => p.midi != null)
  if (pts.length < 2) {
    ctx.fillStyle = theme.muted
    ctx.font = '600 12px ui-sans-serif, system-ui, sans-serif'
    ctx.fillText('Sing on Tune or Chord — staff plots recent live pitch history.', 12, h / 2)
    return
  }

  const t0 = pts[0]!.tMs
  const t1 = pts[pts.length - 1]!.tMs
  const span = Math.max(1, t1 - t0)
  const win = Math.max(1, props.windowCents)

  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!
    const x = padX + ((p.tMs - t0) / span) * (w - padX * 2)
    const y01 = midiToStaffY01(p.midi!, clef.value)
    const y = padY + (1 - y01) * plotH
    const sharp = p.cents > 0
    let color = theme.danger
    if (p.zone === 'in') color = theme.accent
    else if (p.zone === 'near') color = '#c9a227'
    ctx.fillStyle = color
    ctx.globalAlpha = Math.min(1, 0.45 + Math.abs(p.cents) / (win * 4))
    ctx.beginPath()
    ctx.arc(x, y + (sharp ? -1.5 : 1.5), 2.4, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
}

function requestPaint(): void {
  scheduleTunerPaint(paintKey, paint)
}

watch(
  () => [props.history, props.prefs.staffClef, props.windowCents] as const,
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
  <section class="staff" aria-label="Staff intonation">
    <div class="head">
      <p class="label">Staff intonation (recent phrase)</p>
      <div class="clefs" role="group" aria-label="Clef">
        <button
          type="button"
          class="btn"
          :class="{ on: clef === 'treble' }"
          @click="setClef('treble')"
        >
          Treble
        </button>
        <button
          type="button"
          class="btn"
          :class="{ on: clef === 'bass' }"
          @click="setClef('bass')"
        >
          Bass
        </button>
      </div>
    </div>
    <canvas ref="canvasRef" class="canvas" role="img" aria-label="Pitch on staff over time" />
    <p class="hint">Green in-window · amber near · red far. Not a transcription product.</p>
  </section>
</template>

<style scoped>
.staff {
  display: grid;
  gap: 0.45rem;
}
.head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}
.label {
  margin: 0;
  flex: 1;
  font-size: 0.9rem;
  font-weight: 650;
}
.clefs {
  display: flex;
  gap: 0.35rem;
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
.btn.on {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 14%, var(--surface));
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
