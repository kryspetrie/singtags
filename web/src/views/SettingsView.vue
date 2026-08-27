<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useOfflineLibraryStore } from '../stores/offlineLibrary'
import { useOfflineModeStore } from '../stores/offlineMode'
import { useStarsStore } from '../stores/stars'
import { usePreferencesStore } from '../stores/preferences'
import { useOnline } from '../composables/useOnline'
import {
  AUDIO_ENCODE_QUALITY_LABELS,
  type AudioEncodeQuality,
} from '../types/audio'
import { estimateAudioDownloadBytes } from '../lib/offlineManifest'
import { isPublishedTierPath } from '../lib/audioTiers'
import StarsNoticeLine from '../components/StarsNoticeLine.vue'

const offlineLib = useOfflineLibraryStore()
const offlineMode = useOfflineModeStore()
const stars = useStarsStore()
const prefs = usePreferencesStore()
const { offline } = useOnline()
const confirmClear = ref(false)
const cacheFileInput = ref<HTMLInputElement | null>(null)

onMounted(async () => {
  offlineLib.restoreCatalogCached()
  if (!offlineLib.loaded) await offlineLib.loadManifests()
  else await offlineLib.refreshEstimate()
})

const sheetsPct = computed(() => {
  const p = offlineLib.sheetsProgress
  if (!p) return offlineLib.sheetsStatus === 'done' ? 100 : 0
  return Math.round(p.ratio * 100)
})

const audioPct = computed(() => {
  const p = offlineLib.audioProgress
  if (!p) return offlineLib.audioStatus === 'done' ? 100 : 0
  return Math.round(p.ratio * 100)
})

const cachePct = computed(() => {
  const p = offlineLib.cacheProgress
  if (!p) return 0
  return Math.round(p.ratio * 100)
})

const metered = computed(() => offlineLib.isLikelyMeteredConnection())

const audioDownloadBytes = computed(() =>
  estimateAudioDownloadBytes(
    offlineLib.audioManifest,
    'all',
    [],
    prefs.audioEncodeQuality,
  ),
)

const audioDownloadLabel = computed(() => offlineLib.formatBytes(audioDownloadBytes.value))

const canStartAudioDownload = computed(
  () => !offline.value && offlineLib.audioStatus !== 'running',
)

const publishedTiersShipped = computed(() => {
  const m = offlineLib.audioManifest
  if (!m?.entries.length) return true
  return m.entries.some((e) => e.paths.some(isPublishedTierPath))
})

const qualityOptions = computed(() => {
  const keys = (Object.keys(AUDIO_ENCODE_QUALITY_LABELS) as AudioEncodeQuality[]).filter(
    (id) => !publishedTiersShipped.value || id !== 'compact',
  )
  return keys.map((id) => ({ id, label: AUDIO_ENCODE_QUALITY_LABELS[id] }))
})

const hasOfflineCache = computed(
  () =>
    offlineLib.sheetsCachedCount > 0 ||
    offlineLib.audioCachedCount > 0 ||
    stars.count > 0 ||
    !!offlineLib.catalogCachedAt,
)

function onQualityChange(v: string): void {
  prefs.setAudioEncodeQuality(v as AudioEncodeQuality)
}

async function onExportCache(): Promise<void> {
  await offlineLib.exportOfflineCache()
}

async function onImportCacheFile(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    await offlineLib.importOfflineCache(file)
    await stars.refresh()
  } finally {
    input.value = ''
  }
}

function onClearCacheClick(): void {
  if (!confirmClear.value) {
    confirmClear.value = true
    return
  }
  void clearAllCache()
}

async function clearAllCache(): Promise<void> {
  await offlineLib.clearAllOfflineData()
  await stars.refresh()
  confirmClear.value = false
}

function cancelClear(): void {
  confirmClear.value = false
}
</script>

