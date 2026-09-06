<script setup lang="ts">
/**
 * First-visit browse welcome: install PWA tip + optional background pack downloads.
 */
import { computed, ref, watch } from 'vue'
import { useOfflineLibraryStore } from '../stores/offlineLibrary'
import { useOnline } from '../composables/useOnline'
import { usePwaInstall } from '../composables/usePwaInstall'
import { formatBytes } from '../offline/storageEstimate'
import { OFFLINE_LOFI_AUDIO_BALLPARK_LABEL } from '../lib/offlineAudioBallpark'
import OfflineOpticalTransferPrompt from './OfflineOpticalTransferPrompt.vue'
import PwaInstallHowToDialog from './PwaInstallHowToDialog.vue'
import { usePreferencesStore } from '../stores/preferences'

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
const prefs = usePreferencesStore()
const { offline } = useOnline()
const { showInstallEntry, promptInstall } = usePwaInstall()
const howToOpen = ref(false)

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
  return '<100 MB'
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

const installBusy = ref(false)

async function onInstall(): Promise<void> {
  if (installBusy.value) return
  installBusy.value = true
  try {
    const outcome = await promptInstall()
    if (outcome === 'unavailable') howToOpen.value = true
  } finally {
    installBusy.value = false
  }
}

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
          <p class="lede">
            Weekly mirror of
            <a href="https://www.barbershoptags.com/" target="_blank" rel="noopener noreferrer"
              >barbershoptags.com</a
            >. Search &amp; sing here; ratings &amp; newest uploads stay on the official site.
          </p>
        </header>

        <div class="body">
          <div v-if="showInstallEntry" class="install-card">
            <div class="install-row">
              <div class="install-text">
                <p class="install-title">Install App on this device</p>
                <p class="install-hint">Install before downloading offline caches.</p>
              </div>
              <button
                type="button"
                class="btn-install-app"
                :disabled="installBusy"
                :aria-busy="installBusy"
                @click="onInstall"
              >
                Install App
              </button>
            </div>
          </div>
          <p v-else class="install-done muted-note" role="status">Installed — caches stay here.</p>

          <label v-if="!sheetsReady" class="toggle-row" :class="{ disabled: offline }">
            <input
              v-model="cacheSheetsNow"
              type="checkbox"
              class="toggle-input"
              :disabled="offline"
            />
            <span class="toggle-ui" aria-hidden="true" />
            <span class="toggle-copy">
              <span class="toggle-title">Sheet music cache</span>
              <span class="toggle-meta">Full library · {{ sheetsSizeLabel }} · background</span>
            </span>
          </label>
          <p v-else class="muted-note">Sheets already cached.</p>

          <label v-if="!audioReady" class="toggle-row" :class="{ disabled: offline }">
            <input
              v-model="cacheAudioNow"
              type="checkbox"
              class="toggle-input"
              :disabled="offline"
            />
            <span class="toggle-ui" aria-hidden="true" />
            <span class="toggle-copy">
              <span class="toggle-title">Lo-fi learning tracks</span>
              <span class="toggle-meta">{{ audioSizeLabel }} · 16k mono · background</span>
            </span>
          </label>
          <p v-else-if="!sheetsReady" class="muted-note">Lo-fi tracks already cached.</p>

          <p v-if="offline" class="warn" role="status">
            Offline — connect to download, or receive files below.
          </p>

          <p class="offline-note">
            Once sheets and tracks are cached, this site and app can be used entirely offline.
          </p>

          <OfflineOpticalTransferPrompt v-if="offline && prefs.opticalTransferEnabled" />
        </div>

        <footer class="actions">
          <button type="button" class="btn btn-primary" @click="onContinue">Continue</button>
          <button type="button" class="btn btn-ghost" @click="emit('close')">Skip</button>
        </footer>
      </div>
    </div>
    <PwaInstallHowToDialog :open="howToOpen" @close="howToOpen = false" />
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
  padding: 0.65rem;
  padding-bottom: calc(0.65rem + env(safe-area-inset-bottom));
}
.backdrop {
  position: absolute;
  inset: 0;
  border: 0;
  background: rgba(0, 0, 0, 0.4);
}
.panel {
  position: relative;
  width: min(100%, 26rem);
  max-height: min(92vh, 36rem);
  overflow: auto;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 0.85rem 0.9rem 0.75rem;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.18);
  display: grid;
  gap: 0.55rem;
  align-content: start;
}
.head {
  display: grid;
  gap: 0.15rem;
}
.eyebrow {
  margin: 0;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--accent);
}
.head h2 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.2rem;
  line-height: 1.15;
}
.lede {
  margin: 0.15rem 0 0;
  font-size: 0.86rem;
  line-height: 1.35;
  color: var(--text);
}
.lede a {
  color: var(--accent);
  font-weight: 600;
}
.body {
  display: grid;
  gap: 0.45rem;
  color: var(--text);
  font-size: 0.88rem;
  line-height: 1.35;
}
.body p {
  margin: 0;
}
.install-card {
  padding: 0.55rem 0.65rem;
  border-radius: 8px;
  border: 1px solid color-mix(in srgb, var(--accent) 45%, var(--border));
  background: color-mix(in srgb, var(--accent) 14%, var(--surface));
}
.install-row {
  display: flex;
  align-items: center;
  gap: 0.55rem;
}
.install-text {
  flex: 1 1 auto;
  min-width: 0;
  display: grid;
  gap: 0.1rem;
}
.install-title {
  margin: 0;
  font-weight: 750;
  font-size: 0.92rem;
  color: var(--accent-hover);
}
.install-hint {
  margin: 0;
  font-size: 0.78rem;
  line-height: 1.3;
  color: var(--muted);
}
.btn-install-app {
  flex: 0 0 auto;
  border: 1px solid color-mix(in srgb, var(--accent-hover) 40%, var(--accent));
  background: var(--accent);
  color: #fff;
  font: inherit;
  font-size: 0.85rem;
  font-weight: 750;
  padding: 0.5rem 0.7rem;
  border-radius: 8px;
  cursor: pointer;
  white-space: nowrap;
  box-shadow: 0 1px 0 color-mix(in srgb, var(--accent-hover) 55%, transparent);
}
.btn-install-app:hover {
  background: var(--accent-hover);
}
.btn-install-app:disabled {
  opacity: 0.65;
  cursor: wait;
}
.btn-install-app:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.install-done {
  margin: 0;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--accent-hover);
}
.toggle-row {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.55rem;
  align-items: center;
  padding: 0.55rem 0.65rem;
  border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--border));
  background: color-mix(in srgb, var(--accent) 8%, var(--surface));
  border-radius: 8px;
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
  width: 2.35rem;
  height: 1.3rem;
  border-radius: 999px;
  background: var(--border);
  position: relative;
  flex-shrink: 0;
  transition: background 0.15s ease;
}
.toggle-ui::after {
  content: '';
  position: absolute;
  top: 0.12rem;
  left: 0.12rem;
  width: 1.05rem;
  height: 1.05rem;
  border-radius: 50%;
  background: var(--surface);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
  transition: transform 0.15s ease;
}
.toggle-input:checked + .toggle-ui {
  background: var(--accent);
}
.toggle-input:checked + .toggle-ui::after {
  transform: translateX(1.05rem);
}
.toggle-input:focus-visible + .toggle-ui {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.toggle-copy {
  display: grid;
  gap: 0.05rem;
  min-width: 0;
}
.toggle-title {
  font-weight: 700;
  font-size: 0.9rem;
  line-height: 1.25;
}
.toggle-meta {
  color: var(--muted);
  font-size: 0.75rem;
  line-height: 1.3;
}
.muted-note {
  color: var(--muted);
  font-size: 0.8rem;
}
.offline-note {
  margin: 0;
  color: var(--muted);
  font-size: 0.8rem;
  line-height: 1.35;
}
.warn {
  color: var(--danger);
  font-size: 0.82rem;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  align-items: stretch;
  gap: 0.4rem;
  position: sticky;
  bottom: 0;
  background: linear-gradient(to top, var(--surface) 70%, transparent);
  padding-top: 0.35rem;
}
.actions .btn-primary {
  flex: 1 1 auto;
}
.actions .btn-ghost {
  flex: 0 0 auto;
}
</style>
