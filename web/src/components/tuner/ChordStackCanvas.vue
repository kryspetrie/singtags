<script setup lang="ts">
/**
 * Chord Detail lane canvas — four pitch lanes with ¢ sparks + green corridor.
 */
import { onMounted, onUnmounted, ref, watch } from 'vue'
import type { ChordStackScore } from '../../domain/tuner/chordStack'
import type { ChordToneRow } from '../../composables/useTunerChordSession'
import { formatDisplayCents } from '../../domain/tuner/displayCents'
import {
  cancelScheduledTunerPaint,
  readTunerCanvasTheme,
  scheduleTunerPaint,
  sizeTunerCanvas,
} from '../../lib/tuner/canvasPaint'

const props = withDefaults(
  defineProps<{
    score: ChordStackScore | null
    rows: ChordToneRow[]
    clarity?: number
    /** Green corridor half-width in cents (matches scoring window). */
    windowCents?: number
  }>(),
  { windowCents: 5 },
)

const canvasRef = ref<HTMLCanvasElement | null>(null)
const paintKey = {}
let ro: ResizeObserver | null = null

function requestPaint(): void {
  scheduleTunerPaint(paintKey, paint)
}

function statusLabel(): string {
  const s = props.score
  if (s?.assistedPinRequired) return 'Pin nature/root in Settings to color Locked/Fix'
  if (!s || s.unstable) return 'Listening…'
  if (s.status === 'locked') return 'Locked'
  if (s.status === 'shifted') {
    const dir = s.commonShiftCents >= 0 ? 'sharp' : 'flat'
    return `Locked · ${Math.abs(Math.round(s.commonShiftCents))}¢ ${dir} of key`
  }
  if (s.status === 'fix') return 'Fix — hold JI roles'
  return 'Hold steady to score'
}

function paint(): void {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const { cssW: w, cssH: h } = sizeTunerCanvas(canvas, ctx, {
    maxDpr: 2,
    maxPixels: 1_000_000,
  })
  const theme = readTunerCanvasTheme(canvas)

  ctx.fillStyle = theme.surface
  ctx.fillRect(0, 0, w, h)

  const headerH = 36
  const status = statusLabel()
  const st = props.score && !props.score.unstable ? props.score.status : 'wait'
  ctx.fillStyle =
    st === 'locked'
      ? `color-mix(in srgb, ${theme.accent} 22%, ${theme.surface})`
      : st === 'fix'
        ? `color-mix(in srgb, ${theme.danger} 18%, ${theme.surface})`
        : st === 'shifted'
          ? `color-mix(in srgb, #c90 20%, ${theme.surface})`
          : `color-mix(in srgb, ${theme.muted} 12%, ${theme.surface})`
  ctx.fillRect(0, 0, w, headerH)
  ctx.fillStyle = theme.text
  ctx.font = `700 14px ui-sans-serif, system-ui, sans-serif`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(status, 12, headerH / 2)
  if (props.score) {
    ctx.textAlign = 'right'
    ctx.fillStyle = theme.muted
    ctx.font = `600 12px ui-sans-serif, system-ui, sans-serif`
    ctx.fillText(`${props.score.natureId}`, w - 12, headerH / 2)
  }

  const lanes = Math.max(1, props.rows.length)
  const bodyH = h - headerH
  const laneH = bodyH / lanes
  const scale = 40 // ±40¢ fills lane

  for (let i = 0; i < lanes; i++) {
    const row = props.rows[i]
    const y0 = headerH + i * laneH
    const mid = y0 + laneH / 2
    ctx.strokeStyle = theme.border
    ctx.globalAlpha = 0.35
    ctx.beginPath()
    ctx.moveTo(0, y0 + laneH)
    ctx.lineTo(w, y0 + laneH)
    ctx.stroke()
    ctx.globalAlpha = 1

    // Green corridor matches scoring window
    const band = (Math.max(1, props.windowCents) / scale) * (laneH * 0.4)
    ctx.fillStyle = `color-mix(in srgb, ${theme.accent} 14%, transparent)`
    ctx.fillRect(88, mid - band, w - 100, band * 2)

    ctx.strokeStyle = theme.border
    ctx.globalAlpha = 0.5
    ctx.beginPath()
    ctx.moveTo(88, mid)
    ctx.lineTo(w - 12, mid)
    ctx.stroke()
    ctx.globalAlpha = 1

    const tone = row?.tone ?? null
    const hearing = row?.hearing ?? null
    const rawNote = tone?.note ?? hearing?.note ?? null
    const note = rawNote ? rawNote.replace('#', '♯').replace('b', '♭') : '—'
    const mark = tone?.glanceMark ?? ''
    const cents =
      tone == null
        ? hearing
          ? `${hearing.hz.toFixed(0)} Hz`
          : '—'
        : formatDisplayCents(tone.errorCentsVsJi, { clarity: props.clarity ?? 0.85 })

    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = tone?.inTuneSelf ? theme.accent : theme.text
    ctx.font = `700 15px ui-sans-serif, system-ui, sans-serif`
    ctx.fillText(note, 10, mid - 8)
    ctx.fillStyle = theme.muted
    ctx.font = `600 11px ui-sans-serif, system-ui, sans-serif`
    ctx.fillText(tone ? `r${tone.role}` : hearing ? 'live' : '·', 10, mid + 10)
    ctx.textAlign = 'right'
    ctx.fillStyle = tone?.inTuneSelf ? theme.accent : theme.text
    ctx.font = `700 13px ui-sans-serif, system-ui, sans-serif`
    ctx.fillText(`${cents}${mark ? ` ${mark}` : ''}`, w - 12, mid)

    const xs = row?.trace.cents ?? []
    if (xs.length >= 2) {
      ctx.strokeStyle = tone?.inTuneSelf
        ? theme.accent
        : hearing
          ? theme.text
          : theme.danger
      ctx.lineWidth = 2
      ctx.beginPath()
      const left = 88
      const right = w - 48
      for (let j = 0; j < xs.length; j++) {
        const x = left + (j / (xs.length - 1)) * (right - left)
        const c = Math.max(-scale, Math.min(scale, xs[j]!))
        const y = mid - (c / scale) * (laneH * 0.38)
        if (j === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()
    }
  }
}

watch(
  () => [props.rows, props.score, props.clarity, props.windowCents],
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
  ro = null
})
</script>

<template>
  <canvas
    ref="canvasRef"
    class="lanes"
    role="img"
    :aria-label="statusLabel()"
  />
</template>

<style scoped>
.lanes {
  width: 100%;
  height: clamp(16rem, 52vh, 24rem);
  border-radius: 12px;
  border: 1px solid var(--border);
  background: var(--surface);
  display: block;
}
</style>
