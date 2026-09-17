<script setup lang="ts">
/**
 * Fullscreen Sing Together host scanner: keep capturing singer QRs until Done.
 */
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import {
  decodeQrDetailedFromFile,
  decodeQrDetailedFromVideo,
  type QrDecodeResult,
} from '../lib/qrDecode'

const props = defineProps<{
  open: boolean
  /** Brief overlay after a successful capture, e.g. "Alex songs captured". */
  flashMessage?: string | null
}>()

const emit = defineEmits<{
  close: []
  detected: [result: QrDecodeResult]
  error: [message: string]
}>()

type CameraFit = 'height' | 'all'

const videoRef = ref<HTMLVideoElement | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
const status = ref('')
const busyFile = ref(false)
const cameraFit = ref<CameraFit>('height')

const fitToggleLabel = computed(() =>
  cameraFit.value === 'height' ? 'Fit all' : 'Fit height',
)
const fitToggleTitle = computed(() =>
  cameraFit.value === 'height'
    ? 'Show the whole camera frame (letterbox)'
    : 'Fill the preview height (crop sides)',
)

let stream: MediaStream | null = null
let raf = 0
let closed = true
let handling = false

function toggleCameraFit(): void {
  cameraFit.value = cameraFit.value === 'height' ? 'all' : 'height'
}

function stopCamera(): void {
  if (raf) {
    cancelAnimationFrame(raf)
    raf = 0
  }
  if (stream) {
    for (const track of stream.getTracks()) track.stop()
    stream = null
  }
  const video = videoRef.value
  if (video) video.srcObject = null
}

async function startCamera(): Promise<void> {
  stopCamera()
  status.value = 'Starting camera…'
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    })
  } catch {
    status.value = 'Camera unavailable — pick a photo instead.'
    emit('error', 'Camera unavailable. Choose a photo of the QR code instead.')
    return
  }
  await nextTick()
  const video = videoRef.value
  if (!video || closed) {
    stopCamera()
    return
  }
  try {
    video.srcObject = stream
    await video.play()
  } catch {
    status.value = 'Could not start the camera preview.'
    emit('error', 'Could not start the camera preview.')
    stopCamera()
    return
  }
  status.value = 'Point at a singer’s My QR'
  scheduleScan()
}

function scheduleScan(): void {
  if (closed || handling) return
  raf = requestAnimationFrame(() => {
    void tickScan()
  })
}

function pauseThenResume(ms = 900): void {
  handling = true
  window.setTimeout(() => {
    if (closed || !props.open) return
    handling = false
    status.value = 'Point at a singer’s My QR'
    scheduleScan()
  }, ms)
}

async function tickScan(): Promise<void> {
  raf = 0
  if (closed || handling) return
  const video = videoRef.value
  if (!video) {
    scheduleScan()
    return
  }
  try {
    const result = await decodeQrDetailedFromVideo(video)
    if (result?.bytes?.length || result?.text) {
      emit('detected', result)
      pauseThenResume()
      return
    }
  } catch {
    /* keep scanning */
  }
  scheduleScan()
}

function openFilePicker(): void {
  fileInputRef.value?.click()
}

async function onFileChange(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  busyFile.value = true
  status.value = 'Reading image…'
  try {
    const result = await decodeQrDetailedFromFile(file)
    if (!result?.bytes?.length && !result?.text) {
      status.value = 'No QR code found in that image.'
      emit('error', 'No QR code found in that image.')
      return
    }
    emit('detected', result)
    pauseThenResume()
  } catch {
    status.value = 'Could not read that image.'
    emit('error', 'Could not read that image.')
  } finally {
    busyFile.value = false
  }
}

function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    e.preventDefault()
    e.stopPropagation()
    emit('close')
  }
}

watch(
  () => props.open,
  async (open) => {
    if (open) {
      closed = false
      handling = false
      cameraFit.value = 'height'
      window.addEventListener('keydown', onKey)
      await nextTick()
      await startCamera()
      return
    }
    closed = true
    handling = false
    window.removeEventListener('keydown', onKey)
    stopCamera()
    status.value = ''
  },
  { immediate: true },
)

