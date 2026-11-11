<script setup lang="ts">
/**
 * FFT Analyze — fixed-height filled bezier spectrum; resolution / smooth / peak-hold.
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { formatDisplayCents } from '../../domain/tuner/displayCents'
import type { FftPeak, FftSpectrumView } from '../../audio/tuner/fftPeaks'
import type { DigitalTunerPrefs } from '../../lib/preferences/digitalTuner'
import {
  cancelScheduledTunerPaint,
  readTunerCanvasTheme,
  scheduleTunerPaint,
  sizeTunerCanvas,
  type TunerCanvasTheme,
} from '../../lib/tuner/canvasPaint'

const props = withDefaults(
  defineProps<{
    spectrum: FftSpectrumView | null
    paused: boolean
    prefs: DigitalTunerPrefs
    /** 10-foot mode — canvas only, no options / audition chrome. */
    glance?: boolean
  }>(),
  { glance: false },
)

const emit = defineEmits<{
  togglePause: []
  playPeak: [hz: number]
  auditionSelected: [hz: number[]]
  patch: [Partial<DigitalTunerPrefs>]
}>()

type Pt = { x: number; y: number }

const canvasRef = ref<HTMLCanvasElement | null>(null)
const selectedHz = ref<Set<number>>(new Set())
const paintKey = {}
let ro: ResizeObserver | null = null
let cachedCtx: CanvasRenderingContext2D | null = null
let cachedTheme: TunerCanvasTheme | null = null
/** Reused point buffer — avoids allocating every hop. */
let ptsBuf: Pt[] = []

const peaks = computed(() =>
  [...(props.spectrum?.peaks ?? [])].sort((a, b) => a.hz - b.hz).slice(0, 6),
)

function requestPaint(): void {
  scheduleTunerPaint(paintKey, paint)
}

function peakKey(hz: number): number {
  return Math.round(hz)
}

function toggleSelect(hz: number): void {
  const k = peakKey(hz)
  const next = new Set(selectedHz.value)
  if (next.has(k)) next.delete(k)
  else next.add(k)
  selectedHz.value = next
}

function audition(): void {
  const hz = peaks.value
    .filter((p) => selectedHz.value.has(peakKey(p.hz)))
    .map((p) => p.hz)
  emit('auditionSelected', hz)
}

function hzToX(hz: number, width: number, fMin: number, fMax: number): number {
  const t = (Math.log(hz) - Math.log(fMin)) / (Math.log(fMax) - Math.log(fMin))
  return Math.max(0, Math.min(width, t * width))
}

/** Bin index → log-frequency x (center of display bin). */
function binToX(i: number, n: number, width: number): number {
  if (n <= 1) return width / 2
  return (i / (n - 1)) * width
}

function binsToPoints(
  bins: Float32Array,
  width: number,
  baseY: number,
  usable: number,
): Pt[] {
  const n = bins.length
  if (ptsBuf.length !== n) ptsBuf = new Array(n)
  for (let i = 0; i < n; i++) {
    const existing = ptsBuf[i]
    if (existing) {
      existing.x = binToX(i, n, width)
      existing.y = baseY - bins[i]! * usable
    } else {
      ptsBuf[i] = {
        x: binToX(i, n, width),
        y: baseY - bins[i]! * usable,
      }
    }
  }
  return ptsBuf
}

/** Midpoint-quadratic path — continuous regardless of bin count. */
function traceBezier(ctx: CanvasRenderingContext2D, pts: Pt[]): void {
  if (!pts.length) return
  ctx.moveTo(pts[0]!.x, pts[0]!.y)
  if (pts.length === 1) return
  if (pts.length === 2) {
    ctx.lineTo(pts[1]!.x, pts[1]!.y)
    return
  }
  for (let i = 1; i < pts.length - 2; i++) {
    const p = pts[i]!
    const n = pts[i + 1]!
    ctx.quadraticCurveTo(p.x, p.y, (p.x + n.x) / 2, (p.y + n.y) / 2)
  }
  const last = pts[pts.length - 1]!
  const prev = pts[pts.length - 2]!
  ctx.quadraticCurveTo(prev.x, prev.y, last.x, last.y)
}

function fillUnderCurve(
  ctx: CanvasRenderingContext2D,
  pts: Pt[],
  baseY: number,
  fill: string,
  stroke: string,
  lineWidth: number,
): void {
  if (pts.length < 2) return
  ctx.beginPath()
  traceBezier(ctx, pts)
  const last = pts[pts.length - 1]!
  const first = pts[0]!
  ctx.lineTo(last.x, baseY)
  ctx.lineTo(first.x, baseY)
  ctx.closePath()
  ctx.fillStyle = fill
  ctx.fill()
  ctx.beginPath()
  traceBezier(ctx, pts)
  ctx.strokeStyle = stroke
  ctx.lineWidth = lineWidth
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.stroke()
}

