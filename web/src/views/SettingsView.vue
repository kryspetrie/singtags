<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useOfflineLibraryStore } from '../stores/offlineLibrary'
import { useOfflineModeStore } from '../stores/offlineMode'
import { useStarsStore } from '../stores/stars'
import { usePreferencesStore } from '../stores/preferences'
import { useOnline } from '../composables/useOnline'
import { DEVICE_AUDIO_STORAGE_QUALITY } from '../types/audio'
import { estimateAudioDownloadBytes } from '../lib/offlineManifest'
import StarsNoticeLine from '../components/StarsNoticeLine.vue'
import { useUserCollectionsStore } from '../stores/userCollections'
import { usePracticeStore } from '../stores/practice'
import {
  applyLocalStorageSnapshot,
  downloadAppStateBackup,
  loadAppStateBackupFile,
  restoreOfflineCacheBytes,
} from '../lib/appStateBackup'

const offlineLib = useOfflineLibraryStore()
const offlineMode = useOfflineModeStore()
const stars = useStarsStore()
const prefs = usePreferencesStore()
const { offline } = useOnline()
const confirmClear = ref(false)
const cacheFileInput = ref<HTMLInputElement | null>(null)
const appBackupFileInput = ref<HTMLInputElement | null>(null)
const includeCacheInAppBackup = ref(false)
const appBackupBusy = ref(false)
const appBackupMessage = ref<string | null>(null)
const userCollections = useUserCollectionsStore()
const practice = usePracticeStore()

onMounted(async () => {
  offlineLib.restoreCatalogCached()
  // Always refresh manifests when online so new remote tags can be detected.
  if (!offline.value || !offlineLib.loaded) await offlineLib.loadManifests()
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
    DEVICE_AUDIO_STORAGE_QUALITY,
  ),
)

const audioDownloadLabel = computed(() => offlineLib.formatBytes(audioDownloadBytes.value))

/** Any pack download in flight (including Sync missing). */
const packDownloadBusy = computed(
  () =>
    offlineLib.packSyncBusy ||
    offlineLib.sheetsStatus === 'running' ||
    offlineLib.audioStatus === 'running',
)

const sheetsActionLabel = computed(() => {
  if (offlineLib.packSyncBusy && offlineLib.sheetsStatus === 'running') {
    return 'Syncing sheets…'
  }
  if (offlineLib.sheetsStatus === 'paused' || offlineLib.sheetsStatus === 'quota') {
    return 'Resume sheets'
  }
  if (offlineLib.sheetsSyncAvailable) {
    return `Sync missing sheets (${offlineLib.sheetsMissingCount})`
  }
  if (offlineLib.sheetsStatus === 'done' || offlineLib.sheetsCachedCount > 0) {
    return 'Sheets up to date'
  }
  return 'Download all sheets'
})

const audioActionLabel = computed(() => {
  if (offlineLib.packSyncBusy && offlineLib.audioStatus === 'running') {
    return 'Syncing tracks…'
  }
  if (offlineLib.audioStatus === 'paused' || offlineLib.audioStatus === 'quota') {
    return 'Resume audio'
  }
  if (offlineLib.audioSyncAvailable) {
    return `Sync missing audio (${offlineLib.audioMissingCount})`
  }
  if (offlineLib.audioStatus === 'done' || offlineLib.audioCachedCount > 0) {
    return 'Tracks up to date'
  }
  return 'Download learning tracks'
})

/** Primary sheets CTA: resume / sync missing / first download only. */
const canStartSheetsAction = computed(() => {
  if (offline.value || packDownloadBusy.value) return false
  if (offlineLib.sheetsStatus === 'paused' || offlineLib.sheetsStatus === 'quota') return true
  if (offlineLib.sheetsSyncAvailable) return true
  if (offlineLib.sheetsCachedCount === 0) return true
  return false
})

/** Primary audio CTA: resume / sync missing / first download only. */
const canStartAudioDownload = computed(() => {
  if (offline.value || packDownloadBusy.value) return false
  if (offlineLib.audioStatus === 'paused' || offlineLib.audioStatus === 'quota') return true
  if (offlineLib.audioSyncAvailable) return true
  if (offlineLib.audioCachedCount === 0) return true
  return false
})

