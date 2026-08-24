<script setup lang="ts">
import { computed } from 'vue'
import { useQueueStore } from '../stores/queue'
import { usePreferencesStore } from '../stores/preferences'
import EmptyState from '../components/EmptyState.vue'
import type { AudioEncodeQuality, DownloadFormat, TransformMode } from '../types/audio'
import { transformFromMode } from '../types/audio'
import { normalizeZipLayout, type ZipLayout } from '../download/zip'

const queue = useQueueStore()
const prefs = usePreferencesStore()

const formats: Array<{ id: DownloadFormat; label: string }> = [
  { id: 'mp4', label: 'MP4 (AAC)' },
  { id: 'mp3', label: 'MP3' },
  { id: 'ogg', label: 'OGG Vorbis' },
]

const qualities: Array<{ id: AudioEncodeQuality; label: string }> = [
  { id: 'original', label: 'Original (hosted ~128 kbps)' },
  { id: 'standard', label: 'Standard (stereo ~96 kbps)' },
  { id: 'compact', label: 'Compact (stereo ~64 kbps)' },
  { id: 'lofi', label: 'Lo-fi (stereo ~32 kbps)' },
]

const modes: Array<{ id: TransformMode; label: string }> = [
  { id: 'original', label: 'Original' },
  { id: 'key', label: 'Current key' },
  { id: 'speed', label: 'Current speed' },
  { id: 'key+speed', label: 'Current key + speed' },
]

const layouts: Array<{ id: ZipLayout; label: string }> = [
  { id: 'folders', label: 'Folders by tag' },
  { id: 'flat', label: 'Flat (all files together)' },
]

const zipLayoutModel = computed({
  get: (): ZipLayout => normalizeZipLayout(queue.zipLayout),
  set: (v: ZipLayout) => {
    queue.zipLayout = normalizeZipLayout(v)
  },
})

function onModeChange(mode: TransformMode): void {
  queue.transformMode = mode
  queue.applyBulkTransform(mode)
}

function onFormatChange(fmt: DownloadFormat): void {
  queue.format = fmt
  for (const t of queue.tracks) {
    queue.updateTrack(t.tagId, t.part, { format: fmt })
  }
}

function onQualityChange(v: string): void {
  const q = v as AudioEncodeQuality
  queue.encodeQuality = q
  prefs.setAudioEncodeQuality(q)
}
</script>

<template>
  <section aria-labelledby="queue-heading">
    <h1 id="queue-heading">Downloads</h1>
    <p class="muted">
      Build a zip of learning tracks across tags. Max {{ queue.max }} tracks.
      {{ queue.count }} in list.
    </p>
    <p v-if="queue.error" class="error" role="alert">{{ queue.error }}</p>

    <div class="prefs">
      <label>
        Format
        <select
          :value="queue.format"
          aria-label="Zip download format"
          @change="onFormatChange(($event.target as HTMLSelectElement).value as DownloadFormat)"
        >
          <option v-for="f in formats" :key="f.id" :value="f.id">{{ f.label }}</option>
        </select>
      </label>
      <label>
        Quality
        <select
          :value="queue.encodeQuality"
          aria-label="Zip encode quality"
          @change="onQualityChange(($event.target as HTMLSelectElement).value)"
        >
          <option v-for="q in qualities" :key="q.id" :value="q.id">{{ q.label }}</option>
        </select>
      </label>
      <label>
        Transform
        <select
          :value="queue.transformMode"
          aria-label="Zip transform mode"
          @change="onModeChange(($event.target as HTMLSelectElement).value as TransformMode)"
        >
          <option v-for="m in modes" :key="m.id" :value="m.id">{{ m.label }}</option>
        </select>
      </label>
      <label>
        Layout
        <select v-model="zipLayoutModel" aria-label="Zip folder layout">
          <option v-for="l in layouts" :key="l.id" :value="l.id">{{ l.label }}</option>
        </select>
      </label>
    </div>
    <p class="hint">
      MP4 quality re-encodes stereo AAC on device (Original keeps the hosted file). MP3/OGG always re-encode.
    </p>

    <div class="actions">
      <button type="button" :disabled="!queue.count || queue.busy" @click="queue.downloadZip()">
        {{ queue.busy ? `Zipping ${queue.progress.done}/${queue.progress.total}…` : 'Download zip' }}
      </button>
      <button
        v-if="queue.busy"
        type="button"
        class="cancel"
        @click="queue.cancelZip()"
      >
        Cancel
      </button>
      <button type="button" :disabled="!queue.count || queue.busy" @click="queue.clear()">Clear</button>
    </div>

    <ul v-if="queue.tracks.length" class="list">
      <li v-for="t in queue.tracks" :key="`${t.tagId}-${t.part}`">
        <div class="meta">
          <span>#{{ t.tagId }} {{ t.title }} — {{ t.part }}</span>
          <span class="muted tiny">
            {{ t.format ?? queue.format }}
            ·
            {{
              t.transform
                ? `${t.transform.pitchSemitones}st @ ${Math.round(t.transform.speed * 100)}%`
                : transformFromMode(queue.transformMode, queue.playbackTransform).pitchSemitones +
                  'st'
            }}
          </span>
        </div>
        <button type="button" @click="queue.remove(t.tagId, t.part)">Remove</button>
      </li>
    </ul>
    <EmptyState
      v-else
      title="Nothing to download yet"
      message="Select tags on Browse or add tracks from a tag page."
    />
  </section>
</template>

<style scoped>
h1 {
  font-family: var(--font-display);
}
.muted {
  color: var(--muted);
}
.tiny {
  font-size: 0.85rem;
}
.error {
  color: var(--danger);
}
.hint {
  font-size: 0.85rem;
  color: var(--muted);
  margin: 0 0 0.75rem;
}
.prefs {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  margin: 1rem 0;
}
.prefs label {
  display: grid;
  gap: 0.25rem;
  font-size: 0.9rem;
  color: var(--muted);
}
.prefs select {
  font: inherit;
  padding: 0.4rem 0.6rem;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--surface);
}
.actions {
  display: flex;
  gap: 0.75rem;
  margin: 1rem 0;
  flex-wrap: wrap;
}
.actions button {
  font: inherit;
  padding: 0.5rem 0.9rem;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--surface);
}
.actions button:first-child {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
}
.cancel {
  color: var(--danger) !important;
}
.list {
  list-style: none;
  padding: 0;
  display: grid;
  gap: 0.4rem;
}
.list li {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.65rem 0.85rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}
.meta {
  display: grid;
  gap: 0.15rem;
}
.list button {
  border: 0;
  background: none;
  color: var(--danger);
  text-decoration: underline;
}
</style>
