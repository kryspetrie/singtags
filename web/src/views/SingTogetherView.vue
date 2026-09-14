<script setup lang="ts">
/**
 * Sing Together: freeform repertoire, packed QR share, host scan & match.
 */
import { computed, onUnmounted, ref, watch } from 'vue'
import { capacityInfo, encodeProfileQr, decodeProfileFromQr, QR_MAX_BYTES } from '../lib/singTogether/codec'
import {
  matchRepertoires,
  sortMatchedSongs,
  DEFAULT_MATCH_CRITERIA,
  type MatchCriteria,
  type MatchSort,
  type MatchedSong,
  type RosterPerson,
} from '../lib/singTogether/match'
import type { TextMatchMode } from '../lib/singTogether/normalize'
import {
  partLabel,
  partsForVoicing,
  VOICINGS,
  newSongId,
  type Confidence,
  type RepertoireSong,
  type Voicing,
} from '../lib/singTogether/types'
import { decodeQrDetailedFromFile, decodeQrDetailedFromVideo } from '../lib/qrDecode'
import { useSingTogetherStore } from '../stores/singTogether'
import { useSnackbarStore } from '../stores/snackbar'

type Mode = 'repertoire' | 'qr' | 'host'

const store = useSingTogetherStore()
const snackbar = useSnackbarStore()

const mode = ref<Mode>('repertoire')
const editingId = ref<string | null>(null)
const draft = ref<RepertoireSong | null>(null)
const csvInput = ref<HTMLInputElement | null>(null)

const qrSrc = ref('')
const qrBusy = ref(false)
const qrError = ref<string | null>(null)
const enlargeOpen = ref(false)

const hostPeople = ref<RosterPerson[]>([])
const hostScanning = ref(false)
const scanError = ref<string | null>(null)
const sortMode = ref<MatchSort>('coverable-confidence')
const textMode = ref<TextMatchMode>('fuzzy')
const matchCriteria = ref({
  arranger: DEFAULT_MATCH_CRITERIA.arranger,
  voicing: DEFAULT_MATCH_CRITERIA.voicing,
  parts: DEFAULT_MATCH_CRITERIA.parts,
})
const videoEl = ref<HTMLVideoElement | null>(null)
const photoInput = ref<HTMLInputElement | null>(null)

let scanStream: MediaStream | null = null
let scanTimer: number | null = null
let lastScanFingerprint = ''

const cap = computed(() => capacityInfo(store.profile))
const absMax = QR_MAX_BYTES

const matched = computed(() => {
  if (!hostPeople.value.length) return []
  const people: RosterPerson[] = [
    { id: 'host', profile: store.profile },
    ...hostPeople.value,
  ]
  const criteria: Partial<MatchCriteria> = {
    arranger: matchCriteria.value.arranger,
    voicing: matchCriteria.value.voicing,
    parts: matchCriteria.value.parts,
  }
  const list = matchRepertoires(people, {
    criteria,
    textMode: textMode.value,
  })
  return sortMatchedSongs(list, sortMode.value)
})

const coverableCount = computed(() => matched.value.filter((m) => m.coverable).length)

watch(
  () => [mode.value, store.profile] as const,
  () => {
    if (mode.value === 'qr') void refreshQr()
  },
  { deep: true },
)

watch(mode, (m) => {
  if (m !== 'host') stopScan()
})

onUnmounted(() => {
  stopScan()
})

function setMode(m: Mode): void {
  mode.value = m
}

function startAdd(voicing?: Voicing): void {
  const id = newSongId()
  editingId.value = id
  draft.value = {
    id,
    title: '',
    arranger: '',
    voicing,
    parts: {},
  }
}

function onDraftVoicing(ev: Event): void {
  if (!draft.value) return
  const raw = (ev.target as HTMLSelectElement).value
  const voicing = raw ? (raw as Voicing) : undefined
  draft.value = { ...draft.value, voicing, parts: {} }
}

function openEdit(id: string): void {
  const song = store.profile.songs.find((s) => s.id === id)
  if (!song) return
  editingId.value = id
  draft.value = {
    ...song,
    parts: { ...song.parts },
  }
}

function cancelEdit(): void {
  editingId.value = null
  draft.value = null
}

function saveEdit(): void {
  if (!draft.value) return
  const title = draft.value.title.trim()
  if (!title) {
    snackbar.show('Title is required', { tone: 'info', ms: 2500 })
    return
  }
  if (!Object.keys(draft.value.parts).length) {
    snackbar.show('Mark at least one part you know', { tone: 'info', ms: 2500 })
    return
  }
  store.upsertSong(draft.value)
  cancelEdit()
}

