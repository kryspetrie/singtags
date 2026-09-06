<script setup lang="ts">
/**
 * Local Library asset preview: play/stop for audio (or emit to TagPlayer),
 * dialog for image / rasterized PDF pages (never a native PDF viewer).
 */
import { computed, onUnmounted, ref } from 'vue'
import { renderPdfToPageUrls } from '../lib/pdfRender'
import { isLocalAudioMime, isLocalImageMime, isLocalPdfMime } from '../types/localLibrary'

const props = defineProps<{
  mime: string
  filename: string
  /** Resolve bytes on demand (File, IDB blob, etc.). */
  getBlob: () => Promise<Blob | null>
  /**
   * When true, audio Preview emits `play-external` instead of using a local
   * HTMLAudioElement (parent loads the track into TagPlayer).
   */
  externalAudio?: boolean
}>()

const emit = defineEmits<{
  'play-external': []
}>()

const kind = computed<'audio' | 'pdf' | 'image' | null>(() => {
  if (isLocalAudioMime(props.mime, props.filename)) return 'audio'
  if (isLocalPdfMime(props.mime) || props.filename.toLowerCase().endsWith('.pdf')) return 'pdf'
  if (isLocalImageMime(props.mime, props.filename)) return 'image'
  return null
})

const busy = ref(false)
const playing = ref(false)
const dialogOpen = ref(false)
const objectUrl = ref<string | null>(null)
/** Raster page URLs for PDF preview (revoked on close). */
const pageUrls = ref<string[]>([])
const audioEl = ref<HTMLAudioElement | null>(null)
const error = ref<string | null>(null)

function revokeObjectUrl(): void {
  if (objectUrl.value) {
    URL.revokeObjectURL(objectUrl.value)
    objectUrl.value = null
  }
}

function revokePageUrls(): void {
  for (const u of pageUrls.value) URL.revokeObjectURL(u)
  pageUrls.value = []
}

async function ensureObjectUrl(): Promise<string | null> {
  error.value = null
  if (objectUrl.value) return objectUrl.value
  busy.value = true
  try {
    const blob = await props.getBlob()
    if (!blob) {
      error.value = 'Could not load preview'
      return null
    }
    objectUrl.value = URL.createObjectURL(blob)
    return objectUrl.value
  } catch {
    error.value = 'Could not load preview'
    return null
  } finally {
    busy.value = false
  }
}

function stopAudio(): void {
  const a = audioEl.value
  if (!a) return
  a.pause()
  a.currentTime = 0
  playing.value = false
}

async function toggleLocalAudio(): Promise<void> {
  if (playing.value) {
    stopAudio()
    return
  }
  const url = await ensureObjectUrl()
  if (!url) return
  if (!audioEl.value) {
    const a = new Audio(url)
    a.addEventListener('ended', () => {
      playing.value = false
    })
    a.addEventListener('pause', () => {
      if (a.currentTime === 0 || a.ended) playing.value = false
    })
    audioEl.value = a
  }
  try {
    await audioEl.value.play()
    playing.value = true
  } catch {
    error.value = 'Playback blocked'
    playing.value = false
  }
}

async function openImage(): Promise<void> {
  stopAudio()
  const url = await ensureObjectUrl()
  if (!url) return
  revokePageUrls()
  dialogOpen.value = true
}

async function openPdfRaster(): Promise<void> {
  stopAudio()
  error.value = null
  busy.value = true
  revokePageUrls()
  try {
    const blob = await props.getBlob()
    if (!blob) {
      error.value = 'Could not load preview'
      return
    }
    // Temporary blob URL for pdf.js — revoke after rasterize.
    const pdfUrl = URL.createObjectURL(blob)
    try {
      // Preview DPI: sharp enough to read, lighter than sheet-viewer 300 DPI.
      pageUrls.value = await renderPdfToPageUrls(pdfUrl, { dpi: 144, crop: true })
    } finally {
      URL.revokeObjectURL(pdfUrl)
    }
    if (!pageUrls.value.length) {
      error.value = 'Could not render PDF'
      return
    }
    dialogOpen.value = true
  } catch {
    error.value = 'Could not render PDF'
    revokePageUrls()
  } finally {
    busy.value = false
  }
}

