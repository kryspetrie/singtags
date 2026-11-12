/**
 * Phrase pitch history — cents ribbon with in-tune corridor (no % breakdown).
 */
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type { PitchHistoryPoint } from '../../composables/useTunerSessionStats'
import { scheduleTunerPaint, cancelScheduledTunerPaint, sizeTunerCanvas } from '../../lib/tuner/canvasPaint'

const props = defineProps<{
  history: PitchHistoryPoint[]
  hasVoice: boolean
  holdProgress: number
  windowCents?: number
  scaleCents?: number
}>()

const emit = defineEmits<{ reset: [] }>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const paintKey = {}
let ro: ResizeObserver | null = null

const status = computed(() => {
  if (!props.hasVoice) return 'Sing to track phrase pitch'
  const last = props.history[props.history.length - 1]
  if (!last) return 'Listening…'
  if (last.zone === 'in') return 'In tune'
  if (last.cents > 0) return 'Sharp'
  return 'Flat'
})

function paint(): void {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d', { alpha: false })
  if (!ctx) return
  const { cssW: w, cssH: h } = sizeTunerCanvas(canvas, ctx, { maxDpr: 1.5, maxPixels: 200_000 })
  const s = getComputedStyle(canvas)
  const surface = s.getPropertyValue('--surface').trim() || '#f4f4f4'
  const border = s.getPropertyValue('--border').trim() || '#888'
  const accent = s.getPropertyValue('--accent').trim() || '#2a7'
  const danger = s.getPropertyValue('--danger').trim() || '#b33'
  const muted = s.getPropertyValue('--muted').trim() || '#888'
  const text = s.getPropertyValue('--text').trim() || '#222'

  ctx.fillStyle = surface
  ctx.fillRect(0, 0, w, h)

  const mid = h / 2
  const scale = Math.max(10, props.scaleCents ?? 40)
  const win = Math.max(1, Math.min(scale, props.windowCents ?? 15))
  const amp = h * 0.42

  // In-tune corridor
  const band = (win / scale) * amp
  ctx.fillStyle = `color-mix(in srgb, ${accent} 16%, ${surface})`
  ctx.fillRect(0, mid - band, w, band * 2)

  ctx.strokeStyle = border
  ctx.globalAlpha = 0.4
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(0, mid)
  ctx.lineTo(w, mid)
  ctx.stroke()
  ctx.globalAlpha = 1

  const pts = props.history
  if (pts.length < 2) {
    ctx.fillStyle = muted
    ctx.font = '600 11px system-ui, sans-serif'
    ctx.fillText('—', 8, mid + 4)
    return
  }
  const t0 = pts[0]!.tMs
  const t1 = pts[pts.length - 1]!.tMs
  const span = Math.max(1, t1 - t0)

  ctx.lineWidth = 2
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.beginPath()
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!
    const x = ((p.tMs - t0) / span) * w
    const y = mid - (Math.max(-scale, Math.min(scale, p.cents)) / scale) * amp
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  const last = pts[pts.length - 1]!
  ctx.strokeStyle = last.zone === 'in' ? accent : last.zone === 'near' ? '#c9a227' : danger
  ctx.stroke()

  // Live tip
  const tipX = w - 2
  const tipY = mid - (Math.max(-scale, Math.min(scale, last.cents)) / scale) * amp
  ctx.fillStyle = last.zone === 'in' ? accent : text
  ctx.beginPath()
  ctx.arc(tipX - 4, tipY, 3.5, 0, Math.PI * 2)
  ctx.fill()
}

function requestPaint(): void {
  scheduleTunerPaint(paintKey, paint)
}

watch(
  () => [props.history, props.windowCents, props.hasVoice] as const,
  () => requestPaint(),
  { deep: true },
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
  <section class="session" aria-label="Phrase pitch">
    <div class="head">
      <p class="label" aria-live="polite">{{ status }}</p>
      <button type="button" class="btn" @click="emit('reset')">Reset</button>
    </div>
    <div class="hold" aria-hidden="true" title="Continuous in-tune hold">
      <div class="hold-fill" :style="{ width: `${Math.round(holdProgress * 100)}%` }" />
    </div>
    <canvas ref="canvasRef" class="ribbon" role="img" aria-label="Recent cents history" />
  </section>
</template>

<style scoped>
.session {
  display: grid;
  gap: 0.35rem;
}
.head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.label {
  margin: 0;
  flex: 1 1 auto;
  font-size: 0.85rem;
  font-weight: 650;
  color: var(--text);
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
.hold {
  height: 0.28rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--text) 12%, transparent);
  overflow: hidden;
}
.hold-fill {
  height: 100%;
  background: color-mix(in srgb, var(--accent) 70%, var(--text));
  transition: width 0.12s linear;
}
@media (prefers-reduced-motion: reduce) {
  .hold-fill {
    transition: none;
  }
}
.ribbon {
  display: block;
  width: 100%;
  height: 3.5rem;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--surface);
}
</style>
