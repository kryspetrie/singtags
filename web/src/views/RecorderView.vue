<script setup lang="ts">
/**
 * Labs Audio Recorder — list of on-device recording sessions.
 * New opens a session ready to record; Quick Record creates one and starts immediately.
 */
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { useRecorderStore } from '../stores/recorder'
import { usePreferencesStore } from '../stores/preferences'
import {
  defaultRecorderSessionName,
  filterRecorderSessions,
  type RecorderSessionSort,
} from '../types/recorder'
import { openRecorderStream } from '../audio/recorderCapture'
import { setPendingQuickRecordStream, clearPendingQuickRecordStream } from '../audio/pendingQuickRecord'
import { exportSessionsZip, RECORDER_DOWNLOAD_FORMAT_OPTIONS, type RecorderDownloadFormat } from '../download/recorderExport'
import { getStorageEstimate } from '../offline/storageEstimate'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import RecorderSettingsModal from '../components/RecorderSettingsModal.vue'

const store = useRecorderStore()
const prefs = usePreferencesStore()
const router = useRouter()

const q = ref('')
const sort = ref<RecorderSessionSort>('newest')
const dateFrom = ref('')
const dateTo = ref('')
const selected = ref<Set<string>>(new Set())
const creating = ref(false)
const quickStarting = ref(false)
const err = ref<string | null>(null)
const msg = ref<string | null>(null)
const exportFormat = ref<RecorderDownloadFormat>('original')
const exporting = ref(false)
const originUsage = ref<{ usage: number; quota: number } | null>(null)
const deleteConfirmOpen = ref(false)
const settingsOpen = ref(false)

const quickLabels = ref<string[]>([...prefs.quickRecordPrefs.autoLabels])
const quickNotesText = ref(prefs.quickRecordPrefs.autoNotes)
const captureDraft = ref({ ...prefs.recorderCapturePrefs })

const filtered = computed(() =>
  filterRecorderSessions(store.sessions, {
    query: q.value,
    dateFrom: dateFrom.value,
    dateTo: dateTo.value,
    sort: sort.value,
  }),
)

const selectedSessions = computed(() =>
  store.sessions.filter((s) => selected.value.has(s.id)),
)

const hasActiveFilters = computed(
  () => !!q.value.trim() || !!dateFrom.value || !!dateTo.value || sort.value !== 'newest',
)

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function clearFilters(): void {
  q.value = ''
  dateFrom.value = ''
  dateTo.value = ''
  sort.value = 'newest'
}

