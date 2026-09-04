<script setup lang="ts">
/**
 * Fullscreen SingTags QR scanner: tag URL codes + Decimen sheet transfer receive.
 */
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import {
  decodeQrDetailedFromFile,
  decodeQrDetailedFromVideo,
  type QrDecodeResult,
} from '../lib/qrDecode'
import { DecimenReceiveCapture } from '../lib/decimen/receiveCapture'
import type { OpticalFile } from '../../vendor/decimen/shared/protocol'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  close: []
  /** Decoded tag URL QR (text and/or bytes). */
  detected: [result: QrDecodeResult]
  /** Decimen fountain progress while receiving a sheet transfer. */
  sheetTransferProgress: [label: string]
  /** Completed Decimen optical file (SingTags sheet container). */
  sheetTransferComplete: [file: OpticalFile]
  sheetTransferError: [message: string]
  error: [message: string]
}>()

/** Preview scale: fill stage height (crop sides) vs show the whole frame. */
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
let decimenCapture: DecimenReceiveCapture | null = null
let receivingSheet = false

function toggleCameraFit(): void {
  cameraFit.value = cameraFit.value === 'height' ? 'all' : 'height'
}

function stopCamera(): void {
  decimenCapture?.stop()
  decimenCapture = null
  receivingSheet = false
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

function ensureDecimenCapture(video: HTMLVideoElement): DecimenReceiveCapture {
  if (!decimenCapture) {
    decimenCapture = new DecimenReceiveCapture({
      onProgress: (p) => {
        receivingSheet = true
        status.value = p.label
        emit('sheetTransferProgress', p.label)
      },
      onComplete: (file) => {
        receivingSheet = true
        handling = true
        emit('sheetTransferComplete', file)
      },
      onError: (message) => {
        emit('sheetTransferError', message)
        if (receivingSheet) status.value = message
      },
    })
  }
  decimenCapture.attachVideo(video)
  return decimenCapture
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
  status.value = 'Point at a tag link or sheet transfer QR'
  ensureDecimenCapture(video).start()
  scheduleScan()
}

function scheduleScan(): void {
  if (closed || handling) return
  raf = requestAnimationFrame(() => {
    void tickScan()
  })
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
    if (result?.text && !result.bytes?.length) {
      handling = true
      emit('detected', result)
      window.setTimeout(() => {
        if (closed || !props.open) return
        handling = false
        if (!receivingSheet) status.value = 'Point at a tag link or sheet transfer QR'
        scheduleScan()
      }, 450)
      return
    }
  } catch {
    // Keep scanning.
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
    handling = true
    emit('detected', result)
    window.setTimeout(() => {
      if (closed || !props.open) return
      handling = false
      status.value = 'Point at a tag link or sheet transfer QR'
      scheduleScan()
    }, 450)
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
      receivingSheet = false
      cameraFit.value = 'height'
      window.addEventListener('keydown', onKey)
      await nextTick()
      await startCamera()
      return
    }
    closed = true
    handling = false
    receivingSheet = false
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
      class="qr-scan"
      role="dialog"
      aria-modal="true"
      aria-label="Scan SingTags QR code"
    >
      <div class="qr-scan-stage">
        <video
          ref="videoRef"
          class="qr-scan-video"
          :class="cameraFit === 'height' ? 'fit-height' : 'fit-all'"
          playsinline
          muted
          autoplay
        />
        <div class="qr-scan-frame" aria-hidden="true" />
      </div>

      <p class="qr-scan-status" role="status">{{ status }}</p>

      <div class="qr-scan-actions">
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
        <button type="button" class="btn btn-primary" @click="emit('close')">Cancel</button>
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
.qr-scan {
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
.qr-scan-stage {
  position: relative;
  min-height: 0;
  border-radius: 12px;
  overflow: hidden;
  background: #111;
  container-type: size;
}
.qr-scan-video {
  display: block;
  background: #000;
}
/* Fill stage height; crop left/right; keep optical center in the stage center. */
.qr-scan-video.fit-height {
  position: absolute;
  top: 0;
  left: 50%;
  height: 100%;
  width: auto;
  max-width: none;
  transform: translateX(-50%);
}
/* Show the whole frame, letterboxed, centered. */
.qr-scan-video.fit-all {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  object-position: center center;
}
/* Fixed square guide — does not stretch with screen width. */
.qr-scan-frame {
  position: absolute;
  top: 50%;
  left: 50%;
  translate: -50% -50%;
  aspect-ratio: 1 / 1;
  /* Prefer container size; fall back to viewport when cqmin unsupported. */
  width: min(72vmin, 88%);
  width: min(72cqmin, 88%);
  height: auto;
  border: 2px solid rgba(255, 255, 255, 0.85);
  border-radius: 16px;
  box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.35);
  pointer-events: none;
}
.qr-scan-status {
  margin: 0;
  text-align: center;
  font-size: 0.95rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.9);
}
.qr-scan-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.55rem;
}
.qr-scan-actions .btn {
  min-height: 44px;
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
</style>
