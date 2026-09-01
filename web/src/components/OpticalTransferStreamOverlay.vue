<script setup lang="ts">
/**
 * Fullscreen animated QR stream for optical transfer — stage sharing with zoom.
 */
import { computed, onUnmounted, watch } from 'vue'
import { formatBytes } from '../offline/storageEstimate'
import type { DecimenSendStreamProgress } from '../lib/decimen/sendProgress'

const DISPLAY_SCALE_MIN = 1
const DISPLAY_SCALE_MAX = 6
/** One tap on +/- jumps a full step. */
const DISPLAY_SCALE_STEP = 1
const DISPLAY_SCALE_SLIDER_STEP = 0.25

const props = defineProps<{
  open: boolean
  status?: string
  progress?: DecimenSendStreamProgress | null
  countdown?: number | null
  displayScale: number
}>()

const emit = defineEmits<{
  stop: []
  'update:displayScale': [scale: number]
}>()

const scaleLabel = computed(() => `${props.displayScale.toFixed(1)}×`)

const progressBytesLine = computed(() => {
  const p = props.progress
  if (!p) return ''
  return `~${formatBytes(p.bytesEstimate)} / ${formatBytes(p.totalBytes)}`
})

function clampScale(scale: number): number {
  return Math.min(DISPLAY_SCALE_MAX, Math.max(DISPLAY_SCALE_MIN, Math.round(scale * 4) / 4))
}

function setScale(scale: number): void {
  emit('update:displayScale', clampScale(scale))
}

function bumpScale(delta: number): void {
  setScale(props.displayScale + delta)
}

function onStreamKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    e.preventDefault()
    e.stopPropagation()
    emit('stop')
    return
  }
  if (e.key === '+' || e.key === '=') {
    e.preventDefault()
    bumpScale(DISPLAY_SCALE_STEP)
  } else if (e.key === '-' || e.key === '_') {
    e.preventDefault()
    bumpScale(-DISPLAY_SCALE_STEP)
  }
}

watch(
  () => props.open,
  (open) => {
    if (open) window.addEventListener('keydown', onStreamKey)
    else window.removeEventListener('keydown', onStreamKey)
  },
)

