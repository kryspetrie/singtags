<script setup lang="ts">
/**
 * Scrolling spectrogram — grid / scale / window / resolution / colormap + pitch tracks.
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type { SpectrogramRing } from '../../audio/tuner/spectrogramRing'
import { fractionAtHz } from '../../audio/tuner/spectrogramRing'
import {
  SPECTROGRAM_COLORMAPS,
  spectrogramColorRgb,
  type SpectrogramColormap,
} from '../../audio/tuner/spectrogramColormap'
import type { SpectrogramTrack } from '../../audio/tuner/spectrogramTracks'
import {
  prefsForPitchRange,
  type DigitalTunerPrefs,
  type PitchRangeId,
  type SpectrogramResolution,
} from '../../lib/preferences/digitalTuner'
import type { SpectrogramFreqScale } from '../../audio/tuner/spectrogramRing'
import { matchPitchRangeId, PITCH_RANGE_PRESETS } from '../../domain/tuner/pitchRange'
import {
  cancelScheduledTunerPaint,
  scheduleTunerPaint,
  sizeTunerCanvas,
} from '../../lib/tuner/canvasPaint'

const props = withDefaults(
  defineProps<{
    ring: SpectrogramRing
    tracks: SpectrogramTrack[]
    paused: boolean
    prefs: DigitalTunerPrefs
    /** Increments when a new column is ready. */
    paintGen?: number
    /** 10-foot mode — canvas only. */
    glance?: boolean
  }>(),
  { glance: false },
)

