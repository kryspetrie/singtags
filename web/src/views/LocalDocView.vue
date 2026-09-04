<script setup lang="ts">
/**
 * Local Library entry: Tag-like view (default) + Edit mode (?edit=1).
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import EmptyState from '../components/EmptyState.vue'
import SheetViewer from '../components/SheetViewer.vue'
import PitchControls from '../components/PitchControls.vue'
import TagPlayer from '../components/TagPlayer.vue'
import LocalEntryTransferSheet from '../components/LocalEntryTransferSheet.vue'
import { navigateToOpticalTransfer } from '../lib/decimen/opticalTransferNav'
import {
  isLocalEntryEditQuery,
  isLocalEntryFullscreenQuery,
  navigateToLocalEntry,
  parseImportQueue,
  patchLocalEntryQuery,
} from '../lib/localDocOpen'
import {
  PitchPlayer,
  formatKeyShiftLabel,
  keyToTonicNote,
  clampPitchSemitones,
} from '../audio/pitchPlayer'
import {
  getActivePitchPipeVoice,
  PITCH_PIPE_VOICE_CHANGE_EVENT,
} from '../audio/pitchPipeVoice'
import { useLocalLibraryStore } from '../stores/localLibrary'
import { usePreferencesStore } from '../stores/preferences'
import { useSnackbarStore } from '../stores/snackbar'
import type { LocalAsset, LocalEntry } from '../types/localLibrary'
import {
  LOCAL_ASSET_ROLES,
  LOCAL_LIBRARY_KEY_OPTIONS,
  isLocalAudioMime,
  isLocalImageMime,
  isLocalPdfMime,
  localAssetRoleLabel,
  localLibraryKeyLabel,
} from '../types/localLibrary'
import type { SheetImageSet, SheetPdfFile } from '../lib/sheetAssets'
import { formatBytes } from '../offline/storageEstimate'
import { formatLocalSizeWarn } from '../lib/localDocReceive'

const props = defineProps<{ id: string }>()

const library = useLocalLibraryStore()
const prefs = usePreferencesStore()
const snackbar = useSnackbarStore()
const router = useRouter()
const route = useRoute()

const entry = ref<LocalEntry | null>(null)
const loadError = ref<string | null>(null)
const ownedUrls = ref<string[]>([])
const sheetViewerRef = ref<InstanceType<typeof SheetViewer> | null>(null)
const sheetFullscreenActive = ref(false)
const tracksFullscreenActive = ref(false)

const draftTitle = ref('')
const draftArranger = ref('')
const draftNotes = ref('')
const draftKey = ref('')
const draftDetune = ref(0)
const saveBusy = ref(false)

const keyShift = ref(0)
const pitch = new PitchPlayer(getActivePitchPipeVoice())

const imageSets = ref<SheetImageSet[]>([])
const pdfs = ref<SheetPdfFile[]>([])
const trackParts = ref<Record<string, string>>({})
const trackPartIds = ref<string[]>([])

const editing = computed(() => isLocalEntryEditQuery(route.query))
const openSheetFullscreen = computed(() => isLocalEntryFullscreenQuery(route.query))
const importQueue = computed(() => parseImportQueue(route.query))

const assets = computed(() => library.assetsFor(props.id))

const keyOptions = computed(() => {
  const current = draftKey.value.trim()
  if (current && !(LOCAL_LIBRARY_KEY_OPTIONS as readonly string[]).includes(current)) {
    return [current, ...LOCAL_LIBRARY_KEY_OPTIONS]
  }
  return [...LOCAL_LIBRARY_KEY_OPTIONS]
})

const pitchLabel = computed(() => {
  const key = draftKey.value.trim() || entry.value?.key || null
  return formatKeyShiftLabel(key, keyShift.value)
})

const canPayKey = computed(() => {
  const key = draftKey.value.trim() || entry.value?.key || null
  return !!keyToTonicNote(key)
})

const hasSheet = computed(() => imageSets.value.length > 0 || pdfs.value.length > 0)
const hasAudio = computed(() => trackPartIds.value.length > 0)

const neighborIds = computed(() => library.filteredEntries.map((e) => e.id))
const neighborIndex = computed(() => neighborIds.value.indexOf(props.id))
const prevId = computed(() =>
  neighborIndex.value > 0 ? neighborIds.value[neighborIndex.value - 1] : null,
)
const nextId = computed(() =>
  neighborIndex.value >= 0 && neighborIndex.value < neighborIds.value.length - 1
    ? neighborIds.value[neighborIndex.value + 1]
    : null,
)

const queuePosition = computed(() => {
  const q = importQueue.value
  if (!q.length) return null
  const i = q.indexOf(props.id)
  if (i < 0) return null
  return { index: i, total: q.length }
})

function revokeOwned(): void {
  for (const u of ownedUrls.value) URL.revokeObjectURL(u)
  ownedUrls.value = []
  imageSets.value = []
  pdfs.value = []
  trackParts.value = {}
  trackPartIds.value = []
}

async function buildMedia(list: LocalAsset[]): Promise<void> {
  revokeOwned()
  const imgs: SheetImageSet[] = []
  const pdfList: SheetPdfFile[] = []
  const tracks: Record<string, string> = {}
  const trackIds: string[] = []
  const urls: string[] = []

  for (const asset of list) {
    const blobRec = await library.getLocalAssetBlob(asset.id)
    if (!blobRec) continue
    const blob = new Blob([blobRec.data], { type: blobRec.mime || asset.mime })
    const url = URL.createObjectURL(blob)
    urls.push(url)

    if (asset.role === 'track' || isLocalAudioMime(asset.mime, asset.filename)) {
      const partId = `local_${asset.id}`
      tracks[partId] = url
      trackIds.push(partId)
      continue
    }
    if (
      asset.role === 'sheet' ||
      asset.role === 'alternateSheet' ||
      isLocalPdfMime(asset.mime) ||
      asset.filename.toLowerCase().endsWith('.pdf')
    ) {
      if (isLocalPdfMime(asset.mime) || asset.filename.toLowerCase().endsWith('.pdf')) {
        pdfList.push({ id: asset.id, label: asset.label || asset.filename, path: url })
      } else if (isLocalImageMime(asset.mime, asset.filename)) {
        imgs.push({ id: asset.id, label: asset.label || asset.filename, paths: [url] })
      }
      continue
    }
    if (asset.role === 'image' || isLocalImageMime(asset.mime, asset.filename)) {
      imgs.push({ id: asset.id, label: asset.label || asset.filename, paths: [url] })
    }
  }

  ownedUrls.value = urls
  imageSets.value = imgs
  pdfs.value = pdfList
  trackParts.value = tracks
  trackPartIds.value = trackIds
}

async function loadEntry(): Promise<void> {
  loadError.value = null
  await library.ensureLoaded()
  const meta =
    library.entries.find((e) => e.id === props.id) ?? (await library.getLocalEntry(props.id))
  if (!meta) {
    entry.value = null
    loadError.value = 'Song not found.'
    revokeOwned()
    return
  }
  entry.value = meta
  draftTitle.value = meta.title
  draftArranger.value = meta.arranger
  draftNotes.value = meta.notes
  draftKey.value = meta.key ?? ''
  draftDetune.value = meta.detuneCents ?? 0
  keyShift.value = 0
  const list = await library.reloadAssets(meta.id)
  await buildMedia(list)
}

onMounted(() => {
  void loadEntry()
})

watch(
  () => props.id,
  () => {
    void loadEntry()
  },
)

onUnmounted(() => {
  window.removeEventListener(PITCH_PIPE_VOICE_CHANGE_EVENT, syncPitchVoice)
  revokeOwned()
  pitch.stop()
  pitch.dispose()
})

function syncPitchVoice(): void {
  pitch.setVoice(getActivePitchPipeVoice())
}

if (typeof window !== 'undefined') {
  window.addEventListener(PITCH_PIPE_VOICE_CHANGE_EVENT, syncPitchVoice)
}

async function saveMeta(): Promise<boolean> {
  if (!entry.value || saveBusy.value) return false
  saveBusy.value = true
  try {
    const next = await library.updateMeta(entry.value.id, {
      title: draftTitle.value,
      arranger: draftArranger.value,
      notes: draftNotes.value,
      key: draftKey.value || null,
      detuneCents: draftDetune.value,
    })
    if (next) {
      entry.value = next
      snackbar.show('Saved', { tone: 'ok', ms: 2000 })
      return true
    }
    return false
  } catch (e) {
    snackbar.show(e instanceof Error ? e.message : 'Could not save.', { tone: 'error' })
    return false
  } finally {
    saveBusy.value = false
  }
}

async function enterEdit(): Promise<void> {
  await patchLocalEntryQuery(router, { edit: '1' })
}

async function exitEdit(): Promise<void> {
  await patchLocalEntryQuery(router, { edit: null, importQueue: null })
}

async function doneEdit(): Promise<void> {
  await saveMeta()
  await exitEdit()
}

async function saveAndNext(): Promise<void> {
  if (!(await saveMeta())) return
  const q = importQueue.value
  const i = q.indexOf(props.id)
  const next = i >= 0 ? q[i + 1] : null
  if (next) {
    await navigateToLocalEntry(router, next, { edit: true, importQueue: q })
    return
  }
  await exitEdit()
}

async function skipImport(): Promise<void> {
  const q = importQueue.value
  const i = q.indexOf(props.id)
  const next = i >= 0 ? q[i + 1] : null
  if (next) {
    await navigateToLocalEntry(router, next, { edit: true, importQueue: q })
    return
  }
  await exitEdit()
}

const transferSheetOpen = ref(false)

function transferOptically(): void {
  if (!entry.value || !prefs.opticalTransferEnabled) return
  transferSheetOpen.value = true
}

function onTransferConfirm(assetIds: string[]): void {
  if (!entry.value) return
  transferSheetOpen.value = false
  const assets = library.assetsFor(entry.value.id).filter((a) => assetIds.includes(a.id))
  const total = assets.reduce((s, a) => s + a.byteLength, 0)
  const sizeWarn = formatLocalSizeWarn(Math.max(total, ...assets.map((a) => a.byteLength), 0))
  if (sizeWarn) snackbar.show(sizeWarn, { tone: 'info', ms: 5000 })
  navigateToOpticalTransfer(router, {
    localDocIds: [entry.value.id],
    localAssetIdsByEntry: { [entry.value.id]: assetIds },
    openNow: true,
  })
}

function tonicNote() {
  const key = draftKey.value.trim() || entry.value?.key || null
  return keyToTonicNote(key)
}

const mixDetuneCents = computed(
  () => prefs.globalPitchDetuneCents() + (entry.value?.detuneCents ?? 0),
)

async function payKeyDown(): Promise<void> {
  const note = tonicNote()
  if (!note) return
  const shiftCents = keyShift.value * 100
  await pitch.start(note, shiftCents + mixDetuneCents.value)
}

function payKeyUp(): void {
  pitch.stop()
}

function enterSheetFullscreen(): void {
  sheetViewerRef.value?.enterFullscreen?.()
}

async function onSheetFullscreenChange(active: boolean): Promise<void> {
  sheetFullscreenActive.value = active
  if (active) tracksFullscreenActive.value = false
  await patchLocalEntryQuery(router, { fullscreen: active ? '1' : null })
}

function onTracksFullscreenChange(active: boolean): void {
  tracksFullscreenActive.value = active
  if (active) sheetFullscreenActive.value = false
}

async function onAssetRoleChange(asset: LocalAsset, role: string): Promise<void> {
  await library.updateAssetMeta(asset.id, { role: role as LocalAsset['role'] })
  await buildMedia(library.assetsFor(props.id))
}

async function onRemoveAsset(assetId: string): Promise<void> {
  await library.removeAsset(assetId)
  await buildMedia(library.assetsFor(props.id))
}

async function onAddFiles(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const files = input.files ? [...input.files] : []
  input.value = ''
  if (!files.length || !entry.value) return
  try {
    await library.addFilesToEntry(entry.value.id, files)
    await buildMedia(library.assetsFor(props.id))
    snackbar.show('Files added', { tone: 'ok', ms: 2000 })
  } catch (e) {
    snackbar.show(e instanceof Error ? e.message : 'Could not add files.', { tone: 'error' })
  }
}

function trackLabel(partId: string): string {
  const assetId = partId.replace(/^local_/, '')
  const asset = assets.value.find((a) => a.id === assetId)
  return asset?.label || asset?.filename || partId
}
</script>

<template>
  <EmptyState v-if="loadError" title="Local Library" :message="loadError" tone="danger">
    <RouterLink class="btn" to="/library">Back to Local Library</RouterLink>
  </EmptyState>

  <section v-else-if="entry" class="tag" aria-label="Local song">
    <div class="top-row">
      <button type="button" class="btn btn-ghost" @click="router.push('/library')">← Library</button>
      <div v-if="prevId || nextId" class="pager">
        <button
          type="button"
          class="btn btn-ghost"
          :disabled="!prevId"
          @click="prevId && router.push(`/library/${prevId}`)"
        >
          ←
        </button>
        <button
          type="button"
          class="btn btn-ghost"
          :disabled="!nextId"
          @click="nextId && router.push(`/library/${nextId}`)"
        >
          →
        </button>
      </div>
    </div>

    <header class="title-row">
      <div class="title-block">
        <div class="title-head">
          <h1>{{ entry.title }}</h1>
          <div class="title-actions">
            <button
              v-if="!editing"
              type="button"
              class="title-copy"
              @click="enterEdit"
            >
              Edit
            </button>
            <button
              v-if="prefs.opticalTransferEnabled"
              type="button"
              class="title-copy"
              @click="transferOptically"
            >
              Transfer
            </button>
          </div>
        </div>
      </div>
      <p class="id-line">
        <span v-if="entry.arranger" class="arranger">{{ entry.arranger }}</span>
        <span v-if="entry.key" class="arranger">{{ entry.key }}</span>
      </p>
    </header>

    <p v-if="queuePosition" class="import-banner" role="status">
      Import {{ queuePosition.index + 1 }} of {{ queuePosition.total }} — set details, then continue.
    </p>

    <section class="section pitch-section" aria-labelledby="pitch-heading">
      <h2 id="pitch-heading" class="section-heading">Pitch</h2>
      <div class="section-body">
        <PitchControls
          v-model="keyShift"
          :pitch-label="pitchLabel"
          :pay-key-enabled="canPayKey"
          @pay-down="payKeyDown"
          @pay-up="payKeyUp"
        />
        <p v-if="!canPayKey" class="tip">Set a key in Edit to enable pay-the-key.</p>
      </div>
    </section>

    <details class="section" open>
      <summary class="section-summary sheet-section-head">
        <span class="sheet-section-title">Sheet music</span>
        <button
          v-if="hasSheet && !sheetFullscreenActive && !tracksFullscreenActive"
          type="button"
          class="sheet-section-fs"
          aria-label="Fullscreen sheet"
          title="Fullscreen"
          @click.prevent.stop="enterSheetFullscreen"
        >
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
            <path
              fill="currentColor"
              d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"
            />
          </svg>
        </button>
      </summary>
      <div class="section-body sheet-slot">
        <SheetViewer
          v-if="hasSheet"
          ref="sheetViewerRef"
          :image-sets="imageSets"
          :pdfs="pdfs"
          :offline="true"
          :can-choose-format="imageSets.length > 0 && pdfs.length > 0"
          :crop-to-content="true"
          :pay-key-enabled="canPayKey"
          :key-label="pitchLabel"
          :shift="keyShift"
          :sing-controls="hasAudio"
          :auto-enter-fullscreen="openSheetFullscreen"
          exit-origin-label="Library"
          @pay-down="payKeyDown"
          @pay-up="payKeyUp"
          @shift-delta="keyShift = clampPitchSemitones(keyShift + $event)"
          @shift-reset="keyShift = 0"
          @fullscreen-change="onSheetFullscreenChange"
          @exit-origin="router.push('/library')"
        />
        <p v-else class="tip">No sheet music on this song yet.</p>
      </div>
    </details>

    <details class="section" :open="hasAudio">
      <summary class="section-summary sheet-section-head">
        <span class="sheet-section-title">Tracks</span>
      </summary>
      <div class="section-body">
        <TagPlayer
          v-if="hasAudio"
          :parts="trackParts"
          :available-parts="trackPartIds"
          :pitch-semitones="keyShift"
          :detune-cents="mixDetuneCents"
          :song-key="entry.key || undefined"
          :pay-key-enabled="canPayKey"
          exit-origin-label="Library"
          @update:pitch-semitones="keyShift = $event"
          @pay-down="payKeyDown"
          @pay-up="payKeyUp"
          @fullscreen-change="onTracksFullscreenChange"
          @exit-origin="router.push('/library')"
        />
        <p v-else class="tip">No learning tracks yet — add audio in Edit.</p>
        <ul v-if="hasAudio" class="track-labels">
          <li v-for="pid in trackPartIds" :key="pid">{{ trackLabel(pid) }}</li>
        </ul>
      </div>
    </details>

    <details class="section" :open="editing">
      <summary class="section-summary">Details</summary>
      <div v-if="!editing" class="section-body">
        <dl class="meta-dl">
          <div><dt>Title</dt><dd>{{ entry.title }}</dd></div>
          <div v-if="entry.arranger"><dt>Arranger</dt><dd>{{ entry.arranger }}</dd></div>
          <div v-if="entry.key"><dt>Key</dt><dd>{{ entry.key }}</dd></div>
          <div v-if="entry.detuneCents"><dt>Detune</dt><dd>{{ entry.detuneCents }}¢</dd></div>
          <div v-if="entry.notes"><dt>Notes</dt><dd>{{ entry.notes }}</dd></div>
          <div>
            <dt>Files</dt>
            <dd>{{ library.summaryFor(entry.id) }}</dd>
          </div>
        </dl>
      </div>
      <div v-else class="section-body edit-body">
        <div class="meta-grid">
          <label>
            Title
            <input v-model="draftTitle" type="text" maxlength="200" />
          </label>
          <label>
            Arranger
            <input v-model="draftArranger" type="text" maxlength="120" />
          </label>
          <label>
            Key
            <select v-model="draftKey">
              <option v-for="opt in keyOptions" :key="opt || 'none'" :value="opt">
                {{ localLibraryKeyLabel(opt) }}
              </option>
            </select>
          </label>
          <label>
            Detune (cents)
            <input
              v-model.number="draftDetune"
              type="number"
              min="-50"
              max="50"
              step="1"
              inputmode="numeric"
            />
          </label>
          <label class="notes">
            Notes
            <textarea v-model="draftNotes" rows="3" maxlength="2000" />
          </label>
        </div>

        <h3 class="assets-h">Files</h3>
        <ul class="asset-list">
          <li v-for="asset in assets" :key="asset.id" class="asset-row">
            <span class="asset-name">{{ asset.label || asset.filename }}</span>
            <span class="asset-meta">{{ formatBytes(asset.byteLength) }}</span>
            <select
              :value="asset.role"
              aria-label="Role"
              @change="onAssetRoleChange(asset, ($event.target as HTMLSelectElement).value)"
            >
              <option v-for="r in LOCAL_ASSET_ROLES" :key="r" :value="r">
                {{ localAssetRoleLabel(r) }}
              </option>
            </select>
            <button type="button" class="btn btn-ghost danger" @click="onRemoveAsset(asset.id)">
              Remove
            </button>
          </li>
        </ul>
        <label class="add-files btn">
          Add files
          <input class="visually-hidden" type="file" multiple @change="onAddFiles" />
        </label>

        <div class="edit-actions">
          <template v-if="queuePosition">
            <button type="button" class="btn" :disabled="saveBusy" @click="skipImport">Skip</button>
            <button type="button" class="btn btn-primary" :disabled="saveBusy" @click="saveAndNext">
              {{ queuePosition.index + 1 >= queuePosition.total ? 'Save' : 'Save & next' }}
            </button>
          </template>
          <template v-else>
            <button type="button" class="btn" :disabled="saveBusy" @click="saveMeta">
              {{ saveBusy ? 'Saving…' : 'Save' }}
            </button>
            <button type="button" class="btn btn-primary" :disabled="saveBusy" @click="doneEdit">
              Done
            </button>
          </template>
        </div>
      </div>
    </details>
  </section>

  <p v-else class="loading" role="status">Loading…</p>

  <LocalEntryTransferSheet
    :open="transferSheetOpen"
    :title="entry?.title ?? ''"
    :assets="assets"
    @close="transferSheetOpen = false"
    @confirm="onTransferConfirm"
  />
</template>

<style scoped>
.tag {
  min-width: 0;
  max-width: 100%;
}
.top-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.35rem;
  min-width: 0;
}
.pager {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex-wrap: nowrap;
  min-width: 0;
}
.pager .btn {
  min-height: 44px;
  min-width: 44px;
  padding: 0.4rem 0.65rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.title-row {
  display: grid;
  gap: 0.35rem;
  margin: 0.25rem 0 0.75rem;
  min-width: 0;
  max-width: 100%;
}
.title-block {
  min-width: 0;
}
.title-head {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem 0.75rem;
  flex-wrap: wrap;
  min-width: 0;
}
.title-head h1 {
  flex: 1 1 12rem;
  min-width: 0;
  margin: 0;
  font-family: var(--font-display);
  font-size: clamp(1.35rem, 6vw, 2rem);
  font-weight: 700;
  line-height: 1.2;
  max-width: 100%;
  overflow-wrap: anywhere;
}
.title-actions {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex-shrink: 0;
}
.title-copy {
  min-height: 36px;
  padding: 0.35rem 0.65rem;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--surface);
  font: inherit;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--muted);
  white-space: nowrap;
  cursor: pointer;
}
.id-line {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  align-items: center;
  margin: 0;
  min-width: 0;
}
.arranger {
  color: var(--muted);
  font-size: 0.95rem;
  min-width: 0;
  overflow-wrap: anywhere;
}
.arranger + .arranger::before {
  content: '·';
  margin-right: 0.45rem;
  color: var(--border);
}
.import-banner {
  margin: 0.35rem 0 0.75rem;
  padding: 0.55rem 0.75rem;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--border));
  background: color-mix(in srgb, var(--accent) 10%, var(--surface));
  font-size: 0.9rem;
}
.section {
  margin: 1rem 0;
  padding: 0.75rem 0.85rem 0.95rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  min-width: 0;
  max-width: 100%;
}
.section-heading,
.section-summary {
  font-family: var(--font-display);
  font-size: 1.1rem;
  font-weight: 600;
  margin: 0;
}
.section-heading {
  margin-bottom: 0.35rem;
}
.section-summary {
  list-style: none;
  cursor: pointer;
  user-select: none;
  padding: 0.25rem 0 0.35rem;
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
.section-summary.sheet-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.65rem;
}
.sheet-section-title {
  flex: 1;
  min-width: 0;
}
.sheet-section-fs {
  box-sizing: border-box;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  margin: -0.15rem 0;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg);
  color: var(--text);
  cursor: pointer;
}
.section-body {
  margin-top: 0.75rem;
  display: grid;
  gap: 0.75rem;
  min-width: 0;
}
.pitch-section .section-body {
  margin-top: 0.65rem;
}
.tip {
  margin: 0.5rem 0 0;
  color: var(--muted);
  font-size: 0.85rem;
  line-height: 1.4;
}
@media (min-width: 640px) {
  .section {
    margin: 1.25rem 0;
    padding: 0.95rem 1.15rem 1.15rem;
  }
  .section-heading,
  .section-summary {
    font-size: 1.15rem;
  }
  .title-head h1 {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    overflow-wrap: normal;
  }
}
.meta-dl {
  margin: 0;
  display: grid;
  gap: 0.55rem;
}
.meta-dl > div {
  display: grid;
  gap: 0.15rem;
}
.meta-dl dt {
  font-size: 0.8rem;
  font-weight: 650;
  color: var(--muted);
}
.meta-dl dd {
  margin: 0;
  overflow-wrap: anywhere;
}
.meta-grid {
  display: grid;
  gap: 0.55rem;
}
.meta-grid label {
  display: grid;
  gap: 0.25rem;
  font-size: 0.85rem;
  font-weight: 600;
}
.meta-grid input,
.meta-grid textarea,
.meta-grid select,
.asset-row select {
  padding: 0.55rem 0.65rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 16px;
  font-weight: 400;
}
.assets-h {
  margin: 1rem 0 0.4rem;
  font-size: 0.95rem;
}
.asset-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.45rem;
}
.asset-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
  padding: 0.45rem 0;
  border-bottom: 1px solid var(--border);
}
.asset-name {
  flex: 1 1 8rem;
  font-weight: 600;
  overflow-wrap: anywhere;
}
.asset-meta {
  font-size: 0.8rem;
  color: var(--muted);
}
.edit-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  margin-top: 0.85rem;
}
.track-labels {
  margin: 0.5rem 0 0;
  padding-left: 1.1rem;
  color: var(--muted);
  font-size: 0.85rem;
}
.loading {
  text-align: center;
  color: var(--muted);
}
.btn {
  min-height: 44px;
  padding: 0.45rem 0.85rem;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--surface);
  font: inherit;
  font-weight: 650;
  text-decoration: none;
  color: inherit;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.btn-primary {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}
.btn-ghost {
  background: transparent;
}
.danger {
  color: var(--danger);
}
.add-files {
  margin-top: 0.55rem;
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
  white-space: nowrap;
  border: 0;
}
</style>
