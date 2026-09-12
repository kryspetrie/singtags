<script setup lang="ts">
/**
 * Live input monitor: VU always (when mic is open); scrolling waveform only while recording.
 */
import { onMounted, onUnmounted, ref, watch } from 'vue'
import {
  dbToMeterRatio,
  LIVE_METER_FLOOR_DB,
  type LiveInputMeter,
  type LiveMeterSnapshot,
} from '../audio/liveMeter'

const props = defineProps<{
  meter: LiveInputMeter | null
  paused?: boolean
  /** True while MediaRecorder is capturing a take. */
  recording?: boolean
  /** Elapsed capture time label (e.g. 0:12) — shown on the recording badge. */
  elapsedLabel?: string
  /** Idle shell (no live stream). */
  idle?: boolean
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const status = ref<LiveMeterSnapshot | null>(null)
let raf = 0

const DB_LINES = [0, -6, -12, -18, -24, -36] as const

function cssVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}

function draw(snap: LiveMeterSnapshot): void {
  const canvas = canvasRef.value
  if (!canvas) return
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const cssW = canvas.clientWidth || 320
  const cssH = canvas.clientHeight || 96
  const w = Math.max(1, Math.floor(cssW * dpr))
  const h = Math.max(1, Math.floor(cssH * dpr))
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w
    canvas.height = h
  }
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const accent = cssVar('--accent', '#2a6f6a')
  const border = cssVar('--border', '#c8c2b6')
  const muted = cssVar('--muted', '#6b6560')
  const surface = cssVar('--surface', '#f7f4ef')
  const clip = '#c0392b'
  const midY = h / 2
  const maxAmp = Math.max(8, h * 0.46)

  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = surface
  ctx.fillRect(0, 0, w, h)

  ctx.save()
  for (const db of DB_LINES) {
    const ratio = dbToMeterRatio(db)
    const yOff = ratio * maxAmp
    ctx.strokeStyle = db === 0 ? 'rgba(192, 57, 43, 0.55)' : border
    ctx.lineWidth = db === 0 ? 1.25 * dpr : 1 * dpr
    ctx.setLineDash(db === 0 ? [] : [3 * dpr, 3 * dpr])
    ctx.beginPath()
    ctx.moveTo(0, midY - yOff)
    ctx.lineTo(w, midY - yOff)
    ctx.moveTo(0, midY + yOff)
    ctx.lineTo(w, midY + yOff)
    ctx.stroke()
  }
  ctx.setLineDash([])
  ctx.strokeStyle = border
  ctx.lineWidth = 1 * dpr
  ctx.beginPath()
  ctx.moveTo(0, midY)
  ctx.lineTo(w, midY)
  ctx.stroke()
  ctx.restore()

  const cols = snap.columns
  const n = cols.length
  if (n > 0) {
    const gap = Math.max(1, Math.floor(dpr))
    const barW = Math.max(1, (w - gap * (n - 1)) / n)
    for (let i = 0; i < n; i++) {
      const col = cols[i]!
      const amp = Math.min(1.15, col.peak)
      const bh = amp * maxAmp
      const x = i * (barW + gap)
      ctx.fillStyle = col.clipped ? clip : accent
      ctx.globalAlpha = col.clipped ? 1 : 0.88
      ctx.fillRect(x, midY - bh, barW, bh * 2)
    }
    ctx.globalAlpha = 1
  }

  ctx.fillStyle = muted
  ctx.font = `${11 * dpr}px ui-sans-serif, system-ui, sans-serif`
  ctx.textAlign = 'left'
  ctx.fillText('0 dB', 4 * dpr, 12 * dpr)
  ctx.fillText(`${LIVE_METER_FLOOR_DB} dB`, 4 * dpr, h - 4 * dpr)
}

function loop(): void {
  raf = 0
  if (!props.meter) return
  // Advance columns only while recording; still sample peaks for VU when monitoring.
  const snap = props.meter.tick(!!props.paused || !props.recording)
  status.value = snap
  if (props.recording) draw(snap)
  raf = requestAnimationFrame(loop)
}

function start(): void {
  stop()
  if (!props.meter) return
  raf = requestAnimationFrame(loop)
}

function stop(): void {
  if (raf) cancelAnimationFrame(raf)
  raf = 0
}

