<script setup lang="ts">
import { computed } from 'vue'
import { useQueueStore } from '../stores/queue'
import { useOnline } from '../composables/useOnline'
import EmptyState from '../components/EmptyState.vue'
import {
  DOWNLOAD_FORMAT_OPTIONS,
  downloadFormatLabel,
  type UserDownloadFormat,
} from '../types/audio'
import { normalizeZipLayout, type ZipLayout } from '../download/zip'

const queue = useQueueStore()
const { offline } = useOnline()

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

function onFormatChange(fmt: UserDownloadFormat): void {
  queue.setFormat(fmt)
}
</script>

<template>
  <section aria-label="Downloads">
    <p class="muted intro">
      Build a zip of sheet music and learning tracks across tags. Max {{ queue.max }} files.
      {{ queue.count }} in list.
    </p>
    <p v-if="queue.error" class="error" role="alert">{{ queue.error }}</p>

    <div class="prefs">
      <label>
        Audio as
        <select
          :value="queue.format"
          aria-label="Download audio as"
          @change="onFormatChange(($event.target as HTMLSelectElement).value as UserDownloadFormat)"
        >
          <option v-for="f in DOWNLOAD_FORMAT_OPTIONS" :key="f.value" :value="f.value">
            {{ f.label }}
          </option>
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
      Sheets stay as PDF/image. For audio, Original keeps the hosted AAC file (~128 kbps, .m4a). MP3 is
      transcoded on your device (LAME VBR quality&nbsp;2).
    </p>

    <p v-if="offline" class="hint warn-offline" role="status">
      Zip exports need a network connection. Your queue is saved on this device — you can add files
      while offline.
    </p>

    <div class="actions">
      <button
        type="button"
        :disabled="!queue.count || queue.busy || offline"
        :title="
          !queue.count
            ? 'Add files from Browse or a tag page first'
            : offline
              ? 'Zip export needs a network connection'
              : undefined
        "
        @click="queue.downloadZip()"
      >
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
          <span>#{{ t.tagId }} {{ t.title }} — {{ t.label || t.part }}</span>
          <span class="muted tiny">
            {{
              t.kind === 'sheet'
                ? 'Sheet'
                : downloadFormatLabel(t.format ?? queue.format)
            }}
          </span>
        </div>
        <button type="button" @click="queue.remove(t.tagId, t.part)">Remove</button>
      </li>
    </ul>
    <EmptyState
      v-else
      title="Nothing to download yet"
      message="Select tags on Browse or add sheets and tracks from a tag page."
    />
  </section>
</template>

<style scoped>
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
