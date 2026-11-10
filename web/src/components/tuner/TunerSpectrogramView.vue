<script setup lang="ts">
/**
 * Scrolling spectrogram canvas (Phase 7) — paints ring columns.
 */
import { onMounted, onUnmounted, ref, watch } from 'vue'
import type { SpectrogramRing } from '../../audio/tuner/spectrogramRing'

const props = defineProps<{
  ring: SpectrogramRing
  paused: boolean
}>()

defineEmits<{
  togglePause: []
  clear: []
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
let raf = 0

function paint(): void {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const rect = canvas.getBoundingClientRect()
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const w = Math.max(1, Math.floor(rect.width * dpr))
  const h = Math.max(1, Math.floor(rect.height * dpr))
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w
    canvas.height = h
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.fillStyle = '#111'
  ctx.fillRect(0, 0, w, h)
  const cols = props.ring.columns
  if (!cols.length) return
  const colW = Math.max(1, w / props.ring.maxColumns)
  const start = Math.max(0, cols.length - Math.ceil(w / colW))
  for (let i = start; i < cols.length; i++) {
    const col = cols[i]!
    const x = (i - start) * colW
    for (let b = 0; b < col.length; b++) {
      const v = col[b]!
      const y = h - ((b + 1) / col.length) * h
      const bh = h / col.length + 1
      const g = Math.floor(40 + v * 200)
      ctx.fillStyle = `rgb(${g},${Math.floor(g * 0.7)},${Math.floor(40 + v * 80)})`
      ctx.fillRect(x, y, colW + 0.5, bh)
    }
  }
}

function loop(): void {
  raf = requestAnimationFrame(loop)
  paint()
}

onMounted(() => {
  raf = requestAnimationFrame(loop)
})
onUnmounted(() => cancelAnimationFrame(raf))
watch(
  () => props.ring.columns.length,
  () => paint(),
)
</script>

<template>
  <section class="spec" aria-label="Spectrogram">
    <div class="head">
      <h2 class="title">Analyze · Spectrogram</h2>
      <button type="button" class="btn" :class="{ on: paused }" @click="$emit('togglePause')">
        {{ paused ? 'Resume' : 'Pause' }}
      </button>
      <button type="button" class="btn" @click="$emit('clear')">Clear</button>
    </div>
    <canvas ref="canvasRef" class="canvas" />
  </section>
</template>

<style scoped>
.spec {
  display: grid;
  gap: 0.5rem;
}
.head {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
}
.title {
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
}
.btn {
  min-height: 40px;
  padding: 0.35rem 0.75rem;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--surface);
  font: inherit;
  cursor: pointer;
}
.btn.on {
  border-color: var(--accent);
  color: var(--accent);
}
.canvas {
  width: 100%;
  height: clamp(8rem, 28vh, 14rem);
  border-radius: 8px;
  border: 1px solid var(--border);
  background: #111;
}
</style>