watch(
  () => [props.meter, props.paused, props.recording] as const,
  () => {
    if (props.meter) start()
    else {
      stop()
      status.value = null
    }
  },
)

onMounted(() => {
  if (props.meter) start()
})

onUnmounted(() => stop())

function fmtDb(db: number | undefined): string {
  if (db == null || !Number.isFinite(db)) return '—'
  if (db <= LIVE_METER_FLOOR_DB) return `≤${LIVE_METER_FLOOR_DB}`
  return db.toFixed(1)
}
</script>

<template>
  <div
    class="live-monitor"
    :class="{
      idle: idle || !meter,
      recording: recording && !paused,
      paused: recording && paused,
      standby: !recording,
    }"
    :aria-label="recording ? (paused ? 'Recording paused' : 'Recording') : 'Not recording'"
  >
    <div class="rec-banner" role="status" aria-live="polite">
      <span class="rec-banner-dot" aria-hidden="true" />
      <strong>{{ recording ? (paused ? 'Paused' : 'Recording') : 'Not Recording' }}</strong>
      <span class="rec-banner-time">{{ elapsedLabel || '0:00' }}</span>
    </div>

    <div class="wave-wrap">
      <canvas
        v-show="recording && meter"
        ref="canvasRef"
        class="wave"
        role="img"
        aria-label="Scrolling input waveform"
      />
      <div v-if="!recording" class="wave wave-idle" aria-hidden="true">
        <span class="wave-idle-label">{{ meter ? 'Input levels' : 'Mic off' }}</span>
      </div>
    </div>
    <div class="vu-col">
      <div
        class="vu"
        role="meter"
        aria-label="Input level"
        :aria-valuemin="LIVE_METER_FLOOR_DB"
        :aria-valuemax="0"
        :aria-valuenow="Math.round(status?.peakDb ?? LIVE_METER_FLOOR_DB)"
      >
        <div
          class="vu-fill"
          :class="{ clip: status?.clipped, hot: status?.peaking && !status?.clipped }"
          :style="{ height: `${Math.min(100, dbToMeterRatio(status?.peakDb ?? LIVE_METER_FLOOR_DB) * 100)}%` }"
        />
        <div
          class="vu-hold"
          :style="{ bottom: `${Math.min(100, dbToMeterRatio(status?.holdDb ?? LIVE_METER_FLOOR_DB) * 100)}%` }"
          title="Peak hold"
        />
        <div class="vu-marks" aria-hidden="true">
          <span style="bottom: 100%">0</span>
          <span style="bottom: 70%">-12</span>
          <span style="bottom: 40%">-24</span>
          <span style="bottom: 0%">-60</span>
        </div>
      </div>
      <div class="vu-readout">
        <div class="peak" :class="{ peaking: status?.peaking }">
          Peak {{ idle || !meter ? '—' : fmtDb(status?.holdDb) }}
          <span class="unit">dBFS</span>
        </div>
        <div class="inst muted">Now {{ idle || !meter ? '—' : fmtDb(status?.peakDb) }}</div>
      </div>
    </div>
    <div v-if="$slots.default" class="below-wave">
      <slot />
    </div>
    <p v-if="status?.peaking && meter" class="warn clip-warn" role="status">
      Clipping / hitting 0 dBFS — back off the mic or input gain.
    </p>
    <p v-else-if="status?.tooLow && meter" class="warn low-warn" role="status">
      Level is low — move closer or raise gain so peaks near −12 to −6 dBFS.
    </p>
    <p v-else-if="recording" class="hint muted">
      Aim for peaks around −12 to −6 dBFS; red bars mean clipping.
    </p>
    <p v-else-if="meter" class="hint muted">
      Check levels, then tap Record when you’re ready to capture.
    </p>
    <p v-else class="hint muted">Open this panel to check mic levels, then tap Record.</p>
  </div>
</template>

