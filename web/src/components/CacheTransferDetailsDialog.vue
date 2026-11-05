<script setup lang="ts">
/**
 * Live song-cache transfer details. Opened from the progress snack so upload
 * and download stay on the current page.
 */
import { computed, onUnmounted, watch } from 'vue'
import { RouterLink } from 'vue-router'
import {
  driveCacheSyncState,
  driveCacheTransferLabel,
  isDriveCacheTransferActive,
} from '../lib/google/driveCacheSync'
import { useCatalogStore } from '../stores/catalog'
import { useOfflineLibraryStore } from '../stores/offlineLibrary'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const catalog = useCatalogStore()
const offlineLib = useOfflineLibraryStore()

const driveActive = computed(() => isDriveCacheTransferActive())

const title = computed(() => {
  if (driveCacheSyncState.status === 'uploading') return 'Uploading to Google Drive'
  if (driveCacheSyncState.status === 'hydrating') return 'Downloading from Google Drive'
  if (driveCacheSyncState.status === 'invalidating') return 'Updating Google Drive'
  if (offlineLib.sheetsStatus === 'running' || offlineLib.audioStatus === 'running') {
    return 'Downloading from SingTags'
  }
  return 'Song cache'
})

const drivePct = computed(() => {
  const total = driveCacheSyncState.total
  if (total <= 0) return 0
  return Math.min(100, Math.round((driveCacheSyncState.done / total) * 100))
})

const sheetsPct = computed(() => Math.round((offlineLib.sheetsProgress?.ratio ?? 0) * 100))
const audioPct = computed(() => Math.round((offlineLib.audioProgress?.ratio ?? 0) * 100))

const finished = computed(() => new Set(driveCacheSyncState.finishedTagIds))

const tagRows = computed(() => {
  const titles = new Map<number, string>()
  for (const tag of catalog.tags) {
    const title = tag.title?.trim()
    if (title) titles.set(tag.id, title)
  }
  const done = finished.value
  return driveCacheSyncState.tagIds.map((id) => ({
    id,
    title: id === 0 ? 'Other files' : titles.get(id) || `Tag ${id}`,
    done: done.has(id),
  }))
})

const pendingRows = computed(() => tagRows.value.filter((row) => !row.done))
const doneCount = computed(() => tagRows.value.length - pendingRows.value.length)

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') emit('close')
}

watch(
  () => props.open,
  (open) => {
    if (open) window.addEventListener('keydown', onKeydown)
    else window.removeEventListener('keydown', onKeydown)
  },
  { immediate: true },
)

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="transfer-details-root"
      role="dialog"
      aria-modal="true"
      aria-labelledby="transfer-details-title"
    >
      <button type="button" class="backdrop" aria-label="Close" @click="emit('close')" />
      <div class="panel">
        <header class="head">
          <h2 id="transfer-details-title">{{ title }}</h2>
          <p v-if="driveActive || driveCacheTransferLabel()" class="lede">
            {{ driveCacheTransferLabel() }}
          </p>
        </header>

        <div v-if="driveActive && driveCacheSyncState.total > 0" class="section">
          <div
            class="bar"
            role="progressbar"
            :aria-valuenow="drivePct"
            aria-valuemin="0"
            aria-valuemax="100"
            :aria-label="driveCacheTransferLabel()"
          >
            <div class="fill" :style="{ width: `${drivePct}%` }" />
          </div>
          <p class="meta">
            {{ driveCacheSyncState.done.toLocaleString() }} of
            {{ driveCacheSyncState.total.toLocaleString() }} tags
          </p>
        </div>

        <div v-if="tagRows.length" class="section">
          <p class="meta">
            {{ doneCount.toLocaleString() }} finished
            <template v-if="pendingRows.length">
              · {{ pendingRows.length.toLocaleString() }} still going
            </template>
          </p>
          <ul class="tags">
            <li v-for="row in pendingRows" :key="`pending-${row.id}`">
              <span class="mark" aria-hidden="true">…</span>
              <span>{{ row.title }}</span>
            </li>
            <li v-for="row in tagRows.filter((r) => r.done)" :key="`done-${row.id}`" class="done">
              <span class="mark" aria-hidden="true">✓</span>
              <span>{{ row.title }}</span>
            </li>
          </ul>
        </div>

        <div v-if="offlineLib.sheetsStatus === 'running'" class="section">
          <p class="section-title">Sheets from SingTags</p>
          <div
            class="bar"
            role="progressbar"
            :aria-valuenow="sheetsPct"
            aria-valuemin="0"
            aria-valuemax="100"
            :aria-label="offlineLib.sheetsProgress?.label || 'Downloading sheets'"
          >
            <div class="fill" :style="{ width: `${sheetsPct}%` }" />
          </div>
          <p class="meta">{{ offlineLib.sheetsProgress?.label || 'Downloading sheets…' }}</p>
        </div>

        <div v-if="offlineLib.audioStatus === 'running'" class="section">
          <p class="section-title">Tracks from SingTags</p>
          <div
            class="bar"
            role="progressbar"
            :aria-valuenow="audioPct"
            aria-valuemin="0"
            aria-valuemax="100"
            :aria-label="offlineLib.audioProgress?.label || 'Downloading tracks'"
          >
            <div class="fill" :style="{ width: `${audioPct}%` }" />
          </div>
          <p class="meta">{{ offlineLib.audioProgress?.label || 'Downloading tracks…' }}</p>
        </div>

        <footer class="actions">
          <RouterLink class="btn" to="/settings?tab=offline" @click="emit('close')">
            Song cache settings
          </RouterLink>
          <button type="button" class="btn btn-primary" @click="emit('close')">Close</button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.transfer-details-root {
  position: fixed;
  inset: 0;
  z-index: 116;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  padding-bottom: calc(1rem + var(--bottom-nav-h, 3.75rem) + env(safe-area-inset-bottom));
}
.backdrop {
  position: absolute;
  inset: 0;
  border: 0;
  background: rgba(0, 0, 0, 0.45);
  cursor: pointer;
}
.panel {
  position: relative;
  z-index: 1;
  width: min(34rem, 100%);
  max-height: min(32rem, 100%);
  overflow: auto;
  display: grid;
  gap: 0.85rem;
  padding: 1.15rem 1.2rem;
  border-radius: var(--radius, 12px);
  border: 1px solid var(--border);
  background: var(--surface);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.2);
}
.head {
  display: grid;
  gap: 0.35rem;
}
.head h2 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.22rem;
  line-height: 1.25;
}
.lede,
.meta,
.section-title {
  margin: 0;
  color: var(--muted);
  font-size: 0.9rem;
  line-height: 1.4;
}
.section-title {
  color: var(--text);
  font-weight: 650;
}
.section {
  display: grid;
  gap: 0.4rem;
  min-height: 0;
}
.bar {
  height: 0.45rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--border) 80%, var(--surface));
  overflow: hidden;
}
.fill {
  height: 100%;
  border-radius: inherit;
  background: var(--accent);
}
.tags {
  list-style: none;
  margin: 0;
  padding: 0;
  overflow: auto;
  max-height: 16rem;
  display: grid;
  gap: 0.2rem;
}
.tags li {
  display: flex;
  gap: 0.45rem;
  align-items: baseline;
  font-size: 0.9rem;
  line-height: 1.35;
}
.tags li.done {
  color: var(--muted);
}
.mark {
  flex: 0 0 1rem;
  color: var(--muted);
}
.actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.5rem;
}
</style>
