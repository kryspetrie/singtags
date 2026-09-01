<script setup lang="ts">
/**
 * Tag share sheet: copy link, always-on QR, and fullscreen enlarge for stage sharing.
 */
import { computed, onUnmounted, ref, watch } from 'vue'
import FilterSheet from './FilterSheet.vue'
import { qrDataUrl } from '../lib/qr'
import { usePreferencesStore } from '../stores/preferences'
import { useSnackbarStore } from '../stores/snackbar'

const SHEET_QR_PX = 200
/** High-res source so CSS upscaling for stage stays sharp. */
const ENLARGE_QR_PX = 1024
const ENLARGE_SCALE_MIN = 1
const ENLARGE_SCALE_MAX = 6
const ENLARGE_SCALE_STEP = 0.5
/** Open enlarge at 2× the in-sheet QR size. */
const ENLARGE_SCALE_DEFAULT = 2

const props = defineProps<{
  open: boolean
  /** Absolute SingTags URL to share (already includes shift / fullscreen query). */
  url: string
  /** Public barbershoptags.com tag page for the same tag. */
  barbershopUrl?: string
  /** Tag title for native share. */
  title?: string
  /** When true, show “Transfer sheet” (peer QR data mode). */
  canTransferSheet?: boolean
}>()

const emit = defineEmits<{
  close: []
  'transfer-sheet': []
}>()

const prefs = usePreferencesStore()
const snackbar = useSnackbarStore()

const qrSrc = ref('')
const qrBusy = ref(false)
const qrError = ref<string | null>(null)
const enlargeOpen = ref(false)
const enlargeScale = ref(ENLARGE_SCALE_DEFAULT)
const enlargeSrc = ref('')
const enlargeBusy = ref(false)

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

const enlargeDisplayPx = computed(() => Math.round(SHEET_QR_PX * enlargeScale.value))

watch(
  () => props.open,
  (open) => {
    if (!open) {
      closeEnlarge()
      qrSrc.value = ''
      qrError.value = null
      qrBusy.value = false
      enlargeSrc.value = ''
    }
  },
)