<style scoped>
.live-monitor {
  display: grid;
  gap: 0.55rem;
  grid-template-columns: 1fr auto;
  align-items: stretch;
  outline: 2px solid color-mix(in srgb, var(--muted) 45%, transparent);
  outline-offset: 4px;
  border-radius: 10px;
  padding: 0.45rem;
  background: color-mix(in srgb, var(--muted) 8%, var(--surface));
}
.live-monitor.recording {
  outline-color: color-mix(in srgb, #b42318 55%, transparent);
  background: color-mix(in srgb, #b42318 6%, var(--surface));
}
.live-monitor.paused {
  outline-color: color-mix(in srgb, #9a5b00 55%, transparent);
  background: color-mix(in srgb, #9a5b00 7%, var(--surface));
}
.rec-banner {
  grid-column: 1 / -1;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.45rem 0.65rem;
  min-height: 2.5rem;
  padding: 0.4rem 0.7rem;
  border-radius: 8px;
  background: color-mix(in srgb, var(--muted) 72%, #3a3a3a);
  color: #fff;
  font-size: 1rem;
  font-weight: 700;
  letter-spacing: 0.02em;
}
.live-monitor.recording .rec-banner {
  background: #b42318;
}
.live-monitor.paused .rec-banner {
  background: #9a5b00;
}
.rec-banner-dot {
  width: 0.7rem;
  height: 0.7rem;
  border-radius: 50%;
  background: #fff;
  opacity: 0.85;
}
.live-monitor.recording .rec-banner-dot {
  opacity: 1;
  box-shadow: 0 0 0 0 rgba(255, 255, 255, 0.7);
  animation: rec-pulse 1.1s ease-out infinite;
}
.live-monitor.paused .rec-banner-dot {
  animation: none;
  opacity: 0.85;
}
.rec-banner-time {
  margin-left: auto;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  opacity: 0.95;
}
@keyframes rec-pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(255, 255, 255, 0.65);
  }
  70% {
    box-shadow: 0 0 0 0.55rem rgba(255, 255, 255, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(255, 255, 255, 0);
  }
}
.wave-wrap {
  grid-column: 1;
  position: relative;
  min-width: 0;
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
  background: var(--surface);
}
.wave {
  display: block;
  width: 100%;
  height: 96px;
}
.wave-idle {
  display: grid;
  place-items: center;
  background:
    linear-gradient(to bottom, transparent 0%, transparent calc(50% - 0.5px), var(--border) calc(50% - 0.5px), var(--border) calc(50% + 0.5px), transparent calc(50% + 0.5px)),
    var(--surface);
}
.wave-idle-label {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--muted);
  background: color-mix(in srgb, var(--surface) 88%, transparent);
  padding: 0.2rem 0.55rem;
  border-radius: 999px;
}
.vu-col {
  grid-column: 2;
  display: grid;
  gap: 0.35rem;
  justify-items: center;
  min-width: 3.4rem;
}
.below-wave {
  grid-column: 1 / -1;
  min-width: 0;
}
.vu {
  position: relative;
  width: 1.15rem;
  height: 96px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: color-mix(in srgb, var(--border) 55%, transparent);
  overflow: hidden;
}
.vu-fill {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--accent);
  transition: height 50ms linear;
}
.vu-fill.hot {
  background: color-mix(in srgb, #c47b1a 70%, var(--accent));
}
.vu-fill.clip {
  background: #c0392b;
}
.vu-hold {
  position: absolute;
  left: 0;
  right: 0;
  height: 2px;
  margin-bottom: -1px;
  background: #1a1a1a;
  opacity: 0.85;
  pointer-events: none;
}
.vu-marks {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.vu-marks span {
  position: absolute;
  left: 100%;
  margin-left: 0.2rem;
  font-size: 0.62rem;
  color: var(--muted);
  transform: translateY(50%);
  white-space: nowrap;
}
.vu-readout {
  text-align: center;
  font-size: 0.72rem;
  line-height: 1.25;
}
.peak {
  font-weight: 700;
}
.peak.peaking {
  color: #c0392b;
}
.unit {
  font-weight: 500;
  opacity: 0.8;
}
.hint,
.warn {
  grid-column: 1 / -1;
  margin: 0;
  font-size: 0.82rem;
  line-height: 1.35;
}
.warn {
  font-weight: 600;
}
.clip-warn {
  color: #c0392b;
}
.low-warn {
  color: #9a5b00;
}
.muted {
  color: var(--muted);
}
@media (max-width: 420px) {
  .live-monitor {
    grid-template-columns: 1fr;
  }
  .vu-col {
    grid-column: 1;
    grid-template-columns: auto 1fr;
    justify-items: start;
    align-items: center;
    width: 100%;
  }
  .vu {
    height: 72px;
  }
  .vu-readout {
    text-align: left;
  }
}
</style>
