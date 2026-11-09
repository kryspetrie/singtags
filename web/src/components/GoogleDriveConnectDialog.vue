<script setup lang="ts">
/**
 * Google Drive connect prompt — privacy & storage always visible in a scroll pane.
 * Song-cache choices happen in {@link GoogleDriveCacheOfferDialog} after login.
 */
import { computed, onUnmounted, ref, watch } from 'vue'
import {
  DRIVE_APP_STATE_BALLPARK,
  DRIVE_CACHE_MIRROR_SOFT_CAP,
  DRIVE_MY_LIBRARY_BALLPARK,
  DRIVE_TAG_STUDIO_BALLPARK,
} from '../lib/google/driveStorageEstimates'
import {
  googleAuthState,
  isGoogleConfigured,
  setDriveSyncEnabled,
  signIn,
} from '../lib/google/googleAuth'
import { ensureDriveHydrate } from '../lib/google/driveAppStateSync'
import { OFFLINE_LOFI_AUDIO_BALLPARK_LABEL } from '../lib/offlineAudioBallpark'
import { formatBytes } from '../offline/storageEstimate'
import { useOfflineLibraryStore } from '../stores/offlineLibrary'
import { useSnackbarStore } from '../stores/snackbar'
import GoogleDrivePrivacyNote from './GoogleDrivePrivacyNote.vue'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  close: []
  /** Fired after a successful Connect + app-state hydrate (cache offer comes next). */
  connected: []
}>()

const offlineLib = useOfflineLibraryStore()
const snackbar = useSnackbarStore()
const configured = isGoogleConfigured()
const connecting = ref(false)

const SHEETS_SIZE_CAP = 100 * 1024 * 1024

const sheetsSizeLabel = computed(() => {
  const bytes = offlineLib.sheetsTotalBytes
  if (bytes > 0 && bytes < SHEETS_SIZE_CAP) return formatBytes(bytes)
  return '<100 MB'
})

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape' && !connecting.value) emit('close')
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      connecting.value = false
      googleAuthState.error = ''
      window.addEventListener('keydown', onKeydown)
      return
    }
    window.removeEventListener('keydown', onKeydown)
  },
)

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
})

function onCancel(): void {
  if (connecting.value) return
  emit('close')
}

