<script setup lang="ts">
/**
 * Tune Detail stage — one canvas: needle / strobe / locking scope + note/¢/legend/level.
 */
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { advanceScopePhase, scopeWavePoints } from '../../audio/tuner/lockingScope'
import { advanceStrobePhase } from '../../audio/tuner/strobe'
import { formatDisplayCents } from '../../domain/tuner/displayCents'
import {
  noteDisplayPartsFromMidi,
  preferFlatsForKeyPc,
} from '../../domain/tuner/noteDisplayParts'
import {
  cancelScheduledTunerPaint,
  readTunerCanvasTheme,
  scheduleTunerPaint,
  sizeTunerCanvas,
} from '../../lib/tuner/canvasPaint'

const props = withDefaults(
  defineProps<{
    cents: number | null
    inTune: boolean
    clarity: number
    displayMidi: number | null
    hz: number | null
    keyPc: number
    legend: string
    level: number
    /** needle | strobe | scope (phase-locked sine) */
    mode: 'needle' | 'strobe' | 'scope'
    /** horizontal bands (default) or radial spokes */
    strobeStyle?: 'horizontal' | 'radial'
    /** 0…1 continuous in-window hold (Detail only). */
    holdProgress?: number
    active: boolean
    windowCents?: number
    scaleCents?: number
  }>(),
  { windowCents: 10, scaleCents: 50, strobeStyle: 'horizontal', holdProgress: 0 },
)

function animates(): boolean {
  return props.active && (props.mode === 'strobe' || props.mode === 'scope')
}

const canvasRef = ref<HTMLCanvasElement | null>(null)
const paintKey = {}
let raf = 0
let phase = 0
let lastTs = 0
let ro: ResizeObserver | null = null
const trail: number[] = []
const TRAIL_MAX = 48

function requestPaint(ts?: number): void {
  scheduleTunerPaint(paintKey, () => paint(ts ?? performance.now()))
}

function pushTrail(c: number | null): void {
  if (c == null || !Number.isFinite(c)) return
  trail.push(c)
  while (trail.length > TRAIL_MAX) trail.shift()
}

function centsToDeg(cents: number, scale: number): number {
  const clamped = Math.max(-scale, Math.min(scale, cents))
  return (clamped / scale) * 90
}