function toggle(id: string): void {
  const next = new Set(selected.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selected.value = next
}

function persistQuickSettings(): void {
  prefs.setQuickRecordPrefs({
    autoLabels: [...quickLabels.value],
    autoNotes: quickNotesText.value,
  })
  prefs.setRecorderCapturePrefs(captureDraft.value)
  quickLabels.value = [...prefs.quickRecordPrefs.autoLabels]
  quickNotesText.value = prefs.quickRecordPrefs.autoNotes
  captureDraft.value = { ...prefs.recorderCapturePrefs }
}

async function createSession(): Promise<void> {
  if (creating.value || quickStarting.value) return
  creating.value = true
  err.value = null
  try {
    const session = await store.createSession({
      name: defaultRecorderSessionName(),
      notes: '',
      labels: [],
      capture: prefs.recorderCapturePrefs,
    })
    await router.push(`/recorder/${session.id}`)
  } catch (e) {
    err.value = e instanceof Error ? e.message : String(e)
  } finally {
    creating.value = false
  }
}

async function quickRecord(): Promise<void> {
  if (creating.value || quickStarting.value) return
  quickStarting.value = true
  err.value = null
  let stream: MediaStream | null = null
  try {
    persistQuickSettings()
    // Mic first (same user gesture) so deny never leaves an empty session.
    stream = await openRecorderStream(prefs.recorderCapturePrefs)
    const quick = prefs.quickRecordPrefs
    const session = await store.createSession({
      name: defaultRecorderSessionName(),
      notes: quick.autoNotes,
      labels: [...quick.autoLabels],
      capture: prefs.recorderCapturePrefs,
    })
    setPendingQuickRecordStream(stream)
    stream = null
    await router.push({ path: `/recorder/${session.id}`, query: { quick: '1' } })
  } catch (e) {
    clearPendingQuickRecordStream()
    if (stream) {
      for (const track of stream.getTracks()) {
        try {
          track.stop()
        } catch {
          /* ignore */
        }
      }
    }
    err.value =
      e instanceof Error
        ? e.name === 'NotAllowedError'
          ? 'Microphone permission denied'
          : e.message
        : String(e)
  } finally {
    quickStarting.value = false
  }
}

function requestDeleteSelected(): void {
  if (!selectedSessions.value.length) return
  deleteConfirmOpen.value = true
}

async function confirmDeleteSelected(): Promise<void> {
  deleteConfirmOpen.value = false
  for (const s of selectedSessions.value) {
    await store.removeSession(s.id)
  }
  selected.value = new Set()
}

async function exportSelected(): Promise<void> {
  if (!selectedSessions.value.length) return
  exporting.value = true
  err.value = null
  msg.value = null
  try {
    await exportSessionsZip(selectedSessions.value, exportFormat.value)
    msg.value = `Exported ${selectedSessions.value.length} session(s).`
  } catch (e) {
    err.value = e instanceof Error ? e.message : String(e)
  } finally {
    exporting.value = false
  }
}

onMounted(async () => {
  await store.refresh()
  originUsage.value = await getStorageEstimate()
  quickLabels.value = [...prefs.quickRecordPrefs.autoLabels]
  quickNotesText.value = prefs.quickRecordPrefs.autoNotes
  captureDraft.value = { ...prefs.recorderCapturePrefs }
})
</script>

<template>
  <section class="recorder" aria-label="Audio Recorder">
    <header class="head">
      <div class="head-row">
        <h1>Audio Recorder</h1>
        <button type="button" class="btn settings" @click="settingsOpen = true">
          Recording settings
        </button>
      </div>
      <p class="intro">
        Quick Record starts a session and the mic immediately. Or tap New to open a session first.
      </p>
      <p class="storage muted">
        Recorder storage: {{ fmtBytes(store.totalBytes) }}
        <template v-if="originUsage">
          - Device {{ fmtBytes(originUsage.usage) }} / {{ fmtBytes(originUsage.quota) }}
        </template>
      </p>
    </header>

    <div class="toolbar">
      <button
        type="button"
        class="go rec"
        :disabled="creating || quickStarting"
        aria-label="Quick Record"
        @click="quickRecord"
      >
        {{ quickStarting ? 'Starting…' : 'Quick Record' }}
      </button>
      <button type="button" class="go secondary" :disabled="creating || quickStarting" @click="createSession">
        {{ creating ? 'Opening…' : 'New' }}
      </button>
    </div>

    <div class="search-row">
      <input
        v-model="q"
        type="search"
        class="search"
        placeholder="Search title, notes, or labels…"
        aria-label="Search title, notes, or labels"
      />
    </div>

    <div class="filters card">
      <label class="fmt">
        Sort
        <select v-model="sort" aria-label="Sort by date">
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
        </select>
      </label>
      <label class="fmt">
        From
        <input v-model="dateFrom" type="date" aria-label="Filter from date" />
      </label>
      <label class="fmt">
        To
        <input v-model="dateTo" type="date" aria-label="Filter to date" />
      </label>
      <button
        v-if="hasActiveFilters"
        type="button"
        class="btn clear"
        @click="clearFilters"
      >
        Clear filters
      </button>
    </div>

    <div v-if="selectedSessions.length" class="bulk card">
      <p>{{ selectedSessions.length }} selected</p>
      <p class="muted tip">
        Original keeps the capture container when there are no edits; otherwise Edit take settings are
        baked in. MP3 and M4A always re-encode.
      </p>
      <label class="fmt">
        Export as
        <select v-model="exportFormat">
          <option v-for="f in RECORDER_DOWNLOAD_FORMAT_OPTIONS" :key="f.value" :value="f.value">
            {{ f.label }}
          </option>
        </select>
      </label>
      <div class="bulk-actions">
        <button type="button" class="go" :disabled="exporting" @click="exportSelected">
          {{ exporting ? 'Exporting…' : 'Export zip' }}
        </button>
        <button type="button" class="go danger" @click="requestDeleteSelected">Delete</button>
      </div>
    </div>

    <p v-if="err" class="error" role="alert">{{ err }}</p>
    <p v-if="msg" class="ok" role="status">{{ msg }}</p>

    <ul v-if="filtered.length" class="list">
      <li v-for="s in filtered" :key="s.id" class="row">
        <label class="check">
          <input type="checkbox" :checked="selected.has(s.id)" @change="toggle(s.id)" />
          <span class="visually-hidden">Select {{ s.name }}</span>
        </label>
        <RouterLink class="main" :to="`/recorder/${s.id}`">
          <span class="title">{{ s.name }}</span>
          <span v-if="s.notes.trim()" class="notes-preview">{{ s.notes.trim() }}</span>
          <span class="meta">
            {{ s.takeIds.length }} take{{ s.takeIds.length === 1 ? '' : 's' }}
            <template v-if="s.labels.length"> - {{ s.labels.join(', ') }}</template>
            <template v-if="s.linkedTag"> · Tag: {{ s.linkedTag.title }}</template>
            <template v-else-if="s.linkedLibrary"> · Library: {{ s.linkedLibrary.title }}</template>
          </span>
        </RouterLink>
      </li>
    </ul>
    <p v-else-if="store.loaded && store.sessions.length" class="empty muted">
      No sessions match these filters.
    </p>
    <p v-else-if="store.loaded" class="empty muted">No sessions yet — tap Quick Record or New.</p>

    <ConfirmDialog
      :open="deleteConfirmOpen"
      title="Delete sessions?"
      :message="`Delete ${selectedSessions.length} session(s)? This cannot be undone.`"
      confirm-label="Delete"
      @close="deleteConfirmOpen = false"
      @confirm="confirmDeleteSelected"
    />
    <RecorderSettingsModal
      v-model="captureDraft"
      v-model:quick-labels="quickLabels"
      v-model:quick-notes="quickNotesText"
      :open="settingsOpen"
      show-quick-defaults
      @change="persistQuickSettings"
      @close="settingsOpen = false"
    />
  </section>
</template>

<style scoped>
.recorder {
  display: grid;
  gap: 1rem;
  padding: 0.15rem 0 2rem;
  min-width: 0;
  max-width: 100%;
}
.head-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.55rem;
}
.head h1 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.45rem;
}
.btn.settings {
  min-height: 40px;
  padding: 0.35rem 0.75rem;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  color: inherit;
}
.intro,
.storage,
.muted,
.empty,
.tip {
  margin: 0.35rem 0 0;
  color: var(--muted);
  font-size: 0.9rem;
  line-height: 1.4;
}
.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
}
.search-row {
  display: flex;
}
.search {
  flex: 1 1 12rem;
  min-height: 44px;
  font: inherit;
  font-size: 16px;
  border-radius: 8px;
  border: 1px solid var(--border);
  padding: 0.45rem 0.65rem;
  background: var(--bg);
}
.card {
  display: grid;
  gap: 0.65rem;
  padding: 0.85rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
}
.filters {
  grid-template-columns: 1fr;
}
@media (min-width: 560px) {
  .filters {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    align-items: end;
  }
  .filters .clear {
    grid-column: 1 / -1;
    justify-self: start;
  }
}
.fmt {
  display: grid;
  gap: 0.35rem;
  font-size: 0.9rem;
  color: var(--muted);
}
.fmt select,
.fmt input,
.fmt textarea {
  font: inherit;
  font-size: 16px;
  min-height: 44px;
  border-radius: 8px;
  border: 1px solid var(--border);
  padding: 0.45rem 0.65rem;
  background: var(--bg);
  color: inherit;
}
.fmt textarea {
  min-height: 4rem;
  resize: vertical;
  line-height: 1.4;
}
.btn.clear {
  min-height: 40px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg);
  font: inherit;
  font-weight: 600;
  padding: 0.35rem 0.7rem;
  cursor: pointer;
  color: inherit;
}
.go {
  min-height: 48px;
  border: 0;
  border-radius: 10px;
  background: var(--accent);
  color: #fff;
  font: inherit;
  font-weight: 600;
  padding: 0.5rem 1rem;
  cursor: pointer;
}
.go.secondary {
  background: var(--bg);
  color: inherit;
  border: 1px solid var(--border);
}
.go.rec {
  background: #b33;
  min-width: 9.5rem;
}
.go.danger {
  background: var(--danger, #b33);
}
.go:disabled {
  opacity: 0.55;
}
.bulk-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.45rem;
}
.row {
  display: flex;
  gap: 0.55rem;
  align-items: stretch;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
  min-width: 0;
}
.check {
  display: grid;
  place-items: center;
  padding: 0 0.35rem 0 0.65rem;
}
.main {
  flex: 1;
  min-width: 0;
  padding: 0.7rem 0.85rem 0.7rem 0;
  text-decoration: none;
  color: inherit;
  display: grid;
  gap: 0.2rem;
}
.title {
  font-weight: 700;
}
.notes-preview {
  font-size: 0.88rem;
  color: var(--text);
  opacity: 0.85;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.meta {
  font-size: 0.85rem;
  color: var(--muted);
}
.error {
  margin: 0;
  color: var(--danger);
}
.ok {
  margin: 0;
  color: var(--accent);
}
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}
</style>
