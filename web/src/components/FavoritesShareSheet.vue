<script setup lang="ts">
/**
 * Share a favorites list: copy link, QR, and fullscreen enlarge for stage sharing.
 */
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { navigateToOpticalTransfer } from '../lib/decimen/opticalTransferNav'
import FilterSheet from './FilterSheet.vue'
import QrEnlargeOverlay from './QrEnlargeOverlay.vue'
import TransferButtonLabel from './TransferButtonLabel.vue'
import { qrDataUrl } from '../lib/qr'
import { useSnackbarStore } from '../stores/snackbar'

const SHARE_URL_WARN_LEN = 2000
const SHEET_QR_PX = 200

const props = defineProps<{
  open: boolean
  url: string
  tagCount: number
  tagIds: number[]
  collectionId?: string | null
  title?: string
}>()

const emit = defineEmits<{
  close: []
}>()

const snackbar = useSnackbarStore()
const router = useRouter()

const qrSrc = ref('')
const qrBusy = ref(false)
const qrError = ref<string | null>(null)
const enlargeOpen = ref(false)

const shareUrlTooLong = computed(() => props.url.length > SHARE_URL_WARN_LEN)
const canNativeShare = computed(
  () => typeof navigator !== 'undefined' && typeof navigator.share === 'function',
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
  () => [props.open, props.url] as const,
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
    await navigator.clipboard.writeText(props.url)
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
      title: props.title || 'SingTags favorites',
      url: props.url,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return
    snackbar.show('Could not open the device share menu.', { tone: 'error' })
  }
}

function transferOptically(): void {
  if (!props.tagIds.length && !props.collectionId) return
  emit('close')
  navigateToOpticalTransfer(router, {
    tagIds: props.tagIds,
    name: props.title,
    collectionId: props.collectionId ?? undefined,
  })
}
</script>

<template>
  <FilterSheet :open="open" title="Share favorites" full-screen @close="emit('close')">
    <div class="share-panel">
      <p class="hint">
        Anyone with this link can review and add these {{ tagCount }} tags to their favorites.
        Enlarge the QR to hold up from the stage. For offline sheet transfer between devices, use
        optical transfer instead of the link.
      </p>

      <label class="url-lbl" for="favorites-share-url">Share link</label>
      <input
        id="favorites-share-url"
        class="url-input"
        :value="url"
        readonly
        @focus="selectShareUrl"
      />
      <p v-if="shareUrlTooLong" class="share-warn" role="status">
        This link is very long ({{ url.length }} chars) and may fail in SMS or some QR scanners.
        Prefer Copy link or Share… on the same network.
      </p>

      <div class="qr-block">
        <img
          v-if="qrSrc"
          class="share-qr"
          :src="qrSrc"
          :width="SHEET_QR_PX"
          :height="SHEET_QR_PX"
          alt="QR code for this favorites share link"
        />
        <p v-else-if="qrBusy" class="muted" role="status">Generating QR…</p>
        <p v-else-if="qrError" class="err" role="alert">{{ qrError }}</p>
      </div>

      <div class="share-actions">
        <button type="button" class="btn btn-primary" @click="copyLink">Copy link</button>
        <button
          type="button"
          class="btn"
          aria-label="Transfer optically"
          :disabled="!tagIds.length"
          @click="transferOptically"
        >
          <TransferButtonLabel />
        </button>
        <button type="button" class="btn" :disabled="!qrSrc || qrBusy" @click="openEnlarge">
          Enlarge QR
        </button>
        <button v-if="canNativeShare" type="button" class="btn" @click="nativeShare">
          Share…
        </button>
      </div>
    </div>
  </FilterSheet>

  <QrEnlargeOverlay
    :open="enlargeOpen"
    :url="url"
    :preview-src="qrSrc"
    alt="Large QR code for this favorites share link"
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
  line-height: 1.45;
}
.err {
  margin: 0;
  color: var(--danger);
  font-size: 0.9rem;
}
.share-warn {
  margin: 0;
  font-size: 0.85rem;
  color: var(--muted, #666);
  line-height: 1.4;
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
@media (max-width: 767px) {
  .share-panel {
    gap: 0.6rem;
  }
  .hint {
    font-size: 0.85rem;
    line-height: 1.4;
  }
  .share-qr {
    width: min(180px, 38vw);
  }
  .share-actions {
    gap: 0.45rem;
  }
  .share-actions .btn {
    flex: 1 1 calc(50% - 0.25rem);
    min-width: 0;
  }
}
</style>
