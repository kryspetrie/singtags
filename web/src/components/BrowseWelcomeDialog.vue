<script setup lang="ts">
/**
 * First-visit browse welcome: optional background download of sheets and lo-fi audio packs.
 */
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { useOfflineLibraryStore } from '../stores/offlineLibrary'
import { useOnline } from '../composables/useOnline'
import { formatBytes } from '../offline/storageEstimate'
import { OFFLINE_LOFI_AUDIO_BALLPARK_LABEL } from '../lib/offlineAudioBallpark'

const props = defineProps<{
  /** First-run splash visibility. */
  open: boolean
}>()

const emit = defineEmits<{
  close: []
  /** Continue from splash; toggles start background pack downloads. */
  continue: [opts: { cacheSheets: boolean; cacheAudio: boolean }]
}>()

const offlineLib = useOfflineLibraryStore()
const { offline } = useOnline()

const sheetsReady = computed(
  () => offlineLib.sheetsStatus === 'done' || offlineLib.sheetsCachedCount > 0,
)
const audioReady = computed(
  () => offlineLib.audioStatus === 'done' || offlineLib.audioCachedCount > 0,
)

/** Soft cap for welcome copy — actual pack is well under this. */
const SHEETS_SIZE_CAP = 100 * 1024 * 1024

const sheetsSizeLabel = computed(() => {
  const bytes = offlineLib.sheetsTotalBytes
  if (bytes > 0 && bytes < SHEETS_SIZE_CAP) return formatBytes(bytes)
  return 'under 100 MB'
})

const audioSizeLabel = OFFLINE_LOFI_AUDIO_BALLPARK_LABEL

/** Default on when packs aren't cached yet and we're online. */
const cacheSheetsNow = ref(true)
const cacheAudioNow = ref(false)

watch(
  () => props.open,
  (open) => {
    if (open) {
      cacheSheetsNow.value = !sheetsReady.value && !offline.value
      cacheAudioNow.value = !audioReady.value && !offline.value
    }
  },
)

const continueLabel = computed(() => {
  const sheet = cacheSheetsNow.value && !sheetsReady.value && !offline.value
  const audio = cacheAudioNow.value && !audioReady.value && !offline.value
  if (sheet && audio) return 'Continue & download sheets + audio'
  if (sheet) return 'Continue & download sheets'
  if (audio) return 'Continue & download lo-fi audio'
  return 'Continue'
})