function paint(ts: number): void {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const { cssW: w, cssH: h } = sizeTunerCanvas(canvas, ctx, {
    maxDpr: 2,
    maxPixels: 1_200_000,
  })
  const theme = readTunerCanvasTheme(canvas)
  const dt = lastTs ? (ts - lastTs) / 1000 : 0
  lastTs = ts

  if (props.active && props.cents != null) pushTrail(props.cents)

  ctx.fillStyle = theme.surface
  ctx.fillRect(0, 0, w, h)

  const levelH = Math.max(10, Math.min(16, h * 0.045))
  const pad = 12
  const visualTop = h * 0.38
  const visualBottom = h - levelH - 10
  const visualH = Math.max(40, visualBottom - visualTop)

  // Cents trail behind needle/strobe (scope paints its own accuracy ribbon)
  if (props.mode !== 'scope' && trail.length > 1) {
    const midY = visualTop + visualH * 0.55
    const amp = visualH * 0.35
    const scale = Math.max(10, props.scaleCents)
    ctx.strokeStyle = `color-mix(in srgb, ${theme.accent} 45%, ${theme.border})`
    ctx.lineWidth = 1.5
    ctx.beginPath()
    for (let i = 0; i < trail.length; i++) {
      const x = pad + (i / (TRAIL_MAX - 1)) * (w - pad * 2)
      const c = Math.max(-scale, Math.min(scale, trail[i]!))
      const y = midY - (c / scale) * amp
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
  }

  if (props.mode === 'strobe' && props.active) {
    if (props.cents != null) {
      const sample = advanceStrobePhase(phase, props.cents, dt)
      phase = sample.phase01
    }
    if (props.strobeStyle === 'radial') {
      paintRadialStrobe(ctx, w, visualTop, visualH, phase, theme)
    } else {
      paintStrobe(ctx, w, visualTop, visualH, phase, theme)
    }
  } else if (props.mode === 'scope') {
    if (props.active && props.cents != null) {
      const sample = advanceScopePhase(phase, props.cents, dt)
      phase = sample.phase01
    }
    paintScope(ctx, w, visualTop, visualH, phase, theme)
  } else {
    paintNeedle(ctx, w, visualTop, visualH, theme)
  }

  // Subtle held-in-tune ring (Detail only; never Glance)
  const hold = Math.max(0, Math.min(1, props.holdProgress ?? 0))
  if (hold > 0.02 && props.mode !== 'strobe') {
    const cx = w / 2
    const cy = visualTop + visualH * 0.55
    const r = Math.min(w, visualH) * (0.22 + hold * 0.18)
    ctx.strokeStyle = `color-mix(in srgb, ${theme.accent} ${Math.round(25 + hold * 45)}%, transparent)`
    ctx.lineWidth = 2 + hold * 3
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.stroke()
  }

  // Note + cents overlay (top)
  const parts =
    props.displayMidi == null
      ? null
      : noteDisplayPartsFromMidi(props.displayMidi, preferFlatsForKeyPc(props.keyPc))
  const noteLabel = parts
    ? `${parts.letter}${parts.accidentalGlyph}${parts.octave}`
    : '—'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = theme.text
  const noteSize = Math.round(Math.min(72, Math.max(28, h * 0.16)))
  ctx.font = `700 ${noteSize}px ui-sans-serif, system-ui, sans-serif`
  ctx.fillText(noteLabel, w / 2, pad + noteSize)

  if (props.hz != null && Number.isFinite(props.hz)) {
    ctx.font = `600 ${Math.round(noteSize * 0.32)}px ui-sans-serif, system-ui, sans-serif`
    ctx.fillStyle = theme.muted
    ctx.fillText(`${props.hz.toFixed(1)} Hz`, w / 2, pad + noteSize + noteSize * 0.38)
  }

  const centsText =
    props.cents == null
      ? '—'
      : formatDisplayCents(props.cents, { clarity: props.clarity })
  ctx.font = `700 ${Math.round(Math.min(36, noteSize * 0.5))}px ui-sans-serif, system-ui, sans-serif`
  ctx.fillStyle = props.inTune ? theme.accent : theme.text
  ctx.fillText(centsText, w / 2, pad + noteSize + noteSize * 0.78)

  ctx.font = `600 ${Math.round(Math.min(14, h * 0.035))}px ui-sans-serif, system-ui, sans-serif`
  ctx.fillStyle = theme.muted
  ctx.fillText(props.legend, w / 2, pad + noteSize + noteSize * 1.05)

  // Level strip
  ctx.fillStyle = `color-mix(in srgb, ${theme.border} 70%, ${theme.surface})`
  ctx.fillRect(pad, h - levelH - 4, w - pad * 2, levelH)
  const lw = Math.max(0, Math.min(1, props.level)) * (w - pad * 2)
  ctx.fillStyle = theme.accent
  ctx.fillRect(pad, h - levelH - 4, lw, levelH)
}

function paintStrobe(
  ctx: CanvasRenderingContext2D,
  w: number,
  top: number,
  height: number,
  phase01: number,
  theme: ReturnType<typeof readTunerCanvasTheme>,
): void {
  const stripeH = Math.max(6, height / 8)
  const band = w
  const shift = phase01 * band
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, top, w, height)
  ctx.clip()
  ctx.globalAlpha = 0.5
  ctx.fillStyle = props.inTune ? theme.accent : theme.text
  for (let y = top; y < top + height + stripeH; y += stripeH * 2) {
    ctx.fillRect(-shift, y, band, stripeH)
    ctx.fillRect(band - shift, y, band, stripeH)
  }
  ctx.globalAlpha = 1
  ctx.strokeStyle = theme.border
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(w / 2, top)
  ctx.lineTo(w / 2, top + height)
  ctx.stroke()
  ctx.restore()
}

/** Same strobe phase model; spokes rotate around center. */
function paintRadialStrobe(
  ctx: CanvasRenderingContext2D,
  w: number,
  top: number,
  height: number,
  phase01: number,
  theme: ReturnType<typeof readTunerCanvasTheme>,
): void {
  const cx = w / 2
  const cy = top + height / 2
  const r = Math.min(w * 0.48, height * 0.48)
  const spokes = 16
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, top, w, height)
  ctx.clip()
  ctx.translate(cx, cy)
  ctx.rotate(phase01 * Math.PI * 2)
  ctx.fillStyle = props.inTune ? theme.accent : theme.text
  ctx.globalAlpha = 0.42
  for (let i = 0; i < spokes; i++) {
    if (i % 2 !== 0) continue
    const a0 = (i / spokes) * Math.PI * 2
    const a1 = ((i + 1) / spokes) * Math.PI * 2
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.arc(0, 0, r, a0, a1)
    ctx.closePath()
    ctx.fill()
  }
  ctx.globalAlpha = 1
  ctx.strokeStyle = theme.border
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(0, 0, 4, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
}