function paint(): void {
  const canvas = canvasRef.value
  const spec = props.spectrum
  if (!canvas) return
  if (!cachedCtx) {
    cachedCtx = canvas.getContext('2d', { alpha: false })
  }
  const ctx = cachedCtx
  if (!ctx) return
  // Fullscreen Glance can be huge on phones — budget pixels + slightly lower DPR.
  const { cssW, cssH } = sizeTunerCanvas(canvas, ctx, {
    maxDpr: props.glance ? 1.5 : 2,
    maxPixels: props.glance ? 900_000 : 1_400_000,
  })
  if (!cachedTheme) cachedTheme = readTunerCanvasTheme(canvas)
  const { border, accent, muted, text, surface } = cachedTheme

  ctx.fillStyle = surface
  ctx.fillRect(0, 0, cssW, cssH)

  const axisBand = Math.max(12, Math.min(24, Math.round(cssH * 0.07)))
  const labelBand = props.glance ? 8 : Math.max(14, Math.min(28, Math.round(cssH * 0.08)))
  const fontPx = Math.max(10, Math.min(14, Math.round(cssH * 0.045)))

  if (!spec) {
    ctx.fillStyle = muted
    ctx.font = `600 ${fontPx}px system-ui, sans-serif`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText('Listening…', 12, Math.round(cssH / 2))
    return
  }

  const bins = spec.bins
  const hold = spec.peakHold
  const baseY = cssH - axisBand
  const usable = Math.max(8, baseY - labelBand)

  // Frequency grid under the curve
  ctx.fillStyle = muted
  ctx.font = `600 ${Math.max(9, fontPx - 1)}px system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  const marks = cssW < 360 ? [100, 400, 1600] : [100, 200, 400, 800, 1600]
  for (const mark of marks) {
    if (mark < spec.fMinHz || mark > spec.fMaxHz) continue
    const x = Math.round(hzToX(mark, cssW, spec.fMinHz, spec.fMaxHz))
    ctx.strokeStyle = border
    ctx.globalAlpha = 0.28
    ctx.beginPath()
    ctx.moveTo(x, 4)
    ctx.lineTo(x, baseY)
    ctx.stroke()
    ctx.globalAlpha = 1
    if (cssH >= 120) {
      ctx.fillText(mark >= 1000 ? `${mark / 1000}k` : String(mark), x, cssH - 4)
    }
  }

  if (hold && hold.length === bins.length) {
    fillUnderCurve(
      ctx,
      binsToPoints(hold, cssW, baseY, usable),
      baseY,
      withAlpha(accent, 0.18),
      withAlpha(accent, 0.45),
      1,
    )
  }

  fillUnderCurve(
    ctx,
    binsToPoints(bins, cssW, baseY, usable),
    baseY,
    withAlpha(accent, 0.32),
    accent,
    cssH < 160 ? 1.25 : 1.75,
  )

  ctx.strokeStyle = border
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(0, baseY)
  ctx.lineTo(cssW, baseY)
  ctx.stroke()

  // Glance shows peaks as chips — keep markers only to avoid tiny/squished labels.
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  for (const p of spec.peaks) {
    const x = Math.round(hzToX(p.hz, cssW, spec.fMinHz, spec.fMaxHz))
    const sel = !props.glance && selectedHz.value.has(peakKey(p.hz))
    ctx.strokeStyle = sel ? accent : text
    ctx.globalAlpha = sel ? 0.9 : 0.45
    ctx.lineWidth = sel ? 2 : 1.15
    ctx.beginPath()
    ctx.moveTo(x, labelBand)
    ctx.lineTo(x, baseY)
    ctx.stroke()
    ctx.globalAlpha = 1
    if (!props.glance && cssH >= 140) {
      ctx.fillStyle = sel ? accent : text
      ctx.font = `700 ${fontPx}px system-ui, sans-serif`
      const label = p.note ?? `${p.hz.toFixed(0)}`
      const tx = Math.min(cssW - 8, Math.max(8, x))
      ctx.fillText(label, tx, 4)
    }
  }
}

/** Cheap fill/stroke without parsing color-mix every frame. */
function withAlpha(cssColor: string, alpha: number): string {
  if (cssColor.startsWith('#') && (cssColor.length === 4 || cssColor.length === 7)) {
    const hex =
      cssColor.length === 4
        ? `#${cssColor[1]}${cssColor[1]}${cssColor[2]}${cssColor[2]}${cssColor[3]}${cssColor[3]}`
        : cssColor
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    return `rgba(${r},${g},${b},${alpha})`
  }
  return cssColor
}

watch(
  () => props.spectrum,
  () => requestPaint(),
)

onMounted(() => {
  requestPaint()
  if (canvasRef.value && typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(() => {
      cachedTheme = null
      requestPaint()
    })
    ro.observe(canvasRef.value)
  }
})