const packSyncBanner = computed(() => {
  if (offlineLib.packSyncBusy) {
    return 'Syncing missing sheets and learning tracks… Already-cached files are skipped.'
  }
  const sheets = offlineLib.sheetsSyncAvailable
  const audio = offlineLib.audioSyncAvailable
  if (!sheets && !audio) return null
  if (sheets && audio) {
    return `New tags are available remotely — ${offlineLib.sheetsMissingCount} sheet file(s) and ${offlineLib.audioMissingCount} audio file(s) aren’t on this device yet. Sync keeps what you already have and only downloads the missing files.`
  }
  if (sheets) {
    return `New tags are available remotely — ${offlineLib.sheetsMissingCount} sheet file(s) aren’t on this device yet. Sync keeps what you already have and only downloads the missing files.`
  }
  return `New learning tracks are available remotely — ${offlineLib.audioMissingCount} audio file(s) aren’t on this device yet. Sync keeps what you already have and only downloads the missing files.`
})

const packSyncBannerBtnLabel = computed(() =>
  offlineLib.packSyncBusy ? 'Syncing…' : 'Sync missing',
)

const canSyncMissing = computed(
  () =>
    !offline.value &&
    !packDownloadBusy.value &&
    (offlineLib.sheetsSyncAvailable || offlineLib.audioSyncAvailable),
)

const hasOfflineCache = computed(
  () =>
    offlineLib.sheetsCachedCount > 0 ||
    offlineLib.audioCachedCount > 0 ||
    stars.count > 0 ||
    !!offlineLib.catalogCachedAt,
)


async function onExportAppState(): Promise<void> {
  appBackupBusy.value = true
  appBackupMessage.value = null
  try {
    await stars.ensureLoaded()
    const result = await downloadAppStateBackup(
      {
        records: stars.records,
        collections: userCollections.exportSnapshot(),
        practice: practice.exportSnapshot(),
      },
      {
        includeCache: includeCacheInAppBackup.value,
        onProgress: (p) => {
          offlineLib.cacheProgress = p
        },
      },
    )
    appBackupMessage.value = result.includeCache
      ? 'Downloaded app backup zip (includes offline cache).'
      : 'Downloaded app-state JSON (settings & favorites; no media cache).'
  } catch (e) {
    appBackupMessage.value = e instanceof Error ? e.message : String(e)
  } finally {
    appBackupBusy.value = false
    offlineLib.cacheProgress = null
  }
}