function paintNeedle(
  ctx: CanvasRenderingContext2D,
  w: number,
  top: number,
  height: number,
  theme: ReturnType<typeof readTunerCanvasTheme>,
): void {
  const cx = w / 2
  const cy = top + height * 0.92
  const r = Math.min(w * 0.42, height * 0.95)
  const scale = Math.max(10, props.scaleCents)
  const win = Math.max(1, Math.min(scale, props.windowCents))

  // Track arc
  ctx.strokeStyle = theme.border
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.arc(cx, cy, r, Math.PI, 0)
  ctx.stroke()

  // Green wedge
  const a0 = Math.PI + ((-win / scale) * Math.PI) / 2
  const a1 = Math.PI + ((win / scale) * Math.PI) / 2
  ctx.fillStyle = `color-mix(in srgb, ${theme.accent} 35%, transparent)`
  ctx.beginPath()
  ctx.moveTo(cx, cy)
  ctx.arc(cx, cy, r, a0, a1)
  ctx.closePath()
  ctx.fill()

  // Needle
  const deg = props.cents == null ? 0 : centsToDeg(props.cents, scale)
  const rad = Math.PI + ((deg / 90) * Math.PI) / 2
  ctx.strokeStyle = props.inTune ? theme.accent : theme.text
  ctx.lineWidth = 3
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(cx, cy)
  ctx.lineTo(cx + Math.cos(rad) * r * 0.92, cy + Math.sin(rad) * r * 0.92)
  ctx.stroke()
  ctx.fillStyle = props.inTune ? theme.accent : theme.text
  ctx.beginPath()
  ctx.arc(cx, cy, 5, 0, Math.PI * 2)
  ctx.fill()
}

function paintScope(
  ctx: CanvasRenderingContext2D,
  w: number,
  top: number,
  height: number,
  phase01: number,
  theme: ReturnType<typeof readTunerCanvasTheme>,
): void {
  const padX = 16
  const midY = top + height * 0.55
  const amp = height * 0.34
  const left = padX
  const right = w - padX

  // Corridor band (±window); grows gently while held in tune
  const win = Math.max(1, props.windowCents)
  const scale = Math.max(10, props.scaleCents)
  const hold = Math.max(0, Math.min(1, props.holdProgress ?? 0))
  const band = Math.min(amp, (win / scale) * amp) * (1 + hold * 0.35)
  const fillMix = props.inTune ? 22 + hold * 28 : 10
  ctx.fillStyle = props.inTune
    ? `color-mix(in srgb, ${theme.accent} ${fillMix}%, ${theme.surface})`
    : `color-mix(in srgb, ${theme.muted} 10%, ${theme.surface})`
  ctx.fillRect(left, midY - band, right - left, band * 2)

  // Zero line
  ctx.strokeStyle = theme.border
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(left, midY)
  ctx.lineTo(right, midY)
  ctx.stroke()

  // Locking sine — freezes when on pitch
  const pts = scopeWavePoints(phase01, Math.max(48, Math.round((right - left) / 3)))
  ctx.strokeStyle = props.inTune ? theme.accent : theme.text
  ctx.lineWidth = props.inTune ? 2.6 : 2
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.beginPath()
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!
    const x = left + p.x01 * (right - left)
    const y = midY - p.y * amp
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.stroke()

  // Pitch-accuracy ribbon (recent cents) along the center — green when in window
  if (trail.length > 1) {
    ctx.strokeStyle = props.inTune
      ? theme.accent
      : `color-mix(in srgb, ${theme.danger} 70%, ${theme.text})`
    ctx.globalAlpha = 0.55
    ctx.lineWidth = 1.5
    ctx.beginPath()
    for (let i = 0; i < trail.length; i++) {
      const x = left + (i / (TRAIL_MAX - 1)) * (right - left)
      const c = Math.max(-scale, Math.min(scale, trail[i]!))
      const y = midY - (c / scale) * amp * 0.85
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
    ctx.globalAlpha = 1
  }
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
    if (animates()) {
      raf = requestAnimationFrame(tick)
    }
  }
  raf = requestAnimationFrame(tick)
}

watch(
  () => props.mode,
  () => {
    trail.length = 0
    phase = 0
  },
)

watch(
  () =>
    [
      props.cents,
      props.inTune,
      props.clarity,
      props.displayMidi,
      props.hz,
      props.legend,
      props.level,
      props.mode,
      props.strobeStyle,
      props.holdProgress,
      props.active,
      props.windowCents,
    ] as const,
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
  ro = null
})
</script>

<template>
  <div class="stage-wrap">
    <canvas
      ref="canvasRef"
      class="stage"
      role="img"
      aria-hidden="true"
    />
    <div class="sr" aria-live="polite">
      <span v-if="displayMidi != null">{{ legend }}; {{ cents == null ? 'no cents' : formatDisplayCents(cents, { clarity }) }}</span>
      <span v-else>No pitch</span>
    </div>
  </div>
</template>

<style scoped>
.stage-wrap {
  position: relative;
  width: 100%;
  min-height: 14rem;
}
.stage {
  width: 100%;
  height: clamp(14rem, 48vh, 22rem);
  border-radius: 12px;
  border: 1px solid var(--border);
  background: var(--surface);
  display: block;
}
.sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}
</style>