function onConnect(): void {
  if (!configured || connecting.value) return
  connecting.value = true
  googleAuthState.error = ''
  setDriveSyncEnabled(true)
  // Close now — Google’s popup and the snackbar carry the rest of the status.
  emit('close')
  snackbar.show('Approve Google in the popup to finish signing in.', {
    title: 'Connecting',
    tone: 'ok',
    ms: 4000,
  })
  void (async () => {
    try {
      await signIn()
      await ensureDriveHydrate({ allowTokenPrompt: true })
      emit('connected')
    } catch {
      snackbar.show(googleAuthState.error || 'Google sign-in failed.', {
        title: 'Google Drive',
        tone: 'error',
        ms: 7000,
      })
    } finally {
      connecting.value = false
    }
  })()
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="drive-connect-root"
      role="dialog"
      aria-modal="true"
      aria-labelledby="drive-connect-title"
    >
      <button
        type="button"
        class="backdrop"
        aria-label="Cancel"
        :disabled="connecting"
        @click="onCancel"
      />
      <div class="panel" tabindex="-1">
        <header class="head">
          <h2 id="drive-connect-title">Sync across your devices</h2>
          <p class="lede">
            Connect Google so your favorites and settings follow you — stored in
            <strong>your</strong> Drive, not on SingTags.
          </p>
        </header>

        <div class="body">
          <p class="warn beta-note" role="note">
            Beta: your email <strong>must</strong> be configured by Krys as a test user, or Connect
            will not work. Ask Krys to add you before continuing.
          </p>

          <ul class="highlights">
            <li>Pick up where you left off on phone, tablet, or computer</li>
            <li>SingTags keeps no account and no copy of your data</li>
            <li>You can disconnect anytime</li>
          </ul>

          <p class="syncs">
            Syncs favorites, settings, Tag Studio, My Library, recordings, and Tag Roulette.
            <span class="syncs-soon">Tag Studio &amp; My Library coming soon.</span>
          </p>

          <p class="cache-teaser">
            After you connect, we’ll check your Drive for an existing song cache and ask whether to
            enable sheets and tracks on this device.
          </p>

          <GoogleDrivePrivacyNote />

          <section class="info-block" aria-labelledby="drive-space-heading">
            <h3 id="drive-space-heading">Drive space used</h3>
            <p>
              Settings backup is tiny ({{ DRIVE_APP_STATE_BALLPARK }}). Optional song cache uses
              your Drive quota ({{ DRIVE_CACHE_MIRROR_SOFT_CAP }}).
            </p>
            <ul class="sizes">
              <li>
                <span class="size-label">Settings &amp; favorites</span>
                <span class="size-meta">{{ DRIVE_APP_STATE_BALLPARK }}</span>
              </li>
              <li>
                <span class="size-label">Tag Studio</span>
                <span class="size-meta">{{ DRIVE_TAG_STUDIO_BALLPARK }} · coming soon</span>
              </li>
              <li>
                <span class="size-label">My Library</span>
                <span class="size-meta">{{ DRIVE_MY_LIBRARY_BALLPARK }} · coming soon</span>
              </li>
              <li>
                <span class="size-label">Sheet music cache</span>
                <span class="size-meta">{{ sheetsSizeLabel }} when enabled</span>
              </li>
              <li>
                <span class="size-label">Track cache</span>
                <span class="size-meta"
                  >{{ OFFLINE_LOFI_AUDIO_BALLPARK_LABEL }} when enabled</span
                >
              </li>
            </ul>
          </section>

          <p v-if="!configured" class="warn" role="alert">
            Google sign-in is not configured in this build.
          </p>
          <p v-else-if="googleAuthState.error" class="warn" role="alert">
            {{ googleAuthState.error }}
          </p>
        </div>

        <footer class="actions">
          <button type="button" class="btn" :disabled="connecting" @click="onCancel">Cancel</button>
          <button
            type="button"
            class="btn btn-primary"
            :disabled="!configured || connecting"
            :aria-busy="connecting"
            @click="onConnect"
          >
            {{ connecting ? 'Connecting…' : 'Connect' }}
          </button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.drive-connect-root {
  position: fixed;
  inset: 0;
  z-index: 115;
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
.backdrop:disabled {
  cursor: wait;
}
.panel {
  position: relative;
  z-index: 1;
  width: min(34rem, 100%);
  max-height: min(88vh, 40rem);
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  gap: 0.85rem;
  padding: 1.15rem 1.2rem 1.15rem;
  border-radius: var(--radius, 12px);
  border: 1px solid var(--border);
  background: var(--surface);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.2);
  overflow: hidden;
}
.head {
  display: grid;
  gap: 0.4rem;
  flex: 0 0 auto;
}
.head h2 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.22rem;
  line-height: 1.25;
}
.lede {
  margin: 0;
  color: var(--muted);
  font-size: 0.92rem;
  line-height: 1.45;
}
.body {
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  display: grid;
  gap: 0.7rem;
  min-height: 0;
  padding-right: 0.15rem;
}
.highlights {
  margin: 0;
  padding-left: 1.15rem;
  display: grid;
  gap: 0.35rem;
  color: var(--text);
  font-size: 0.9rem;
  line-height: 1.4;
}
.syncs {
  margin: 0;
  padding-top: 0.65rem;
  border-top: 1px solid var(--border);
  color: var(--text);
  font-size: 0.88rem;
  font-weight: 650;
  line-height: 1.4;
}
.syncs-soon {
  display: inline;
  font-weight: 500;
  color: var(--muted);
}
.cache-teaser {
  margin: 0;
  font-size: 0.84rem;
  color: var(--muted);
  line-height: 1.4;
}
.info-block {
  display: grid;
  gap: 0.4rem;
  margin: 0;
  padding: 0.65rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: color-mix(in srgb, var(--surface) 90%, var(--border));
}
.info-block h3 {
  margin: 0;
  font-size: 0.86rem;
  font-weight: 700;
  color: var(--text);
  line-height: 1.3;
}
.info-block p {
  margin: 0;
  color: var(--muted);
  font-size: 0.82rem;
  line-height: 1.45;
}
.sizes {
  list-style: none;
  margin: 0.15rem 0 0;
  padding: 0;
  display: grid;
  gap: 0.35rem;
}
.sizes li {
  display: grid;
  gap: 0.05rem;
}
.size-label {
  font-size: 0.8rem;
  font-weight: 650;
  color: var(--text);
}
.size-meta {
  font-size: 0.76rem;
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
  flex: 0 0 auto;
  padding-top: 0.15rem;
  border-top: 1px solid var(--border);
}
</style>
