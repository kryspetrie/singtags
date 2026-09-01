<script setup lang="ts">
/**
 * Single-tag optical transfer with countdown, fullscreen stream, and quality toggle.
 */
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import FilterSheet from './FilterSheet.vue'
import OpticalTransferStreamOverlay from './OpticalTransferStreamOverlay.vue'
import OpticalTransferQualityToggle from './OpticalTransferQualityToggle.vue'
import { DecimenSendStream } from '../lib/decimen/sendStream'
import type { DecimenSendStreamProgress } from '../lib/decimen/sendProgress'
import { createOpticalSendCountdownSignal, runOpticalSendCountdown } from '../lib/decimen/sendCountdown'
import { packSingtagsSheetFile } from '../lib/decimen/singtagsPayload'
import { loadTagForTransfer, anyHighResTransferAvailable } from '../lib/decimen/loadTagForTransfer'
import {
  OPTICAL_FRAME_BYTES_LABELS,
  OPTICAL_FRAME_BYTES_OPTIONS,
  OPTICAL_TX_FPS_LABELS,
  OPTICAL_TX_FPS_OPTIONS,
  formatOpticalThroughput,
  opticalPayloadFits,
  suggestOpticalFrameBytes,
  type OpticalFrameBytes,
} from '../lib/decimen/sendSettings'
import { usePreferencesStore } from '../stores/preferences'
import { useSnackbarStore } from '../stores/snackbar'
import { formatBytes } from '../offline/storageEstimate'

