<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useOfflineLibraryStore } from '../stores/offlineLibrary'
import { useStarsStore } from '../stores/stars'
import { usePreferencesStore } from '../stores/preferences'
import { useOnline } from '../composables/useOnline'
import {
  AUDIO_ENCODE_QUALITY_LABELS,
  type AudioEncodeQuality,
} from '../types/audio'

const offlineLib = useOfflineLibraryStore()
const stars = useStarsStore()
const prefs = usePreferencesStore()
const { offline } = useOnline()

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

const metered = computed(() => offlineLib.isLikelyMeteredConnection())

const qualityOptions = (Object.keys(AUDIO_ENCODE_QUALITY_LABELS) as AudioEncodeQuality[]).map(
  (id) => ({ id, label: AUDIO_ENCODE_QUALITY_LABELS[id] }),
)

function onQualityChange(v: string): void {
  prefs.setAudioEncodeQuality(v as AudioEncodeQuality)
}
</script>

<template>
  <section class="settings" aria-labelledby="settings-heading">
    <header class="head">
      <h1 id="settings-heading">Offline</h1>
      <p class="lede">
        Make SingTags work like a native app without a network. Download the songbook sheets once;
        star tags to keep their audio. Optionally download all audio on a large device.
      </p>
    </header>

    <p class="status" role="status">{{ offlineLib.statusLabel }}</p>
    <p v-if="offline" class="warn" role="status">You are offline — downloads need a connection.</p>
    <p v-if="offlineLib.error" class="warn" role="alert">{{ offlineLib.error }}</p>
    <p v-if="metered" class="hint">Cellular / data-saver detected — Wi‑Fi recommended for large packs.</p>

    <section class="card" aria-labelledby="quality-h">
      <h2 id="quality-h">Audio storage quality</h2>
      <p class="hint">
        Applied when starring tags, caching starred audio, and downloading the full audio pack.
        Non-original qualities re-encode to stereo AAC MP4 on this device (slower first save, less storage).
      </p>
      <label class="quality">
        Quality
        <select
          :value="prefs.audioEncodeQuality"
          aria-label="Audio storage quality"
          @change="onQualityChange(($event.target as HTMLSelectElement).value)"
        >
          <option v-for="q in qualityOptions" :key="q.id" :value="q.id">{{ q.label }}</option>
        </select>
      </label>
    </section>

    <section class="card" aria-labelledby="playback-q-h">
      <h2 id="playback-q-h">Online playback quality</h2>
      <p class="hint">
        When you have lower-quality audio cached on this device, these options control whether the
        hosted original is preferred while you are online.
      </p>
      <label class="check">
        <input
          v-model="prefs.playOriginalWhileOnline"
          type="checkbox"
          :disabled="offline"
        />
        Play original quality while online
      </label>
      <p class="hint tight">
        Fetches the hosted track in the background (starting with Mix). Play uses the cached file until
        the original is ready, then switches.
      </p>
      <label class="check">
        <input
          v-model="prefs.upgradeCachedOnPlay"
          type="checkbox"
          :disabled="offline || !prefs.playOriginalWhileOnline"
        />
        Upgrade cached track quality when played
      </label>
      <p class="hint tight">
        When an original is fetched for playback, replace the starred lower-quality cache with it.
      </p>
    </section>

    <section class="card" aria-labelledby="storage-h">
      <h2 id="storage-h">Storage</h2>
      <dl class="stats">
        <div>
          <dt>Used</dt>
          <dd>{{ offlineLib.formatBytes(offlineLib.estimate?.usage ?? 0) }}</dd>
        </div>
        <div>
          <dt>Quota</dt>
          <dd>{{ offlineLib.formatBytes(offlineLib.estimate?.quota ?? 0) }}</dd>
        </div>
        <div>
          <dt>Persisted</dt>
          <dd>{{ offlineLib.estimate?.persisted ? 'Yes' : 'No' }}</dd>
        </div>
        <div>
          <dt>Catalog</dt>
          <dd>{{ offlineLib.catalogCachedAt ? 'Cached' : 'Not yet' }}</dd>
        </div>
      </dl>
      <button
        type="button"
        class="btn btn-ghost"
        :disabled="offline"
        @click="offlineLib.requestPersistentStorage().then(() => offlineLib.refreshEstimate())"
      >
        Request persistent storage
      </button>
      <button type="button" class="btn btn-ghost" @click="offlineLib.refreshEstimate()">
        Refresh estimate
      </button>
    </section>

    <section class="card" aria-labelledby="sheets-h">
      <h2 id="sheets-h">Songbook sheets (Tier 2)</h2>
      <p class="hint">
        All WebP sheet pages + tag metadata —
        {{ offlineLib.formatBytes(offlineLib.sheetsTotalBytes) }}
        · {{ offlineLib.sheetsCachedCount }} files cached
      </p>
      <div v-if="offlineLib.sheetsProgress" class="bar" role="progressbar" :aria-valuenow="sheetsPct" aria-valuemin="0" aria-valuemax="100">
        <div class="fill" :style="{ width: `${sheetsPct}%` }" />
      </div>
      <p v-if="offlineLib.sheetsProgress" class="hint">{{ offlineLib.sheetsProgress.label }}</p>
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
          Clear sheet pack
        </button>
      </div>
    </section>

    <section class="card" aria-labelledby="starred-h">
      <h2 id="starred-h">Starred audio (Tier 3)</h2>
      <p class="hint">
        {{ stars.count }} starred · cache audio for tags you rehearse. Sheets come from the library
        pack when available. Incomplete audio caches retry automatically when you reconnect.
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
      <p v-if="stars.progress" class="hint">{{ stars.progress.label }}</p>
      <p v-if="stars.lastMessage" class="hint" role="status">{{ stars.lastMessage }}</p>
    </section>

    <section class="card" aria-labelledby="audio-h">
      <h2 id="audio-h">Full audio library (Tier 4)</h2>
      <p class="hint warn-inline">
        Large download — about {{ offlineLib.formatBytes(offlineLib.audioTotalBytes) }}. Prefer
        desktop or a device with plenty of free space. Phones should use Starred audio instead.
      </p>
      <div v-if="offlineLib.audioProgress" class="bar" role="progressbar" :aria-valuenow="audioPct" aria-valuemin="0" aria-valuemax="100">
        <div class="fill" :style="{ width: `${audioPct}%` }" />
      </div>
      <p v-if="offlineLib.audioProgress" class="hint">{{ offlineLib.audioProgress.label }}</p>
      <div class="actions">
        <button
          type="button"
          class="btn btn-primary"
          :disabled="offline || offlineLib.audioStatus === 'running'"
          @click="offlineLib.startPack('audio')"
        >
          {{
            offlineLib.audioStatus === 'paused' || offlineLib.audioStatus === 'quota'
              ? 'Resume all audio'
              : offlineLib.audioStatus === 'done'
                ? 'Re-download all audio'
                : 'Download all audio'
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
          Clear audio pack
        </button>
      </div>
      <p class="hint">{{ offlineLib.audioCachedCount }} audio files cached</p>
    </section>
  </section>
</template>

<style scoped>
.settings {
  padding: 1rem 1rem 5rem;
  max-width: 40rem;
  margin: 0 auto;
}
.head h1 {
  margin: 0 0 0.35rem;
  font-family: var(--font-display, Georgia, serif);
  font-size: 1.75rem;
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
.hint.tight {
  margin-top: -0.35rem;
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
.warn-inline {
  color: var(--accent);
}
.warn {
  color: var(--accent);
  margin: 0 0 0.75rem;
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
.quality {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-size: 0.9rem;
  margin-bottom: 0.25rem;
}
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
</style>
