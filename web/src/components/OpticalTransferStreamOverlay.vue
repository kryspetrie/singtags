<script setup lang="ts">
/**
 * Fullscreen animated QR stream for optical transfer — stage sharing with zoom.
 */
import { onUnmounted, watch } from 'vue'
import { formatBytes } from '../offline/storageEstimate'
import type { DecimenSendStreamProgress } from '../lib/decimen/sendProgress'
import type { OpticalSendCountdownTick } from '../lib/decimen/sendCountdown'

/** Fill factor: 1 = max stage size; − shrinks from there. */
const DISPLAY_SCALE_MIN = 0.4
const DISPLAY_SCALE_MAX = 1
const DISPLAY_SCALE_STEP = 0.15

const props = defineProps<{
  open: boolean
  status?: string
  progress?: DecimenSendStreamProgress | null
  countdown?: OpticalSendCountdownTick | null
  displayScale: number
  /** Offer “Easier scan” while streaming when a lower density/grid is available. */
  canEaseScan?: boolean
  easeScanBusy?: boolean
}>()

const emit = defineEmits<{
  stop: []
  'update:displayScale': [scale: number]
  'ease-scan': []
  'toggle-countdown-pause': []
}>()

function clampScale(scale: number): number {
  return Math.min(DISPLAY_SCALE_MAX, Math.max(DISPLAY_SCALE_MIN, Math.round(scale * 20) / 20))
}

function setScale(scale: number): void {
  emit('update:displayScale', clampScale(scale))
}

function bumpScale(delta: number): void {
  setScale(props.displayScale + delta)
}

function onCountdownStageClick(e: MouseEvent): void {
  if (props.countdown == null) return
  e.preventDefault()
  emit('toggle-countdown-pause')
}

function onStreamKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    e.preventDefault()
    e.stopPropagation()
    emit('stop')
    return
  }
  if (props.countdown != null && (e.key === ' ' || e.key === 'Enter')) {
    e.preventDefault()
    emit('toggle-countdown-pause')
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
        <button
          v-if="canEaseScan"
          type="button"
          class="chrome-btn ease-btn"
          :disabled="easeScanBusy || countdown != null"
          aria-label="Retry with easier-to-scan QR codes"
          title="Receiver struggling? Restart with larger QR modules"
          @click="emit('ease-scan')"
        >
          Easier scan
        </button>
        <button type="button" class="chrome-btn stop-btn" @click="emit('stop')">Stop</button>
      </div>

      <div class="optical-stream-panel">
        <div
          class="qr-stage"
          :class="{ 'countdown-active': countdown != null }"
          @click="onCountdownStageClick"
        >
          <slot />
          <div
            v-if="countdown != null"
            class="countdown-overlay"
            role="status"
            aria-live="assertive"
            :aria-label="
              countdown === 'paused' ? 'Countdown paused. Tap to restart.' : `Starting in ${countdown}`
            "
          >
            <span
              v-if="countdown === 'paused'"
              class="countdown-pause"
              aria-hidden="true"
            >
              <svg viewBox="0 0 64 64" width="1em" height="1em" focusable="false">
                <rect x="14" y="10" width="12" height="44" rx="3" fill="currentColor" />
                <rect x="38" y="10" width="12" height="44" rx="3" fill="currentColor" />
              </svg>
            </span>
            <span v-else class="countdown-num" :key="countdown">{{ countdown }}</span>
          </div>
        </div>
      </div>

      <div class="optical-stream-footer">
        <div
          v-if="progress && countdown == null"
          class="send-progress"
          role="status"
          aria-live="polite"
        >
          <div
            class="send-progress-bar"
            role="progressbar"
            :aria-valuenow="progress.percent"
            aria-valuemin="0"
            aria-valuemax="100"
            :aria-valuetext="`~${formatBytes(progress.bytesEstimate)} / ${formatBytes(progress.totalBytes)}`"
          >
            <div class="send-progress-fill" :style="{ width: `${progress.percent}%` }" />
          </div>
          <p class="send-progress-meta">
            <span class="send-progress-bytes"
              >~{{ formatBytes(progress.bytesEstimate) }} /
              {{ formatBytes(progress.totalBytes) }}</span
            >
            <span v-if="progress.likelyComplete" class="send-progress-ok">Probably enough</span>
            <span v-else-if="progress.phase === 'collecting'" class="send-progress-hint"
              >Collecting…</span
            >
            <span v-else class="send-progress-hint">Redundancy…</span>
            <span v-if="status" class="send-progress-status">{{ status }}</span>
          </p>
        </div>

        <p
          v-else-if="status && countdown == null"
          class="optical-stream-status"
          role="status"
        >
          {{ status }}
        </p>
        <p v-else-if="countdown != null" class="optical-stream-status" role="status">
          {{ countdown === 'paused' ? 'Paused — tap to restart' : 'Get phones ready…' }}
        </p>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.optical-stream {
  position: fixed;
  inset: 0;
  z-index: 140;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  gap: 0.5rem;
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
.chrome-btn.ease-btn {
  flex-shrink: 0;
  white-space: nowrap;
}
.chrome-btn.stop-btn {
  flex-shrink: 0;
  min-width: 4.5rem;
}
.optical-stream-panel {
  display: grid;
  place-items: center;
  min-height: 0;
  min-width: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  pointer-events: none;
}
.qr-stage {
  position: relative;
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  max-width: 100%;
  max-height: 100%;
  min-width: 0;
  min-height: 0;
}
.qr-stage.countdown-active {
  cursor: pointer;
  pointer-events: auto;
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
.countdown-pause {
  display: grid;
  place-items: center;
  font-size: min(28vw, 28vh, 10rem);
  color: #fff;
  filter: drop-shadow(0 0 0.25em #000) drop-shadow(0.04em 0.04em 0 #000);
  animation: countdown-pop 0.45s ease-out;
}
.countdown-pause svg {
  display: block;
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
  max-width: 100%;
  max-height: 100%;
  width: auto;
  height: auto;
  object-fit: contain;
  border-radius: 8px;
  background: transparent;
  box-shadow: none;
  pointer-events: none;
  opacity: 0;
}
.optical-stream-panel :deep(.qr-canvas.is-ready) {
  opacity: 1;
  background: #fff;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.45);
}
/* Fixed one-line footer so progress text never resizes the QR stage. */
.optical-stream-footer {
  display: grid;
  align-content: center;
  justify-items: stretch;
  min-height: 2.75rem;
  height: 2.75rem;
}
.optical-stream-status {
  margin: 0;
  text-align: center;
  font-size: 0.88rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.88);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.send-progress {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 0.55rem;
  width: 100%;
  min-width: 0;
  margin: 0;
}
.send-progress-bar {
  flex: 1 1 5rem;
  min-width: 3.5rem;
  max-width: 12rem;
  height: 0.4rem;
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
  flex-wrap: nowrap;
  align-items: center;
  gap: 0.4rem 0.55rem;
  min-width: 0;
  flex: 1 1 auto;
  font-size: 0.84rem;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
}
.send-progress-bytes {
  flex: 0 0 auto;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: rgba(255, 255, 255, 0.95);
}
.send-progress-ok {
  flex: 0 0 auto;
  color: #9be49b;
  font-weight: 650;
}
.send-progress-hint {
  flex: 0 0 auto;
  color: rgba(255, 255, 255, 0.68);
}
.send-progress-status {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  color: rgba(255, 255, 255, 0.55);
  font-weight: 500;
}
</style>
