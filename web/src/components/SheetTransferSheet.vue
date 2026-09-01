<script setup lang="ts">
/**
 * Sender UI: encode sheet + metadata into multi-frame STX1 QR codes.
 * Shows required frame count and warns when more than 4 frames are needed.
 */
import { computed, onUnmounted, ref, watch } from 'vue'
import FilterSheet from './FilterSheet.vue'
import {
  SHEET_QR_WARN_FRAME_COUNT,
  buildSheetTransfer,
  encodeSheetImageForTransfer,
  sheetTransferQrDataUrls,
  type SheetTransferMeta,
} from '../lib/sheetQrTransfer'

const props = defineProps<{
  open: boolean
  /** Image URL or blob URL for the sheet page to transfer. */
  imageUrl: string | null
  meta: SheetTransferMeta | null
}>()

const emit = defineEmits<{
  close: []
}>()

const busy = ref(false)
const error = ref<string | null>(null)
const frameCount = ref(0)
const warnOverBudget = ref(false)
const packageBytes = ref(0)
const qrUrls = ref<string[]>([])
const frameIndex = ref(0)
const enlargeOpen = ref(false)

const currentQr = computed(() => qrUrls.value[frameIndex.value] || '')

watch(
  () => props.open,
  (open) => {
    if (!open) {
      busy.value = false
      error.value = null
      frameCount.value = 0
      warnOverBudget.value = false
      packageBytes.value = 0
      qrUrls.value = []
      frameIndex.value = 0
      enlargeOpen.value = false
      return
    }
    void prepare()
  },
)

onUnmounted(() => {
  enlargeOpen.value = false
})

async function prepare(): Promise<void> {
  if (!props.imageUrl || !props.meta) {
    error.value = 'No sheet image available to transfer.'
    return
  }
  busy.value = true
  error.value = null
  qrUrls.value = []
  frameIndex.value = 0
  try {
    const res = await fetch(props.imageUrl)
    if (!res.ok) throw new Error('Could not load sheet image')
    const blob = await res.blob()
    const encoded = await encodeSheetImageForTransfer(blob, { maxWidth: 800 })
    const meta: SheetTransferMeta = {
      ...props.meta,
      mime: encoded.mime,
      width: encoded.width,
      height: encoded.height,
    }
    const built = buildSheetTransfer(meta, encoded.bytes)
    frameCount.value = built.frameCount
    warnOverBudget.value = built.warnOverBudget
    packageBytes.value = built.packageBytes
    qrUrls.value = await sheetTransferQrDataUrls(built.frames, 512)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Could not build transfer QR codes.'
  } finally {
    busy.value = false
  }
}

function prevFrame(): void {
  if (frameIndex.value > 0) frameIndex.value -= 1
}

function nextFrame(): void {
  if (frameIndex.value < qrUrls.value.length - 1) frameIndex.value += 1
}

function onEnlargeKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    e.preventDefault()
    enlargeOpen.value = false
    return
  }
  if (e.key === 'ArrowLeft') {
    e.preventDefault()
    prevFrame()
  } else if (e.key === 'ArrowRight') {
    e.preventDefault()
    nextFrame()
  }
}

watch(enlargeOpen, (open) => {
  if (open) window.addEventListener('keydown', onEnlargeKey)
  else window.removeEventListener('keydown', onEnlargeKey)
})
</script>

<template>
  <FilterSheet :open="open" title="Transfer sheet" elevated @close="emit('close')">
    <div class="panel">
      <p class="hint">
        Show these QR codes to another phone’s camera to copy this sheet and tag info — no shared
        cache or network required.
      </p>

      <p v-if="busy" class="status" role="status">Preparing transfer…</p>
      <p v-else-if="error" class="err" role="alert">{{ error }}</p>

      <template v-else-if="frameCount">
        <p class="count" role="status">
          Needs <strong>{{ frameCount }}</strong> QR
          {{ frameCount === 1 ? 'code' : 'codes' }}
          <span class="muted">({{ Math.round(packageBytes / 1024) }} KB packed)</span>
        </p>
        <p v-if="warnOverBudget" class="warn" role="status">
          Warning: more than {{ SHEET_QR_WARN_FRAME_COUNT }} codes — scanning will take longer. Hold
          steady and step through each frame.
        </p>

        <div v-if="currentQr" class="qr-wrap">
          <img class="qr" :src="currentQr" alt="Sheet transfer QR frame" />
          <p class="frame-ind" aria-live="polite">
            Frame {{ frameIndex + 1 }} / {{ frameCount }}
          </p>
        </div>

        <div class="pager" role="group" aria-label="Transfer QR frames">
          <button type="button" class="btn" :disabled="frameIndex <= 0" @click="prevFrame">
            ← Prev
          </button>
          <button type="button" class="btn" :disabled="!currentQr" @click="enlargeOpen = true">
            Enlarge
          </button>
          <button
            type="button"
            class="btn"
            :disabled="frameIndex >= frameCount - 1"
            @click="nextFrame"
          >
            Next →
          </button>
        </div>
      </template>
    </div>
  </FilterSheet>

  <Teleport to="body">
    <div
      v-if="enlargeOpen && currentQr"
      class="enlarge"
      role="dialog"
      aria-modal="true"
      aria-label="Enlarged transfer QR"
    >
      <div class="enlarge-chrome">
        <button type="button" class="btn" :disabled="frameIndex <= 0" @click="prevFrame">←</button>
        <span class="enlarge-ind">{{ frameIndex + 1 }} / {{ frameCount }}</span>
        <button
          type="button"
          class="btn"
          :disabled="frameIndex >= frameCount - 1"
          @click="nextFrame"
        >
          →
        </button>
        <button type="button" class="btn exit" aria-label="Close enlarged QR" @click="enlargeOpen = false">
          ✕
        </button>
      </div>
      <img class="enlarge-qr" :src="currentQr" alt="" />
    </div>
  </Teleport>
</template>

<style scoped>
.panel {
  display: grid;
  gap: 0.75rem;
}
.hint,
.status,
.count,
.warn,
.err,
.muted,
.frame-ind {
  margin: 0;
  font-size: 0.92rem;
}
.hint,
.muted {
  color: var(--muted);
}
.err {
  color: var(--danger, #b00020);
}
.warn {
  padding: 0.55rem 0.7rem;
  border-radius: 8px;
  border: 1px solid color-mix(in srgb, #c47a00 45%, var(--border));
  background: color-mix(in srgb, #c47a00 12%, var(--surface));
  color: inherit;
}
.qr-wrap {
  display: grid;
  justify-items: center;
  gap: 0.35rem;
}
.qr {
  width: min(100%, 280px);
  height: auto;
  border-radius: 8px;
  background: #fff;
}
.pager {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  justify-content: center;
}
.btn {
  min-height: 40px;
  padding: 0.35rem 0.75rem;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--surface);
  font: inherit;
}
.btn:disabled {
  opacity: 0.45;
}
.enlarge {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  grid-template-rows: auto 1fr;
  background: #111;
  color: #fff;
}
.enlarge-chrome {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.65rem 0.75rem;
  padding-top: calc(0.65rem + env(safe-area-inset-top));
}
.enlarge-ind {
  flex: 1;
  text-align: center;
  font-variant-numeric: tabular-nums;
}
.enlarge .btn {
  background: #222;
  color: #fff;
  border-color: #444;
}
.enlarge-qr {
  width: min(92vw, 92vh);
  height: auto;
  margin: auto;
  background: #fff;
  border-radius: 8px;
}
</style>
