<script setup lang="ts">
/**
 * Post-login song-cache offer: restore from Drive when present, else first-time sync.
 */
import { computed, onUnmounted, ref, watch } from 'vue'
import {
  applyDriveCacheOffer,
  probeDriveCachePresence,
  type DriveCachePresence,
} from '../lib/google/driveCacheSync'
import { OFFLINE_LOFI_AUDIO_BALLPARK_LABEL } from '../lib/offlineAudioBallpark'
import { formatBytes } from '../offline/storageEstimate'
import { useOfflineLibraryStore } from '../stores/offlineLibrary'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  close: []
  /** User saved cache prefs (including Skip → both off). */
  decided: [opts: { sheets: boolean; audio: boolean }]
}>()

const offlineLib = useOfflineLibraryStore()
const probing = ref(false)
const applying = ref(false)
const error = ref('')
const presence = ref<DriveCachePresence | null>(null)
/** Per-device opt-in — default off so a new login does not start a large download. */
const enableSheets = ref(false)
const enableAudio = ref(false)

const SHEETS_SIZE_CAP = 100 * 1024 * 1024

const sheetsSizeLabel = computed(() => {
  const bytes = offlineLib.sheetsTotalBytes
  if (bytes > 0 && bytes < SHEETS_SIZE_CAP) return formatBytes(bytes)
  return '<100 MB'
})

const sheetsDriveLabel = computed(() => {
  const p = presence.value?.sheets
  if (!p?.present) return null
  return `${p.files.toLocaleString()} files · ${formatBytes(p.bytes)} on Drive`
})

const audioDriveLabel = computed(() => {
  const p = presence.value?.audio
  if (!p?.present) return null
  return `${p.files.toLocaleString()} files · ${formatBytes(p.bytes)} on Drive`
})

const anyOnDrive = computed(
  () => !!(presence.value?.sheets.present || presence.value?.audio.present),
)

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape' && !applying.value && !probing.value) emit('close')
}

watch(
  () => props.open,
  async (open) => {
    if (!open) {
      window.removeEventListener('keydown', onKeydown)
      return
    }
    error.value = ''
    applying.value = false
    presence.value = null
    enableSheets.value = false
    enableAudio.value = false
    probing.value = true
    window.addEventListener('keydown', onKeydown)
    try {
      presence.value = await probeDriveCachePresence()
      // Stay off until the user opts in for this device.
      enableSheets.value = false
      enableAudio.value = false
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
      presence.value = {
        sheets: { present: false, files: 0, bytes: 0 },
        audio: { present: false, files: 0, bytes: 0 },
      }
    } finally {
      probing.value = false
    }
  },
  { immediate: true },
)

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
})

async function onContinue(): Promise<void> {
  if (applying.value || probing.value) return
  applying.value = true
  error.value = ''
  try {
    await applyDriveCacheOffer({
      sheets: enableSheets.value,
      audio: enableAudio.value,
      startLocalPacks: (kind) => offlineLib.startPack(kind),
    })
    emit('decided', { sheets: enableSheets.value, audio: enableAudio.value })
    emit('close')
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    applying.value = false
  }
}

async function onSkip(): Promise<void> {
  if (applying.value || probing.value) return
  applying.value = true
  try {
    await applyDriveCacheOffer({ sheets: false, audio: false })
    emit('decided', { sheets: false, audio: false })
    emit('close')
  } finally {
    applying.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="cache-offer-root"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cache-offer-title"
    >
      <button
        type="button"
        class="backdrop"
        aria-label="Close"
        :disabled="applying"
        @click="onSkip"
      />
      <div class="panel" tabindex="-1">
        <header class="head">
          <h2 id="cache-offer-title">Song cache on this device</h2>
          <p class="lede">
            <template v-if="probing">Checking your Google Drive…</template>
            <template v-else-if="anyOnDrive">
              Your Drive already has SingTags song files. Turn on a cache
              <strong>for this device only</strong> to restore them here (from Drive when
              possible, otherwise SingTags). Other devices keep their own choice.
            </template>
            <template v-else>
              Optionally download sheet music and learning tracks
              <strong>on this device</strong>. When you’re signed in, new files also sync to your
              Drive for other devices that opt in. Skip if you don’t need a local cache here.
            </template>
          </p>
        </header>

        <div class="body">
          <p v-if="probing" class="status" role="status">Looking for an existing cache…</p>

          <template v-else>
            <label class="cache-row">
              <input v-model="enableSheets" type="checkbox" class="cache-check" />
              <span class="cache-copy">
                <span class="cache-title">
                  {{
                    presence?.sheets.present
                      ? 'Enable local sheet music cache from your Drive'
                      : 'Enable local sheet music cache and sync'
                  }}
                </span>
                <span class="cache-meta">
                  <template v-if="presence?.sheets.present">
                    Already on Drive · {{ sheetsDriveLabel }}
                  </template>
                  <template v-else>{{ sheetsSizeLabel }} · download once, then sync to Drive</template>
                </span>
              </span>
            </label>

            <label class="cache-row">
              <input v-model="enableAudio" type="checkbox" class="cache-check" />
              <span class="cache-copy">
                <span class="cache-title">
                  {{
                    presence?.audio.present
                      ? 'Enable local track cache from your Drive'
                      : 'Enable local track cache and sync'
                  }}
                </span>
                <span class="cache-meta">
                  <template v-if="presence?.audio.present">
                    Already on Drive · {{ audioDriveLabel }}
                  </template>
                  <template v-else
                    >{{ OFFLINE_LOFI_AUDIO_BALLPARK_LABEL }} lo-fi · download once, then sync to
                    Drive</template
                  >
                </span>
              </span>
            </label>
          </template>

          <p v-if="error" class="warn" role="alert">{{ error }}</p>
        </div>

        <footer class="actions">
          <button
            type="button"
            class="btn"
            :disabled="applying || probing"
            @click="onSkip"
          >
            Not now
          </button>
          <button
            type="button"
            class="btn btn-primary"
            :disabled="applying || probing"
            :aria-busy="applying"
            @click="onContinue"
          >
            {{ applying ? 'Starting…' : 'Continue' }}
          </button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.cache-offer-root {
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
  display: grid;
  gap: 0.9rem;
  padding: 1.15rem 1.2rem 1.15rem;
  border-radius: var(--radius, 12px);
  border: 1px solid var(--border);
  background: var(--surface);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.2);
}
.head {
  display: grid;
  gap: 0.4rem;
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
  display: grid;
  gap: 0.55rem;
}
.status {
  margin: 0;
  color: var(--muted);
  font-size: 0.88rem;
}
.cache-row {
  display: flex;
  align-items: flex-start;
  gap: 0.55rem;
  margin: 0;
  padding: 0.55rem 0.65rem;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: color-mix(in srgb, var(--surface) 88%, var(--border));
  cursor: pointer;
  user-select: none;
}
.cache-check {
  margin-top: 0.2rem;
  flex: 0 0 auto;
  width: 1.05rem;
  height: 1.05rem;
  accent-color: var(--accent);
}
.cache-copy {
  display: grid;
  gap: 0.1rem;
  min-width: 0;
}
.cache-title {
  font-size: 0.88rem;
  font-weight: 650;
  color: var(--text);
  line-height: 1.35;
}
.cache-meta {
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
}
</style>
