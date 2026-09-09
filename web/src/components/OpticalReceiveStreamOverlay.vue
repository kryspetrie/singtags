<script setup lang="ts">
/**
 * Fullscreen camera receive for optical transfer — landscape-friendly stage.
 */
import { onUnmounted, watch } from 'vue'
import type { OpticalCameraDevice } from '../lib/decimen/opticalCamera'

const props = defineProps<{
  open: boolean
  status?: string
  error?: string | null
  saveAfter: boolean
  openAfter: boolean
  saveAfterLabel: string
  cameraFit: 'height' | 'all'
  cameras: OpticalCameraDevice[]
  deviceId: string
}>()

const emit = defineEmits<{
  stop: []
  'update:saveAfter': [value: boolean]
  'update:openAfter': [value: boolean]
  'update:cameraFit': [value: 'height' | 'all']
  'update:deviceId': [value: string]
}>()

function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    e.preventDefault()
    e.stopPropagation()
    emit('stop')
  }
}

watch(
  () => props.open,
  (open) => {
    if (open) window.addEventListener('keydown', onKey)
    else window.removeEventListener('keydown', onKey)
  },
)

onUnmounted(() => {
  window.removeEventListener('keydown', onKey)
})

function onDeviceChange(event: Event): void {
  const select = event.target as HTMLSelectElement
  emit('update:deviceId', select.value)
}

function toggleFit(): void {
  emit('update:cameraFit', props.cameraFit === 'height' ? 'all' : 'height')
}

const fitLabel = () => (props.cameraFit === 'height' ? 'Fit all' : 'Fit height')
</script>

<template>
  <Teleport to="body">
    <div
      v-show="open"
      class="optical-receive"
      role="dialog"
      aria-modal="true"
      aria-label="Optical transfer receive camera"
    >
      <div class="receive-chrome" role="toolbar" aria-label="Receive controls">
        <label v-if="cameras.length" class="camera-field">
          <span class="camera-field-label">Camera</span>
          <select
            class="camera-select"
            :value="deviceId"
            aria-label="Camera"
            @change="onDeviceChange"
          >
            <option v-if="!deviceId" value="">Default</option>
            <option v-for="cam in cameras" :key="cam.deviceId" :value="cam.deviceId">
              {{ cam.label }}
            </option>
          </select>
        </label>
        <button type="button" class="chrome-btn" @click="toggleFit">{{ fitLabel() }}</button>
        <button type="button" class="chrome-btn stop-btn" @click="emit('stop')">Stop</button>
      </div>

      <div class="receive-intents" role="group" aria-label="After transfer">
        <button
          type="button"
          class="intent-toggle"
          :class="{ on: saveAfter }"
          :aria-pressed="saveAfter"
          @click="emit('update:saveAfter', !saveAfter)"
        >
          {{ saveAfterLabel }}
        </button>
        <button
          type="button"
          class="intent-toggle"
          :class="{ on: openAfter }"
          :aria-pressed="openAfter"
          @click="emit('update:openAfter', !openAfter)"
        >
          Open after transfer
        </button>
      </div>

      <div class="receive-panel">
        <div class="camera-stage">
          <slot />
        </div>
      </div>

      <div class="receive-footer">
        <p v-if="error" class="receive-err" role="alert">{{ error }}</p>
        <p v-else class="receive-status" role="status">{{ status || 'Point at an animated transfer QR code' }}</p>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.optical-receive {
  position: fixed;
  inset: 0;
  z-index: 140;
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr) auto;
  gap: 0.45rem;
  padding: max(0.65rem, env(safe-area-inset-top)) max(0.65rem, env(safe-area-inset-right))
    max(0.65rem, env(safe-area-inset-bottom)) max(0.65rem, env(safe-area-inset-left));
  background: #0a0a0a;
  color: #fff;
}
.receive-chrome {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.45rem;
  justify-content: flex-end;
}
.camera-field {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  margin-right: auto;
  min-width: 0;
  max-width: min(100%, 18rem);
}
.camera-field-label {
  font-size: 0.82rem;
  font-weight: 650;
  opacity: 0.85;
  white-space: nowrap;
}
.camera-select {
  min-width: 0;
  flex: 1;
  min-height: 40px;
  padding: 0.35rem 0.55rem;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.28);
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  font: inherit;
  font-size: 0.88rem;
}
.chrome-btn {
  min-height: 40px;
  padding: 0.35rem 0.75rem;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.28);
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  font: inherit;
  font-weight: 650;
  cursor: pointer;
}
.stop-btn {
  background: color-mix(in srgb, #c01c28 75%, transparent);
  border-color: transparent;
}
.receive-intents {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  padding: 0.15rem 0.1rem;
}
.intent-toggle {
  /* Mobile-first: large touch target, clear pressed state */
  min-height: 44px;
  min-width: 7.5rem;
  flex: 1 1 auto;
  padding: 0.55rem 0.9rem;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.32);
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  font: inherit;
  font-size: 0.9rem;
  font-weight: 650;
  line-height: 1.2;
  text-align: center;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
  user-select: none;
}
.intent-toggle.on {
  background: color-mix(in srgb, #6ec6ff 32%, rgba(255, 255, 255, 0.1));
  border-color: #6ec6ff;
  color: #eaf6ff;
  box-shadow: inset 0 0 0 1px rgba(110, 198, 255, 0.35);
}
.intent-toggle:focus-visible {
  outline: 2px solid #6ec6ff;
  outline-offset: 2px;
}
.intent-toggle:active {
  transform: scale(0.98);
}
.receive-panel {
  min-height: 0;
  display: grid;
}
.camera-stage {
  position: relative;
  overflow: hidden;
  width: 100%;
  height: 100%;
  min-height: 0;
  border-radius: 12px;
  background: #111;
}
.receive-footer {
  min-height: 2.4rem;
  display: grid;
  align-items: center;
}
.receive-status,
.receive-err {
  margin: 0;
  font-size: 0.9rem;
  line-height: 1.35;
  text-align: center;
}
.receive-err {
  color: #ffb4b4;
}
@media (orientation: landscape) and (max-height: 520px) {
  .optical-receive {
    gap: 0.3rem;
    padding-top: max(0.4rem, env(safe-area-inset-top));
    padding-bottom: max(0.4rem, env(safe-area-inset-bottom));
  }
  .receive-intents {
    gap: 0.4rem;
  }
  .intent-toggle {
    min-height: 40px;
    padding: 0.4rem 0.75rem;
    font-size: 0.84rem;
  }
  .receive-footer {
    min-height: 1.8rem;
  }
}
</style>
