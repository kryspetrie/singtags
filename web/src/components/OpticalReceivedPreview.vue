<script setup lang="ts">
/**
 * In-app preview for a received optical file (image / PDF / audio).
 * Always in-app — never relies on OS open / new-tab.
 */
import { onUnmounted, ref, watch } from 'vue'
import { renderPdfToPageUrls } from '../lib/pdfRender'
import {
  opticalFileBlob,
  opticalPreviewKind,
  type OpticalPreviewKind,
} from '../lib/decimen/opticalReceivePreview'
import type { OpticalFile } from '../../vendor/decimen/shared/protocol'

const props = defineProps<{
  file: OpticalFile
}>()

const emit = defineEmits<{
  close: []
}>()

const kind = ref<OpticalPreviewKind | null>(opticalPreviewKind(props.file))
const busy = ref(false)
const error = ref<string | null>(null)
const objectUrl = ref<string | null>(null)
const pageUrls = ref<string[]>([])
const audioEl = ref<HTMLAudioElement | null>(null)
const playing = ref(false)

function revokeAll(): void {
  if (objectUrl.value) {
    URL.revokeObjectURL(objectUrl.value)
    objectUrl.value = null
  }
  for (const u of pageUrls.value) URL.revokeObjectURL(u)
  pageUrls.value = []
  if (audioEl.value) {
    audioEl.value.pause()
    audioEl.value = null
  }
  playing.value = false
}

async function load(): Promise<void> {
  revokeAll()
  error.value = null
  kind.value = opticalPreviewKind(props.file)
  if (!kind.value) {
    error.value = 'No in-app preview for this file type.'
    return
  }
  busy.value = true
  try {
    const blob = opticalFileBlob(props.file)
    if (kind.value === 'pdf') {
      const pdfUrl = URL.createObjectURL(blob)
      try {
        pageUrls.value = await renderPdfToPageUrls(pdfUrl, { dpi: 144, crop: true })
      } finally {
        URL.revokeObjectURL(pdfUrl)
      }
      if (!pageUrls.value.length) error.value = 'Could not render PDF'
      return
    }
    objectUrl.value = URL.createObjectURL(blob)
    if (kind.value === 'audio' && objectUrl.value) {
      const a = new Audio(objectUrl.value)
      a.addEventListener('ended', () => {
        playing.value = false
      })
      audioEl.value = a
      try {
        await a.play()
        playing.value = true
      } catch {
        /* autoplay may be blocked — controls still shown */
      }
    }
  } catch {
    error.value = 'Could not open preview'
    revokeAll()
  } finally {
    busy.value = false
  }
}

async function toggleAudio(): Promise<void> {
  const a = audioEl.value
  if (!a) return
  if (playing.value) {
    a.pause()
    playing.value = false
    return
  }
  try {
    await a.play()
    playing.value = true
  } catch {
    error.value = 'Playback blocked'
  }
}

function onClose(): void {
  revokeAll()
  emit('close')
}

watch(
  () => props.file,
  () => {
    void load()
  },
  { immediate: true },
)

onUnmounted(() => {
  revokeAll()
})
</script>

<template>
  <Teleport to="body">
    <div
      class="preview-backdrop"
      role="dialog"
      aria-modal="true"
      :aria-label="`Preview ${file.name}`"
      @click.self="onClose"
    >
      <div class="preview-panel">
        <header class="preview-head">
          <h2 class="preview-title">{{ file.name }}</h2>
          <button type="button" class="btn btn-ghost" aria-label="Close preview" @click="onClose">
            Close
          </button>
        </header>
        <div class="preview-body">
          <p v-if="busy" class="preview-status" role="status">Loading…</p>
          <p v-else-if="error" class="preview-status err" role="alert">{{ error }}</p>
          <img
            v-else-if="kind === 'image' && objectUrl"
            class="preview-img"
            :src="objectUrl"
            :alt="file.name"
          />
          <div v-else-if="kind === 'pdf' && pageUrls.length" class="preview-pages">
            <img
              v-for="(src, i) in pageUrls"
              :key="src"
              class="preview-page"
              :src="src"
              :alt="`${file.name} page ${i + 1}`"
            />
          </div>
          <div v-else-if="kind === 'audio'" class="preview-audio">
            <button type="button" class="btn btn-primary" @click="toggleAudio">
              {{ playing ? 'Pause' : 'Play' }}
            </button>
            <p class="hint">{{ file.name }}</p>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.preview-backdrop {
  position: fixed;
  inset: 0;
  z-index: 70;
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
.preview-status {
  margin: 1rem;
  text-align: center;
}
.preview-status.err {
  color: var(--danger, #b00020);
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
.preview-audio {
  display: grid;
  gap: 0.75rem;
  place-items: center;
  padding: 2rem 1rem;
}
.hint {
  margin: 0;
  font-size: 0.85rem;
  opacity: 0.75;
  text-align: center;
  word-break: break-word;
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
.btn-ghost {
  background: transparent;
}
.btn-primary {
  background: var(--accent, #1a5fb4);
  border-color: transparent;
  color: #fff;
}
</style>