watch(
  () => [props.open, activeUrl.value] as const,
  async ([open, url]) => {
    if (!open || !url) return
    qrBusy.value = true
    qrError.value = null
    enlargeSrc.value = ''
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

async function ensureEnlargeSrc(): Promise<void> {
  if (!activeUrl.value) return
  if (enlargeSrc.value) return
  enlargeBusy.value = true
  try {
    enlargeSrc.value = await qrDataUrl(activeUrl.value, ENLARGE_QR_PX)
  } catch {
    enlargeSrc.value = qrSrc.value
  } finally {
    enlargeBusy.value = false
  }
}

async function openEnlarge(): Promise<void> {
  if (!qrSrc.value && !qrBusy.value) return
  enlargeScale.value = ENLARGE_SCALE_DEFAULT
  enlargeOpen.value = true
  window.addEventListener('keydown', onEnlargeKey)
  await ensureEnlargeSrc()
}

function closeEnlarge(): void {
  if (!enlargeOpen.value) return
  enlargeOpen.value = false
  window.removeEventListener('keydown', onEnlargeKey)
}

function bumpEnlargeScale(delta: number): void {
  const next = Math.round((enlargeScale.value + delta) * 10) / 10
  enlargeScale.value = Math.min(ENLARGE_SCALE_MAX, Math.max(ENLARGE_SCALE_MIN, next))
}

function onEnlargeKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    e.preventDefault()
    e.stopPropagation()
    closeEnlarge()
    return
  }
  if (e.key === '+' || e.key === '=') {
    e.preventDefault()
    bumpEnlargeScale(ENLARGE_SCALE_STEP)
  } else if (e.key === '-' || e.key === '_') {
    e.preventDefault()
    bumpEnlargeScale(-ENLARGE_SCALE_STEP)
  }
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

onUnmounted(() => {
  window.removeEventListener('keydown', onEnlargeKey)
})
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

      <div v-if="canTransferSheet" class="transfer-block">
        <p class="transfer-hint">
          Offline peer copy: send the sheet image and tag info as a sequence of QR codes the other
          phone can scan.
        </p>
        <button
          type="button"
          class="btn"
          @click="emit('transfer-sheet')"
        >
          Transfer sheet via QR…
        </button>
      </div>
    </div>
  </FilterSheet>

  <Teleport to="body">
    <div
      v-if="enlargeOpen"
      class="qr-enlarge"
      role="dialog"
      aria-modal="true"
      aria-label="Enlarged QR code"
    >
      <button type="button" class="qr-enlarge-backdrop" aria-label="Close enlarged QR" @click="closeEnlarge" />

      <div class="qr-enlarge-chrome" role="toolbar" aria-label="QR size controls">
        <div class="qr-enlarge-shift" role="group" aria-label="QR size">
          <button
            type="button"
            class="chrome-btn"
            :disabled="enlargeScale <= ENLARGE_SCALE_MIN"
            aria-label="Make QR smaller"
            title="Smaller"
            @click="bumpEnlargeScale(-ENLARGE_SCALE_STEP)"
          >
            −
          </button>
          <button
            type="button"
            class="chrome-btn"
            :disabled="enlargeScale >= ENLARGE_SCALE_MAX"
            aria-label="Make QR larger"
            title="Larger"
            @click="bumpEnlargeScale(ENLARGE_SCALE_STEP)"
          >
            +
          </button>
        </div>
        <button
          type="button"
          class="chrome-btn exit"
          aria-label="Close enlarged QR"
          title="Close"
          @click="closeEnlarge"
        >
          ✕
        </button>
      </div>

      <div class="qr-enlarge-panel">
        <img
          v-if="enlargeSrc || qrSrc"
          class="qr-enlarge-img"
          :src="enlargeSrc || qrSrc"
          :width="enlargeDisplayPx"
          :height="enlargeDisplayPx"
          :style="{ width: `${enlargeDisplayPx}px`, height: `${enlargeDisplayPx}px` }"
          alt="Large QR code for this tag link"
        />
        <p v-else-if="enlargeBusy" class="qr-enlarge-status" role="status">Generating QR…</p>
      </div>
    </div>
  </Teleport>
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

.qr-enlarge {
  position: fixed;
  inset: 0;
  z-index: 120;
  display: grid;
  place-items: center;
  padding: max(0.75rem, env(safe-area-inset-top)) max(0.75rem, env(safe-area-inset-right))
    max(0.75rem, env(safe-area-inset-bottom)) max(0.75rem, env(safe-area-inset-left));
}
.qr-enlarge-backdrop {
  position: absolute;
  inset: 0;
  border: 0;
  padding: 0;
  margin: 0;
  background: rgba(0, 0, 0, 0.88);
  cursor: pointer;
}
.qr-enlarge-chrome {
  position: absolute;
  top: calc(0.5rem + env(safe-area-inset-top));
  right: calc(0.5rem + env(safe-area-inset-right));
  left: calc(0.5rem + env(safe-area-inset-left));
  z-index: 2;
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 0.45rem;
  pointer-events: none;
}
.qr-enlarge-shift {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  margin-right: auto;
  pointer-events: none;
}
.qr-enlarge-chrome > *,
.qr-enlarge-shift > * {
  pointer-events: auto;
}
.chrome-btn {
  box-sizing: border-box;
  min-height: 44px;
  min-width: 44px;
  padding: 0 0.85rem;
  border: 1px solid rgba(255, 255, 255, 0.28);
  border-radius: 12px;
  background: rgba(20, 20, 20, 0.38);
  color: #fff;
  font: inherit;
  font-size: 0.92rem;
  font-weight: 600;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  box-shadow: 0 1px 6px rgba(0, 0, 0, 0.25);
  cursor: pointer;
  touch-action: manipulation;
  user-select: none;
}
.chrome-btn:hover:not(:disabled) {
  background: rgba(40, 40, 40, 0.52);
}
.chrome-btn:disabled {
  opacity: 0.4;
  cursor: default;
}
.chrome-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.chrome-btn.exit {
  width: 44px;
  padding: 0;
  font-size: 1.25rem;
  font-weight: 500;
  margin-left: auto;
}
.qr-enlarge-panel {
  position: relative;
  z-index: 1;
  display: grid;
  justify-items: center;
  max-width: 100%;
  max-height: 100%;
  pointer-events: none;
}
.qr-enlarge-img {
  display: block;
  max-width: min(96vw, 96vh);
  max-height: min(96vw, 96vh);
  object-fit: contain;
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.45);
}
.qr-enlarge-status {
  margin: 0;
  color: #fff;
  font-size: 1rem;
}
</style>