function removeEditing(): void {
  if (!editingId.value) return
  const id = editingId.value
  cancelEdit()
  store.removeSong(id)
}

function toggleDraftPart(partId: string): void {
  if (!draft.value) return
  const parts = { ...draft.value.parts }
  if (Object.prototype.hasOwnProperty.call(parts, partId)) delete parts[partId]
  else parts[partId] = 0
  draft.value = { ...draft.value, parts }
}

function setDraftConf(partId: string, conf: number): void {
  if (!draft.value) return
  if (!Object.prototype.hasOwnProperty.call(draft.value.parts, partId)) return
  draft.value = {
    ...draft.value,
    parts: { ...draft.value.parts, [partId]: conf as Confidence },
  }
}

function onCsvPick(ev: Event): void {
  const input = ev.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  void file.text().then((text) => {
    const result = store.importCsv(text)
    snackbar.show(
      result.added
        ? `Imported ${result.added} song${result.added === 1 ? '' : 's'}${
            result.skipped ? ` (${result.skipped} skipped)` : ''
          }`
        : `No songs imported${result.skipped ? ` (${result.skipped} skipped)` : ''}`,
      {
        tone: result.added ? 'ok' : 'warn',
        ms: 3500,
        title: 'CSV import',
      },
    )
  })
}

function clearAll(): void {
  if (!store.profile.songs.length) return
  if (!confirm('Clear all songs from your repertoire on this device?')) return
  store.clearSongs()
}

async function refreshQr(): Promise<void> {
  qrBusy.value = true
  qrError.value = null
  try {
    if (cap.value.critical && !cap.value.fit) {
      qrSrc.value = ''
      qrError.value = `Too large for one QR (${cap.value.usedBytes} / ${absMax} B). Remove songs.`
      return
    }
    const { dataUrl } = await encodeProfileQr(store.profile, 512)
    qrSrc.value = dataUrl
  } catch (e) {
    qrSrc.value = ''
    qrError.value = e instanceof Error ? e.message : 'Could not build QR'
  } finally {
    qrBusy.value = false
  }
}

function stopScan(): void {
  hostScanning.value = false
  if (scanTimer != null) {
    window.clearInterval(scanTimer)
    scanTimer = null
  }
  if (scanStream) {
    for (const t of scanStream.getTracks()) t.stop()
    scanStream = null
  }
  if (videoEl.value) videoEl.value.srcObject = null
}

async function startScan(): Promise<void> {
  scanError.value = null
  stopScan()
  hostScanning.value = true
  lastScanFingerprint = ''
  try {
    scanStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' } },
    })
    const video = videoEl.value
    if (!video) throw new Error('No video element')
    video.srcObject = scanStream
    await video.play()
    scanTimer = window.setInterval(() => {
      void tickScan()
    }, 400)
  } catch (e) {
    hostScanning.value = false
    scanError.value = e instanceof Error ? e.message : 'Camera unavailable'
  }
}

async function tickScan(): Promise<void> {
  const video = videoEl.value
  if (!video || !hostScanning.value) return
  try {
    const result = await decodeQrDetailedFromVideo(video)
    if (!result) return
    ingestScan(result)
  } catch {
    /* keep scanning */
  }
}

function ingestScan(result: { text: string | null; bytes: Uint8Array | null }): void {
  let profile
  try {
    profile = decodeProfileFromQr(result)
  } catch {
    return
  }
  const fp =
    (result.bytes ? Array.from(result.bytes.slice(0, 32)).join(',') : '') +
    '|' +
    (profile.displayName || '') +
    '|' +
    profile.songs.length
  if (fp === lastScanFingerprint) return
  lastScanFingerprint = fp

  const name = profile.displayName.trim() || `Singer ${hostPeople.value.length + 1}`
  const existing = hostPeople.value.findIndex(
    (p) =>
      p.profile.displayName.trim().toLowerCase() === name.toLowerCase() &&
      p.profile.songs.length === profile.songs.length,
  )
  const person: RosterPerson = {
    id: existing >= 0 ? hostPeople.value[existing]!.id : `peer-${Date.now()}`,
    profile: { ...profile, displayName: name },
  }
  if (existing >= 0) {
    const next = [...hostPeople.value]
    next[existing] = person
    hostPeople.value = next
    snackbar.show(`Updated ${name}`, { tone: 'ok', ms: 2000 })
  } else {
    hostPeople.value = [...hostPeople.value, person]
    snackbar.show(`Added ${name}`, { tone: 'ok', ms: 2000 })
  }
}

