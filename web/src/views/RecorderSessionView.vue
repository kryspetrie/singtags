<script setup lang="ts">
/**
 * One recording session: capture settings, takes, player, tag link, export.
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink, onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { useRecorderStore } from '../stores/recorder'
import { usePreferencesStore } from '../stores/preferences'
import { useCatalogStore } from '../stores/catalog'
import type { RecorderCapturePrefs, RecorderSession, RecorderTake } from '../types/recorder'
import {
  parseSessionLabels,
  RECORDER_BITRATE_PRESETS,
} from '../types/recorder'
import { recorderMimeChoices } from '../audio/recorderCapture'
import { takePendingQuickRecordStream } from '../audio/pendingQuickRecord'
import { useRecorderCapture } from '../composables/useRecorderCapture'
import { exportSessionZip, exportTakeFile, RECORDER_DOWNLOAD_FORMAT_OPTIONS } from '../download/recorderExport'
import type { UserDownloadFormat } from '../types/audio'
import { tagOpenLocation } from '../lib/tagOpen'
import RecorderPlayer from '../components/RecorderPlayer.vue'

const props = defineProps<{ id: string }>()

const store = useRecorderStore()
const prefs = usePreferencesStore()
const catalog = useCatalogStore()
const router = useRouter()
const route = useRoute()

const sessionName = ref('')
const sessionNotes = ref('')
const sessionLabels = ref('')
const currentSession = ref<RecorderSession | null>(null)
const takes = ref<RecorderTake[]>([])
const activeTakeId = ref<string | null>(null)
const err = ref<string | null>(null)
const msg = ref<string | null>(null)
const capture = ref<RecorderCapturePrefs>({ ...prefs.recorderCapturePrefs })
const devices = ref<MediaDeviceInfo[]>([])
const renamingTakeId = ref<string | null>(null)
const renameDraft = ref('')
const exportFormat = ref<UserDownloadFormat>('mp3')
const busyExport = ref(false)
const tagQuery = ref('')
const tagPickerOpen = ref(false)

function persistCapture(): void {
  prefs.setRecorderCapturePrefs(capture.value)
  void store.updateSession(props.id, { capture: capture.value })
}

const {
  recording,
  paused,
  elapsed,
  inputLevel,
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
const mimeChoices = computed(() => recorderMimeChoices())

const tagHits = computed(() => {
  const q = tagQuery.value.trim()
  if (!q) return []
  catalog.queryText = q
  return catalog.allResults.slice(0, 12)
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
  sessionLabels.value = row.labels.join(', ')
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
      labels: parseSessionLabels(sessionLabels.value),
    })
    await reload()
    msg.value = 'Saved'
  } catch (e) {
    err.value = e instanceof Error ? e.message : String(e)
  }
}

onBeforeRouteLeave(async () => confirmLeaveWhileRecording())

function beginRenameTake(t: RecorderTake): void {
  renamingTakeId.value = t.id
  renameDraft.value = t.label
}

async function commitRenameTake(): Promise<void> {
  const id = renamingTakeId.value
  if (!id) return
  const label = renameDraft.value.trim()
  renamingTakeId.value = null
  if (!label) return
  await store.renameTake(id, label)
  takes.value = await store.loadTakes(props.id)
}

async function deleteSession(): Promise<void> {
  if (!confirm('Delete this entire session and all takes? This cannot be undone.')) return
  markLeaveHandled()
  cancelRecording()
  await store.removeSession(props.id)
  await router.replace('/recorder')
}

async function deleteTake(takeId: string): Promise<void> {
  if (!confirm('Delete this take?')) return
  await store.removeTake(takeId)
  takes.value = await store.loadTakes(props.id)
  if (activeTakeId.value === takeId) {
    activeTakeId.value = takes.value[takes.value.length - 1]?.id ?? null
  }
}

async function onCropped(take: RecorderTake): Promise<void> {
  takes.value = await store.loadTakes(props.id)
  activeTakeId.value = take.id
  msg.value = 'Take cropped'
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

function linkTag(hit: { id: number; title?: string | null }): void {
  void store
    .updateSession(props.id, {
      linkedTag: { tagId: hit.id, title: hit.title || `Tag ${hit.id}` },
    })
    .then(async () => {
      tagPickerOpen.value = false
      tagQuery.value = ''
      await reload()
      msg.value = 'Linked to tag'
    })
}

function clearLinkedTag(): void {
  void store.updateSession(props.id, { linkedTag: null }).then(() => reload())
}

function openLinkedTag(): void {
  const t = currentSession.value?.linkedTag
  if (!t) return
  void router.push(tagOpenLocation(t.tagId))
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
      if (confirm('Recording did not start. Remove this empty session?')) {
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
      <p class="session-title" :title="sessionName">{{ sessionName }}</p>

      <div class="transport card" role="group" aria-label="Recording transport">
        <div class="transport-row">
          <button
            v-if="!recording"
            type="button"
            class="go rec transport-rec"
            aria-label="Record"
            @click="startRecording()"
          >
            ● Record
          </button>
          <template v-else>
            <button type="button" class="go transport-rec" aria-label="Stop and save" @click="stopRecording">
              ■ Stop
            </button>
            <button
              v-if="canPause"
              type="button"
              class="btn"
              :aria-pressed="paused"
              @click="togglePause"
            >
              {{ paused ? 'Resume' : 'Pause' }}
            </button>
            <button type="button" class="btn" @click="onCancelClick">Cancel</button>
            <span class="rec-live" role="status">
              {{ paused ? 'Paused ' : '' }}{{ fmtElapsed(elapsed) }}
            </span>
          </template>
        </div>
        <div
          v-if="recording"
          class="level"
          role="meter"
          aria-label="Input level"
          :aria-valuenow="Math.round(inputLevel * 100)"
          aria-valuemin="0"
          aria-valuemax="100"
        >
          <div class="level-fill" :style="{ width: `${Math.min(100, inputLevel * 140)}%` }" />
        </div>
        <p v-if="!recording && !takes.length" class="hint muted">Ready — tap Record to capture a take.</p>
      </div>

      <div v-if="takes.length" class="takes card">
        <h2>Takes</h2>
        <ul class="take-list">
          <li v-for="t in takes" :key="t.id" :class="{ on: t.id === activeTakeId }">
            <template v-if="renamingTakeId === t.id">
              <input
                v-model="renameDraft"
                class="rename-input"
                maxlength="80"
                aria-label="Take name"
                @keydown.enter.prevent="commitRenameTake"
                @blur="commitRenameTake"
              />
            </template>
            <button v-else type="button" class="take-btn" @click="activeTakeId = t.id">
              <span class="take-label">{{ t.label }}</span>
              <span class="muted">{{ fmtElapsed(t.durationSec) }}</span>
            </button>
            <button
              v-if="renamingTakeId !== t.id"
              type="button"
              class="btn tiny"
              @click="beginRenameTake(t)"
            >
              Rename
            </button>
            <button type="button" class="btn tiny" @click="deleteTake(t.id)">Delete</button>
          </li>
        </ul>
      </div>

      <RecorderPlayer v-if="activeTake" :take="activeTake" @cropped="onCropped" />

      <details class="extras card">
        <summary>Session details &amp; settings</summary>
        <div class="extras-body">
          <label>
            Name
            <input v-model="sessionName" maxlength="120" @change="saveMeta" />
          </label>
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
            <input
              v-model="sessionLabels"
              maxlength="200"
              placeholder="optional, comma-separated"
              @change="saveMeta"
            />
          </label>

          <div class="link-row">
            <template v-if="currentSession.linkedTag">
              <button type="button" class="go linkish" @click="openLinkedTag">
                Open tag: {{ currentSession.linkedTag.title }} (#{{ currentSession.linkedTag.tagId }})
              </button>
              <button type="button" class="btn" @click="clearLinkedTag">Unlink</button>
            </template>
            <button v-else type="button" class="btn" @click="tagPickerOpen = !tagPickerOpen">
              Link to SingTag…
            </button>
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

          <h3 class="subhead">Capture</h3>
          <div class="capture-grid">
            <label>
              Processing
              <select v-model="capture.processing" :disabled="recording" @change="persistCapture">
                <option value="music">Music (raw)</option>
                <option value="voice">Voice call</option>
              </select>
            </label>
            <label>
              Format
              <select v-model="capture.mimeType" :disabled="recording" @change="persistCapture">
                <option
                  v-for="m in mimeChoices"
                  :key="m.value"
                  :value="m.value"
                  :disabled="!m.supported"
                >
                  {{ m.label }}{{ m.supported ? '' : ' (unsupported)' }}
                </option>
              </select>
            </label>
            <label>
              Bitrate
              <select v-model.number="capture.bitRate" :disabled="recording" @change="persistCapture">
                <option v-for="b in RECORDER_BITRATE_PRESETS" :key="b" :value="b">
                  {{ Math.round(b / 1000) }} kbps
                </option>
              </select>
            </label>
            <label>
              Channels
              <select
                :value="capture.channels"
                :disabled="recording"
                @change="
                  capture.channels = Number(($event.target as HTMLSelectElement).value) === 2 ? 2 : 1;
                  persistCapture()
                "
              >
                <option :value="1">Mono</option>
                <option :value="2">Stereo</option>
              </select>
            </label>
            <label v-if="devices.length">
              Input
              <select v-model="capture.deviceId" :disabled="recording" @change="persistCapture">
                <option value="">Default</option>
                <option v-for="d in devices" :key="d.deviceId" :value="d.deviceId">
                  {{ d.label || d.deviceId }}
                </option>
              </select>
            </label>
          </div>

          <h3 class="subhead">Export</h3>
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
          <div class="danger-zone">
            <button type="button" class="btn danger" @click="deleteSession">Delete session</button>
          </div>
        </div>
      </details>
    </template>

    <p v-if="err" class="error" role="alert">{{ err }}</p>
    <p v-if="msg" class="ok" role="status">{{ msg }}</p>
  </section>
</template>

<style scoped>
.session {
  display: grid;
  gap: 1rem;
  padding: 1rem 1rem 2.5rem;
  max-width: 42rem;
  margin: 0 auto;
}
.back a {
  color: var(--accent);
  text-decoration: none;
  font-weight: 600;
}
.session-title {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.2rem;
  font-weight: 700;
  line-height: 1.3;
}
.card {
  display: grid;
  gap: 0.65rem;
  padding: 0.85rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
}
.transport-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.55rem;
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
.level {
  height: 8px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--border) 70%, transparent);
  overflow: hidden;
}
.level-fill {
  height: 100%;
  background: var(--accent);
  transition: width 60ms linear;
}
.rename-input {
  flex: 1;
  min-width: 0;
  min-height: 40px;
}
.danger-zone {
  margin-top: 0.75rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--border);
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
.capture-grid {
  display: grid;
  gap: 0.65rem;
}
@media (min-width: 560px) {
  .capture-grid {
    grid-template-columns: 1fr 1fr;
  }
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
.extras > summary {
  cursor: pointer;
  font-weight: 700;
  font-family: var(--font-display);
}
.extras-body {
  display: grid;
  gap: 0.75rem;
  padding-top: 0.75rem;
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
.muted {
  color: var(--muted);
  font-size: 0.85rem;
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
