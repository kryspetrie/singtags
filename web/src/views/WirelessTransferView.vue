<script setup lang="ts">
/**
 * Labs: WebRTC wireless transfer — own page (not nested under Optical).
 */
import { computed, ref } from 'vue'
import EmptyState from '../components/EmptyState.vue'
import WebrtcTransferPanel from '../components/WebrtcTransferPanel.vue'
import { prefersOpticalDownloadSave, saveOpticalFiles } from '../lib/decimen/opticalTransfer'
import { formatBytes } from '../offline/storageEstimate'
import type { OpticalFile } from '../../vendor/decimen/shared/protocol'
import { useSnackbarStore } from '../stores/snackbar'

type Tab = 'send' | 'receive'
type QueuedFile = { id: number; file: File }
type ReceivedItem = { id: string; file: OpticalFile; saved: boolean }

const snackbar = useSnackbarStore()
const tab = ref<Tab>('send')
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

function onFilesPicked(ev: Event): void {
  const input = ev.target as HTMLInputElement
  const files = input.files ? Array.from(input.files) : []
  input.value = ''
  if (!files.length) return
  queue.value = [
    ...queue.value,
    ...files.map((file) => ({ id: ++nextQueueId, file })),
  ]
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
  tab.value = 'receive'
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
        @click="tab = 'send'"
      >
        Send
      </button>
      <button
        type="button"
        class="tab"
        role="tab"
        :aria-selected="tab === 'receive'"
        :class="{ active: tab === 'receive' }"
        @click="tab = 'receive'"
      >
        Receive
      </button>
    </div>

    <div v-show="tab === 'send'" class="panel" role="tabpanel" aria-label="Send files">
      <div class="queue-card">
        <div class="queue-head">
          <h2 class="section-title">Transfer queue</h2>
          <p v-if="queueSummary" class="queue-summary">{{ queueSummary }}</p>
        </div>
        <ul v-if="queue.length" class="queue-list">
          <li v-for="entry in queue" :key="entry.id">
            <div class="queue-meta">
              <span class="file-name">{{ entry.file.name }}</span>
              <span class="file-size">{{ formatBytes(entry.file.size) }}</span>
            </div>
            <button type="button" class="btn btn-ghost remove" @click="removeQueued(entry.id)">
              Remove
            </button>
          </li>
        </ul>
        <EmptyState
          v-else
          title="No files queued yet"
          message="Add one or more files, then create a wireless offer QR."
        />
        <div class="queue-actions">
          <label class="btn file-add">
            Add files…
            <input class="visually-hidden" type="file" multiple @change="onFilesPicked" />
          </label>
          <button
            v-if="queue.length"
            type="button"
            class="btn btn-ghost"
            @click="clearQueue"
          >
            Clear queue
          </button>
        </div>
      </div>

      <WebrtcTransferPanel tab="send" :files="queuedFiles" @received="onReceived" />
    </div>

    <div v-show="tab === 'receive'" class="panel" role="tabpanel" aria-label="Receive files">
      <WebrtcTransferPanel tab="receive" :files="[]" @received="onReceived" />

      <div v-if="received.length" class="received">
        <div class="received-head">
          <h2 class="section-title">Received files</h2>
          <button
            type="button"
            class="btn btn-primary"
            :disabled="saveBusy"
            @click="saveAll"
          >
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
.received {
  display: grid;
  gap: 0.75rem;
  padding: 0.85rem;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
}
.queue-head,
.received-head {
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
.row-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.file-add {
  display: inline-flex;
  align-items: center;
  cursor: pointer;
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
