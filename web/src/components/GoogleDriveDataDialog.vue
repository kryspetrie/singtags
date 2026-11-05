<script setup lang="ts">
/**
 * Signed-in view of what SingTags has stored in the user's private Drive folder.
 */
import { onUnmounted, ref, watch } from 'vue'
import {
  loadDriveAccountSummary,
  type DriveAccountSummary,
  type DrivePackSummary,
} from '../lib/google/driveAccountSummary'
import { googleAuthState } from '../lib/google/googleAuth'
import { isDriveCacheTransferActive } from '../lib/google/driveCacheSync'
import { formatBytes } from '../offline/storageEstimate'
import GoogleDrivePrivacyNote from './GoogleDrivePrivacyNote.vue'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const loading = ref(false)
const error = ref('')
const summary = ref<DriveAccountSummary | null>(null)

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape' && !loading.value) emit('close')
}

async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  summary.value = null
  try {
    summary.value = await loadDriveAccountSummary()
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

watch(
  () => props.open,
  (open) => {
    if (!open) {
      window.removeEventListener('keydown', onKeydown)
      return
    }
    window.addEventListener('keydown', onKeydown)
    void load()
  },
  { immediate: true },
)

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
})

function packLine(pack: DrivePackSummary): string {
  if (!pack.present) return 'Not in Drive'
  const tags = `${pack.tags.toLocaleString()} tag${pack.tags === 1 ? '' : 's'}`
  const files = `${pack.files.toLocaleString()} file${pack.files === 1 ? '' : 's'}`
  return `${tags} · ${files} · ${formatBytes(pack.bytes)}`
}

function settingsLine(s: DriveAccountSummary): string {
  if (!s.settingsPresent && s.settingsBytes <= 0) return 'Not in Drive yet'
  const bits = [formatBytes(s.settingsBytes)]
  if (s.favoriteCount != null) {
    bits.push(`${s.favoriteCount.toLocaleString()} favorite${s.favoriteCount === 1 ? '' : 's'}`)
  }
  if (s.collectionCount) {
    bits.push(`${s.collectionCount.toLocaleString()} collection${s.collectionCount === 1 ? '' : 's'}`)
  }
  if (s.settingsUpdatedAt) {
    const when = new Date(s.settingsUpdatedAt)
    if (!Number.isNaN(when.getTime())) bits.push(`updated ${when.toLocaleString()}`)
  }
  return bits.join(' · ')
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="drive-data-root"
      role="dialog"
      aria-modal="true"
      aria-labelledby="drive-data-title"
    >
      <button type="button" class="backdrop" aria-label="Close" @click="emit('close')" />
      <div class="panel">
        <header class="head">
          <h2 id="drive-data-title">Your Google Drive</h2>
          <p class="lede">
            Stored in a private SingTags folder in
            {{ googleAuthState.email ? googleAuthState.email + '’s' : 'your' }} Google Account.
            This is not the rest of your Drive.
          </p>
        </header>

        <div class="body">
          <p v-if="loading" class="status" role="status">Checking your Google Drive…</p>
          <p v-else-if="error" class="warn" role="alert">{{ error }}</p>
          <template v-else-if="summary">
            <p class="total">
              App data stored
              <strong>{{ formatBytes(summary.totalBytes) }}</strong>
              <span class="meta">
                {{ summary.fileCount.toLocaleString() }} file{{ summary.fileCount === 1 ? '' : 's' }}
                in your private Drive folder
              </span>
            </p>
            <p v-if="isDriveCacheTransferActive()" class="status" role="status">
              A copy to Drive is still running. Sheet and track counts are the songs already listed,
              and that list is updated while the copy continues. Refresh to see the latest.
            </p>
            <p
              v-else-if="summary.catalogBytes > summary.objectBytes + 5 * 1024 * 1024"
              class="status"
              role="status"
            >
              The song list on Drive names {{ formatBytes(summary.catalogBytes) }}, but only
              {{ formatBytes(summary.objectBytes) }} of those song files are stored.
            </p>
            <ul class="rows">
              <li>
                <span class="label">Settings &amp; favorites</span>
                <span class="value">{{ settingsLine(summary) }}</span>
              </li>
              <li>
                <span class="label">Sheet music</span>
                <span class="value">{{ packLine(summary.sheets) }}</span>
              </li>
              <li>
                <span class="label">Learning tracks</span>
                <span class="value">{{ packLine(summary.audio) }}</span>
              </li>
              <li v-if="!summary.sheets.present && !summary.audio.present && summary.objectCount">
                <span class="label">Song files</span>
                <span class="value">
                  {{ summary.objectCount.toLocaleString() }} files · {{ formatBytes(summary.objectBytes) }}
                </span>
              </li>
            </ul>
          </template>

          <GoogleDrivePrivacyNote />
        </div>

        <footer class="actions">
          <button type="button" class="btn" :disabled="loading" @click="load">Refresh</button>
          <button type="button" class="btn btn-primary" @click="emit('close')">Close</button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.drive-data-root {
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
  max-height: min(36rem, 100%);
  display: flex;
  flex-direction: column;
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
.status {
  margin: 0;
  color: var(--muted);
  font-size: 0.92rem;
  line-height: 1.45;
}
.body {
  overflow: auto;
  display: grid;
  gap: 0.75rem;
  min-height: 0;
}
.total {
  margin: 0;
  font-size: 0.95rem;
  line-height: 1.4;
}
.total strong {
  margin-left: 0.35rem;
}
.meta {
  display: block;
  color: var(--muted);
  font-size: 0.82rem;
}
.rows {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.45rem;
}
.rows li {
  display: grid;
  gap: 0.1rem;
}
.label {
  font-size: 0.82rem;
  font-weight: 700;
}
.value {
  font-size: 0.84rem;
  color: var(--muted);
  line-height: 1.35;
}
.warn {
  margin: 0;
  padding: 0.5rem 0.6rem;
  border-radius: 8px;
  border: 1px solid color-mix(in srgb, var(--danger, #b33) 35%, var(--border));
  background: color-mix(in srgb, var(--danger, #b33) 10%, var(--surface));
  color: var(--text);
  font-size: 0.84rem;
  line-height: 1.4;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.5rem;
}
</style>