onUnmounted(() => {
  window.removeEventListener('keydown', onStreamKey)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-show="open"
      class="optical-stream"
      role="dialog"
      aria-modal="true"
      aria-label="Optical transfer QR stream"
    >
      <div class="optical-stream-chrome" role="toolbar" aria-label="QR stream controls">
        <div class="optical-stream-zoom" role="group" aria-label="QR size">
          <button
            type="button"
            class="chrome-btn"
            :disabled="displayScale <= DISPLAY_SCALE_MIN"
            aria-label="Make QR smaller"
            title="Smaller"
            @click="bumpScale(-DISPLAY_SCALE_STEP)"
          >
            −
          </button>
          <label class="zoom-slider-wrap">
            <span class="visually-hidden">QR size</span>
            <input
              class="zoom-slider"
              type="range"
              :min="DISPLAY_SCALE_MIN"
              :max="DISPLAY_SCALE_MAX"
              :step="DISPLAY_SCALE_SLIDER_STEP"
              :value="displayScale"
              aria-valuemin="DISPLAY_SCALE_MIN"
              aria-valuemax="DISPLAY_SCALE_MAX"
              :aria-valuenow="displayScale"
              aria-label="QR size"
              @input="setScale(Number(($event.target as HTMLInputElement).value))"
            />
          </label>
          <span class="zoom-label" aria-hidden="true">{{ scaleLabel }}</span>
          <button
            type="button"
            class="chrome-btn"
            :disabled="displayScale >= DISPLAY_SCALE_MAX"
            aria-label="Make QR larger"
            title="Larger"
            @click="bumpScale(DISPLAY_SCALE_STEP)"
          >
            +
          </button>
        </div>
        <button type="button" class="chrome-btn stop-btn" @click="emit('stop')">Stop</button>
      </div>

      <div class="optical-stream-panel">
        <div class="qr-stage">
          <slot />
          <div
            v-if="countdown != null"
            class="countdown-overlay"
            role="status"
            aria-live="assertive"
            :aria-label="`Starting in ${countdown}`"
          >
            <span class="countdown-num" :key="countdown">{{ countdown }}</span>
          </div>
        </div>
      </div>

      <div v-if="progress && countdown == null" class="send-progress" role="status" aria-live="polite">
        <div
          class="send-progress-bar"
          role="progressbar"
          :aria-valuenow="progress.percent"
          aria-valuemin="0"
          aria-valuemax="100"
          :aria-valuetext="progressBytesLine"
        >
          <div class="send-progress-fill" :style="{ width: `${progress.percent}%` }" />
        </div>
        <p class="send-progress-meta">
          <span class="send-progress-bytes">{{ progressBytesLine }}</span>
          <span v-if="progress.likelyComplete" class="send-progress-ok">Probably enough — hold steady a moment longer</span>
          <span v-else-if="progress.phase === 'collecting'" class="send-progress-hint">Collecting frames…</span>
          <span v-else class="send-progress-hint">Sending redundancy…</span>
        </p>
      </div>

      <p v-if="status && countdown == null" class="optical-stream-status" role="status">{{ status }}</p>
      <p v-else-if="countdown != null" class="optical-stream-status" role="status">Get phones ready…</p>
    </div>
  </Teleport>
</template>

<style scoped>
.optical-stream {
  position: fixed;
  inset: 0;
  z-index: 140;
  display: grid;
  grid-template-rows: auto 1fr auto;
  gap: 0.65rem;
  padding: max(0.75rem, env(safe-area-inset-top)) max(0.75rem, env(safe-area-inset-right))
    max(0.75rem, env(safe-area-inset-bottom)) max(0.75rem, env(safe-area-inset-left));
  background: #0a0a0a;
  color: #fff;
}
.optical-stream-chrome {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 0.45rem;
  pointer-events: none;
}
.optical-stream-zoom {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  gap: 0.45rem;
  min-width: 0;
  margin-right: auto;
  pointer-events: none;
}
.optical-stream-chrome > *,
.optical-stream-zoom > * {
  pointer-events: auto;
}
.chrome-btn {
  box-sizing: border-box;
  min-height: 44px;
  min-width: 44px;
  padding: 0 0.85rem;
  border: 1px solid rgba(255, 255, 255, 0.28);
  border-radius: 12px;
  background: rgba(20, 20, 20, 0.38);
  color: #fff;
  font: inherit;
  font-size: 0.92rem;
  font-weight: 600;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  box-shadow: 0 1px 6px rgba(0, 0, 0, 0.25);
  cursor: pointer;
  touch-action: manipulation;
  user-select: none;
}
.chrome-btn:hover:not(:disabled) {
  background: rgba(40, 40, 40, 0.52);
}
.chrome-btn:disabled {
  opacity: 0.4;
  cursor: default;
}
.chrome-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.chrome-btn.stop-btn {
  flex-shrink: 0;
  min-width: 4.5rem;
}
.zoom-slider-wrap {
  flex: 1 1 8rem;
  min-width: 5.5rem;
  max-width: 16rem;
  display: flex;
  align-items: center;
  margin: 0;
}
.zoom-slider {
  width: 100%;
  margin: 0;
  accent-color: #fff;
  cursor: pointer;
  touch-action: pan-x;
}
.zoom-label {
  flex-shrink: 0;
  min-width: 2.75rem;
  font-size: 0.92rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  text-align: center;
  color: rgba(255, 255, 255, 0.92);
}
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
.optical-stream-panel {
  display: grid;
  place-items: center;
  min-height: 0;
  overflow: hidden;
  pointer-events: none;
}
.qr-stage {
  position: relative;
  display: inline-grid;
  place-items: center;
  max-width: 100%;
  max-height: 100%;
}
.countdown-overlay {
  position: absolute;
  inset: 0;
  display: grid;
  place-content: center;
  justify-items: center;
  pointer-events: none;
}
.countdown-num {
  font-size: min(42vw, 42vh, 18rem);
  font-weight: 900;
  line-height: 0.95;
  letter-spacing: -0.04em;
  font-variant-numeric: tabular-nums;
  color: #fff;
  -webkit-text-stroke: 0.08em #000;
  paint-order: stroke fill;
  text-shadow:
    0 0 0.4em #000,
    0.04em 0.04em 0 #000,
    -0.04em 0.04em 0 #000,
    0.04em -0.04em 0 #000,
    -0.04em -0.04em 0 #000;
  animation: countdown-pop 0.45s ease-out;
}
@keyframes countdown-pop {
  from {
    opacity: 0.5;
    transform: scale(0.82);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
.optical-stream-panel :deep(.qr-canvas) {
  display: block;
  max-width: min(96vw, 96vh);
  max-height: min(96vw, 96vh);
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.45);
  pointer-events: none;
}
.optical-stream-status {
  margin: 0;
  text-align: center;
  font-size: 0.92rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.88);
}
.send-progress {
  display: grid;
  gap: 0.4rem;
  width: min(100%, 28rem);
  margin: 0 auto;
}
.send-progress-bar {
  height: 0.45rem;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.14);
  overflow: hidden;
}
.send-progress-fill {
  height: 100%;
  border-radius: inherit;
  background: #fff;
  transition: width 0.2s ease;
}
.send-progress-meta {
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.35rem 0.65rem;
  font-size: 0.88rem;
  line-height: 1.35;
  text-align: center;
}
.send-progress-bytes {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: rgba(255, 255, 255, 0.95);
}
.send-progress-ok {
  color: #9be49b;
  font-weight: 650;
}
.send-progress-hint {
  color: rgba(255, 255, 255, 0.68);
}
</style>
