<script setup lang="ts">
/**
 * Tag share sheet: copy link, always-on QR, and fullscreen enlarge for stage sharing.
 */
import { computed, ref, watch } from 'vue'
import FilterSheet from './FilterSheet.vue'
import QrEnlargeOverlay from './QrEnlargeOverlay.vue'
import TransferButtonLabel from './TransferButtonLabel.vue'
import { qrDataUrl } from '../lib/qr'
import { usePreferencesStore } from '../stores/preferences'
import { useSnackbarStore } from '../stores/snackbar'

const SHEET_QR_PX = 200

const props = defineProps<{
  open: boolean
  /** Absolute SingTags URL to share (already includes shift / fullscreen query). */
  url: string
  /** Public barbershoptags.com tag page for the same tag. */
  barbershopUrl?: string
  /** Tag title for native share. */
  title?: string
  /** When true, show optical transfer for the sheet. */
  canOpticalTransfer?: boolean
}>()

const emit = defineEmits<{
  close: []
  'optical-transfer': []
}>()

const prefs = usePreferencesStore()
const snackbar = useSnackbarStore()

const qrSrc = ref('')
const qrBusy = ref(false)
const qrError = ref<string | null>(null)
const enlargeOpen = ref(false)

const canNativeShare = computed(
  () => typeof navigator !== 'undefined' && typeof navigator.share === 'function',
)

const useBarbershopLink = computed({
  get: () => Boolean(prefs.shareBarbershopTags && props.barbershopUrl),
  set: (on: boolean) => prefs.setShareBarbershopTags(on),
})

/** SingTags links may carry shift/detune — barbershoptags.com cannot. */
function urlHasPitchSession(url: string): boolean {
  try {
    const u = new URL(url)
    return u.searchParams.has('shift') || u.searchParams.has('detune')
  } catch {
    return false
  }
}

/**
 * Active link + QR target based on the origin toggle.
 * Pitch session query forces the SingTags URL so scanners match key / fine detune.
 */
const activeUrl = computed(() => {
  if (useBarbershopLink.value && props.barbershopUrl && !urlHasPitchSession(props.url)) {
    return props.barbershopUrl
  }
  return props.url
})

const pitchSessionForcesSingTags = computed(
  () => useBarbershopLink.value && urlHasPitchSession(props.url),
)

watch(
  () => props.open,
  (open) => {
    if (!open) {
      enlargeOpen.value = false
      qrSrc.value = ''
      qrError.value = null
      qrBusy.value = false
    }
  },
)

watch(
  () => [props.open, activeUrl.value] as const,
  async ([open, url]) => {
    if (!open || !url) return
    qrBusy.value = true
    qrError.value = null
    try {
      qrSrc.value = await qrDataUrl(url, SHEET_QR_PX)
    } catch {
      qrSrc.value = ''
      qrError.value = 'Could not generate a QR code.'
    } finally {
      qrBusy.value = false
    }
  },
  { immediate: true },
)

function selectShareUrl(event: Event): void {
  const input = event.target as HTMLInputElement
  input.select()
}

async function copyLink(): Promise<void> {
  try {
    await navigator.clipboard.writeText(activeUrl.value)
    snackbar.show('Link copied', { tone: 'ok', ms: 3000 })
  } catch {
    snackbar.show('Could not copy — select the link and copy it manually.', {
      tone: 'error',
    })
  }
}

function openEnlarge(): void {
  if (!qrSrc.value && !qrBusy.value) return
  enlargeOpen.value = true
}

