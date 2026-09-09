<script setup lang="ts">
/**
 * Labs wireless transfer — Optical-like UX: queue on Send, idle Receive + fullscreen overlay.
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter, type RouteLocationNormalizedLoaded } from 'vue-router'
import EmptyState from '../components/EmptyState.vue'
import InfoTips from '../components/InfoTips.vue'
import LabsReceiveInvite from '../components/LabsReceiveInvite.vue'
import LabsTransferOverlay from '../components/LabsTransferOverlay.vue'
import OpticalReceiveInviteOverlay from '../components/OpticalReceiveInviteOverlay.vue'
import { prefersOpticalDownloadSave, saveOpticalFiles } from '../lib/decimen/opticalTransfer'
import { opticalVideoConstraints } from '../lib/decimen/opticalCamera'
import { decodeQrFromVideo } from '../lib/qrDecode'
import {
  isLabsReceiveFullscreenQuery,
  isWirelessReceiveRoute,
  WIRELESS_RX_PATH,
  WIRELESS_TX_PATH,
  wirelessReceiveAbsoluteHref,
} from '../lib/labsTransferNav'
import { buildTransferBundle, opticalFileFromBrowserFile } from '../lib/transferBundle'
import {
  createWebrtcAnswerSession,
  createWebrtcOfferSession,
  type WebrtcAnswerSession,
  type WebrtcOfferSession,
  type WebrtcTransferProgress,
} from '../lib/webrtcTransfer'
import { formatBytes } from '../offline/storageEstimate'
import type { OpticalFile } from '../../vendor/decimen/shared/protocol'
import { useSnackbarStore } from '../stores/snackbar'

type Tab = 'send' | 'receive'
type QueuedFile = { id: number; file: File }
type ReceivedItem = { id: string; file: OpticalFile; saved: boolean }
type SendPhase = 'offer' | 'scan-answer' | 'sending'
type ReceivePhase = 'scan-offer' | 'answer' | 'receiving'

const route = useRoute()
const router = useRouter()
const snackbar = useSnackbarStore()

function tabFromRoute(r: RouteLocationNormalizedLoaded): Tab {
  return isWirelessReceiveRoute(r) ? 'receive' : 'send'
}

function selectTab(next: Tab): void {
  if (tab.value !== next) tab.value = next
  const path = next === 'receive' ? WIRELESS_RX_PATH : WIRELESS_TX_PATH
  const query = { ...route.query }
  if ('mode' in query) delete query.mode
  if ('fullscreen' in query) delete query.fullscreen
  if (route.path === path && !('mode' in route.query) && !('fullscreen' in route.query)) return
  void router.replace({ path, query })
}

function shouldAutoStartReceive(r: RouteLocationNormalizedLoaded = route): boolean {
  return isWirelessReceiveRoute(r) && isLabsReceiveFullscreenQuery(r.query)
}

const tab = ref<Tab>(tabFromRoute(route))
const queue = ref<QueuedFile[]>([])
let nextQueueId = 0
const received = ref<ReceivedItem[]>([])
const saveBusy = ref(false)
const saveUsesDownload = prefersOpticalDownloadSave()
const saveAllLabel = computed(() => (saveUsesDownload ? 'Download all' : 'Save all…'))
const saveOneLabel = computed(() => (saveUsesDownload ? 'Download' : 'Save…'))

const queuedFiles = computed(() => queue.value.map((e) => e.file))
const queueBytes = computed(() => queue.value.reduce((sum, e) => sum + e.file.size, 0))
const queueSummary = computed(() => {
  if (!queue.value.length) return ''
  return `${queue.value.length} file${queue.value.length === 1 ? '' : 's'} · ${formatBytes(queueBytes.value)}`
})

const receiveInviteHref = computed(() => wirelessReceiveAbsoluteHref(router))
const receiveInviteOverlayOpen = ref(false)

const sendLive = ref(false)
const receiveLive = ref(false)
const sendPhase = ref<SendPhase>('offer')
const receivePhase = ref<ReceivePhase>('scan-offer')
const overlayStatus = ref('')
const overlayError = ref<string | null>(null)
const qrDataUrl = ref<string | null>(null)
const pastePayload = ref('')
const sendVideoRef = ref<HTMLVideoElement | null>(null)
const receiveVideoRef = ref<HTMLVideoElement | null>(null)

let offerSession: (WebrtcOfferSession & { _file?: File }) | null = null
let answerSession: WebrtcAnswerSession | null = null
let scanStream: MediaStream | null = null
let scanTimer: number | null = null

const sendStartDisabled = computed(
  () => !queue.value.length || sendLive.value || receiveLive.value,
)
const sendStartLabel = computed(() => (sendLive.value ? 'Transferring…' : 'Start transfer'))

function onProgress(p: WebrtcTransferProgress): void {
  overlayStatus.value = p.label
}

function stopScanCamera(): void {
  if (scanTimer != null) {
    window.clearInterval(scanTimer)
    scanTimer = null
  }
  if (scanStream) {
    for (const t of scanStream.getTracks()) t.stop()
    scanStream = null
  }
  const video = sendVideoRef.value
  if (video) video.srcObject = null
  const recv = receiveVideoRef.value
  if (recv) recv.srcObject = null
}

function closeSessions(): void {
  offerSession?.close()
  offerSession = null
  answerSession?.close()
  answerSession = null
}

function stopSendLive(): void {
  stopScanCamera()
  closeSessions()
  sendLive.value = false
  sendPhase.value = 'offer'
  qrDataUrl.value = null
  pastePayload.value = ''
  overlayStatus.value = ''
  overlayError.value = null
}

function stopReceiveLive(): void {
  stopScanCamera()
  closeSessions()
  receiveLive.value = false
  receivePhase.value = 'scan-offer'
  qrDataUrl.value = null
  pastePayload.value = ''
  overlayStatus.value = ''
  overlayError.value = null
}

function onFilesPicked(ev: Event): void {
  const input = ev.target as HTMLInputElement
  const files = input.files ? Array.from(input.files) : []
  input.value = ''
  if (!files.length) return
  queue.value = [...queue.value, ...files.map((file) => ({ id: ++nextQueueId, file }))]
}

function removeQueued(id: number): void {
  queue.value = queue.value.filter((e) => e.id !== id)
}

function clearQueue(): void {
  queue.value = []
}

function onReceived(file: OpticalFile): void {
  const id = `${Date.now()}-${received.value.length}`
  received.value = [{ id, file, saved: false }, ...received.value]
  stopReceiveLive()
  selectTab('receive')
  snackbar.show(`Received ${file.name}`, { tone: 'ok', ms: 3000 })
}

async function saveOne(item: ReceivedItem): Promise<void> {
  saveBusy.value = true
  try {
    await saveOpticalFiles([item.file])
    item.saved = true
    snackbar.show(saveUsesDownload ? 'Downloaded' : 'Saved', { tone: 'ok', ms: 2500 })
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return
    snackbar.show(e instanceof Error ? e.message : 'Save failed', { tone: 'error' })
  } finally {
    saveBusy.value = false
  }
}

async function saveAll(): Promise<void> {
  if (!received.value.length) return
  saveBusy.value = true
  try {
    await saveOpticalFiles(received.value.map((r) => r.file))
    received.value = received.value.map((r) => ({ ...r, saved: true }))
    snackbar.show(saveUsesDownload ? 'Downloaded' : 'Saved', { tone: 'ok', ms: 2500 })
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return
    snackbar.show(e instanceof Error ? e.message : 'Save failed', { tone: 'error' })
  } finally {
    saveBusy.value = false
  }
}

function removeReceived(id: string): void {
  received.value = received.value.filter((r) => r.id !== id)
}

async function startSendTransfer(): Promise<void> {
  if (sendStartDisabled.value) return
  receiveInviteOverlayOpen.value = false
  stopReceiveLive()
  stopSendLive()
  sendLive.value = true
  sendPhase.value = 'offer'
  overlayError.value = null
  overlayStatus.value = 'Creating wireless offer…'
  try {
    const bundle = await buildTransferBundle(queuedFiles.value)
    offerSession = (await createWebrtcOfferSession(onProgress)) as WebrtcOfferSession & {
      _file?: File
    }
    offerSession._file = bundle.file
    qrDataUrl.value = offerSession.offerQrDataUrl
    overlayStatus.value = 'Show this offer QR to the receiver, then scan their answer'
  } catch (e) {
    overlayError.value = e instanceof Error ? e.message : 'Could not start wireless send.'
    sendLive.value = false
    closeSessions()
  }
}

async function beginScanAnswer(): Promise<void> {
  if (!offerSession?._file) {
    overlayError.value = 'Create an offer first.'
    return
  }
  overlayError.value = null
  sendPhase.value = 'scan-answer'
  overlayStatus.value = 'Scan the receiver’s answer QR'
  await startScanLoop('send', async (text) => {
    await applyAnswerPayload(text)
  })
}

async function applyAnswerPayload(payload: string): Promise<void> {
  const session = offerSession
  if (!session?._file) {
    overlayError.value = 'Create an offer first.'
    return
  }
  stopScanCamera()
  sendPhase.value = 'sending'
  overlayError.value = null
  try {
    await session.completeAndSend(payload, session._file, onProgress)
    overlayStatus.value = 'Sent'
    snackbar.show('Wireless send complete', { tone: 'ok', ms: 3000 })
    stopSendLive()
  } catch (e) {
    overlayError.value =
      e instanceof Error
        ? `${e.message} Same Wi‑Fi or hotspot required — otherwise use Optical.`
        : 'Wireless send failed.'
    sendPhase.value = 'offer'
    if (session.offerQrDataUrl) {
      qrDataUrl.value = session.offerQrDataUrl
    }
  }
}

async function beginLiveReceive(): Promise<void> {
  if (receiveLive.value) return
  stopSendLive()
  stopReceiveLive()
  receiveLive.value = true
  receivePhase.value = 'scan-offer'
  overlayError.value = null
  overlayStatus.value = 'Scan the sender’s offer QR'
  await nextTick()
  await startScanLoop('receive', async (text) => {
    await startAnswerFromOffer(text)
  })
}

async function rescanOffer(): Promise<void> {
  if (!receiveLive.value) {
    await beginLiveReceive()
    return
  }
  receivePhase.value = 'scan-offer'
  qrDataUrl.value = null
  overlayError.value = null
  overlayStatus.value = 'Scan the sender’s offer QR'
  await startScanLoop('receive', async (text) => {
    await startAnswerFromOffer(text)
  })
}

async function startAnswerFromOffer(payload: string): Promise<void> {
  stopScanCamera()
  overlayError.value = null
  overlayStatus.value = 'Creating answer…'
  try {
    answerSession = await createWebrtcAnswerSession(payload, onProgress)
    qrDataUrl.value = answerSession.answerQrDataUrl
    receivePhase.value = 'answer'
    overlayStatus.value = 'Show this answer QR to the sender'
    receivePhase.value = 'receiving'
    const file = await answerSession.receive(onProgress)
    const copy = Uint8Array.from(file.bytes)
    onReceived(
      await opticalFileFromBrowserFile(
        new File([copy], file.name, { type: file.type || 'application/octet-stream' }),
      ),
    )
  } catch (e) {
    overlayError.value =
      e instanceof Error
        ? `${e.message} Same Wi‑Fi or hotspot required — otherwise use Optical.`
        : 'Wireless receive failed.'
    receivePhase.value = 'scan-offer'
    qrDataUrl.value = null
  }
}

async function startScanLoop(
  target: 'send' | 'receive',
  onCode: (text: string) => Promise<void>,
): Promise<void> {
  stopScanCamera()
  try {
    scanStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: opticalVideoConstraints(),
    })
  } catch {
    overlayError.value = 'Camera unavailable — paste the pairing code instead.'
    return
  }
  await nextTick()
  const video = target === 'send' ? sendVideoRef.value : receiveVideoRef.value
  if (!video || !scanStream) return
  video.srcObject = scanStream
  try {
    await video.play()
  } catch {
    overlayError.value = 'Could not start camera preview.'
    stopScanCamera()
    return
  }
  scanTimer = window.setInterval(() => {
    void (async () => {
      const live = target === 'send' ? sendVideoRef.value : receiveVideoRef.value
      if (!live) return
      const text = await decodeQrFromVideo(live)
      if (!text) return
      stopScanCamera()
      await onCode(text)
    })()
  }, 400)
}

async function onPasteSubmit(): Promise<void> {
  const payload = pastePayload.value.trim()
  if (!payload) return
  if (sendLive.value) await applyAnswerPayload(payload)
  else if (receiveLive.value) await startAnswerFromOffer(payload)
}

function openReceiveInviteOverlay(): void {
  receiveInviteOverlayOpen.value = true
}

function closeReceiveInviteOverlay(): void {
  receiveInviteOverlayOpen.value = false
}

function startFromReceiveInviteOverlay(): void {
  closeReceiveInviteOverlay()
  void startSendTransfer()
}

watch(tab, (next) => {
  if (next !== 'receive') stopReceiveLive()
  if (next !== 'send') stopSendLive()
})

onMounted(() => {
  if (shouldAutoStartReceive(route)) void beginLiveReceive()
})

watch(
  () => [route.name, route.path, route.query.mode, route.query.fullscreen] as const,
  () => {
    const next = tabFromRoute(route)
    tab.value = next
    if (next === 'receive' && shouldAutoStartReceive(route) && !receiveLive.value) {
      void beginLiveReceive()
    }
  },
)

onUnmounted(() => {
  stopSendLive()
  stopReceiveLive()
})
</script>

<template>
  <section class="page" aria-label="Wireless transfer">
    <header class="page-head">
      <h1 class="page-title">Wireless transfer</h1>
      <p class="intro">
        Labs experiment: move files between two phones on the same Wi‑Fi or personal hotspot via a
        private link. Pair with QR codes — no SingTags servers.
      </p>
    </header>

    <div class="tabs" role="tablist" aria-label="Transfer direction">
      <button
        type="button"
        class="tab"
        role="tab"
        :aria-selected="tab === 'send'"
        :class="{ active: tab === 'send' }"
        @click="selectTab('send')"
      >
        Send
      </button>
      <button
        type="button"
        class="tab"
        role="tab"
        :aria-selected="tab === 'receive'"
        :class="{ active: tab === 'receive' }"
        @click="selectTab('receive')"
      >
        Receive
      </button>
    </div>

    <div v-show="tab === 'send'" class="panel" role="tabpanel" aria-label="Send files">
      <div class="queue-card">
        <div class="queue-head">
          <div class="hint-row">
            <h2 class="section-title">Transfer queue</h2>
            <InfoTips label="Wireless transfer how-to" title="How to run a wireless transfer">
              <p><strong>Network first</strong></p>
              <ul>
                <li>Turn Wi‑Fi on on both phones.</li>
                <li>
                  Join the <strong>same network</strong>, or use a <strong>personal hotspot</strong>
                  (often most reliable).
                </li>
                <li>Cellular-only usually fails — use Optical instead.</li>
              </ul>
              <p>
                Sender starts transfer (offer QR) → receiver scans in fullscreen → sender scans the
                answer QR → file moves. Keep both screens open until done.
              </p>
            </InfoTips>
          </div>
          <p v-if="queueSummary" class="queue-summary">{{ queueSummary }}</p>
        </div>
        <ul v-if="queue.length" class="queue-list">
          <li v-for="entry in queue" :key="entry.id">
            <div class="queue-meta">
              <span class="file-name">{{ entry.file.name }}</span>
              <span class="file-size">{{ formatBytes(entry.file.size) }}</span>
            </div>
            <button
              type="button"
              class="btn btn-ghost remove"
              :disabled="sendLive"
              @click="removeQueued(entry.id)"
            >
              Remove
            </button>
          </li>
        </ul>
        <EmptyState
          v-else
          title="No files queued yet"
          message="Add one or more files, then start the wireless transfer."
        />
        <div class="queue-actions">
          <label class="btn file-add" :class="{ disabled: sendLive }">
            Add files…
            <input
              class="visually-hidden"
              type="file"
              multiple
              :disabled="sendLive"
              @change="onFilesPicked"
            />
          </label>
          <button
            v-if="queue.length"
            type="button"
            class="btn btn-ghost"
            :disabled="sendLive"
            @click="clearQueue"
          >
            Clear queue
          </button>
        </div>
      </div>

      <LabsReceiveInvite
        :url="receiveInviteHref"
        title="Sending to someone without Wireless receive open?"
        description="Share this link. It opens Wireless receive in fullscreen so they can scan your offer QR."
      />

      <div class="send-actions">
        <button
          type="button"
          class="btn btn-primary"
          :disabled="sendStartDisabled"
          @click="startSendTransfer"
        >
          {{ sendStartLabel }}
        </button>
        <button
          type="button"
          class="btn"
          :disabled="sendLive"
          @click="openReceiveInviteOverlay"
        >
          Receive link QR
        </button>
      </div>
    </div>

    <div v-show="tab === 'receive'" class="panel receive-panel" role="tabpanel" aria-label="Receive files">
      <div class="receive-intro-card">
        <h2 class="section-title">Receive to this device</h2>
        <p class="hint">
          Same Wi‑Fi or personal hotspot as the sender. Start receiving to open the fullscreen scanner
          — no inline camera on this page.
        </p>
      </div>

      <div class="send-actions">
        <button
          type="button"
          class="btn btn-primary"
          :disabled="receiveLive"
          @click="beginLiveReceive"
        >
          Start receiving
        </button>
      </div>
      <p class="hint receive-idle-hint">
        After a successful transfer, this overlay closes so your received files list is visible.
      </p>

      <div v-if="received.length" class="received">
        <div class="received-head">
          <h2 class="section-title">Received files</h2>
          <button type="button" class="btn btn-primary" :disabled="saveBusy" @click="saveAll">
            {{ saveAllLabel }}
          </button>
        </div>
        <ul class="queue-list">
          <li v-for="item in received" :key="item.id">
            <div class="queue-meta">
              <span class="file-name">{{ item.file.name }}</span>
              <span class="file-size">{{ formatBytes(item.file.bytes.length) }}</span>
              <span v-if="item.saved" class="saved-badge">Saved</span>
            </div>
            <div class="row-actions">
              <button
                type="button"
                class="btn btn-ghost"
                :disabled="saveBusy"
                @click="saveOne(item)"
              >
                {{ saveOneLabel }}
              </button>
              <button type="button" class="btn btn-ghost remove" @click="removeReceived(item.id)">
                Remove
              </button>
            </div>
          </li>
        </ul>
      </div>
    </div>

    <OpticalReceiveInviteOverlay
      :open="receiveInviteOverlayOpen"
      :url="receiveInviteHref"
      :start-disabled="sendStartDisabled"
      start-label="Start wireless transfer"
      @close="closeReceiveInviteOverlay"
      @start="startFromReceiveInviteOverlay"
    />

    <LabsTransferOverlay
      :open="sendLive"
      title="Wireless send"
      :status="overlayStatus"
      :error="overlayError"
      @stop="stopSendLive"
    >
      <template #chrome>
        <button
          v-if="sendPhase === 'offer' && qrDataUrl"
          type="button"
          class="chrome-btn"
          @click="beginScanAnswer"
        >
          Scan answer QR
        </button>
      </template>
      <div class="stage-inner">
        <img
          v-if="sendPhase !== 'scan-answer' && qrDataUrl"
          :src="qrDataUrl"
          alt="Wireless offer QR"
          class="qr-img"
        />
        <video
          v-show="sendPhase === 'scan-answer'"
          ref="sendVideoRef"
          class="scan-video"
          playsinline
          muted
          autoplay
        />
      </div>
      <template #footer>
        <label class="paste-field">
          <span class="paste-label">Or paste pairing code</span>
          <textarea v-model="pastePayload" class="paste-input" rows="2" placeholder="STW1:…" />
          <button
            type="button"
            class="chrome-btn"
            :disabled="!pastePayload.trim()"
            @click="onPasteSubmit"
          >
            Apply answer
          </button>
        </label>
      </template>
    </LabsTransferOverlay>

    <LabsTransferOverlay
      :open="receiveLive"
      title="Wireless receive"
      :status="overlayStatus"
      :error="overlayError"
      @stop="stopReceiveLive"
    >
      <template #chrome>
        <button
          v-if="receivePhase === 'scan-offer'"
          type="button"
          class="chrome-btn"
          @click="rescanOffer"
        >
          Rescan
        </button>
      </template>
      <div class="stage-inner">
        <video
          v-show="receivePhase === 'scan-offer'"
          ref="receiveVideoRef"
          class="scan-video"
          playsinline
          muted
          autoplay
        />
        <img
          v-if="receivePhase !== 'scan-offer' && qrDataUrl"
          :src="qrDataUrl"
          alt="Wireless answer QR"
          class="qr-img"
        />
      </div>
      <template #footer>
        <label v-if="receivePhase === 'scan-offer'" class="paste-field">
          <span class="paste-label">Or paste offer code</span>
          <textarea v-model="pastePayload" class="paste-input" rows="2" placeholder="STW1:…" />
          <button
            type="button"
            class="chrome-btn"
            :disabled="!pastePayload.trim()"
            @click="onPasteSubmit"
          >
            Use offer
          </button>
        </label>
      </template>
    </LabsTransferOverlay>
  </section>
</template>

<style scoped>
.page {
  display: grid;
  gap: 1rem;
  width: 100%;
  max-width: 40rem;
  margin: 0 auto;
}
.page-head {
  display: grid;
  gap: 0.35rem;
}
.page-title {
  margin: 0;
  font-size: 1.35rem;
  font-weight: 750;
  letter-spacing: -0.02em;
}
.intro,
.hint,
.queue-summary {
  margin: 0;
  color: var(--muted);
  font-size: 0.92rem;
  line-height: 1.45;
}
.section-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
}
.tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.4rem;
}
.tab {
  min-height: 44px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--surface);
  font: inherit;
  font-weight: 650;
  cursor: pointer;
  color: inherit;
}
.tab.active {
  border-color: var(--accent, #0f6b5c);
  background: color-mix(in srgb, var(--accent, #0f6b5c) 12%, var(--surface));
}
.panel {
  display: grid;
  gap: 0.85rem;
}
.queue-card,
.receive-intro-card,
.received {
  display: grid;
  gap: 0.75rem;
  padding: 0.85rem;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
}
.queue-head,
.received-head,
.hint-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}
.queue-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.5rem;
}
.queue-list li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.45rem 0;
  border-top: 1px solid var(--border);
}
.queue-list li:first-child {
  border-top: 0;
  padding-top: 0;
}
.queue-meta {
  display: grid;
  gap: 0.15rem;
  min-width: 0;
  flex: 1;
}
.file-name {
  font-weight: 650;
  overflow-wrap: anywhere;
}
.file-size,
.saved-badge {
  font-size: 0.85rem;
  color: var(--muted);
}
.saved-badge {
  color: var(--accent, #0f6b5c);
  font-weight: 650;
}
.queue-actions,
.row-actions,
.send-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.file-add {
  display: inline-flex;
  align-items: center;
  cursor: pointer;
}
.file-add.disabled {
  opacity: 0.55;
  pointer-events: none;
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
.receive-idle-hint {
  margin: 0;
}
.stage-inner {
  display: grid;
  place-items: center;
  width: min(100%, 28rem);
  gap: 0.75rem;
}
.qr-img {
  width: min(280px, 100%);
  height: auto;
  background: #fff;
  border-radius: 0.5rem;
  padding: 0.5rem;
}
.scan-video {
  width: 100%;
  max-height: min(60vh, 420px);
  object-fit: cover;
  border-radius: 0.5rem;
  background: #111;
}
.paste-field {
  display: grid;
  gap: 0.35rem;
  width: min(100%, 28rem);
}
.paste-label {
  font-size: 0.85rem;
  font-weight: 650;
  opacity: 0.9;
}
.paste-input {
  width: 100%;
  font: inherit;
  padding: 0.5rem;
  border-radius: 0.4rem;
  border: 1px solid rgba(255, 255, 255, 0.28);
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  resize: vertical;
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
</style>