async function onImportAppStateFile(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  appBackupBusy.value = true
  appBackupMessage.value = null
  try {
    const { state, cacheBytes } = await loadAppStateBackupFile(file, (p) => {
      offlineLib.cacheProgress = p
    })
    await stars.importFromJson(state.favorites.starred, false)
    userCollections.replaceAll(state.favorites.collections)
    practice.importSnapshot(state.favorites.practice)
    applyLocalStorageSnapshot(state.localStorage)
    if (cacheBytes) {
      await restoreOfflineCacheBytes(cacheBytes, (p) => {
        offlineLib.cacheProgress = p
      })
    }
    appBackupMessage.value = 'App backup restored. Reloading…'
    window.setTimeout(() => window.location.reload(), 400)
  } catch (err) {
    appBackupMessage.value = err instanceof Error ? err.message : String(err)
    appBackupBusy.value = false
    offlineLib.cacheProgress = null
  } finally {
    input.value = ''
  }
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
    prefs.hydratePitchPipePrefs()
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
      sheets, then choose which audio parts to cache — or favorite individual tags as you browse.
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
    <p v-if="offlineLib.cacheMessage" class="ok" role="status">{{ offlineLib.cacheMessage }}</p>

    <p v-if="packSyncBanner && !offline" class="ok sync-banner" role="status">
      {{ packSyncBanner }}
      <button
        type="button"
        class="btn btn-primary sync-banner-btn"
        :disabled="!canSyncMissing"
        :aria-busy="offlineLib.packSyncBusy"
        @click="offlineLib.syncMissingPacks()"
      >
        {{ packSyncBannerBtnLabel }}
      </button>
    </p>

    <section class="card primary-card" aria-labelledby="sheets-h">
      <h2 id="sheets-h">Songbook sheets</h2>
      <p class="hint">
        Cache sheet images (WebP pages) for every tag — about
        {{ offlineLib.formatBytes(offlineLib.sheetsTotalBytes) }} to download.
        <template v-if="offlineLib.sheetsCachedCount">
          <strong>{{ offlineLib.formatBytes(offlineLib.sheetsCachedBytes) }}</strong> stored
          ({{ offlineLib.sheetsCachedCount }} of {{ offlineLib.sheetsExpectedCount }} files).
        </template>
        Already-cached files are kept; sync only downloads what’s missing. PDF sheet view still needs
        the network; offline mode uses the cached page images.
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
          :disabled="!canStartSheetsAction"
          @click="offlineLib.startPack('sheets')"
        >
          {{ sheetsActionLabel }}
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
        Already-cached files are kept; sync only downloads what’s missing.
      </p>

      <p class="hint bandwidth-est">
        Estimated download: <strong>~{{ audioDownloadLabel }}</strong> over the network
        (64&nbsp;kbps Opus).
        <template v-if="offlineLib.audioCachedCount">
          <strong>{{ offlineLib.formatBytes(offlineLib.audioCachedBytes) }}</strong> stored on device
          ({{ offlineLib.audioCachedCount }} of {{ offlineLib.audioExpectedCount }} files).
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
          {{ audioActionLabel }}
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

    <section class="card primary-card" aria-labelledby="favorites-h">
      <h2 id="favorites-h">Favorites</h2>
      <p class="hint">
        {{ stars.count }} favorited · audio is stored as 64&nbsp;kbps Opus when you favorite from
        Browse.
      </p>
      <div class="actions">
        <button
          type="button"
          class="btn btn-primary"
          :disabled="offline || stars.busy || !stars.count"
          @click="stars.ensureAudioForAllStarred()"
        >
          Cache audio for all favorites
        </button>
      </div>
      <p v-if="stars.progress" class="hint progress-lbl">{{ stars.progress.label }}</p>
      <p v-if="stars.lastNotice" class="hint stars-notice-wrap" role="status">
        <StarsNoticeLine :notice="stars.lastNotice" />
      </p>
    </section>

    <details class="advanced">
      <summary>Advanced offline settings</summary>

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
          Export cached sheets, audio, favorited media, and pitch pipe settings as one zip — or restore
          a zip onto this device (merges with whatever is already cached). For settings, favorites, and
          collections too, use <strong>App state backup</strong> below.
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
          Removes downloaded sheets, audio pack, favorited tags, and cached catalog metadata on this
          device. Download queue, recent tags, and settings are kept.
        </p>
      </section>

      <section class="card" aria-labelledby="app-backup-h">
        <h2 id="app-backup-h">App state backup</h2>
        <p class="hint">
          Save SingTags settings, favorites, collections, practice order, recent tags, and download
          queue. Optionally include the offline media cache (sheets/audio packs and favorited media) —
          that zip is much larger.
        </p>
        <label class="check">
          <input v-model="includeCacheInAppBackup" type="checkbox" />
          Include offline media cache
        </label>
        <p v-if="appBackupMessage" class="hint" role="status">{{ appBackupMessage }}</p>
        <div class="actions">
          <button
            type="button"
            class="btn btn-primary"
            :disabled="appBackupBusy || offlineLib.cacheBusy"
            @click="onExportAppState"
          >
            {{ appBackupBusy ? 'Working…' : includeCacheInAppBackup ? 'Backup app + cache' : 'Backup app state' }}
          </button>
          <button
            type="button"
            class="btn"
            :disabled="appBackupBusy || offlineLib.cacheBusy"
            @click="appBackupFileInput?.click()"
          >
            Restore app backup…
          </button>
          <input
            ref="appBackupFileInput"
            class="sr"
            type="file"
            accept=".json,.zip,application/json,application/zip"
            aria-label="Restore app state backup"
            @change="onImportAppStateFile"
          />
        </div>
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
.sync-banner {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.65rem 0.85rem;
  padding: 0.75rem 0.85rem;
  border-radius: 8px;
  border: 1px solid color-mix(in srgb, var(--accent) 28%, var(--border));
  background: color-mix(in srgb, var(--accent) 10%, var(--surface));
  line-height: 1.4;
}
.sync-banner-btn {
  flex: 0 0 auto;
  margin-left: auto;
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