async function nativeShare(): Promise<void> {
  if (!navigator.share) return
  try {
    await navigator.share({
      title: props.title || 'SingTags',
      text: props.title || 'SingTags',
      url: activeUrl.value,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return
    snackbar.show('Could not open the device share menu.', { tone: 'error' })
  }
}
</script>

<template>
  <FilterSheet :open="open" title="Share tag" elevated @close="emit('close')">
    <div class="share-panel">
      <p class="hint">
        Copy a link or show the QR so someone else can open this tag. Enlarge the QR to hold up from
        the stage.
      </p>

      <div class="share-toggles">
        <label
          v-if="barbershopUrl"
          class="setting-row"
          :class="{ on: useBarbershopLink }"
          title="Share the original barbershoptags.com page instead of a SingTags link"
        >
          <span class="setting-copy">
            <span class="setting-title">barbershoptags.com</span>
            <span class="setting-desc">
              <template v-if="pitchSessionForcesSingTags">
                Pitch shift / detune needs a SingTags link — using SingTags for this share
              </template>
              <template v-else>Share the original tag page instead of SingTags</template>
            </span>
          </span>
          <input
            type="checkbox"
            class="setting-switch"
            role="switch"
            :checked="useBarbershopLink"
            :aria-checked="useBarbershopLink"
            aria-label="Link to barbershoptags.com"
            @change="useBarbershopLink = ($event.target as HTMLInputElement).checked"
          />
        </label>

        <label
          v-if="!useBarbershopLink"
          class="setting-row"
          :class="{ on: prefs.shareFullscreen }"
          title="When on, the SingTags link opens the sheet fullscreen"
        >
          <span class="setting-copy">
            <span class="setting-title">Fullscreen</span>
            <span class="setting-desc">Open the shared link in sheet fullscreen</span>
          </span>
          <input
            type="checkbox"
            class="setting-switch"
            role="switch"
            :checked="prefs.shareFullscreen"
            :aria-checked="prefs.shareFullscreen"
            aria-label="Open fullscreen sheet"
            @change="prefs.setShareFullscreen(($event.target as HTMLInputElement).checked)"
          />
        </label>
      </div>

      <label class="url-lbl" for="tag-share-url">Link</label>
      <input
        id="tag-share-url"
        class="url-input"
        :value="activeUrl"
        readonly
        @focus="selectShareUrl"
      />

      <div class="qr-block">
        <img
          v-if="qrSrc"
          class="share-qr"
          :src="qrSrc"
          :width="SHEET_QR_PX"
          :height="SHEET_QR_PX"
          alt="QR code for this tag link"
        />
        <p v-else-if="qrBusy" class="muted" role="status">Generating QR…</p>
        <p v-else-if="qrError" class="err" role="alert">{{ qrError }}</p>
      </div>

      <div class="share-actions">
        <button type="button" class="btn btn-primary" @click="copyLink">Copy link</button>
        <button
          type="button"
          class="btn"
          :disabled="!qrSrc || qrBusy"
          @click="openEnlarge"
        >
          Enlarge QR
        </button>
        <button v-if="canNativeShare" type="button" class="btn" @click="nativeShare">
          Share…
        </button>
      </div>

      <div v-if="canOpticalTransfer" class="transfer-block">
        <p class="transfer-hint">
          Offline peer copy: stream the sheet and tag info as an animated QR code the other phone
          can scan.
        </p>
        <button
          type="button"
          class="btn"
          aria-label="Transfer optically"
          @click="emit('optical-transfer')"
        >
          <TransferButtonLabel />
        </button>
      </div>
    </div>
  </FilterSheet>

  <QrEnlargeOverlay
    :open="enlargeOpen"
    :url="activeUrl"
    :preview-src="qrSrc"
    alt="Large QR code for this tag link"
    @close="enlargeOpen = false"
  />
</template>

<style scoped>
.share-panel {
  display: grid;
  gap: 0.75rem;
}
.hint,
.muted {
  margin: 0;
  color: var(--muted);
  font-size: 0.9rem;
}
.err {
  margin: 0;
  color: var(--danger);
  font-size: 0.9rem;
}
.share-toggles {
  display: grid;
  gap: 0.55rem;
}
.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin: 0;
  padding: 0.55rem 0.65rem;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--surface);
  cursor: pointer;
  user-select: none;
}
.setting-row.on .setting-title {
  color: var(--accent-hover);
}
.setting-copy {
  display: grid;
  gap: 0.1rem;
  min-width: 0;
}
.setting-title {
  font-size: 0.92rem;
  font-weight: 650;
  color: var(--text);
}
.setting-desc {
  font-size: 0.78rem;
  color: var(--muted);
  line-height: 1.35;
}
.setting-switch {
  appearance: none;
  position: relative;
  flex: 0 0 auto;
  width: 2.6rem;
  height: 1.45rem;
  margin: 0;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: color-mix(in srgb, var(--border) 55%, var(--surface));
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
}
.setting-switch::after {
  content: '';
  position: absolute;
  top: 1px;
  left: 1px;
  width: calc(1.45rem - 4px);
  height: calc(1.45rem - 4px);
  border-radius: 50%;
  background: var(--surface);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
  transition: transform 0.15s ease;
}
.setting-switch:checked {
  background: var(--accent);
  border-color: var(--accent);
}
.setting-switch:checked::after {
  transform: translateX(1.15rem);
}
.setting-switch:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.url-lbl {
  font-size: 0.85rem;
  font-weight: 600;
}
.url-input {
  box-sizing: border-box;
  width: 100%;
  padding: 0.6rem 0.7rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 16px;
}
.qr-block {
  display: grid;
  justify-items: center;
  gap: 0.35rem;
}
.share-qr {
  width: 200px;
  max-width: 100%;
  height: auto;
  border-radius: 6px;
  background: #fff;
}
.share-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
}
.transfer-block {
  display: grid;
  gap: 0.45rem;
  padding-top: 0.45rem;
  border-top: 1px solid var(--border);
}
.transfer-hint {
  margin: 0;
  font-size: 0.82rem;
  color: var(--muted);
  line-height: 1.35;
}
</style>
