<script setup lang="ts">
/**
 * Fullscreen receive-link QR before optical transfer — same stage style as the stream overlay.
 */
import { onUnmounted, ref, watch } from 'vue'
import { qrDataUrl } from '../lib/qr'

const INLINE_QR_PX = 1024

const props = withDefaults(
  defineProps<{
    open: boolean
    url: string
    startDisabled?: boolean
    startLabel?: string
  }>(),
  {
    startDisabled: false,
    startLabel: 'Start QR transfer',
  },
)

const emit = defineEmits<{
  close: []
  start: []
}>()

const qrSrc = ref('')
const qrBusy = ref(false)

watch(
  () => [props.open, props.url] as const,
  async ([open, url]) => {
    if (!open || !url) {
      qrSrc.value = ''
      return
    }
    qrBusy.value = true
    try {
      qrSrc.value = await qrDataUrl(url, INLINE_QR_PX)
    } catch {
      qrSrc.value = ''
    } finally {
      qrBusy.value = false
    }
  },
  { immediate: true },
)

watch(
  () => props.open,
  (open) => {
    if (open) window.addEventListener('keydown', onKey)
    else window.removeEventListener('keydown', onKey)
  },
)

function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    e.preventDefault()
    e.stopPropagation()
    emit('close')
  }
}

onUnmounted(() => {
  window.removeEventListener('keydown', onKey)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-show="open"
      class="receive-invite-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Receive link QR code"
    >
      <div class="overlay-chrome" role="toolbar" aria-label="Receive link controls">
        <button type="button" class="chrome-btn close-btn" @click="emit('close')">Close</button>
      </div>

      <div class="overlay-panel">
        <div class="qr-stage">
          <img
            v-if="qrSrc"
            class="receive-qr"
            :src="qrSrc"
            alt="QR code to open optical receive mode"
          />
          <p v-else-if="qrBusy" class="overlay-status" role="status">Generating QR…</p>
          <p v-else class="overlay-status" role="alert">Could not generate QR code.</p>
        </div>
      </div>

      <div class="overlay-actions">
        <button
          type="button"
          class="start-btn"
          :disabled="startDisabled || qrBusy"
          @click="emit('start')"
        >
          {{ startLabel }}
        </button>
      </div>

      <p class="receive-url-footer" aria-label="Receive link">{{ url }}</p>
    </div>
  </Teleport>
</template>

<style scoped>
.receive-invite-overlay {
  position: fixed;
  inset: 0;
  z-index: 139;
  display: grid;
  grid-template-rows: auto 1fr auto auto;
  gap: 0.65rem;
  padding: max(0.75rem, env(safe-area-inset-top)) max(0.75rem, env(safe-area-inset-right))
    max(0.75rem, env(safe-area-inset-bottom)) max(0.75rem, env(safe-area-inset-left));
  background: #0a0a0a;
  color: #fff;
}
.overlay-chrome {
  display: flex;
  align-items: center;
  justify-content: flex-end;
}
.chrome-btn {
  box-sizing: border-box;
  min-height: 44px;
  min-width: 4.5rem;
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
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  box-shadow: 0 1px 6px rgba(0, 0, 0, 0.25);
  cursor: pointer;
  touch-action: manipulation;
  user-select: none;
}
.chrome-btn:hover {
  background: rgba(40, 40, 40, 0.52);
}
.chrome-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.overlay-panel {
  display: grid;
  place-items: center;
  min-height: 0;
  overflow: hidden;
}
.qr-stage {
  display: grid;
  place-items: center;
  max-width: 100%;
  max-height: 100%;
}
.receive-qr {
  display: block;
  width: min(72vw, 72vh);
  height: auto;
  max-height: min(72vw, 72vh);
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.45);
}
.overlay-status {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.88);
}
.overlay-actions {
  display: grid;
  justify-items: center;
  padding: 0 0.25rem;
}
.start-btn {
  box-sizing: border-box;
  min-height: 48px;
  min-width: min(100%, 20rem);
  padding: 0.65rem 1.25rem;
  border: none;
  border-radius: 12px;
  background: var(--accent);
  color: #fff;
  font: inherit;
  font-size: 1rem;
  font-weight: 700;
  cursor: pointer;
  touch-action: manipulation;
}
.start-btn:hover:not(:disabled) {
  filter: brightness(1.06);
}
.start-btn:disabled {
  opacity: 0.45;
  cursor: default;
}
.start-btn:focus-visible {
  outline: 2px solid #fff;
  outline-offset: 2px;
}
.receive-url-footer {
  margin: 0;
  width: 100%;
  text-align: center;
  font-size: min(5.5vw, 8vh, 2.75rem);
  font-weight: 800;
  line-height: 1.15;
  letter-spacing: -0.02em;
  word-break: break-all;
  color: rgba(255, 255, 255, 0.95);
  hyphens: auto;
}
</style>