const emit = defineEmits<{
  togglePause: []
  clear: []
  patch: [Partial<DigitalTunerPrefs>]
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const paintKey = {}
let ro: ResizeObserver | null = null
/** Low-res heatmap (1 px per bin×column) — scaled up via drawImage. */
let heat: ImageData | null = null
let heatCanvas: OffscreenCanvas | HTMLCanvasElement | null = null
let cachedCtx: CanvasRenderingContext2D | null = null
/** Skip rebuilding heat when only overlay prefs/size changed and columns unchanged. */
let lastHeatGen = -1
let lastHeatCols = -1
let lastHeatBins = -1
let lastHeatMap: SpectrogramColormap | null = null

function requestPaint(): void {
  scheduleTunerPaint(paintKey, paint)
}

const freqPreset = computed(() => matchPitchRangeId(props.prefs.specFMinHz, props.prefs.specFMaxHz))

function setScale(scale: SpectrogramFreqScale): void {
  emit('patch', { specFreqScale: scale })
}
function setGrid(on: boolean): void {
  emit('patch', { specGridlines: on })
}
function setTracks(on: boolean): void {
  emit('patch', { specShowTracks: on })
}
function setColormap(map: SpectrogramColormap): void {
  emit('patch', { specColormap: map })
}
function setResolution(res: SpectrogramResolution): void {
  emit('patch', { specResolution: res })
}
function setFreqPreset(id: string): void {
  if (id === 'custom') return
  emit('patch', prefsForPitchRange(id as PitchRangeId))
}

function ensureHeatCanvas(iw: number, ih: number): OffscreenCanvas | HTMLCanvasElement {
  if (!heatCanvas || heatCanvas.width !== iw || heatCanvas.height !== ih) {
    if (typeof OffscreenCanvas !== 'undefined') {
      heatCanvas = new OffscreenCanvas(iw, ih)
    } else {
      const c = document.createElement('canvas')
      c.width = iw
      c.height = ih
      heatCanvas = c
    }
  }
  return heatCanvas
}

function paint(): void {
  const canvas = canvasRef.value
  if (!canvas) return
  if (!cachedCtx) {
    cachedCtx = canvas.getContext('2d', { alpha: false })
  }
  const ctx = cachedCtx
  if (!ctx) return
  // Cap DPR + pixel budget — Spec fillRect/drawImage cost scales with backing size.
  const { cssW, cssH, dpr } = sizeTunerCanvas(canvas, ctx, {
    maxDpr: props.glance ? 1.25 : 1.5,
    maxPixels: props.glance ? 700_000 : 1_000_000,
  })
  const w = Math.max(1, Math.round(cssW * dpr))
  const h = Math.max(1, Math.round(cssH * dpr))
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, w, h)

  const ring = props.ring
  const cols = ring.columns
  const map = props.prefs.specColormap
  const visible = Math.min(cols.length, ring.maxColumns)
  const start = Math.max(0, cols.length - visible)
  const paintGen = props.paintGen ?? 0
  const needHeat =
    visible > 0 &&
    (paintGen !== lastHeatGen ||
      visible !== lastHeatCols ||
      ring.binCount !== lastHeatBins ||
      map !== lastHeatMap ||
      !heat)

  if (visible > 0) {
    const iw = visible
    const ih = ring.binCount
    if (needHeat) {
      if (!heat || heat.width !== iw || heat.height !== ih) {
        heat = new ImageData(iw, ih)
      }
      const data = heat.data
      for (let i = 0; i < visible; i++) {
        const col = cols[start + i]!
        for (let b = 0; b < ih; b++) {
          const [r, g, bl] = spectrogramColorRgb(col[b] ?? 0, map)
          // ImageData y=0 is top; spectrogram low freq at bottom.
          const y = ih - 1 - b
          const o = (y * iw + i) * 4
          data[o] = r
          data[o + 1] = g
          data[o + 2] = bl
          data[o + 3] = 255
        }
      }
      const hc = ensureHeatCanvas(iw, ih)
      const hctx = hc.getContext('2d', { alpha: false })!
      hctx.putImageData(heat, 0, 0)
      lastHeatGen = paintGen
      lastHeatCols = visible
      lastHeatBins = ih
      lastHeatMap = map
    }
    if (heatCanvas) {
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(heatCanvas as CanvasImageSource, 0, 0, w, h)
    }
  }

  // Tracks + grid in CSS pixel space (after DPR transform).
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  const cssColW = cssW / ring.maxColumns
  const fontPx = Math.max(10, Math.min(13, Math.round(cssH * 0.045)))
  if (props.prefs.specShowTracks && props.tracks.length) {
    for (const track of props.tracks) {
      if (track.points.length < 2) continue
      ctx.strokeStyle = track.held ? '#5eead4' : '#fbbf24'
      ctx.lineWidth = track.held ? (cssH < 160 ? 1.8 : 2.4) : cssH < 160 ? 1.2 : 1.6
      ctx.beginPath()
      let started = false
      for (const p of track.points) {
        if (p.col < start) continue
        const x = (p.col - start) * cssColW + cssColW * 0.5
        const y = cssH - fractionAtHz(ring, p.hz) * cssH
        if (!started) {
          ctx.moveTo(x, y)
          started = true
        } else ctx.lineTo(x, y)
      }
      if (started) ctx.stroke()

      // Glance uses chip strip for held labels — skip canvas glyphs when short.
      if (track.held && track.label && !(props.glance && cssH < 200)) {
        const last = track.points[track.points.length - 1]!
        if (last.col >= start) {
          const x = (last.col - start) * cssColW + 4
          const y = cssH - fractionAtHz(ring, last.hz) * cssH
          ctx.font = `bold ${fontPx}px system-ui, sans-serif`
          ctx.fillStyle = 'rgba(0,0,0,0.55)'
          const tw = ctx.measureText(track.label).width
          ctx.fillRect(x - 2, y - fontPx - 3, tw + 8, fontPx + 4)
          ctx.fillStyle = '#5eead4'
          ctx.fillText(track.label, x, y - 4)
        }
      }
    }
  }

  if (props.prefs.specGridlines && cssH >= 100) {
    ctx.strokeStyle = 'rgba(255,255,255,0.22)'
    ctx.fillStyle = 'rgba(255,255,255,0.55)'
    ctx.lineWidth = 1
    ctx.font = `${Math.max(9, fontPx - 2)}px system-ui, sans-serif`
    const dense = cssH >= 220 && cssW >= 420
    const marks =
      ring.scale === 'log'
        ? dense
          ? [100, 200, 300, 400, 600, 800, 1000, 1500, 2000]
          : [100, 200, 400, 800, 1600]
        : dense
          ? [100, 200, 300, 400, 500, 600, 800, 1000, 1200, 1500, 2000]
          : [100, 200, 400, 800, 1200]
    for (const hz of marks) {
      if (hz < ring.fMinHz || hz > ring.fMaxHz) continue
      const y = cssH - fractionAtHz(ring, hz) * cssH
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(cssW, y)
      ctx.stroke()
      const label = hz >= 1000 ? `${(hz / 1000).toFixed(hz % 1000 === 0 ? 0 : 1)}k` : String(hz)
      ctx.fillText(label, 4, y - 2)
    }
  }
}

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
  ro = null
  cachedCtx = null
})
watch(
  () => [props.paintGen, props.ring.columns.length, props.tracks, props.prefs, props.paused] as const,
  () => requestPaint(),
  { deep: true },
)
</script>