const props = defineProps<{
  open: boolean
  tagId: number
  tagTitle?: string
  highResAvailable?: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const prefs = usePreferencesStore()
const snackbar = useSnackbarStore()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const useHighRes = ref(false)
const busy = ref(false)
const error = ref<string | null>(null)
const status = ref('')
const streaming = ref(false)
const sendCountdown = ref<number | null>(null)
const sendProgress = ref<DecimenSendStreamProgress | null>(null)
const containerBytes = ref(0)
const highResReady = ref(false)

const frameBytesOptions = OPTICAL_FRAME_BYTES_OPTIONS
const txFpsOptions = OPTICAL_TX_FPS_OPTIONS

const densityTooLow = computed(
  () => containerBytes.value > 0 && !opticalPayloadFits(containerBytes.value, prefs.opticalTransferFrameBytes),
)

const suggestedDensity = computed(() =>
  containerBytes.value > 0 ? suggestOpticalFrameBytes(containerBytes.value) : undefined,
)

const selectedDensityHint = computed(
  () => OPTICAL_FRAME_BYTES_LABELS[prefs.opticalTransferFrameBytes as OpticalFrameBytes]?.hint ?? '',
)

let sendStream: DecimenSendStream | null = null
let countdownSignal: ReturnType<typeof createOpticalSendCountdownSignal> | null = null

watch(
  () => [props.open, props.tagId, props.highResAvailable] as const,
  async ([open, tagId, fromParent]) => {
    if (!open) {
      stopStream()
      useHighRes.value = false
      highResReady.value = false
      error.value = null
      status.value = ''
      containerBytes.value = 0
      return
    }
    error.value = null
    status.value = ''
    highResReady.value = fromParent ?? false
    if (!highResReady.value) {
      highResReady.value = await anyHighResTransferAvailable([tagId])
    }
    if (!highResReady.value) useHighRes.value = false
  },
)

onUnmounted(() => {
  stopStream()
})

function stopStream(): void {
  countdownSignal?.cancel()
  countdownSignal = null
  sendCountdown.value = null
  sendStream?.stop()
  sendStream = null
  streaming.value = false
  sendProgress.value = null
}

function onDisplayScale(scale: number): void {
  prefs.setOpticalTransferDisplayScale(scale)
  sendStream?.setDisplayScale(scale)
}

function closeAll(): void {
  stopStream()
  emit('close')
}

async function startTransfer(): Promise<void> {
  if (busy.value || streaming.value) return
  stopStream()
  busy.value = true
  error.value = null
  status.value = 'Preparing sheet…'
  streaming.value = true
  await nextTick()
  const canvas = canvasRef.value
  if (!canvas) {
    error.value = 'Could not start QR display.'
    streaming.value = false
    busy.value = false
    return
  }
  try {
    const pkg = await loadTagForTransfer(props.tagId, {
      quality: useHighRes.value && highResReady.value ? 'high' : 'standard',
    })
    if (!pkg) {
      error.value = useHighRes.value
        ? 'High quality sheets are not available offline. Try standard quality or connect to load the PDF.'
        : 'No sheet available to transfer.'
      stopStream()
      return
    }
    const packed = await packSingtagsSheetFile(pkg.meta, pkg.imageBytes)
    containerBytes.value = packed.container.length
    if (!opticalPayloadFits(packed.container.length, prefs.opticalTransferFrameBytes)) {
      const suggestion = suggestOpticalFrameBytes(packed.container.length)
      error.value = suggestion
        ? `Sheet is too large for current density — try ${OPTICAL_FRAME_BYTES_LABELS[suggestion].label} (${formatOpticalThroughput(suggestion, prefs.opticalTransferTxFps)}).`
        : 'Sheet is too large for the selected QR density.'
      stopStream()
      return
    }

    sendStream = new DecimenSendStream(canvas, {
      txFps: prefs.opticalTransferTxFps,
      frameBytes: prefs.opticalTransferFrameBytes,
      displayPx: 200,
      displayScale: prefs.opticalTransferDisplayScale,
      fullscreen: true,
    })

    let streamStatus: { k: number; qrVersion?: number; txFps: number } | null = null
    await sendStream.start(
      packed.container,
      {
        onStatus: (s) => {
          streamStatus = { k: s.k, qrVersion: s.qrVersion, txFps: s.txFps }
          if (sendCountdown.value != null) return
          status.value = `Streaming · K=${s.k} · QR v${s.qrVersion ?? '?'} · ${formatOpticalThroughput(prefs.opticalTransferFrameBytes, s.txFps)}`
        },
        onProgress: (p) => {
          sendProgress.value = p
        },
        onError: (message) => {
          error.value = message
          stopStream()
        },
      },
      { holdAfterPreview: true },
    )

    countdownSignal = createOpticalSendCountdownSignal()
    const ready = await runOpticalSendCountdown((value) => {
      sendCountdown.value = value
      status.value = 'Get phones ready…'
    }, countdownSignal)
    countdownSignal = null
    sendCountdown.value = null
    if (!ready) {
      stopStream()
      return
    }

    sendStream.resumeTransmission()
    status.value = streamStatus
      ? `Streaming · K=${streamStatus.k} · QR v${streamStatus.qrVersion ?? '?'} · ${formatOpticalThroughput(prefs.opticalTransferFrameBytes, streamStatus.txFps)}`
      : `Streaming · ${formatBytes(packed.container.length)}`
    snackbar.show(`Streaming “${props.tagTitle || `Tag ${props.tagId}`}”`, { tone: 'ok', ms: 2200 })
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Could not start transfer.'
    stopStream()
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <FilterSheet :open="open && !streaming" title="Optical transfer" elevated @close="closeAll">
    <div class="panel">
      <p class="hint">
        Stream this tag’s sheet to another device with an animated QR code. Standard quality uses
        the catalog preview; high quality uses the upgraded PDF raster when available.
      </p>

      <OpticalTransferQualityToggle
        v-model="useHighRes"
        :available="highResReady"
        :disabled="busy"
      />

      <details class="send-settings">
        <summary>Transfer settings</summary>
        <div class="settings-body">
          <div class="settings-row">
            <label class="setting-field">
              <span class="setting-label">QR density</span>
              <select
                class="setting-select"
                :value="prefs.opticalTransferFrameBytes"
                :disabled="busy"
                aria-label="QR code density"
                @change="
                  prefs.setOpticalTransferFrameBytes(
                    Number(($event.target as HTMLSelectElement).value),
                  )
                "
              >
                <option v-for="option in frameBytesOptions" :key="option" :value="option">
                  {{ OPTICAL_FRAME_BYTES_LABELS[option].label }} ({{
                    formatOpticalThroughput(option, prefs.opticalTransferTxFps)
                  }})
                </option>
              </select>
            </label>
            <label class="setting-field">
              <span class="setting-label">Frame rate</span>
              <select
                class="setting-select"
                :value="prefs.opticalTransferTxFps"
                :disabled="busy"
                aria-label="Transfer frame rate"
                @change="
                  prefs.setOpticalTransferTxFps(Number(($event.target as HTMLSelectElement).value))
                "
              >
                <option v-for="fps in txFpsOptions" :key="fps" :value="fps">
                  {{ OPTICAL_TX_FPS_LABELS[fps].label }} ({{ fps }} fps)
                </option>
              </select>
            </label>
          </div>
          <p v-if="selectedDensityHint" class="settings-note">{{ selectedDensityHint }}</p>
        </div>
      </details>

      <p v-if="densityTooLow" class="err" role="alert">
        {{
          suggestedDensity
            ? `Too large for current density — try ${OPTICAL_FRAME_BYTES_LABELS[suggestedDensity].label}.`
            : 'Too large for the selected QR density.'
        }}
      </p>
      <p v-if="error" class="err" role="alert">{{ error }}</p>

      <div class="actions">
        <button
          type="button"
          class="btn btn-primary"
          :disabled="busy || densityTooLow"
          @click="startTransfer"
        >
          {{ busy ? 'Preparing…' : 'Start transfer' }}
        </button>
      </div>
    </div>
  </FilterSheet>

  <OpticalTransferStreamOverlay
    :open="streaming"
    :status="error || status"
    :progress="sendProgress"
    :countdown="sendCountdown"
    :display-scale="prefs.opticalTransferDisplayScale"
    @update:display-scale="onDisplayScale"
    @stop="closeAll"
  >
    <canvas ref="canvasRef" class="qr-canvas" aria-label="Animated tag transfer QR code" />
  </OpticalTransferStreamOverlay>
</template>

<style scoped>
.panel {
  display: grid;
  gap: 0.75rem;
}
.hint,
.settings-note {
  margin: 0;
  color: var(--muted);
  font-size: 0.9rem;
  line-height: 1.45;
}
.err {
  margin: 0;
  color: var(--danger, #b00020);
  font-size: 0.9rem;
}
.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin: 0;
  padding: 0.55rem 0.65rem;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--surface);
  cursor: pointer;
  user-select: none;
}
.setting-row.on .setting-title {
  color: var(--accent-hover);
}
.setting-copy {
  display: grid;
  gap: 0.1rem;
  min-width: 0;
}
.setting-title {
  font-size: 0.92rem;
  font-weight: 650;
}
.setting-desc {
  font-size: 0.78rem;
  color: var(--muted);
  line-height: 1.35;
}
.setting-switch {
  appearance: none;
  position: relative;
  flex: 0 0 auto;
  width: 2.6rem;
  height: 1.45rem;
  margin: 0;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: color-mix(in srgb, var(--border) 55%, var(--surface));
  cursor: pointer;
}
.setting-switch::after {
  content: '';
  position: absolute;
  top: 1px;
  left: 1px;
  width: calc(1.45rem - 4px);
  height: calc(1.45rem - 4px);
  border-radius: 50%;
  background: var(--surface);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
  transition: transform 0.15s ease;
}
.setting-switch:checked {
  background: var(--accent);
  border-color: var(--accent);
}
.setting-switch:checked::after {
  transform: translateX(1.15rem);
}
.send-settings {
  margin: 0;
}
.send-settings > summary {
  cursor: pointer;
  font-weight: 700;
  font-size: 0.92rem;
  color: var(--muted);
  padding: 0.35rem 0;
  list-style: none;
}
.send-settings > summary::-webkit-details-marker {
  display: none;
}
.send-settings > summary::before {
  content: '▸';
  display: inline-block;
  width: 1rem;
  margin-right: 0.15rem;
}
.send-settings[open] > summary::before {
  transform: rotate(90deg);
}
.settings-body {
  display: grid;
  gap: 0.55rem;
  padding-top: 0.25rem;
}
.settings-row {
  display: grid;
  gap: 0.55rem;
}
@media (min-width: 720px) {
  .settings-row {
    grid-template-columns: 1fr 1fr;
  }
}
.setting-field {
  display: grid;
  gap: 0.3rem;
  margin: 0;
}
.setting-label {
  font-size: 0.88rem;
  font-weight: 650;
}
.setting-select {
  font: inherit;
  min-height: 44px;
  padding: 0.45rem 0.65rem;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
}
.btn {
  min-height: 44px;
  padding: 0.45rem 0.85rem;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--surface);
  font: inherit;
  font-weight: 650;
  cursor: pointer;
}
.btn-primary {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}
.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
