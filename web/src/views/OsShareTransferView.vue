<script setup lang="ts">
/**
 * Labs OS Share — Optical-like UX: queue on Send, idle Receive + fullscreen import overlay.
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter, type RouteLocationNormalizedLoaded } from 'vue-router'
import EmptyState from '../components/EmptyState.vue'
import InfoTips from '../components/InfoTips.vue'
import LabsReceiveInvite from '../components/LabsReceiveInvite.vue'
import LabsTransferOverlay from '../components/LabsTransferOverlay.vue'
import OpticalReceiveInviteOverlay from '../components/OpticalReceiveInviteOverlay.vue'
import { prefersOpticalDownloadSave, saveOpticalFiles } from '../lib/decimen/opticalTransfer'
import {
  isLabsReceiveFullscreenQuery,
  isOsShareReceiveRoute,
  OS_SHARE_RX_PATH,
  OS_SHARE_TX_PATH,
  osShareReceiveAbsoluteHref,
} from '../lib/labsTransferNav'
import {
  canShareFiles,
  downloadTransferBundle,
  isShareTargetQuery,
  shareTransferBundle,
  takeShareTargetFiles,
} from '../lib/osShareTransfer'
import { buildTransferBundle, opticalFileFromBrowserFile } from '../lib/transferBundle'
import { formatBytes } from '../offline/storageEstimate'
import type { OpticalFile } from '../../vendor/decimen/shared/protocol'
import { useSnackbarStore } from '../stores/snackbar'
import { usePreferencesStore } from '../stores/preferences'

type Tab = 'send' | 'receive'
type QueuedFile = { id: number; file: File }
type ReceivedItem = { id: string; file: OpticalFile; saved: boolean }

const route = useRoute()
const router = useRouter()
const snackbar = useSnackbarStore()
const prefs = usePreferencesStore()

function tabFromRoute(r: RouteLocationNormalizedLoaded): Tab {
  return isOsShareReceiveRoute(r) ? 'receive' : 'send'
}

function selectTab(next: Tab): void {
  if (tab.value !== next) tab.value = next
  const path = next === 'receive' ? OS_SHARE_RX_PATH : OS_SHARE_TX_PATH
  const query = { ...route.query }
  if ('mode' in query) delete query.mode
  if ('fullscreen' in query) delete query.fullscreen
  // Keep share-target only while actively ingesting; tab clicks clear it.
  if ('share-target' in query) delete query['share-target']
  if ('shareTarget' in query) delete query.shareTarget
  if (
    route.path === path &&
    !('mode' in route.query) &&
    !('fullscreen' in route.query) &&
    !('share-target' in route.query)
  ) {
    return
  }
  void router.replace({ path, query })
}

function shouldAutoStartReceive(r: RouteLocationNormalizedLoaded = route): boolean {
  return (
    isOsShareReceiveRoute(r) &&
    (isLabsReceiveFullscreenQuery(r.query) || isShareTargetQuery(r.query))
  )
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

const receiveInviteHref = computed(() => osShareReceiveAbsoluteHref(router))
const receiveInviteOverlayOpen = ref(false)

const sendBusy = ref(false)
const sendStatus = ref('')
const sendError = ref<string | null>(null)

const receiveLive = ref(false)
const overlayStatus = ref('')
const overlayError = ref<string | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)

const sendStartDisabled = computed(
  () => !queue.value.length || sendBusy.value || receiveLive.value,
)
const sendStartLabel = computed(() => (sendBusy.value ? 'Sharing…' : 'Share via device…'))

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
}

function stopReceiveLive(): void {
  receiveLive.value = false
  overlayStatus.value = ''
  overlayError.value = null
}

async function ingestBrowserFiles(files: File[]): Promise<void> {
  for (const file of files) {
    onReceived(await opticalFileFromBrowserFile(file))
  }
}

async function shareQueue(): Promise<void> {
  if (sendStartDisabled.value) return
  receiveInviteOverlayOpen.value = false
  sendBusy.value = true
  sendError.value = null
  sendStatus.value = 'Packing…'
  try {
    const bundle = await buildTransferBundle(queuedFiles.value)
    if (canShareFiles(bundle.file)) {
      sendStatus.value = 'Opening share sheet…'
      const result = await shareTransferBundle(bundle.file)
      if (result === 'shared') {
        sendStatus.value = 'Shared — pick Quick Share, AirDrop, or Files on the other phone'
        snackbar.show('Choose Quick Share or AirDrop in the share sheet', { tone: 'ok', ms: 4000 })
      } else if (result === 'aborted') {
        sendStatus.value = 'Share cancelled'
      } else {
        downloadTransferBundle(bundle.file)
        sendStatus.value = 'Downloaded — share that file via Quick Share / AirDrop / Files'
      }
    } else {
      downloadTransferBundle(bundle.file)
      sendStatus.value =
        'Web Share unavailable — file downloaded. Share it with Quick Share, AirDrop, or Files.'
    }
  } catch (e) {
    sendError.value = e instanceof Error ? e.message : 'Could not share.'
  } finally {
    sendBusy.value = false
  }
}

async function beginLiveReceive(): Promise<void> {
  if (receiveLive.value) return
  receiveLive.value = true
  overlayError.value = null
  overlayStatus.value = 'Import a shared SingTags pack, or wait if one was just shared to this app'
  await nextTick()
  if (isShareTargetQuery(route.query)) {
    await ingestShareTarget()
  }
}

async function ingestShareTarget(): Promise<void> {
  overlayStatus.value = 'Importing shared files…'
  try {
    const shared = await takeShareTargetFiles()
    if (shared.length) {
      await ingestBrowserFiles(shared)
      overlayStatus.value = `Imported ${shared.length} file${shared.length === 1 ? '' : 's'}`
      snackbar.show('Imported from share', { tone: 'ok', ms: 3000 })
      stopReceiveLive()
      selectTab('receive')
    } else {
      overlayStatus.value = 'No shared files found — use Import shared file…'
    }
    const q = { ...route.query }
    delete q['share-target']
    delete q.shareTarget
    // Stay on receive path; drop share-target flag.
    await router.replace({ path: OS_SHARE_RX_PATH, query: q })
  } catch (e) {
    overlayError.value = e instanceof Error ? e.message : 'Could not read shared files.'
  }
}

async function onImportPicked(ev: Event): Promise<void> {
  const input = ev.target as HTMLInputElement
  const list = input.files ? Array.from(input.files) : []
  input.value = ''
  if (!list.length) return
  overlayError.value = null
  overlayStatus.value = 'Importing…'
  try {
    await ingestBrowserFiles(list)
    overlayStatus.value = `Imported ${list.length} file${list.length === 1 ? '' : 's'}`
    snackbar.show(`Imported ${list.length} file${list.length === 1 ? '' : 's'}`, {
      tone: 'ok',
      ms: 3000,
    })
    stopReceiveLive()
    selectTab('receive')
  } catch (e) {
    overlayError.value = e instanceof Error ? e.message : 'Import failed.'
  }
}

function triggerImportPicker(): void {
  fileInputRef.value?.click()
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

function openReceiveInviteOverlay(): void {
  receiveInviteOverlayOpen.value = true
}

function closeReceiveInviteOverlay(): void {
  receiveInviteOverlayOpen.value = false
}

function startFromReceiveInviteOverlay(): void {
  closeReceiveInviteOverlay()
  void shareQueue()
}

watch(tab, (next) => {
  if (next !== 'receive') stopReceiveLive()
})

onMounted(() => {
  if (isShareTargetQuery(route.query)) {
    prefs.setOsShareTransferEnabled(true)
  }
  if (shouldAutoStartReceive(route)) void beginLiveReceive()
})

watch(
  () =>
    [route.name, route.path, route.query.mode, route.query.fullscreen, route.query['share-target']] as const,
  () => {
    const next = tabFromRoute(route)
    tab.value = next
    if (next === 'receive' && shouldAutoStartReceive(route) && !receiveLive.value) {
      void beginLiveReceive()
    }
  },
)

onUnmounted(() => {
  stopReceiveLive()
})
</script>

<template>
  <section class="page" aria-label="OS Share transfer">
    <header class="page-head">
      <h1 class="page-title">OS Share</h1>
      <p class="intro">
        Labs experiment: pack your queue and open the device share sheet (Quick Share, AirDrop,
        Files). SingTags cannot call Quick Share directly.
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
            <InfoTips label="OS Share how-to" title="How to share via device">
              <p><strong>Send</strong> packs the queue and opens the system share sheet.</p>
              <p>
                <strong>Android receive:</strong> install the PWA so SingTags appears as a share
                target, or import a saved file in fullscreen receive.
              </p>
              <p>
                <strong>iPhone receive:</strong> AirDrop into Files, then Start receiving → Import.
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
              :disabled="sendBusy"
              @click="removeQueued(entry.id)"
            >
              Remove
            </button>
          </li>
        </ul>
        <EmptyState
          v-else
          title="No files queued yet"
          message="Add one or more files, then share via your device."
        />
        <div class="queue-actions">
          <label class="btn file-add" :class="{ disabled: sendBusy }">
            Add files…
            <input
              class="visually-hidden"
              type="file"
              multiple
              :disabled="sendBusy"
              @change="onFilesPicked"
            />
          </label>
          <button
            v-if="queue.length"
            type="button"
            class="btn btn-ghost"
            :disabled="sendBusy"
            @click="clearQueue"
          >
            Clear queue
          </button>
        </div>
      </div>

      <LabsReceiveInvite
        :url="receiveInviteHref"
        title="Sending to someone who needs Receive open?"
        description="Share this link. It opens OS Share receive in fullscreen so they can import the pack."
      />

      <div class="send-actions">
        <button
          type="button"
          class="btn btn-primary"
          :disabled="sendStartDisabled"
          @click="shareQueue"
        >
          {{ sendStartLabel }}
        </button>
        <button
          type="button"
          class="btn"
          :disabled="sendBusy"
          @click="openReceiveInviteOverlay"
        >
          Receive link QR
        </button>
      </div>
      <p v-if="sendBusy" class="status" role="status">{{ sendStatus }}</p>
      <p v-else-if="sendError" class="err" role="alert">{{ sendError }}</p>
      <p v-else-if="sendStatus" class="status" role="status">{{ sendStatus }}</p>
    </div>

    <div v-show="tab === 'receive'" class="panel receive-panel" role="tabpanel" aria-label="Receive files">
      <div class="receive-intro-card">
        <h2 class="section-title">Receive to this device</h2>
        <p class="hint">
          Start receiving to open fullscreen import. Android share-target handoffs also land here
          automatically.
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
        After import, the overlay closes so your received files list is visible.
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
      start-label="Share via device…"
      @close="closeReceiveInviteOverlay"
      @start="startFromReceiveInviteOverlay"
    />

    <LabsTransferOverlay
      :open="receiveLive"
      title="OS Share receive"
      :status="overlayStatus"
      :error="overlayError"
      @stop="stopReceiveLive"
    >
      <template #chrome>
        <button type="button" class="chrome-btn" @click="triggerImportPicker">
          Import shared file…
        </button>
      </template>
      <div class="stage-inner">
        <p class="stage-copy">
          Import a pack from Files / Downloads, or wait if Android just shared into SingTags.
        </p>
        <input
          ref="fileInputRef"
          class="visually-hidden"
          type="file"
          multiple
          @change="onImportPicked"
        />
      </div>
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
.queue-summary,
.status {
  margin: 0;
  color: var(--muted);
  font-size: 0.92rem;
  line-height: 1.45;
}
.err {
  margin: 0;
  color: var(--danger, #b00020);
  font-size: 0.92rem;
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
  padding: 1rem;
  text-align: center;
}
.stage-copy {
  margin: 0;
  opacity: 0.9;
  line-height: 1.45;
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