onUnmounted(() => {
  closed = true
  window.removeEventListener('keydown', onKey)
  stopCamera()
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="host-scan"
      role="dialog"
      aria-modal="true"
      aria-label="Scan singer QR codes"
    >
      <div class="host-scan-stage">
        <video
          ref="videoRef"
          class="host-scan-video"
          :class="cameraFit === 'height' ? 'fit-height' : 'fit-all'"
          playsinline
          muted
          autoplay
        />
        <div class="host-scan-frame" aria-hidden="true" />
        <div v-if="flashMessage" class="host-scan-flash" role="status">
          {{ flashMessage }}
        </div>
      </div>

      <p class="host-scan-status" role="status">{{ status }}</p>

      <div class="host-scan-actions">
        <button
          type="button"
          class="btn"
          :title="fitToggleTitle"
          :aria-label="fitToggleTitle"
          @click="toggleCameraFit"
        >
          {{ fitToggleLabel }}
        </button>
        <button type="button" class="btn" :disabled="busyFile" @click="openFilePicker">
          Choose photo…
        </button>
        <button type="button" class="btn btn-primary" @click="emit('close')">
          Done scanning
        </button>
      </div>

      <input
        ref="fileInputRef"
        class="visually-hidden"
        type="file"
        accept="image/*"
        @change="onFileChange"
      />
    </div>
  </Teleport>
</template>

<style scoped>
.host-scan {
  position: fixed;
  inset: 0;
  z-index: 120;
  display: grid;
  grid-template-rows: 1fr auto auto;
  gap: 0.75rem;
  padding: max(0.75rem, env(safe-area-inset-top)) max(0.75rem, env(safe-area-inset-right))
    max(0.75rem, env(safe-area-inset-bottom)) max(0.75rem, env(safe-area-inset-left));
  background: #0a0a0a;
  color: #fff;
}
.host-scan-stage {
  position: relative;
  min-height: 0;
  border-radius: 12px;
  overflow: hidden;
  background: #111;
  container-type: size;
}
.host-scan-video {
  display: block;
  background: #000;
}
.host-scan-video.fit-height {
  position: absolute;
  top: 0;
  left: 50%;
  height: 100%;
  width: auto;
  max-width: none;
  transform: translateX(-50%);
}
.host-scan-video.fit-all {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  object-position: center center;
}
.host-scan-frame {
  position: absolute;
  top: 50%;
  left: 50%;
  translate: -50% -50%;
  aspect-ratio: 1 / 1;
  width: min(72vmin, 88%);
  width: min(72cqmin, 88%);
  height: auto;
  border: 2px solid rgba(255, 255, 255, 0.85);
  border-radius: 16px;
  box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.35);
  pointer-events: none;
}
.host-scan-flash {
  position: absolute;
  left: 50%;
  bottom: 1.1rem;
  translate: -50% 0;
  z-index: 2;
  max-width: min(92%, 22rem);
  padding: 0.65rem 1rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent, #0a7) 88%, #000);
  color: #fff;
  font-weight: 700;
  font-size: 1rem;
  text-align: center;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
  animation: host-flash-in 0.2s ease-out;
}
@keyframes host-flash-in {
  from {
    opacity: 0;
    transform: translateY(0.35rem);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
.host-scan-status {
  margin: 0;
  text-align: center;
  font-size: 0.95rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.9);
}
.host-scan-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.55rem;
}
.host-scan-actions .btn {
  min-height: 44px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.28);
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  font: inherit;
  font-weight: 650;
  padding: 0.45rem 0.85rem;
  cursor: pointer;
}
.host-scan-actions .btn-primary {
  background: var(--accent, #0a7);
  border-color: var(--accent, #0a7);
  color: var(--on-accent, #fff);
}
.host-scan-actions .btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  border: 0;
}
</style>