<template>
  <section class="spec" :class="{ glance }" aria-label="Spectrogram">
    <div v-if="!glance" class="head">
      <h2 class="title">Analyze · Spectrogram</h2>
      <button type="button" class="btn" :class="{ on: paused }" @click="$emit('togglePause')">
        {{ paused ? 'Resume' : 'Pause' }}
      </button>
      <button type="button" class="btn" @click="$emit('clear')">Clear</button>
    </div>

    <details v-if="!glance" class="opts">
      <summary>Options</summary>
      <div class="controls" role="group" aria-label="Spectrogram options">
        <label class="ctrl">
          <span>Scale</span>
          <select
            :value="prefs.specFreqScale"
            @change="setScale(($event.target as HTMLSelectElement).value as SpectrogramFreqScale)"
          >
            <option value="log">Log</option>
            <option value="linear">Linear</option>
          </select>
        </label>
        <label class="ctrl">
          <span>Window</span>
          <select :value="freqPreset" @change="setFreqPreset(($event.target as HTMLSelectElement).value)">
            <option v-for="p in PITCH_RANGE_PRESETS" :key="p.id" :value="p.id">
              {{ p.label }}
            </option>
            <option value="custom">Custom</option>
            <option value="custom" disabled>Custom</option>
          </select>
        </label>
        <label class="ctrl">
          <span>Resolution</span>
          <select
            :value="prefs.specResolution"
            @change="setResolution(($event.target as HTMLSelectElement).value as SpectrogramResolution)"
          >
            <option value="coarse">Coarse</option>
            <option value="medium">Medium</option>
            <option value="fine">Fine</option>
            <option value="ultra">Ultra</option>
          </select>
        </label>
        <label class="ctrl">
          <span>Color</span>
          <select
            :value="prefs.specColormap"
            @change="setColormap(($event.target as HTMLSelectElement).value as SpectrogramColormap)"
          >
            <option v-for="m in SPECTROGRAM_COLORMAPS" :key="m.id" :value="m.id">{{ m.label }}</option>
          </select>
        </label>
        <label class="check">
          <input
            type="checkbox"
            :checked="prefs.specGridlines"
            @change="setGrid(($event.target as HTMLInputElement).checked)"
          />
          Grid
        </label>
        <label class="check">
          <input
            type="checkbox"
            :checked="prefs.specShowTracks"
            @change="setTracks(($event.target as HTMLInputElement).checked)"
          />
          Tracks
        </label>
      </div>
    </details>

    <canvas ref="canvasRef" class="canvas" />
    <p v-if="!glance" class="hint">
      Teal = held · Amber = tracking · {{ Math.round(prefs.specFMinHz) }}–{{
        Math.round(prefs.specFMaxHz)
      }}
      Hz
    </p>
  </section>
</template>

<style scoped>
.spec {
  display: grid;
  gap: 0.45rem;
}
.opts {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 0.25rem 0.55rem;
  background: var(--surface);
}
.opts summary {
  cursor: pointer;
  font-size: 0.85rem;
  font-weight: 650;
  min-height: 36px;
  display: flex;
  align-items: center;
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
  flex: 1 1 auto;
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
.controls {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem 0.65rem;
  align-items: end;
  padding: 0.35rem 0 0.45rem;
}
.ctrl {
  display: grid;
  gap: 0.2rem;
  font-size: 0.75rem;
  color: var(--muted);
  font-weight: 600;
}
.ctrl select {
  min-height: 36px;
  padding: 0.25rem 0.4rem;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font: inherit;
}
.check {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.85rem;
  min-height: 36px;
  color: var(--text);
}
.canvas {
  display: block;
  box-sizing: border-box;
  width: 100%;
  height: clamp(16rem, 48vh, 28rem);
  border-radius: 8px;
  border: 1px solid var(--border);
  background: color-mix(in srgb, #0b0b0c 82%, var(--surface));
}
.hint {
  margin: 0;
  font-size: 0.8rem;
  color: var(--muted);
}
.spec.glance {
  height: 100%;
  min-height: 0;
  gap: 0;
}
.spec.glance .canvas {
  height: 100%;
  min-height: 0;
  border: none;
  border-radius: 12px;
  background: color-mix(in srgb, #0b0b0c 70%, transparent);
}
</style>