function onContinue(): void {
  emit('continue', {
    cacheSheets: cacheSheetsNow.value && !sheetsReady.value && !offline.value,
    cacheAudio: cacheAudioNow.value && !audioReady.value && !offline.value,
  })
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="welcome-root"
      role="dialog"
      aria-modal="true"
      aria-labelledby="browse-welcome-title"
    >
      <button type="button" class="backdrop" aria-label="Close welcome" @click="emit('close')" />
      <div class="panel">
        <header class="head">
          <p class="eyebrow">Mirror site</p>
          <h2 id="browse-welcome-title">Welcome to SingTags</h2>
        </header>

        <div class="body">
          <p>
            SingTags is a <strong>mirror</strong> of the
            <a href="https://www.barbershoptags.com/" target="_blank" rel="noopener noreferrer"
              >barbershoptags.com</a
            >
            tag library, refreshed <strong>weekly</strong> from the official site. Search and practice
            here; for ratings, comments, and the newest uploads, use barbershoptags.com.
          </p>

          <label
            v-if="!sheetsReady"
            class="toggle-row"
            :class="{ disabled: offline }"
          >
            <input
              v-model="cacheSheetsNow"
              type="checkbox"
              class="toggle-input"
              :disabled="offline"
            />
            <span class="toggle-ui" aria-hidden="true" />
            <span class="toggle-copy">
              <span class="toggle-title">Download sheet music cache now</span>
              <span class="toggle-meta">
                Entire library · {{ sheetsSizeLabel }} (&lt; 100 MB) · runs in the background
              </span>
            </span>
          </label>
          <p v-else class="muted-note">
            Songbook sheets are already cached on this device. Manage offline media in Settings anytime.
          </p>

          <label
            v-if="!audioReady"
            class="toggle-row"
            :class="{ disabled: offline }"
          >
            <input
              v-model="cacheAudioNow"
              type="checkbox"
              class="toggle-input"
              :disabled="offline"
            />
            <span class="toggle-ui" aria-hidden="true" />
            <span class="toggle-copy">
              <span class="toggle-title">Download lo-fi learning tracks now</span>
              <span class="toggle-meta">
                Entire library · {{ audioSizeLabel }} · 16k mono solos (mix reconstructed in-app) ·
                runs in the background
              </span>
            </span>
          </label>
          <p v-else-if="!sheetsReady" class="muted-note">
            Lo-fi learning tracks are already cached. Star individual tags in Settings for original
            quality, or manage packs in Offline settings.
          </p>

          <p v-if="!audioReady && !sheetsReady" class="muted-note">
            You can also star tags as you browse to save higher-quality audio for just your practice
            set.
          </p>

          <p v-if="offline" class="warn" role="status">You are offline — connect to download media.</p>
        </div>

        <footer class="actions">
          <button type="button" class="btn btn-primary" @click="onContinue">
            {{ continueLabel }}
          </button>
          <RouterLink class="btn" to="/settings" @click="emit('close')">Offline settings</RouterLink>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.welcome-root {
  position: fixed;
  inset: 0;
  z-index: 55;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  padding-bottom: calc(1rem + env(safe-area-inset-bottom));
}
.backdrop {
  position: absolute;
  inset: 0;
  border: 0;
  background: rgba(0, 0, 0, 0.4);
}
.panel {
  position: relative;
  width: min(100%, 30rem);
  max-height: min(88vh, 40rem);
  overflow: auto;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1.15rem 1.2rem 1rem;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.18);
  display: grid;
  gap: 0.85rem;
}
.head {
  display: grid;
  gap: 0.25rem;
}
.eyebrow {
  margin: 0;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--accent);
}
.head h2 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.35rem;
  line-height: 1.2;
}
.body {
  display: grid;
  gap: 0.75rem;
  color: var(--text);
  font-size: 0.95rem;
  line-height: 1.5;
}
.body p {
  margin: 0;
}
.toggle-row {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.75rem;
  align-items: start;
  padding: 0.85rem 0.9rem;
  border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--border));
  background: color-mix(in srgb, var(--accent) 8%, var(--surface));
  border-radius: var(--radius);
  cursor: pointer;
  user-select: none;
}
.toggle-row.disabled {
  opacity: 0.65;
  cursor: not-allowed;
}
.toggle-input {
  position: absolute;
  opacity: 0;
  width: 1px;
  height: 1px;
  pointer-events: none;
}
.toggle-ui {
  width: 2.6rem;
  height: 1.45rem;
  margin-top: 0.15rem;
  border-radius: 999px;
  background: var(--border);
  position: relative;
  flex-shrink: 0;
  transition: background 0.15s ease;
}
.toggle-ui::after {
  content: '';
  position: absolute;
  top: 0.15rem;
  left: 0.15rem;
  width: 1.15rem;
  height: 1.15rem;
  border-radius: 50%;
  background: var(--surface);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
  transition: transform 0.15s ease;
}
.toggle-input:checked + .toggle-ui {
  background: var(--accent);
}
.toggle-input:checked + .toggle-ui::after {
  transform: translateX(1.15rem);
}
.toggle-input:focus-visible + .toggle-ui {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.toggle-copy {
  display: grid;
  gap: 0.2rem;
  min-width: 0;
}
.toggle-title {
  font-weight: 700;
  font-size: 0.98rem;
  line-height: 1.3;
}
.toggle-meta {
  color: var(--muted);
  font-size: 0.88rem;
  line-height: 1.35;
}
.muted-note {
  color: var(--muted);
  font-size: 0.9rem;
}
.body a {
  color: var(--accent);
  font-weight: 600;
}
.warn {
  color: var(--danger);
  font-size: 0.9rem;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  padding-top: 0.15rem;
}
.actions .btn-primary {
  flex: 1 1 100%;
}
</style>