async function onPhotoPick(ev: Event): Promise<void> {
  const input = ev.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  try {
    const result = await decodeQrDetailedFromFile(file)
    if (!result) {
      snackbar.show('No QR found in photo', { tone: 'info', ms: 2500 })
      return
    }
    ingestScan(result)
  } catch (e) {
    snackbar.show(e instanceof Error ? e.message : 'Could not read QR', { tone: 'info', ms: 3000 })
  }
}

function removePerson(id: string): void {
  hostPeople.value = hostPeople.value.filter((p) => p.id !== id)
}

function coverageSummary(song: MatchedSong): string {
  const parts = partsForVoicing(song.voicing)
  return parts
    .map((p) => {
      const n = song.coverage[p]?.length ?? 0
      return `${partLabel(p)}:${n}`
    })
    .join(' · ')
}

function fmtConf(n: number): string {
  return n.toFixed(1)
}
</script>

<template>
  <section class="st" aria-label="Sing Together">
    <header class="st-head">
      <h1 class="st-title">Sing Together</h1>
      <p class="st-intro">
        Freeform songs (not catalog tags). On Host, choose which fields must agree and exact /
        partial / fuzzy text matching. Blank arranger, voicing, or parts act as wildcards (title
        always required).
      </p>
    </header>

    <div class="ctrl-tabs st-tabs" role="tablist" aria-label="Sing Together modes">
      <button
        type="button"
        class="ctrl-tab"
        role="tab"
        :aria-selected="mode === 'repertoire'"
        @click="setMode('repertoire')"
      >
        Repertoire
      </button>
      <button
        type="button"
        class="ctrl-tab"
        role="tab"
        :aria-selected="mode === 'qr'"
        @click="setMode('qr')"
      >
        My QR
      </button>
      <button
        type="button"
        class="ctrl-tab"
        role="tab"
        :aria-selected="mode === 'host'"
        @click="setMode('host')"
      >
        Host
      </button>
    </div>

    <!-- Repertoire -->
    <div v-show="mode === 'repertoire'" role="tabpanel" aria-label="Repertoire">
      <section class="card">
        <div class="st-row-actions">
          <button type="button" class="btn" @click="startAdd('TTBB')">Add song</button>
          <button type="button" class="btn btn-ghost" @click="csvInput?.click()">Import CSV</button>
          <button
            type="button"
            class="btn btn-ghost"
            :disabled="!store.profile.songs.length"
            @click="clearAll"
          >
            Clear
          </button>
          <input
            ref="csvInput"
            type="file"
            accept=".csv,text/csv,text/plain"
            class="sr-only"
            @change="onCsvPick"
          />
        </div>
        <p class="hint">
          CSV columns: title, arranger, key, voicing, parts, confidence. Songs match across phones by
          title + arranger + voicing (key is display-only).
        </p>
      </section>

      <section v-if="draft" class="card" aria-labelledby="edit-song-h">
        <h2 id="edit-song-h">{{ draft.title ? 'Edit song' : 'New song' }}</h2>
        <label class="field">
          <span class="field-label">Title</span>
          <input v-model="draft.title" type="text" maxlength="120" autocomplete="off" />
        </label>
        <label class="field">
          <span class="field-label">Arranger</span>
          <input v-model="draft.arranger" type="text" maxlength="80" autocomplete="off" />
        </label>
        <label class="field">
          <span class="field-label">Key (optional)</span>
          <input v-model="draft.key" type="text" maxlength="32" autocomplete="off" />
        </label>
        <label class="field">
          <span class="field-label">Voicing (optional)</span>
          <select :value="draft.voicing ?? ''" @change="onDraftVoicing">
            <option value="">Unspecified</option>
            <option v-for="v in VOICINGS" :key="v" :value="v">{{ v }}</option>
          </select>
        </label>
        <fieldset class="parts-fs">
          <legend>Parts you know</legend>
          <div
            v-for="pid in partsForVoicing(draft.voicing)"
            :key="pid"
            class="part-row"
          >
            <label class="part-check">
              <input
                type="checkbox"
                :checked="Object.prototype.hasOwnProperty.call(draft.parts, pid)"
                @change="toggleDraftPart(pid)"
              />
              {{ partLabel(pid) }}
            </label>
            <select
              v-if="Object.prototype.hasOwnProperty.call(draft.parts, pid)"
              class="conf-select"
              :value="draft.parts[pid]"
              aria-label="Confidence"
              @change="setDraftConf(pid, Number(($event.target as HTMLSelectElement).value))"
            >
              <option :value="0">Not rated</option>
              <option :value="1">1</option>
              <option :value="2">2</option>
              <option :value="3">3</option>
              <option :value="4">4</option>
              <option :value="5">5</option>
            </select>
          </div>
        </fieldset>
        <div class="st-row-actions">
          <button type="button" class="btn" @click="saveEdit">Save</button>
          <button type="button" class="btn btn-ghost" @click="cancelEdit">Cancel</button>
          <button type="button" class="btn btn-ghost danger" @click="removeEditing">Delete</button>
        </div>
      </section>

      <section class="card" aria-labelledby="song-list-h">
        <h2 id="song-list-h">Your songs ({{ store.songCount }})</h2>
        <ul v-if="store.profile.songs.length" class="song-list">
          <li v-for="song in store.profile.songs" :key="song.id">
            <button type="button" class="song-item" @click="openEdit(song.id)">
              <span class="song-title">{{ song.title || '(untitled)' }}</span>
              <span class="song-meta">
                {{ song.arranger || '—' }}
                · {{ song.voicing || 'voicing?' }}
                <template v-if="song.key"> · {{ song.key }}</template>
              </span>
              <span class="song-parts">
                {{
                  Object.keys(song.parts)
                    .map((p) => partLabel(p))
                    .join(', ') || 'No parts'
                }}
              </span>
            </button>
          </li>
        </ul>
        <p v-else class="hint">No songs yet — add some or import a CSV.</p>
      </section>
    </div>

    <!-- My QR -->
    <div v-show="mode === 'qr'" role="tabpanel" aria-label="My QR">
      <section class="card">
        <label class="field">
          <span class="field-label">Display name (shown when scanned)</span>
          <input
            :value="store.profile.displayName"
            type="text"
            maxlength="64"
            autocomplete="nickname"
            placeholder="Your name"
            @input="store.setDisplayName(($event.target as HTMLInputElement).value)"
          />
        </label>

        <div
          class="cap-meter"
          role="status"
          :class="{ warn: cap.warn, critical: cap.critical }"
          :aria-label="`QR capacity ${Math.round((cap.usedBytes / absMax) * 100)} percent of maximum`"
        >
          <div class="cap-bar">
            <div
              class="cap-fill"
              :style="{ width: `${Math.min(100, (cap.usedBytes / absMax) * 100)}%` }"
            />
          </div>
          <p class="cap-text">
            {{ cap.usedBytes }} / {{ absMax }} bytes
            <template v-if="cap.fit">
              · QR v{{ cap.fit.version }} {{ cap.fit.ecc }} ({{ Math.round(cap.fit.pct * 100) }}% of
              this code)
            </template>
            <template v-else> · exceeds max density</template>
          </p>
          <p v-if="cap.warn && !cap.critical" class="cap-hint">
            Getting close to the QR size limit — consider trimming songs.
          </p>
          <p v-if="cap.critical" class="cap-hint">
            Remove songs or shorten titles/arrangers so the QR can be generated.
          </p>
        </div>

        <div class="qr-stage">
          <p v-if="qrBusy" class="hint">Building QR…</p>
          <p v-else-if="qrError" class="cap-hint">{{ qrError }}</p>
          <button
            v-else-if="qrSrc"
            type="button"
            class="qr-btn"
            aria-label="Enlarge QR code"
            @click="enlargeOpen = true"
          >
            <img :src="qrSrc" alt="Your Sing Together repertoire QR" width="240" height="240" />
          </button>
          <p v-else class="hint">Add songs to generate a QR.</p>
        </div>
        <button
          type="button"
          class="btn btn-ghost"
          :disabled="qrBusy"
          @click="refreshQr"
        >
          Refresh QR
        </button>
      </section>
    </div>

    <!-- Host -->
    <div v-show="mode === 'host'" role="tabpanel" aria-label="Host scan and match">
      <section class="card">
        <p class="hint">
          You (this phone) are always included. Scan each singer’s My QR. Title always matches;
          blank arranger / voicing / parts act as wildcards when those criteria are on.
        </p>
        <fieldset class="criteria-fs">
          <legend>Match criteria</legend>
          <label class="crit-check">
            <input type="checkbox" checked disabled />
            Title <span class="crit-note">(required)</span>
          </label>
          <label class="crit-check">
            <input v-model="matchCriteria.arranger" type="checkbox" />
            Arranger
          </label>
          <label class="crit-check">
            <input v-model="matchCriteria.voicing" type="checkbox" />
            Voice range
          </label>
          <label class="crit-check">
            <input v-model="matchCriteria.parts" type="checkbox" />
            Parts (share ≥1 if both list parts)
          </label>
        </fieldset>
        <label class="field">
          <span class="field-label">Text matching</span>
          <select v-model="textMode">
            <option value="exact">Exact (normalized case/spacing)</option>
            <option value="partial">Partial (contains / token subset)</option>
            <option value="fuzzy">Fuzzy (typos, “The …”, light edits)</option>
          </select>
        </label>
        <div class="st-row-actions">
          <button
            v-if="!hostScanning"
            type="button"
            class="btn"
            @click="startScan"
          >
            Start camera scan
          </button>
          <button v-else type="button" class="btn btn-ghost" @click="stopScan">Stop scan</button>
          <button type="button" class="btn btn-ghost" @click="photoInput?.click()">
            Scan from photo
          </button>
          <input
            ref="photoInput"
            type="file"
            accept="image/*"
            capture="environment"
            class="sr-only"
            @change="onPhotoPick"
          />
        </div>
        <p v-if="scanError" class="cap-hint">{{ scanError }}</p>
        <div v-show="hostScanning" class="scan-wrap">
          <video ref="videoEl" class="scan-video" playsinline muted autoplay />
        </div>

        <div class="roster">
          <span class="roster-chip on">You{{ store.profile.displayName ? `: ${store.profile.displayName}` : '' }}</span>
          <button
            v-for="p in hostPeople"
            :key="p.id"
            type="button"
            class="roster-chip"
            :title="`Remove ${p.profile.displayName}`"
            @click="removePerson(p.id)"
          >
            {{ p.profile.displayName }} ×
          </button>
        </div>
      </section>

      <section class="card" aria-labelledby="results-h">
        <div class="results-head">
          <h2 id="results-h">
            Matches ({{ matched.length }})
            <span v-if="matched.length" class="results-sub">{{ coverableCount }} coverable</span>
          </h2>
          <label class="field sort-field">
            <span class="field-label">Sort</span>
            <select v-model="sortMode">
              <option value="coverable-confidence">Coverable, then confidence</option>
              <option value="coverable-title">Coverable, then title</option>
              <option value="intersection-confidence">All shared, by confidence</option>
              <option value="intersection-title">All shared, by title</option>
            </select>
          </label>
        </div>

        <ul v-if="matched.length" class="match-list">
          <li v-for="song in matched" :key="song.matchKey" class="match-item" :class="{ coverable: song.coverable }">
            <div class="match-title-row">
              <span class="song-title">{{ song.title }}</span>
              <span v-if="song.coverable" class="badge">Coverable</span>
              <span v-else class="badge muted">Shared</span>
            </div>
            <div class="song-meta">
              {{ song.arranger || '—' }} · {{ song.voicing }}
              <template v-if="song.key"> · {{ song.key }}</template>
              · confidence {{ fmtConf(song.groupConfidence) }}
            </div>
            <div class="song-parts">{{ coverageSummary(song) }}</div>
          </li>
        </ul>
        <p v-else class="hint">
          {{
            hostPeople.length
              ? 'No songs in common yet — check titles/arrangers/voicings match.'
              : 'Scan at least one other singer to find shared songs.'
          }}
        </p>
      </section>
    </div>

    <Teleport to="body">
      <div
        v-if="enlargeOpen && qrSrc"
        class="qr-enlarge"
        role="dialog"
        aria-modal="true"
        aria-label="Enlarged repertoire QR"
        @click.self="enlargeOpen = false"
      >
        <button type="button" class="btn btn-ghost enlarge-close" @click="enlargeOpen = false">
          Close
        </button>
        <img :src="qrSrc" alt="Enlarged Sing Together QR" class="enlarge-img" />
      </div>
    </Teleport>
  </section>