<template>
  <section class="settings" aria-label="Offline settings">
    <section class="connection-card" aria-labelledby="connection-h">
      <div class="connection-row">
        <div class="connection-copy">
          <h2 id="connection-h">Connection</h2>
          <p class="hint">
            Go offline to use cached sheets and tracks only — saves data and avoids downloads on
            slow or metered connections.
          </p>
        </div>
        <button
          type="button"
          class="btn connection-btn"
          :class="offlineMode.manualOffline ? 'btn-primary' : 'btn-ghost'"
          @click="offlineMode.toggleManualOffline()"
        >
          {{ offlineMode.manualOffline ? 'Go online' : 'Go offline' }}
        </button>
      </div>
    </section>

    <p class="lede">
      Save the songbook and learning tracks on this device for fast, offline practice. Start with
      sheets, then choose which audio parts to cache — or star individual tags as you browse.
    </p>

    <p class="status" role="status">{{ offlineLib.statusLabel }}</p>

    <dl v-if="offlineLib.sheetsCachedCount || offlineLib.audioCachedCount" class="storage-summary">
      <div>
        <dt>Sheets on device</dt>
        <dd>
          {{ offlineLib.formatBytes(offlineLib.sheetsCachedBytes) }}
          <span class="storage-meta">({{ offlineLib.sheetsCachedCount }} files)</span>
        </dd>
      </div>
      <div>
        <dt>Tracks on device</dt>
        <dd>
          {{ offlineLib.formatBytes(offlineLib.audioCachedBytes) }}
          <span class="storage-meta">({{ offlineLib.audioCachedCount }} files)</span>
        </dd>
      </div>
    </dl>

    <p v-if="offlineMode.manualOffline" class="hint connection-on" role="status">
      Offline mode is on — downloads and streaming are paused until you go online.
    </p>
    <p v-else-if="offline" class="warn" role="status">No network connection — downloads need a connection.</p>
    <p v-if="metered" class="warn bandwidth-warn" role="status">
      Cellular or data-saver connection detected. Large library downloads can use many gigabytes —
      connect to Wi‑Fi before caching the full audio library.
    </p>
    <p v-if="offlineLib.error" class="warn" role="alert">{{ offlineLib.error }}</p>
    <p v-if="offlineLib.cacheMessage" class="ok" role="status">{{ offlineLib.cacheMessage }}</p>

    <section class="card primary-card" aria-labelledby="sheets-h">
      <h2 id="sheets-h">Songbook sheets</h2>
      <p class="hint">
        Cache sheet images (WebP pages) for every tag — about
        {{ offlineLib.formatBytes(offlineLib.sheetsTotalBytes) }} to download.
        <template v-if="offlineLib.sheetsCachedCount">
          <strong>{{ offlineLib.formatBytes(offlineLib.sheetsCachedBytes) }}</strong> stored
          ({{ offlineLib.sheetsCachedCount }} files).
        </template>
        PDF sheet view still needs the network; offline mode uses the cached page images.
      </p>
      <div
        v-if="offlineLib.sheetsProgress"
        class="bar"
        role="progressbar"
        :aria-valuenow="sheetsPct"
        aria-valuemin="0"
        aria-valuemax="100"
      >
        <div class="fill" :style="{ width: `${sheetsPct}%` }" />
      </div>
      <p v-if="offlineLib.sheetsProgress" class="hint progress-lbl">{{ offlineLib.sheetsProgress.label }}</p>
      <div class="actions">
        <button
          type="button"
          class="btn btn-primary"
          :disabled="offline || offlineLib.sheetsStatus === 'running'"
          @click="offlineLib.startPack('sheets')"
        >
          {{
            offlineLib.sheetsStatus === 'paused' || offlineLib.sheetsStatus === 'quota'
              ? 'Resume sheets'
              : offlineLib.sheetsStatus === 'done'
                ? 'Re-download sheets'
                : 'Download all sheets'
          }}
        </button>
        <button
          type="button"
          class="btn btn-ghost"
          :disabled="offlineLib.sheetsStatus !== 'running'"
          @click="offlineLib.pausePack('sheets')"
        >
          Pause
        </button>
        <button
          type="button"
          class="btn btn-ghost"
          :disabled="offline || !offlineLib.sheetsCachedCount"
          @click="offlineLib.clearPack('sheets')"
        >
          Clear sheets
        </button>
      </div>
    </section>

    <section class="card primary-card" aria-labelledby="audio-h">
      <h2 id="audio-h">Learning tracks library</h2>
      <p class="hint">
        Cache ultra-low solo stems for every voice part so individual tracks and mix
        (reconstructed at play time) work offline. Mix-only tags download the mix file only.
      </p>

      <label class="quality quick-quality">
        <span>Starred tag storage quality</span>
        <select
          :value="prefs.audioEncodeQuality"
          aria-label="Audio storage quality when starring tags"
          @change="onQualityChange(($event.target as HTMLSelectElement).value)"
        >
          <option v-for="q in qualityOptions" :key="q.id" :value="q.id">{{ q.label }}</option>
        </select>
      </label>

      <p class="hint bandwidth-est">
        Estimated download: <strong>~{{ audioDownloadLabel }}</strong> over the network at your
        current settings.
        <template v-if="offlineLib.audioCachedCount">
          <strong>{{ offlineLib.formatBytes(offlineLib.audioCachedBytes) }}</strong> stored on device
          ({{ offlineLib.audioCachedCount }} files).
        </template>
        Use Wi‑Fi when possible.
      </p>

      <div
        v-if="offlineLib.audioProgress"
        class="bar"
        role="progressbar"
        :aria-valuenow="audioPct"
        aria-valuemin="0"
        aria-valuemax="100"
      >
        <div class="fill" :style="{ width: `${audioPct}%` }" />
      </div>
      <p v-if="offlineLib.audioProgress" class="hint progress-lbl">{{ offlineLib.audioProgress.label }}</p>

      <div class="actions">
        <button
          type="button"
          class="btn btn-primary"
          :disabled="!canStartAudioDownload"
          @click="offlineLib.startPack('audio')"
        >
          {{
            offlineLib.audioStatus === 'paused' || offlineLib.audioStatus === 'quota'
              ? 'Resume audio'
              : offlineLib.audioStatus === 'done'
                ? 'Re-download audio'
                : 'Download learning tracks'
          }}
        </button>
        <button
          type="button"
          class="btn btn-ghost"
          :disabled="offlineLib.audioStatus !== 'running'"
          @click="offlineLib.pausePack('audio')"
        >
          Pause
        </button>
        <button
          type="button"
          class="btn btn-ghost"
          :disabled="!offlineLib.audioCachedCount"
          @click="offlineLib.clearPack('audio')"
        >
          Clear audio
        </button>
      </div>
    </section>

    <section class="card primary-card" aria-labelledby="starred-h">
      <h2 id="starred-h">Starred tags</h2>
      <p class="hint">
        {{ stars.count }} starred · uses the storage quality above when you star from Browse.
        Mix on multi-part tags is reconstructed at play time when stored at Ultra.
      </p>
      <div class="actions">
        <button
          type="button"
          class="btn btn-primary"
          :disabled="offline || stars.busy || !stars.count"
          @click="stars.ensureAudioForAllStarred()"
        >
          Cache audio for all starred
        </button>
      </div>
      <p v-if="stars.progress" class="hint progress-lbl">{{ stars.progress.label }}</p>
      <p v-if="stars.lastNotice" class="hint stars-notice-wrap" role="status">
        <StarsNoticeLine :notice="stars.lastNotice" />
      </p>
    </section>

    <details class="advanced">
      <summary>Advanced offline settings</summary>

      <section class="card" aria-labelledby="quality-detail-h">
        <h2 id="quality-detail-h">Storage quality details</h2>
        <p class="hint">
          Online playback uses 64&nbsp;kbps Opus unless you have downloaded the original. Starred
          tags and the learning-tracks library follow the quality setting above.
        </p>
      </section>

      <section class="card" aria-labelledby="storage-h">
        <h2 id="storage-h">Storage</h2>
        <p class="hint">
          Persistent storage asks the browser not to wipe this site’s offline cache when the device
          runs low on space. Desktop Chrome often grants it silently (no dialog) once you’ve used
          the site enough — so the button can look like it did nothing.
        </p>
        <dl class="stats">
          <div>
            <dt>Sheets</dt>
            <dd>{{ offlineLib.formatBytes(offlineLib.sheetsCachedBytes) }}</dd>
          </div>
          <div>
            <dt>Tracks</dt>
            <dd>{{ offlineLib.formatBytes(offlineLib.audioCachedBytes) }}</dd>
          </div>
          <div>
            <dt>Total site</dt>
            <dd>{{ offlineLib.formatBytes(offlineLib.estimate?.usage ?? 0) }}</dd>
          </div>
          <div>
            <dt>Quota</dt>
            <dd>{{ offlineLib.formatBytes(offlineLib.estimate?.quota ?? 0) }}</dd>
          </div>
          <div>
            <dt>Catalog</dt>
            <dd>{{ offlineLib.catalogCachedAt ? 'Cached' : 'Not yet' }}</dd>
          </div>
          <div>
            <dt>Persistent</dt>
            <dd>{{ offlineLib.estimate?.persisted ? 'Yes' : 'No' }}</dd>
          </div>
        </dl>
        <div class="actions">
          <button
            type="button"
            class="btn btn-ghost"
            :disabled="offline || offlineLib.estimate?.persisted"
            :title="
              offlineLib.estimate?.persisted
                ? 'Already granted for this site'
                : 'Ask the browser to protect offline cache from eviction'
            "
            @click="offlineLib.requestPersistentStorage()"
          >
            {{ offlineLib.estimate?.persisted ? 'Persistent storage on' : 'Request persistent storage' }}
          </button>
          <button type="button" class="btn btn-ghost" @click="offlineLib.refreshEstimate()">
            Refresh estimate
          </button>
        </div>
      </section>

      <section class="card" aria-labelledby="cache-tools-h">
        <h2 id="cache-tools-h">Backup &amp; restore</h2>
        <p class="hint">
          Export cached sheets, audio, and starred media as one zip — or restore a zip onto this
          device (merges with whatever is already cached).
        </p>
        <div
          v-if="offlineLib.cacheProgress"
          class="bar"
          role="progressbar"
          :aria-valuenow="cachePct"
          aria-valuemin="0"
          aria-valuemax="100"
        >
          <div class="fill" :style="{ width: `${cachePct}%` }" />
        </div>
        <p v-if="offlineLib.cacheProgress" class="hint">{{ offlineLib.cacheProgress.label }}</p>
        <div class="actions">
          <button
            type="button"
            class="btn btn-primary"
            :disabled="offlineLib.cacheBusy || !hasOfflineCache"
            @click="onExportCache"
          >
            {{ offlineLib.cacheBusy ? 'Working…' : 'Export offline cache' }}
          </button>
          <button
            type="button"
            class="btn"
            :disabled="offlineLib.cacheBusy"
            @click="cacheFileInput?.click()"
          >
            Restore from zip…
          </button>
          <input
            ref="cacheFileInput"
            class="sr"
            type="file"
            accept=".zip,application/zip"
            aria-label="Restore offline cache zip"
            @change="onImportCacheFile"
          />
          <button
            v-if="confirmClear"
            type="button"
            class="btn btn-danger"
            :disabled="offlineLib.cacheBusy"
            @click="onClearCacheClick"
          >
            Confirm clear all
          </button>
          <button
            v-else
            type="button"
            class="btn btn-ghost"
            :disabled="offlineLib.cacheBusy || !hasOfflineCache"
            @click="onClearCacheClick"
          >
            Clear all offline cache
          </button>
          <button
            v-if="confirmClear"
            type="button"
            class="btn btn-ghost"
            :disabled="offlineLib.cacheBusy"
            @click="cancelClear"
          >
            Cancel
          </button>
        </div>
        <p v-if="confirmClear" class="hint warn-inline" role="alert">
          Removes downloaded sheets, audio pack, starred tags, and cached catalog metadata on this
          device. Download queue, recent tags, and settings are kept.
        </p>
      </section>
    </details>
  </section>
