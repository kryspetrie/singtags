<script setup lang="ts">
/**
 * Fullscreen QR overlay with zoom controls for stage sharing.
 */
import { computed, onUnmounted, ref, watch } from 'vue'
import { qrDataUrl } from '../lib/qr'

const BASE_QR_PX = 200
/** High-res source so CSS upscaling for stage stays sharp. */
const ENLARGE_QR_PX = 1024
const ENLARGE_SCALE_MIN = 1
const ENLARGE_SCALE_MAX = 6
const ENLARGE_SCALE_STEP = 0.5
/** Open enlarge at 2× the in-sheet QR size. */
const ENLARGE_SCALE_DEFAULT = 2

const props = defineProps<{
  open: boolean
  /** URL encoded in the QR code. */
  url: string
  /** Lower-res QR to show while loading or if high-res generation fails. */
  previewSrc?: string
  alt?: string
}>()

const emit = defineEmits<{
  close: []
}>()

const enlargeScale = ref(ENLARGE_SCALE_DEFAULT)
const enlargeSrc = ref('')
const enlargeBusy = ref(false)

const enlargeDisplayPx = computed(() => Math.round(BASE_QR_PX * enlargeScale.value))
const displaySrc = computed(() => enlargeSrc.value || props.previewSrc || '')

watch(
  () => props.open,
  (open) => {
    if (!open) {
      enlargeSrc.value = ''
      window.removeEventListener('keydown', onEnlargeKey)
      return
    }
    enlargeScale.value = ENLARGE_SCALE_DEFAULT
    window.addEventListener('keydown', onEnlargeKey)
    void ensureEnlargeSrc()
  },
)

watch(
  () => props.url,
  () => {
    if (!props.open) return
    enlargeSrc.value = ''
    void ensureEnlargeSrc()
  },
)

async function ensureEnlargeSrc(): Promise<void> {
  if (!props.url) return
  if (enlargeSrc.value) return
  enlargeBusy.value = true
  try {
    enlargeSrc.value = await qrDataUrl(props.url, ENLARGE_QR_PX)
  } catch {
    enlargeSrc.value = props.previewSrc ?? ''
  } finally {
    enlargeBusy.value = false
  }
}

function close(): void {
  emit('close')
}

function bumpEnlargeScale(delta: number): void {
  const next = Math.round((enlargeScale.value + delta) * 10) / 10
  enlargeScale.value = Math.min(ENLARGE_SCALE_MAX, Math.max(ENLARGE_SCALE_MIN, next))
}

function onEnlargeKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    e.preventDefault()
    e.stopPropagation()
    close()
    return
  }
  if (e.key === '+' || e.key === '=') {
    e.preventDefault()
    bumpEnlargeScale(ENLARGE_SCALE_STEP)
  } else if (e.key === '-' || e.key === '_') {
    e.preventDefault()
    bumpEnlargeScale(-ENLARGE_SCALE_STEP)
  }
}

onUnmounted(() => {
  window.removeEventListener('keydown', onEnlargeKey)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="qr-enlarge"
      role="dialog"
      aria-modal="true"
      aria-label="Enlarged QR code"
    >
      <button type="button" class="qr-enlarge-backdrop" aria-label="Close enlarged QR" @click="close" />

      <div class="qr-enlarge-chrome" role="toolbar" aria-label="QR size controls">
        <div class="qr-enlarge-shift" role="group" aria-label="QR size">
          <button
            type="button"
            class="chrome-btn"
            :disabled="enlargeScale <= ENLARGE_SCALE_MIN"
            aria-label="Make QR smaller"
            title="Smaller"
            @click="bumpEnlargeScale(-ENLARGE_SCALE_STEP)"
          >
            −
          </button>
          <button
            type="button"
            class="chrome-btn"
            :disabled="enlargeScale >= ENLARGE_SCALE_MAX"
            aria-label="Make QR larger"
            title="Larger"
            @click="bumpEnlargeScale(ENLARGE_SCALE_STEP)"
          >
            +
          </button>
        </div>
        <button
          type="button"
          class="chrome-btn exit"
          aria-label="Close enlarged QR"
          title="Close"
          @click="close"
        >
          ✕
        </button>
      </div>

      <div class="qr-enlarge-panel">
        <img
          v-if="displaySrc"
          class="qr-enlarge-img"
          :src="displaySrc"
          :width="enlargeDisplayPx"
          :height="enlargeDisplayPx"
          :style="{ width: `${enlargeDisplayPx}px`, height: `${enlargeDisplayPx}px` }"
          :alt="alt || 'Large QR code'"
        />
        <p v-else-if="enlargeBusy" class="qr-enlarge-status" role="status">Generating QR…</p>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.qr-enlarge {
  position: fixed;
  inset: 0;
  z-index: 120;
  display: grid;
  place-items: center;
  padding: max(0.75rem, env(safe-area-inset-top)) max(0.75rem, env(safe-area-inset-right))
    max(0.75rem, env(safe-area-inset-bottom)) max(0.75rem, env(safe-area-inset-left));
}
.qr-enlarge-backdrop {
  position: absolute;
  inset: 0;
  border: 0;
  padding: 0;
  margin: 0;
  background: rgba(0, 0, 0, 0.88);
  cursor: pointer;
}
.qr-enlarge-chrome {
  position: absolute;
  top: calc(0.5rem + env(safe-area-inset-top));
  right: calc(0.5rem + env(safe-area-inset-right));
  left: calc(0.5rem + env(safe-area-inset-left));
  z-index: 2;
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 0.45rem;
  pointer-events: none;
}
.qr-enlarge-shift {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  margin-right: auto;
  pointer-events: none;
}
.qr-enlarge-chrome > *,
.qr-enlarge-shift > * {
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
.chrome-btn.exit {
  width: 44px;
  padding: 0;
  font-size: 1.25rem;
  font-weight: 500;
  margin-left: auto;
}
.qr-enlarge-panel {
  position: relative;
  z-index: 1;
  display: grid;
  justify-items: center;
  max-width: 100%;
  max-height: 100%;
  pointer-events: none;
}
.qr-enlarge-img {
  display: block;
  max-width: min(96vw, 96vh);
  max-height: min(96vw, 96vh);
  object-fit: contain;
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.45);
}
.qr-enlarge-status {
  margin: 0;
  color: #fff;
  font-size: 1rem;
}
</style>
