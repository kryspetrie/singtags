<script setup lang="ts">
/**
 * Labs WebRTC wireless transfer — QR offer/answer pairing, then DataChannel file send.
 */
import { onUnmounted, ref, watch } from 'vue'
import InfoTips from './InfoTips.vue'
import { decodeQrFromVideo } from '../lib/qrDecode'
import { opticalVideoConstraints } from '../lib/decimen/opticalCamera'
import { buildTransferBundle, opticalFileFromBrowserFile } from '../lib/transferBundle'
import {
  createWebrtcAnswerSession,
  createWebrtcOfferSession,
  type WebrtcAnswerSession,
  type WebrtcOfferSession,
  type WebrtcTransferProgress,
} from '../lib/webrtcTransfer'
import type { OpticalFile } from '../../vendor/decimen/shared/protocol'

const props = defineProps<{
  tab: 'send' | 'receive'
  files: File[]
  disabled?: boolean
}>()

const emit = defineEmits<{
  received: [file: OpticalFile]
}>()

const status = ref('')
const error = ref<string | null>(null)
const busy = ref(false)
const qrDataUrl = ref<string | null>(null)
const pastePayload = ref('')
const scanLive = ref(false)
const videoRef = ref<HTMLVideoElement | null>(null)

let offerSession: WebrtcOfferSession | null = null
let answerSession: WebrtcAnswerSession | null = null
let scanStream: MediaStream | null = null
let scanTimer: number | null = null

function onProgress(p: WebrtcTransferProgress): void {
  status.value = p.label
}

function closeSessions(): void {
  offerSession?.close()
  offerSession = null
  answerSession?.close()
  answerSession = null
}

function stopScan(): void {
  if (scanTimer != null) {
    window.clearInterval(scanTimer)
    scanTimer = null
  }
  if (scanStream) {
    for (const t of scanStream.getTracks()) t.stop()
    scanStream = null
  }
  scanLive.value = false
  const video = videoRef.value
  if (video) video.srcObject = null
}

function resetUi(): void {
  stopScan()
  closeSessions()
  qrDataUrl.value = null
  pastePayload.value = ''
  error.value = null
  if (!busy.value) status.value = ''
}

watch(
  () => props.tab,
  () => {
    busy.value = false
    resetUi()
  },
)

onUnmounted(() => {
  busy.value = false
  resetUi()
})

async function startOffer(): Promise<void> {
  if (!props.files.length || props.disabled) return
  busy.value = true
  error.value = null
  qrDataUrl.value = null
  closeSessions()
  try {
    const bundle = await buildTransferBundle(props.files)
    offerSession = await createWebrtcOfferSession(onProgress)
    qrDataUrl.value = offerSession.offerQrDataUrl
    status.value = 'Show this QR to the receiver, then scan their answer'
    // Keep bundle on session via closure for complete step.
    ;(offerSession as WebrtcOfferSession & { _file?: File })._file = bundle.file
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Could not start wireless send.'
    closeSessions()
  } finally {
    busy.value = false
  }
}

async function applyAnswerPayload(payload: string): Promise<void> {
  const session = offerSession as (WebrtcOfferSession & { _file?: File }) | null
  if (!session?._file) {
    error.value = 'Create a wireless offer first.'
    return
  }
  busy.value = true
  error.value = null
  stopScan()
  try {
    await session.completeAndSend(payload, session._file, onProgress)
    status.value = 'Sent — you can close this session'
  } catch (e) {
    error.value =
      e instanceof Error
        ? `${e.message} If both phones are not on the same Wi‑Fi or hotspot, use Optical instead.`
        : 'Wireless send failed.'
  } finally {
    busy.value = false
    closeSessions()
    qrDataUrl.value = null
  }
}

async function startAnswerFromOffer(payload: string): Promise<void> {
  busy.value = true
  error.value = null
  qrDataUrl.value = null
  closeSessions()
  stopScan()
  try {
    answerSession = await createWebrtcAnswerSession(payload, onProgress)
    qrDataUrl.value = answerSession.answerQrDataUrl
    status.value = 'Show this answer QR to the sender'
    const file = await answerSession.receive(onProgress)
    emit('received', await opticalFileFromBrowserFile(
      new File([Uint8Array.from(file.bytes)], file.name, {
        type: file.type || 'application/octet-stream',
      }),
    ))
    status.value = 'Received'
  } catch (e) {
    error.value =
      e instanceof Error
        ? `${e.message} Same Wi‑Fi or hotspot required — otherwise use Optical.`
        : 'Wireless receive failed.'
  } finally {
    busy.value = false
    closeSessions()
    qrDataUrl.value = null
  }
}

async function onPasteSubmit(): Promise<void> {
  const payload = pastePayload.value.trim()
  if (!payload) return
  if (props.tab === 'send') await applyAnswerPayload(payload)
  else await startAnswerFromOffer(payload)
}

