<script setup lang="ts">
/**
 * In-app preview for a received optical file (image / PDF / audio).
 * Always in-app — never relies on OS open / new-tab.
 */
import { computed, onUnmounted, ref, watch } from 'vue'
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
const currentTime = ref(0)
const duration = ref(0)
const volume = ref(1)
const muted = ref(false)
const seeking = ref(false)

const volumeBeforeMute = ref(1)

const progressPercent = computed(() => {
  const d = duration.value
  if (!(d > 0)) return 0
  return Math.min(100, Math.max(0, (currentTime.value / d) * 100))
})

function formatClock(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00'
  const s = Math.floor(sec)
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${r.toString().padStart(2, '0')}`
}

function onAudioTimeUpdate(): void {
  if (seeking.value) return
  const a = audioEl.value
  if (!a) return
  currentTime.value = a.currentTime
}

function onAudioMeta(): void {
  const a = audioEl.value
  if (!a) return
  duration.value = Number.isFinite(a.duration) ? a.duration : 0
}

function onAudioEnded(): void {
  playing.value = false
  currentTime.value = duration.value > 0 ? duration.value : 0
}

function revokeAll(): void {
  const a = audioEl.value
  if (a) {
    a.removeEventListener('timeupdate', onAudioTimeUpdate)
    a.removeEventListener('loadedmetadata', onAudioMeta)
    a.removeEventListener('ended', onAudioEnded)
    a.pause()
    audioEl.value = null
  }
  if (objectUrl.value) {
    URL.revokeObjectURL(objectUrl.value)
    objectUrl.value = null
  }
  for (const u of pageUrls.value) URL.revokeObjectURL(u)
  pageUrls.value = []
  playing.value = false
  currentTime.value = 0
  duration.value = 0
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
      a.volume = volume.value
      a.muted = muted.value
      a.addEventListener('timeupdate', onAudioTimeUpdate)
      a.addEventListener('loadedmetadata', onAudioMeta)
      a.addEventListener('ended', onAudioEnded)
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

function onSeekInput(event: Event): void {
  const a = audioEl.value
  const input = event.target as HTMLInputElement
  const d = duration.value
  if (!a || !(d > 0)) return
  seeking.value = true
  const next = (Number(input.value) / 100) * d
  currentTime.value = next
}

function onSeekCommit(event: Event): void {
  const a = audioEl.value
  const input = event.target as HTMLInputElement
  const d = duration.value
  seeking.value = false
  if (!a || !(d > 0)) return
  a.currentTime = (Number(input.value) / 100) * d
  currentTime.value = a.currentTime
}

function onVolumeInput(event: Event): void {
  const a = audioEl.value
  const input = event.target as HTMLInputElement
  const next = Math.min(1, Math.max(0, Number(input.value) / 100))
  volume.value = next
  muted.value = next === 0
  if (next > 0) volumeBeforeMute.value = next
  if (a) {
    a.volume = next
    a.muted = muted.value
  }
}

function toggleMute(): void {
  const a = audioEl.value
  if (muted.value || volume.value === 0) {
    muted.value = false
    volume.value = volumeBeforeMute.value > 0 ? volumeBeforeMute.value : 1
  } else {
    volumeBeforeMute.value = volume.value > 0 ? volume.value : 1
    muted.value = true
  }
  if (a) {
    a.muted = muted.value
    a.volume = volume.value
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
            <p class="hint">{{ file.name }}</p>
            <div class="audio-player" role="group" aria-label="Audio playback">
              <button
                type="button"
                class="btn btn-primary play-btn"
                :aria-label="playing ? 'Pause' : 'Play'"
                @click="toggleAudio"
              >
                {{ playing ? 'Pause' : 'Play' }}
              </button>
              <div class="seek-row">
                <span class="clock" aria-hidden="true">{{ formatClock(currentTime) }}</span>
                <input
                  class="seek"
                  type="range"
                  min="0"
                  max="100"
                  step="0.1"
                  :value="progressPercent"
                  :aria-valuetext="`${formatClock(currentTime)} of ${formatClock(duration)}`"
                  aria-label="Seek"
                  @input="onSeekInput"
                  @change="onSeekCommit"
                />
                <span class="clock" aria-hidden="true">{{ formatClock(duration) }}</span>
              </div>
              <div class="volume-row">
                <button
                  type="button"
                  class="btn btn-ghost mute-btn"
                  :aria-label="muted || volume === 0 ? 'Unmute' : 'Mute'"
                  @click="toggleMute"
                >
                  {{ muted || volume === 0 ? 'Unmute' : 'Mute' }}
                </button>
                <input
                  class="volume"
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  :value="muted ? 0 : Math.round(volume * 100)"
                  aria-label="Volume"
                  @input="onVolumeInput"
                />
              </div>
            </div>
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
  gap: 1rem;
  place-items: center;
  padding: 1.5rem 1rem 2rem;
}
.audio-player {
  width: min(28rem, 100%);
  display: grid;
  gap: 0.75rem;
}
.play-btn {
  justify-self: center;
  min-width: 6.5rem;
}
.seek-row,
.volume-row {
  display: flex;
  align-items: center;
  gap: 0.55rem;
}
.clock {
  font-size: 0.8rem;
  font-variant-numeric: tabular-nums;
  opacity: 0.8;
  min-width: 2.4rem;
}
.seek,
.volume {
  flex: 1;
  min-width: 0;
  accent-color: var(--accent, #1a5fb4);
}
.mute-btn {
  min-height: 40px;
  padding: 0.3rem 0.65rem;
  font-size: 0.85rem;
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