</template>

<style scoped>
.settings {
  padding: 1rem 1rem 5rem;
  max-width: 40rem;
  margin: 0 auto;
}
.connection-card {
  margin-bottom: 1rem;
  padding: 1rem;
  border: 1px solid color-mix(in srgb, var(--accent) 28%, var(--border));
  border-radius: 10px;
  background: color-mix(in srgb, var(--accent) 8%, var(--surface));
}
.connection-row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem 1rem;
}
.connection-copy {
  flex: 1 1 14rem;
  min-width: 0;
}
.connection-copy h2 {
  margin: 0 0 0.35rem;
  font-size: 1.1rem;
}
.connection-copy .hint {
  margin: 0;
}
.connection-btn {
  flex-shrink: 0;
  align-self: center;
}
.connection-on {
  margin: 0 0 1rem;
  color: var(--accent-hover);
  font-weight: 600;
}
.lede {
  margin: 0 0 1rem;
  color: var(--muted, #5a635f);
  line-height: 1.45;
}
.status {
  margin: 0 0 1rem;
  padding: 0.65rem 0.85rem;
  border-radius: 8px;
  background: color-mix(in srgb, var(--accent) 10%, var(--surface));
  border: 1px solid color-mix(in srgb, var(--accent) 28%, var(--border));
}
.storage-summary {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.65rem 1rem;
  margin: 0 0 1rem;
  padding: 0.75rem 0.85rem;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--surface);
}
.storage-summary dt {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--muted, #5a635f);
}
.storage-summary dd {
  margin: 0.15rem 0 0;
  font-weight: 700;
  font-size: 1.05rem;
}
.storage-meta {
  display: block;
  margin-top: 0.1rem;
  font-size: 0.82rem;
  font-weight: 500;
  color: var(--muted, #5a635f);
}
.primary-card {
  border-color: color-mix(in srgb, var(--accent) 22%, var(--border));
}
.card {
  margin-bottom: 1.25rem;
  padding: 1rem;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
}
.card h2 {
  margin: 0 0 0.5rem;
  font-size: 1.1rem;
}
.hint {
  margin: 0 0 0.75rem;
  font-size: 0.9rem;
  color: var(--muted, #5a635f);
  line-height: 1.4;
}
.progress-lbl {
  font-variant-numeric: tabular-nums;
}
.bandwidth-warn {
  color: var(--danger, #b42318);
}
.bandwidth-est strong {
  color: var(--text);
}
.warn-inline {
  color: var(--accent);
}
.warn {
  color: var(--danger, #b42318);
  margin: 0 0 0.75rem;
}
.ok {
  margin: 0 0 0.75rem;
  color: var(--accent-hover);
}
.advanced {
  margin-top: 0.5rem;
}
.advanced > summary {
  cursor: pointer;
  font-weight: 700;
  font-size: 0.95rem;
  margin-bottom: 0.75rem;
  color: var(--muted);
}
.check {
  display: flex;
  align-items: flex-start;
  gap: 0.55rem;
  font-weight: 600;
  font-size: 0.95rem;
  margin: 0 0 0.35rem;
}
.check input {
  width: 1.15rem;
  height: 1.15rem;
  margin-top: 0.15rem;
  accent-color: var(--accent);
}
.stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem 1rem;
  margin: 0 0 0.75rem;
}
.stats dt {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--muted, #5a635f);
}
.stats dd {
  margin: 0.1rem 0 0;
  font-weight: 600;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.quick-quality,
.quality {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-size: 0.9rem;
  margin-bottom: 0.65rem;
}
.quick-quality select,
.quality select {
  max-width: 100%;
  padding: 0.45rem 0.5rem;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg, #fff);
}
.bar {
  height: 8px;
  border-radius: 999px;
  background: var(--border);
  overflow: hidden;
  margin-bottom: 0.5rem;
}
.fill {
  height: 100%;
  background: var(--accent);
  transition: width 0.2s ease;
}
.btn-danger {
  background: color-mix(in srgb, var(--danger, #b42318) 12%, var(--surface));
  border: 1px solid color-mix(in srgb, var(--danger, #b42318) 45%, var(--border));
  color: var(--danger, #b42318);
  font-weight: 600;
}
.sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}
</style>