async function beginScan(): Promise<void> {
  error.value = null
  stopScan()
  try {
    scanStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: opticalVideoConstraints(),
    })
  } catch {
    error.value = 'Camera unavailable — paste the pairing code instead.'
    return
  }
  scanLive.value = true
  await new Promise((r) => requestAnimationFrame(() => r(undefined)))
  const video = videoRef.value
  if (!video || !scanStream) return
  video.srcObject = scanStream
  try {
    await video.play()
  } catch {
    error.value = 'Could not start camera preview.'
    stopScan()
    return
  }
  status.value = props.tab === 'send' ? 'Scan the receiver’s answer QR' : 'Scan the sender’s offer QR'
  scanTimer = window.setInterval(() => {
    void (async () => {
      if (!videoRef.value || busy.value) return
      const text = await decodeQrFromVideo(videoRef.value)
      if (!text) return
      stopScan()
      if (props.tab === 'send') await applyAnswerPayload(text)
      else await startAnswerFromOffer(text)
    })()
  }, 400)
}
</script>

<template>
  <div class="webrtc-panel">
    <div class="hint-row">
      <p class="hint">
        Same Wi‑Fi or a personal hotspot required. Pair with QR codes, then the file moves over a
        private link — no SingTags servers.
      </p>
      <InfoTips
        label="Wireless transfer how-to"
        title="How to run a wireless transfer"
      >
        <p><strong>Network first</strong></p>
        <ul>
          <li>Turn Wi‑Fi on on both phones.</li>
          <li>
            Join the <strong>same network</strong>, or turn on a <strong>personal hotspot</strong> on
            one phone and connect the other to it (often the most reliable).
          </li>
          <li>Cellular-only (no shared Wi‑Fi/hotspot) usually fails — use Optical instead.</li>
        </ul>
        <p><strong>Send</strong></p>
        <ol>
          <li>Queue files on the Send tab.</li>
          <li>Tap <strong>Create offer QR</strong> and keep this screen open.</li>
          <li>On the other phone: open Wireless transfer → Receive → <strong>Scan offer QR</strong>.</li>
          <li>That phone shows an <strong>answer QR</strong> — scan it here with <strong>Scan answer QR</strong>.</li>
          <li>Keep both screens open until sending finishes.</li>
        </ol>
        <p><strong>Receive</strong></p>
        <ol>
          <li>Open the Receive tab and scan the sender’s offer QR (or paste the code).</li>
          <li>Show your answer QR to the sender and wait for the file.</li>
        </ol>
        <p>If pairing stalls, cancel and use Optical transfer.</p>
      </InfoTips>
    </div>

    <div v-if="tab === 'send'" class="actions">
      <button
        type="button"
        class="btn btn-primary"
        :disabled="disabled || busy || !files.length"
        @click="startOffer"
      >
        {{ qrDataUrl ? 'Refresh offer QR' : 'Create offer QR' }}
      </button>
      <button
        type="button"
        class="btn"
        :disabled="disabled || busy || !qrDataUrl"
        @click="beginScan"
      >
        Scan answer QR
      </button>
    </div>

    <div v-else class="actions">
      <button type="button" class="btn btn-primary" :disabled="disabled || busy" @click="beginScan">
        Scan offer QR
      </button>
    </div>

    <div v-if="qrDataUrl" class="qr-wrap">
      <img :src="qrDataUrl" alt="Wireless pairing QR code" class="qr-img" width="280" height="280" />
    </div>

    <div v-if="scanLive" class="scan-wrap">
      <video ref="videoRef" class="scan-video" playsinline muted autoplay />
      <button type="button" class="btn btn-ghost" @click="stopScan">Stop camera</button>
    </div>

    <label class="paste-field">
      <span class="paste-label">Or paste pairing code</span>
      <textarea
        v-model="pastePayload"
        class="paste-input"
        rows="3"
        :disabled="disabled || busy"
        placeholder="STW1:…"
      />
      <button
        type="button"
        class="btn"
        :disabled="disabled || busy || !pastePayload.trim()"
        @click="onPasteSubmit"
      >
        {{ tab === 'send' ? 'Apply answer' : 'Use offer' }}
      </button>
    </label>

    <p v-if="error" class="err" role="alert">{{ error }}</p>
    <p v-else-if="status" class="status" role="status">{{ status }}</p>
  </div>
</template>

<style scoped>
.webrtc-panel {
  display: grid;
  gap: 0.75rem;
}
.hint-row {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
}
.hint-row .hint {
  flex: 1;
  min-width: 0;
}
.hint {
  margin: 0;
  color: var(--muted);
  font-size: 0.92rem;
  line-height: 1.45;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.qr-wrap {
  display: grid;
  place-items: center;
  padding: 0.5rem;
  background: #fff;
  border-radius: 0.5rem;
  border: 1px solid var(--border, #ddd);
}
.qr-img {
  display: block;
  width: min(280px, 100%);
  height: auto;
}
.scan-wrap {
  display: grid;
  gap: 0.5rem;
}
.scan-video {
  width: 100%;
  max-height: 240px;
  object-fit: cover;
  border-radius: 0.5rem;
  background: #111;
}
.paste-field {
  display: grid;
  gap: 0.35rem;
}
.paste-label {
  font-size: 0.85rem;
  font-weight: 600;
}
.paste-input {
  width: 100%;
  font: inherit;
  padding: 0.5rem;
  border-radius: 0.4rem;
  border: 1px solid var(--border, #ccc);
  resize: vertical;
}
.err {
  margin: 0;
  color: var(--danger, #b00020);
}
.status {
  margin: 0;
  color: var(--muted);
}
</style>