function closeDialog(): void {
  dialogOpen.value = false
  revokePageUrls()
}

function onActivate(): void {
  if (kind.value === 'audio') {
    if (props.externalAudio) {
      emit('play-external')
      return
    }
    void toggleLocalAudio()
  } else if (kind.value === 'pdf') {
    void openPdfRaster()
  } else if (kind.value === 'image') {
    void openImage()
  }
}

onUnmounted(() => {
  stopAudio()
  audioEl.value = null
  revokeObjectUrl()
  revokePageUrls()
})
</script>

<template>
  <span v-if="kind" class="preview-wrap">
    <button
      type="button"
      class="btn btn-ghost preview-btn"
      :disabled="busy"
      :aria-pressed="kind === 'audio' && !externalAudio ? playing : undefined"
      :aria-label="
        kind === 'audio'
          ? externalAudio
            ? `Play ${filename} in player`
            : playing
              ? `Stop ${filename}`
              : `Play ${filename}`
          : `Preview ${filename}`
      "
      @click.stop="onActivate"
    >
      <template v-if="busy">…</template>
      <template v-else-if="kind === 'audio'">
        {{ externalAudio ? 'Play' : playing ? 'Stop' : 'Play' }}
      </template>
      <template v-else>Preview</template>
    </button>
    <span v-if="error" class="preview-error" role="status">{{ error }}</span>

    <Teleport to="body">
      <div
        v-if="dialogOpen && (kind === 'image' ? objectUrl : pageUrls.length)"
        class="preview-backdrop"
        role="dialog"
        aria-modal="true"
        :aria-label="`Preview ${filename}`"
        @click.self="closeDialog"
      >
        <div class="preview-panel">
          <header class="preview-head">
            <h2 class="preview-title">{{ filename }}</h2>
            <button type="button" class="btn btn-ghost" aria-label="Close preview" @click="closeDialog">
              Close
            </button>
          </header>
          <div class="preview-body">
            <img v-if="kind === 'image' && objectUrl" class="preview-img" :src="objectUrl" :alt="filename" />
            <div v-else-if="kind === 'pdf'" class="preview-pages">
              <img
                v-for="(src, i) in pageUrls"
                :key="src"
                class="preview-page"
                :src="src"
                :alt="`${filename} page ${i + 1}`"
              />
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </span>
</template>

<style scoped>
.preview-wrap {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  flex-wrap: wrap;
}
.preview-btn {
  min-height: 36px;
  padding: 0.25rem 0.65rem;
  font-size: 0.85rem;
}
.preview-error {
  font-size: 0.75rem;
  color: var(--danger, #b00020);
}
.preview-backdrop {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: grid;
  place-items: center;
  padding: 0.75rem;
  background: color-mix(in srgb, #000 50%, transparent);
}
.preview-panel {
  width: min(52rem, 100%);
  max-height: min(92vh, 56rem);
  display: grid;
  grid-template-rows: auto 1fr;
  border-radius: 14px;
  border: 1px solid var(--border);
  background: var(--surface);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.25);
  overflow: hidden;
}
.preview-head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.55rem 0.75rem;
  border-bottom: 1px solid var(--border);
}
.preview-title {
  margin: 0;
  flex: 1;
  min-width: 0;
  font-size: 0.95rem;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.preview-body {
  min-height: 0;
  overflow: auto;
  background: color-mix(in srgb, var(--text) 4%, var(--surface));
}
.preview-img {
  display: block;
  max-width: 100%;
  max-height: min(80vh, 48rem);
  margin: 0 auto;
  object-fit: contain;
}
.preview-pages {
  display: grid;
  gap: 0.75rem;
  padding: 0.75rem;
  justify-items: center;
}
.preview-page {
  display: block;
  max-width: 100%;
  height: auto;
  background: #fff;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12);
}
.btn {
  min-height: 44px;
  padding: 0.45rem 0.85rem;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--surface);
  font: inherit;
  font-weight: 650;
  cursor: pointer;
  color: inherit;
}
.btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.btn-ghost {
  background: transparent;
}
</style>