</template>

<style scoped>
.st {
  max-width: 40rem;
  margin: 0 auto;
  padding: 0.75rem 1rem 2.5rem;
  display: grid;
  gap: 0.85rem;
}
.st-head {
  display: grid;
  gap: 0.35rem;
}
.st-title {
  margin: 0;
  font-size: 1.45rem;
}
.st-intro,
.hint {
  margin: 0;
  color: var(--muted);
  font-size: 0.92rem;
  line-height: 1.35;
}
.st-tabs {
  display: flex;
  gap: 0.25rem;
  flex-wrap: wrap;
}
.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius, 8px);
  padding: 0.85rem 1rem;
  display: grid;
  gap: 0.65rem;
}
.card h2 {
  margin: 0;
  font-size: 1.05rem;
}
.st-row-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}
.field {
  display: grid;
  gap: 0.25rem;
}
.field-label {
  font-size: 0.85rem;
  color: var(--muted);
}
.field input,
.field select,
.conf-select {
  font: inherit;
  padding: 0.45rem 0.55rem;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--fg);
}
.parts-fs {
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0.5rem 0.65rem 0.65rem;
  margin: 0;
}
.criteria-fs {
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0.5rem 0.65rem 0.65rem;
  margin: 0;
  display: grid;
  gap: 0.35rem;
}
.crit-check {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.92rem;
}
.crit-note {
  color: var(--muted);
  font-size: 0.85rem;
}
.part-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.25rem 0;
}
.part-check {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}
.song-list,
.match-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.4rem;
}
.song-item {
  width: 100%;
  text-align: left;
  font: inherit;
  color: inherit;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0.55rem 0.7rem;
  display: grid;
  gap: 0.15rem;
  cursor: pointer;
}
.song-title {
  font-weight: 600;
}
.song-meta,
.song-parts {
  font-size: 0.85rem;
  color: var(--muted);
}
.danger {
  color: var(--danger, #b33);
}
.cap-meter.warn .cap-fill {
  background: var(--warn, #c90);
}
.cap-meter.critical .cap-fill {
  background: var(--danger, #b33);
}
.cap-bar {
  height: 0.45rem;
  background: var(--border);
  border-radius: 99px;
  overflow: hidden;
}
.cap-fill {
  height: 100%;
  background: var(--accent, #0a7);
  transition: width 0.2s ease;
}
.cap-text {
  margin: 0.35rem 0 0;
  font-size: 0.85rem;
}
.cap-hint {
  margin: 0;
  font-size: 0.85rem;
  color: var(--warn, #a60);
}
.qr-stage {
  display: grid;
  place-items: center;
  min-height: 12rem;
}
.qr-btn {
  padding: 0;
  border: none;
  background: #fff;
  border-radius: 8px;
  cursor: zoom-in;
}
.qr-btn img {
  display: block;
  width: min(240px, 70vw);
  height: auto;
}
.scan-wrap {
  border-radius: 8px;
  overflow: hidden;
  background: #000;
  aspect-ratio: 3 / 4;
  max-height: 50vh;
}
.scan-video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.roster {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}
.roster-chip {
  font: inherit;
  font-size: 0.85rem;
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 0.25rem 0.65rem;
  background: var(--bg);
  color: inherit;
  cursor: pointer;
}
.roster-chip.on {
  cursor: default;
  background: color-mix(in srgb, var(--accent, #0a7) 18%, transparent);
}
.results-head {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  justify-content: space-between;
  gap: 0.5rem;
}
.results-sub {
  font-weight: 500;
  color: var(--muted);
  font-size: 0.85rem;
  margin-left: 0.35rem;
}
.sort-field {
  min-width: 12rem;
}
.match-item {
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0.55rem 0.7rem;
  display: grid;
  gap: 0.2rem;
}
.match-item.coverable {
  border-color: color-mix(in srgb, var(--accent, #0a7) 45%, var(--border));
}
.match-title-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
}
.badge {
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  padding: 0.1rem 0.4rem;
  border-radius: 4px;
  background: color-mix(in srgb, var(--accent, #0a7) 22%, transparent);
}
.badge.muted {
  background: var(--border);
  color: var(--muted);
}
.qr-enlarge {
  position: fixed;
  inset: 0;
  z-index: 80;
  background: rgba(0, 0, 0, 0.82);
  display: grid;
  place-items: center;
  padding: 1rem;
}
.enlarge-close {
  position: absolute;
  top: 1rem;
  right: 1rem;
  color: #fff;
}
.enlarge-img {
  width: min(92vw, 92vh);
  height: auto;
  background: #fff;
  border-radius: 8px;
}
.sr-only {
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
