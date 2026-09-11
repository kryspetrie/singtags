<script setup lang="ts">
/**
 * One recording session: capture settings, takes, player, tag link, export.
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink, onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { useRecorderStore } from '../stores/recorder'
import { usePreferencesStore } from '../stores/preferences'
import { useCatalogStore } from '../stores/catalog'
import { useLocalLibraryStore } from '../stores/localLibrary'
import type { RecorderCapturePrefs, RecorderSession, RecorderTake } from '../types/recorder'
import { takePendingQuickRecordStream } from '../audio/pendingQuickRecord'
import { useRecorderCapture, type LeaveRecordingDecision } from '../composables/useRecorderCapture'
import {
  exportSessionZip,
  exportTakeFile,
  RECORDER_DOWNLOAD_FORMAT_OPTIONS,
  type RecorderDownloadFormat,
} from '../download/recorderExport'
import { tagOpenLocation } from '../lib/tagOpen'
import RecorderPlayer from '../components/RecorderPlayer.vue'
import RecorderLiveMonitor from '../components/RecorderLiveMonitor.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import LabelPillsInput from '../components/LabelPillsInput.vue'
import RecorderSettingsModal from '../components/RecorderSettingsModal.vue'

const props = defineProps<{ id: string }>()

const store = useRecorderStore()
const prefs = usePreferencesStore()
const catalog = useCatalogStore()
const localLib = useLocalLibraryStore()
const router = useRouter()
const route = useRoute()

const sessionName = ref('')
const sessionNotes = ref('')
const sessionLabels = ref<string[]>([])
const currentSession = ref<RecorderSession | null>(null)
const takes = ref<RecorderTake[]>([])
const activeTakeId = ref<string | null>(null)
const err = ref<string | null>(null)
const msg = ref<string | null>(null)
const capture = ref<RecorderCapturePrefs>({ ...prefs.recorderCapturePrefs })
const devices = ref<MediaDeviceInfo[]>([])
const pendingRenameId = ref<string | null>(null)
const sessionRenameOpen = ref(false)
const renameInput = ref('')
const renameError = ref<string | null>(null)
const renameInputRef = ref<HTMLInputElement | null>(null)
const takeRenameInputRef = ref<HTMLInputElement | null>(null)
const exportFormat = ref<RecorderDownloadFormat>('original')
const busyExport = ref(false)
const settingsOpen = ref(false)
const tagQuery = ref('')
const tagPickerOpen = ref(false)
const libraryQuery = ref('')
const libraryPickerOpen = ref(false)

const deleteSessionOpen = ref(false)
const deleteTakeId = ref<string | null>(null)
const cancelRecOpen = ref(false)
const leaveOpen = ref(false)
const emptySessionOpen = ref(false)
let cancelRecResolve: ((ok: boolean) => void) | null = null
let leaveResolve: ((d: LeaveRecordingDecision) => void) | null = null
let emptySessionResolve: ((ok: boolean) => void) | null = null

function persistCapture(): void {
  prefs.setRecorderCapturePrefs(capture.value)
  void store.updateSession(props.id, { capture: capture.value })
}

function requestCancelConfirm(): Promise<boolean> {
  cancelRecOpen.value = true
  return new Promise((resolve) => {
    cancelRecResolve = resolve
  })
}

function resolveCancelConfirm(ok: boolean): void {
  cancelRecOpen.value = false
  cancelRecResolve?.(ok)
  cancelRecResolve = null
}

function requestLeaveDecision(): Promise<LeaveRecordingDecision> {
  leaveOpen.value = true
  return new Promise((resolve) => {
    leaveResolve = resolve
  })
}

function resolveLeaveDecision(d: LeaveRecordingDecision): void {
  leaveOpen.value = false
  leaveResolve?.(d)
  leaveResolve = null
}

function requestEmptySessionCleanup(): Promise<boolean> {
  emptySessionOpen.value = true
  return new Promise((resolve) => {
    emptySessionResolve = resolve
  })
}

function resolveEmptySession(ok: boolean): void {
  emptySessionOpen.value = false
  emptySessionResolve?.(ok)
  emptySessionResolve = null
}

const {
  recording,
  paused,
  elapsed,
  liveMeter,
  canPause,
  startRecording,
  stopRecording,
  cancelRecording,
  onCancelClick,
  togglePause,
  confirmLeaveWhileRecording,
  onBeforeUnload,
  markLeaveHandled,
  refreshDevices,
} = useRecorderCapture({
  capture,
  onPersistCapture: persistCapture,
  onError: (message) => {
    err.value = message
  },
  onDevices: (list) => {
    devices.value = list
  },
  requestCancelConfirm,
  requestLeaveDecision,
  onSavedTake: async ({ blob, mimeType, durationSec, channels, bitRate }) => {
    const take = await store.addTake({
      sessionId: props.id,
      blob,
      mime: mimeType,
      durationSec,
      channels,
      bitRate,
    })
    takes.value = await store.loadTakes(props.id)
    activeTakeId.value = take.id
    msg.value = `Saved ${take.label}`
  },
})

const activeTake = computed(() => takes.value.find((t) => t.id === activeTakeId.value) ?? null)
const pendingRenameTitle = computed(() => {
  const t = pendingRenameId.value ? takes.value.find((x) => x.id === pendingRenameId.value) : null
  return t ? `Rename “${t.label}”` : 'Rename take'
})
const showEmptyTransport = computed(() => !takes.value.length)
const libraryEnabled = computed(() => prefs.localLibraryEnabled)

function fmtWhen(iso: string): string {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return ''
  return new Date(t).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

const tagHits = computed(() => {
  const q = tagQuery.value.trim()
  if (!q) return []
  catalog.queryText = q
  return catalog.allResults.slice(0, 12)
})

const libraryHits = computed(() => {
  const q = libraryQuery.value.trim().toLowerCase()
  const list = localLib.entries
  if (!q) return list.slice(0, 12)
  return list
    .filter((e) => {
      const hay = `${e.title}\n${e.arranger}\n${e.notes}`.toLowerCase()
      return hay.includes(q)
    })
    .slice(0, 12)
})

async function reload(): Promise<void> {
  err.value = null
  await store.refresh()
  const { getRecorderSession } = await import('../offline/recorderDb')
  const row = await getRecorderSession(props.id)
  if (!row) {
    currentSession.value = null
    err.value = 'Session not found'
    return
  }
  currentSession.value = row
  sessionName.value = row.name
  sessionNotes.value = row.notes ?? ''
  sessionLabels.value = [...row.labels]
  // Honor this session's capture snapshot (not only global prefs).
  capture.value = { ...row.capture }
  takes.value = await store.loadTakes(props.id)
  if (!activeTakeId.value || !takes.value.some((t) => t.id === activeTakeId.value)) {
    activeTakeId.value = takes.value[takes.value.length - 1]?.id ?? null
  }
}

async function saveMeta(): Promise<void> {
  err.value = null
  try {
    await store.updateSession(props.id, {
      name: sessionName.value,
      notes: sessionNotes.value,
      labels: [...sessionLabels.value],
    })
    await reload()
    msg.value = 'Saved'
  } catch (e) {
    err.value = e instanceof Error ? e.message : String(e)
  }
}

onBeforeRouteLeave(async () => confirmLeaveWhileRecording())

async function openRenameSession(): Promise<void> {
  pendingRenameId.value = null
  sessionRenameOpen.value = true
  renameInput.value = sessionName.value
  renameError.value = null
  await nextTick()
  renameInputRef.value?.focus()
  renameInputRef.value?.select()
}

function cancelRenameSession(): void {
  sessionRenameOpen.value = false
  renameInput.value = ''
  renameError.value = null
}

async function confirmRenameSession(): Promise<void> {
  const name = renameInput.value.trim()
  if (!name) {
    renameError.value = 'Enter a name'
    return
  }
  sessionName.value = name
  sessionRenameOpen.value = false
  await saveMeta()
}

async function openRenameTake(t: RecorderTake): Promise<void> {
  pendingRenameId.value = t.id
  sessionRenameOpen.value = false
  renameInput.value = t.label
  renameError.value = null
  await nextTick()
  takeRenameInputRef.value?.focus()
  takeRenameInputRef.value?.select()
}

function cancelRenameTake(): void {
  pendingRenameId.value = null
  renameInput.value = ''
  renameError.value = null
}

async function confirmRenameTake(): Promise<void> {
  const id = pendingRenameId.value
  if (!id) return
  const label = renameInput.value.trim()
  if (!label) {
    renameError.value = 'Enter a name'
    return
  }
  await store.renameTake(id, label)
  takes.value = await store.loadTakes(props.id)
  cancelRenameTake()
}

function requestDeleteSession(): void {
  deleteSessionOpen.value = true
}

async function confirmDeleteSession(): Promise<void> {
  deleteSessionOpen.value = false
  markLeaveHandled()
  cancelRecording()
  await store.removeSession(props.id)
  await router.replace('/recorder')
}

function requestDeleteTake(takeId: string): void {
  deleteTakeId.value = takeId
}

async function confirmDeleteTake(): Promise<void> {
  const takeId = deleteTakeId.value
  deleteTakeId.value = null
  if (!takeId) return
  await store.removeTake(takeId)
  takes.value = await store.loadTakes(props.id)
  if (activeTakeId.value === takeId) {
    activeTakeId.value = takes.value[takes.value.length - 1]?.id ?? null
  }
}

async function exportActiveTake(): Promise<void> {
  if (!activeTake.value || !currentSession.value) return
  busyExport.value = true
  err.value = null
  try {
    await exportTakeFile(activeTake.value, currentSession.value.name, exportFormat.value)
    msg.value = 'Downloaded take'
  } catch (e) {
    err.value = e instanceof Error ? e.message : String(e)
  } finally {
    busyExport.value = false
  }
}

async function exportSession(): Promise<void> {
  if (!currentSession.value) return
  busyExport.value = true
  err.value = null
  try {
    await exportSessionZip(currentSession.value, exportFormat.value)
    msg.value = 'Downloaded session zip'
  } catch (e) {
    err.value = e instanceof Error ? e.message : String(e)
  } finally {
    busyExport.value = false
  }
}

function openTagPicker(): void {
  libraryPickerOpen.value = false
  tagPickerOpen.value = !tagPickerOpen.value
  if (tagPickerOpen.value) tagQuery.value = ''
}

function openLibraryPicker(): void {
  tagPickerOpen.value = false
  libraryPickerOpen.value = !libraryPickerOpen.value
  if (libraryPickerOpen.value) {
    libraryQuery.value = ''
    void localLib.ensureLoaded()
  }
}

function linkTag(hit: { id: number; title?: string | null }): void {
  void store
    .updateSession(props.id, {
      linkedTag: { tagId: hit.id, title: hit.title || `Tag ${hit.id}` },
      linkedLibrary: null,
    })
    .then(async () => {
      tagPickerOpen.value = false
      tagQuery.value = ''
      await reload()
      msg.value = 'Linked to tag'
    })
}

function linkLibrary(hit: { id: string; title: string }): void {
  void store
    .updateSession(props.id, {
      linkedLibrary: { entryId: hit.id, title: hit.title || 'Library song' },
      linkedTag: null,
    })
    .then(async () => {
      libraryPickerOpen.value = false
      libraryQuery.value = ''
      await reload()
      msg.value = 'Linked to My Library'
    })
}

function clearLinked(): void {
  void store
    .updateSession(props.id, { linkedTag: null, linkedLibrary: null })
    .then(() => reload())
}

function openLinkedTag(): void {
  const t = currentSession.value?.linkedTag
  if (!t) return
  void router.push(tagOpenLocation(t.tagId))
}

function openLinkedLibrary(): void {
  const t = currentSession.value?.linkedLibrary
  if (!t) return
  void router.push({ name: 'library-doc', params: { id: t.entryId } })
}

function fmtElapsed(t: number): string {
  const m = Math.floor(t / 60)
  const s = Math.floor(t % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

watch(
  () => props.id,
  () => void reload(),
)

onMounted(async () => {
  window.addEventListener('beforeunload', onBeforeUnload)
  await catalog.load()
  if (prefs.localLibraryEnabled) void localLib.ensureLoaded()
  await refreshDevices()
  await reload()
  const quick = route.query.quick === '1' || route.query.quick === 'true'
  if (quick && currentSession.value) {
    // Drop the flag so refresh/back doesn't re-arm the mic.
    const q = { ...route.query }
    delete q.quick
    await router.replace({ path: route.path, query: q })
    err.value = null
    msg.value = null
    const pending = takePendingQuickRecordStream()
    await startRecording(pending)
    // If Quick Record failed and session has no takes, offer cleanup.
    if (!recording.value && takes.value.length === 0) {
      if (await requestEmptySessionCleanup()) {
        markLeaveHandled()
        await store.removeSession(props.id)
        await router.replace('/recorder')
      }
    }
  }
})

onUnmounted(() => {
  window.removeEventListener('beforeunload', onBeforeUnload)
})
</script>

<template>
  <section class="session" aria-label="Recording session">
    <p class="back">
      <RouterLink to="/recorder">← All sessions</RouterLink>
    </p>

    <template v-if="currentSession">
      <header class="session-head">
        <div class="session-title-row">
          <h1 class="session-title-text">{{ sessionName }}</h1>
          <button
            type="button"
            class="icon-btn"
            title="Rename"
            aria-label="Rename session"
            @click="openRenameSession"
          >
            <font-awesome-icon :icon="['fas', 'pen']" aria-hidden="true" />
          </button>
          <button type="button" class="btn settings-btn" @click="settingsOpen = true">
            Recording settings
          </button>
          <button type="button" class="btn danger header-danger" @click="requestDeleteSession">
            Delete
          </button>
        </div>
        <p v-if="currentSession.createdAt" class="session-when muted">
          Session started {{ fmtWhen(currentSession.createdAt) }}
        </p>
      </header>

      <details class="section card" open>
        <summary class="section-summary">Session details</summary>
        <div class="section-body">
          <label>
            Notes
            <textarea
              v-model="sessionNotes"
              rows="3"
              maxlength="2000"
              placeholder="Optional notes for this session"
              @change="saveMeta"
            />
          </label>
          <label>
            Labels
            <LabelPillsInput
              v-model="sessionLabels"
              placeholder="e.g. warmup, then Enter"
              aria-label="Session labels"
              @change="saveMeta"
            />
          </label>

          <div class="link-row">
            <template v-if="currentSession.linkedTag">
              <button type="button" class="go linkish" @click="openLinkedTag">
                Open tag: {{ currentSession.linkedTag.title }} (#{{ currentSession.linkedTag.tagId }})
              </button>
              <button type="button" class="btn" @click="clearLinked">Unlink</button>
            </template>
            <template v-else-if="currentSession.linkedLibrary">
              <button type="button" class="go linkish" @click="openLinkedLibrary">
                Open library: {{ currentSession.linkedLibrary.title }}
              </button>
              <button type="button" class="btn" @click="clearLinked">Unlink</button>
            </template>
            <template v-else>
              <button type="button" class="btn" @click="openTagPicker">Link to Tag</button>
              <button
                v-if="libraryEnabled"
                type="button"
                class="btn"
                @click="openLibraryPicker"
              >
                Link to My Library
              </button>
            </template>
          </div>
          <div v-if="tagPickerOpen" class="picker">
            <input
              v-model="tagQuery"
              type="search"
              placeholder="Search title or id…"
              aria-label="Search tags"
            />
            <ul v-if="tagHits.length">
              <li v-for="hit in tagHits" :key="hit.id">
                <button type="button" @click="linkTag(hit)">
                  {{ hit.title || `Tag ${hit.id}` }}
                  <span class="muted">#{{ hit.id }}</span>
                </button>
              </li>
            </ul>
            <p v-else-if="tagQuery.trim()" class="muted">No matches</p>
          </div>
          <div v-if="libraryPickerOpen" class="picker">
            <input
              v-model="libraryQuery"
              type="search"
              placeholder="Search My Library…"
              aria-label="Search My Library"
            />
            <ul v-if="libraryHits.length">
              <li v-for="hit in libraryHits" :key="hit.id">
                <button type="button" @click="linkLibrary(hit)">
                  {{ hit.title || 'Untitled' }}
                  <span v-if="hit.arranger" class="muted">{{ hit.arranger }}</span>
                </button>
              </li>
            </ul>
            <p v-else-if="libraryQuery.trim()" class="muted">No matches</p>
            <p v-else-if="!localLib.entries.length" class="muted">My Library is empty</p>
          </div>
        </div>
      </details>

      <div
        v-if="showEmptyTransport || recording"
        class="transport card"
        role="group"
        aria-label="Recording transport"
      >
        <template v-if="!recording">
          <div class="transport-row">
            <button
              type="button"
              class="go rec transport-rec"
              aria-label="Record"
              @click="startRecording()"
            >
              ● Record
            </button>
          </div>
          <p v-if="!takes.length" class="hint muted">Ready — tap Record to capture a take.</p>
        </template>
        <template v-else>
          <RecorderLiveMonitor v-if="liveMeter" :meter="liveMeter" :paused="paused">
            <div class="rec-controls" role="group" aria-label="Recording">
              <button type="button" class="ctrl-transport-btn rec stop" aria-label="Stop and save" @click="stopRecording">
                ■ Stop
              </button>
              <button
                v-if="canPause"
                type="button"
                class="ctrl-transport-btn"
                :aria-pressed="paused"
                @click="togglePause"
              >
                {{ paused ? 'Resume' : 'Pause' }}
              </button>
              <button type="button" class="ctrl-transport-btn" @click="onCancelClick">Cancel</button>
              <span class="rec-live" role="status">
                {{ paused ? 'Paused ' : '' }}{{ fmtElapsed(elapsed) }}
              </span>
            </div>
          </RecorderLiveMonitor>
          <div v-else class="rec-controls" role="group" aria-label="Recording">
            <button type="button" class="ctrl-transport-btn rec stop" aria-label="Stop and save" @click="stopRecording">
              ■ Stop
            </button>
            <button
              v-if="canPause"
              type="button"
              class="ctrl-transport-btn"
              :aria-pressed="paused"
              @click="togglePause"
            >
              {{ paused ? 'Resume' : 'Pause' }}
            </button>
            <button type="button" class="ctrl-transport-btn" @click="onCancelClick">Cancel</button>
            <span class="rec-live" role="status">
              {{ paused ? 'Paused ' : '' }}{{ fmtElapsed(elapsed) }}
            </span>
          </div>
        </template>
      </div>

      <details v-if="takes.length" class="section card" open>
        <summary class="section-summary">Takes</summary>
        <div class="section-body">
          <ul class="take-list">
            <li v-for="t in takes" :key="t.id" :class="{ on: t.id === activeTakeId }">
              <button type="button" class="take-btn" @click="activeTakeId = t.id">
                <span class="take-label">{{ t.label }}</span>
                <span class="take-meta muted">
                  <span>{{ fmtWhen(t.recordedAt || t.createdAt) }}</span>
                  <span>{{ fmtElapsed(t.durationSec) }}</span>
                </span>
              </button>
              <button
                type="button"
                class="icon-btn tiny"
                title="Rename"
                aria-label="Rename take"
                @click="openRenameTake(t)"
              >
                <font-awesome-icon :icon="['fas', 'pen']" aria-hidden="true" />
              </button>
              <button
                type="button"
                class="btn tiny"
                :disabled="recording"
                @click="
                  router.push({ name: 'recorder-take-edit', params: { id, takeId: t.id } })
                "
              >
                Edit
              </button>
              <button type="button" class="btn tiny" @click="requestDeleteTake(t.id)">Delete</button>
            </li>
          </ul>
        </div>
      </details>

      <RecorderPlayer
        v-if="activeTake"
        :take="activeTake"
        :recording="recording"
        @record="startRecording()"
      />

      <details class="section card">
        <summary class="section-summary">Export</summary>
        <div class="section-body">
          <p class="hint muted">
            Original keeps the capture container when there are no edits; otherwise pitch, speed,
            normalize, and compression from Edit take are baked in. MP3 and M4A always re-encode.
          </p>
          <label>
            Format
            <select v-model="exportFormat">
              <option v-for="f in RECORDER_DOWNLOAD_FORMAT_OPTIONS" :key="f.value" :value="f.value">
                {{ f.label }}
              </option>
            </select>
          </label>
          <div class="rec-actions">
            <button
              type="button"
              class="go"
              :disabled="!activeTake || busyExport"
              @click="exportActiveTake"
            >
              Download take
            </button>
            <button
              type="button"
              class="go secondary"
              :disabled="!takes.length || busyExport"
              @click="exportSession"
            >
              Download session zip
            </button>
          </div>
        </div>
      </details>
    </template>

    <p v-if="err" class="error" role="alert">{{ err }}</p>
    <p v-if="msg" class="ok" role="status">{{ msg }}</p>

    <ConfirmDialog
      :open="sessionRenameOpen"
      title="Rename session"
      message="Choose a name for this session."
      confirm-label="Rename"
      :danger="false"
      @close="cancelRenameSession"
      @confirm="confirmRenameSession"
    >
      <label class="name-field">
        <span class="name-lbl">Name</span>
        <input
          ref="renameInputRef"
          v-model="renameInput"
          type="text"
          maxlength="120"
          aria-label="Session name"
          @keydown.enter.prevent="confirmRenameSession"
        />
      </label>
      <p v-if="renameError" class="name-err" role="alert">{{ renameError }}</p>
    </ConfirmDialog>
    <ConfirmDialog
      :open="!!pendingRenameId"
      :title="pendingRenameTitle"
      message="Choose a new name for this take."
      confirm-label="Rename"
      :danger="false"
      @close="cancelRenameTake"
      @confirm="confirmRenameTake"
    >
      <label class="name-field">
        <span class="name-lbl">Name</span>
        <input
          ref="takeRenameInputRef"
          v-model="renameInput"
          type="text"
          maxlength="80"
          aria-label="Take name"
          @keydown.enter.prevent="confirmRenameTake"
        />
      </label>
      <p v-if="renameError" class="name-err" role="alert">{{ renameError }}</p>
    </ConfirmDialog>
    <ConfirmDialog
      :open="deleteSessionOpen"
      title="Delete session?"
      message="Delete this entire session and all takes? This cannot be undone."
      confirm-label="Delete"
      @close="deleteSessionOpen = false"
      @confirm="confirmDeleteSession"
    />
    <ConfirmDialog
      :open="!!deleteTakeId"
      title="Delete take?"
      message="Delete this take? This cannot be undone."
      confirm-label="Delete"
      @close="deleteTakeId = null"
      @confirm="confirmDeleteTake"
    />
    <ConfirmDialog
      :open="cancelRecOpen"
      title="Discard recording?"
      message="Discard this recording? It will not be saved."
      confirm-label="Discard"
      @close="resolveCancelConfirm(false)"
      @confirm="resolveCancelConfirm(true)"
    />
    <ConfirmDialog
      :open="leaveOpen"
      title="Recording in progress"
      message="Stop and save before leaving, discard the take, or stay on this page."
      confirm-label="Stop & save"
      :danger="false"
      @close="resolveLeaveDecision('stay')"
      @confirm="resolveLeaveDecision('save')"
    >
      <button type="button" class="btn leave-discard" @click="resolveLeaveDecision('discard')">
        Discard & leave
      </button>
    </ConfirmDialog>
    <ConfirmDialog
      :open="emptySessionOpen"
      title="Remove empty session?"
      message="Recording did not start. Remove this empty session?"
      confirm-label="Remove"
      @close="resolveEmptySession(false)"
      @confirm="resolveEmptySession(true)"
    />
    <RecorderSettingsModal
      v-model="capture"
      :open="settingsOpen"
      :disabled="recording"
      :devices="devices"
      @change="persistCapture"
      @close="settingsOpen = false"
    />
  </section>
</template>

<style scoped>
.session {
  display: grid;
  gap: 1rem;
  padding: 0.15rem 0 2.5rem;
  min-width: 0;
  max-width: 100%;
}
.back a {
  color: var(--accent);
  text-decoration: none;
  font-weight: 600;
}
.session-head {
  display: grid;
  gap: 0.25rem;
}
.session-title-row {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  min-width: 0;
}
.settings-btn {
  margin-left: auto;
  min-height: 2.25rem;
  padding: 0.35rem 0.7rem;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  color: inherit;
  white-space: nowrap;
}
.header-danger {
  margin-left: 0;
  min-height: 2.25rem;
  padding: 0.35rem 0.7rem;
  white-space: nowrap;
}
.session-title-text {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.35rem;
  font-weight: 700;
  line-height: 1.25;
  min-width: 0;
  overflow-wrap: anywhere;
}
.icon-btn {
  flex: 0 0 auto;
  display: inline-grid;
  place-items: center;
  width: 2.25rem;
  height: 2.25rem;
  min-height: 2.25rem;
  padding: 0;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--muted);
  cursor: pointer;
}
.icon-btn:hover {
  color: var(--text);
  border-color: color-mix(in srgb, var(--accent) 40%, var(--border));
}
.icon-btn.tiny {
  width: 2rem;
  height: 2rem;
  min-height: 2rem;
  font-size: 0.85rem;
}
.session-when {
  margin: 0;
  font-size: 0.88rem;
}
.card {
  display: grid;
  gap: 0.65rem;
  padding: 0.85rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
}
.section-summary {
  list-style: none;
  cursor: pointer;
  user-select: none;
  font-family: var(--font-display);
  font-size: 1.1rem;
  font-weight: 600;
  padding: 0.1rem 0;
}
.section-summary::-webkit-details-marker {
  display: none;
}
.section-summary::before {
  content: '▸';
  display: inline-block;
  margin-right: 0.45rem;
  transition: transform 0.15s ease;
  color: var(--muted);
  font-size: 0.85em;
}
.section[open] > .section-summary::before {
  transform: rotate(90deg);
}
.section-body {
  display: grid;
  gap: 0.65rem;
  padding-top: 0.35rem;
}
.transport-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.55rem;
}
.rec-controls {
  display: flex;
  flex-wrap: nowrap;
  align-items: stretch;
  gap: clamp(0.2rem, 0.9vw, 0.4rem);
  width: 100%;
  min-width: 0;
}
.rec-controls .ctrl-transport-btn {
  flex: 1 1 0;
  min-width: 0;
}
.rec-controls .ctrl-transport-btn.rec.stop {
  background: #b42318;
  border-color: #b42318;
  color: #fff;
}
.rec-controls .rec-live {
  flex: 0 0 auto;
  min-width: 4.5rem;
  margin: 0;
  margin-left: auto;
  align-self: center;
  text-align: right;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  font-size: clamp(0.75rem, 2.15vw, 0.9rem);
  white-space: nowrap;
  color: var(--muted);
}
.transport-rec {
  min-width: 8.5rem;
  min-height: 52px;
  font-size: 1.05rem;
}
.hint {
  margin: 0;
  font-size: 0.9rem;
  line-height: 1.4;
}
.name-field {
  display: grid;
  gap: 0.35rem;
}
.name-lbl {
  font-size: 0.85rem;
  color: var(--muted);
}
.name-err {
  margin: 0;
  color: var(--danger, #9b2c2c);
  font-size: 0.9rem;
}
.leave-discard {
  width: 100%;
  min-height: 44px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--bg);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
.btn.danger {
  color: #b42318;
  border-color: color-mix(in srgb, #b42318 35%, var(--border));
}
h2 {
  margin: 0;
  font-size: 1.05rem;
  font-family: var(--font-display);
}
.subhead {
  margin: 0.35rem 0 0;
  font-size: 0.95rem;
  font-weight: 700;
}
label {
  display: grid;
  gap: 0.35rem;
  font-size: 0.9rem;
  color: var(--muted);
}
input,
select,
textarea {
  font: inherit;
  font-size: 16px;
  min-height: 44px;
  border-radius: 8px;
  border: 1px solid var(--border);
  padding: 0.45rem 0.65rem;
  background: var(--bg);
  color: inherit;
}
textarea {
  min-height: 5rem;
  resize: vertical;
  line-height: 1.4;
}
.rec-actions,
.link-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
}
.go {
  min-height: 44px;
  border: 0;
  border-radius: 10px;
  background: var(--accent);
  color: #fff;
  font: inherit;
  font-weight: 600;
  padding: 0.5rem 1rem;
  cursor: pointer;
}
.go.secondary,
.go.linkish {
  background: color-mix(in srgb, var(--accent) 18%, var(--surface));
  color: var(--accent-hover, var(--accent));
  border: 1px solid var(--accent);
}
.go.rec {
  background: #b33;
}
.btn {
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
.btn.tiny {
  min-height: 36px;
  font-size: 0.85rem;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.btn.tiny:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.rec-live {
  font-weight: 700;
  color: #b33;
  font-variant-numeric: tabular-nums;
}
.take-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.35rem;
}
.take-list li {
  display: flex;
  gap: 0.45rem;
  align-items: center;
  border-radius: 8px;
  border: 1px solid var(--border);
  padding: 0.25rem 0.35rem;
}
.take-list li.on {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, var(--surface));
}
.take-btn {
  flex: 1;
  min-width: 0;
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  border: 0;
  background: transparent;
  font: inherit;
  text-align: left;
  cursor: pointer;
  padding: 0.45rem;
  color: inherit;
}
.take-label {
  font-weight: 700;
}
.take-meta {
  display: grid;
  justify-items: end;
  gap: 0.1rem;
  font-size: 0.8rem;
  line-height: 1.25;
  font-variant-numeric: tabular-nums;
}
.muted {
  color: var(--muted);
}
.picker {
  display: grid;
  gap: 0.45rem;
}
.picker ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.25rem;
  max-height: 14rem;
  overflow: auto;
}
.picker li button {
  width: 100%;
  text-align: left;
  min-height: 44px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg);
  font: inherit;
  padding: 0.45rem 0.65rem;
  cursor: pointer;
  color: inherit;
}
.error {
  margin: 0;
  color: var(--danger);
}
.ok {
  margin: 0;
  color: var(--accent);
}
</style>