onUnmounted(() => {
  cancelScheduledTunerPaint(paintKey)
  ro?.disconnect()
  ro = null
  cachedCtx = null
  cachedTheme = null
})

function onCanvasClick(ev: MouseEvent): void {
  if (props.glance) return
  const spec = props.spectrum
  const canvas = canvasRef.value
  if (!spec || !canvas) return
  const rect = canvas.getBoundingClientRect()
  const x = ev.clientX - rect.left
  const t = x / rect.width
  const hz = Math.exp(
    Math.log(spec.fMinHz) + t * (Math.log(spec.fMaxHz) - Math.log(spec.fMinHz)),
  )
  let best: FftPeak | null = null
  let bestCents = 90
  for (const p of spec.peaks) {
    const c = Math.abs(1200 * Math.log2(hz / p.hz))
    if (c < bestCents) {
      bestCents = c
      best = p
    }
  }
  if (best) {
    emit('playPeak', best.hz)
    toggleSelect(best.hz)
  } else {
    emit('playPeak', hz)
  }
}

</script>

<template>
  <section class="fft" :class="{ glance }" aria-label="FFT analysis">
    <div v-if="!glance" class="head">
      <h2 class="title">Analyze · FFT</h2>
      <button type="button" class="btn" :class="{ on: paused }" @click="$emit('togglePause')">
        {{ paused ? 'Resume' : 'Pause' }}
      </button>
      <button type="button" class="btn" :disabled="!selectedHz.size" @click="audition">
        Audition ({{ selectedHz.size }})
      </button>
    </div>

    <details v-if="!glance" class="opts">
      <summary>Options</summary>
      <div class="controls" role="group" aria-label="FFT options">
        <label class="ctrl">
          <span>Resolution</span>
          <select
            :value="prefs.fftSize"
            @change="
              $emit('patch', {
                fftSize: Number(($event.target as HTMLSelectElement).value),
              })
            "
          >
            <option :value="2048">2048</option>
            <option :value="4096">4096</option>
            <option :value="8192">8192</option>
            <option :value="16384">16384</option>
          </select>
        </label>
        <label class="check">
          <input
            type="checkbox"
            :checked="prefs.fftSmoothing"
            @change="
              $emit('patch', {
                fftSmoothing: ($event.target as HTMLInputElement).checked,
              })
            "
          />
          Smooth
        </label>
        <label class="check">
          <input
            type="checkbox"
            :checked="prefs.fftPeakHold"
            @change="
              $emit('patch', {
                fftPeakHold: ($event.target as HTMLInputElement).checked,
              })
            "
          />
          Peak hold
        </label>
      </div>
    </details>

    <canvas
      ref="canvasRef"
      class="graph"
      role="img"
      aria-label="Frequency spectrum"
      @click="onCanvasClick"
    />
    <ul v-if="!glance && peaks.length" class="peak-strip" aria-label="Detected fundamentals">
      <li
        v-for="p in peaks"
        :key="peakKey(p.hz)"
        class="chip"
        :class="{ on: selectedHz.has(peakKey(p.hz)) }"
      >
        <button
          type="button"
          class="chip-btn"
          @click="toggleSelect(p.hz); $emit('playPeak', p.hz)"
        >
          <span class="note">{{ p.note ?? '—' }}</span>
          <span class="hz">{{ p.hz.toFixed(0) }}</span>
          <span class="cents">
            {{
              p.errorCents == null
                ? ''
                : formatDisplayCents(p.errorCents, { clarity: p.salience })
            }}
          </span>
        </button>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.fft {
  display: grid;
  gap: 0.45rem;
}
.head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}
.title {
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
  flex: 1 1 auto;
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
.controls {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem 0.75rem;
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
.btn:disabled {
  opacity: 0.45;
  cursor: default;
}
.btn.on {
  border-color: var(--accent);
  color: var(--accent);
}
.graph {
  display: block;
  box-sizing: border-box;
  width: 100%;
  /* Explicit CSS height — avoids attribute/CSS aspect mismatch that squishes glyphs. */
  height: clamp(16rem, 48vh, 28rem);
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--surface);
  touch-action: manipulation;
  cursor: crosshair;
}
.peak-strip {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(5.5rem, 1fr));
  gap: 0.35rem;
}
.chip-btn {
  display: grid;
  grid-template-columns: auto auto auto;
  gap: 0.25rem;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 40px;
  padding: 0.3rem 0.35rem;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
}
.chip.on .chip-btn {
  border-color: var(--accent);
  color: var(--accent);
}
.note {
  font-weight: 700;
  font-size: 0.85rem;
}
.hz,
.cents {
  color: var(--muted);
  font-size: 0.75rem;
}
.fft.glance {
  height: 100%;
  min-height: 0;
  gap: 0;
}
.fft.glance .graph {
  height: 100%;
  min-height: 0;
  border: none;
  border-radius: 12px;
  background: color-mix(in srgb, var(--surface) 55%, transparent);
  cursor: default;
}
</style>
