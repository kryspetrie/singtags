import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import {
  MAX_QUEUE_TRACKS,
  normalizeZipLayout,
  type QueueTrack,
  type ZipLayout,
  zipQueueTracks,
} from '../download/zip'
import type { AudioTransform, AudioEncodeQuality, DownloadFormat } from '../types/audio'
import { encodeQualityForDownload, IDENTITY_TRANSFORM, normalizeDownloadFormat } from '../types/audio'

const STORAGE_KEY = 'singtags.zipQueue.v2'
const LAYOUT_KEY = 'singtags.zipLayout.v2'

function loadLayout(): ZipLayout {
  try {
    return normalizeZipLayout(localStorage.getItem(LAYOUT_KEY))
  } catch {
    return 'folders'
  }
}

export const useQueueStore = defineStore('queue', () => {
  const tracks = ref<QueueTrack[]>([])
  const busy = ref(false)
  const progress = ref({ done: 0, total: 0 })
  const error = ref<string | null>(null)
  const format = ref<DownloadFormat>('m4a')
  /** Zip download format (M4A or MP3). */
  const encodeQuality = ref<AudioEncodeQuality>('original')
  const zipLayout = ref<ZipLayout>(loadLayout())
  const playbackTransform = ref<AudioTransform>({ ...IDENTITY_TRANSFORM })
  let abort: AbortController | null = null

  /** Always a valid select value — avoids a blank <option> when state is stale. */
  const zipLayoutValue = computed({
    get: (): ZipLayout => normalizeZipLayout(zipLayout.value),
    set: (v: ZipLayout) => {
      zipLayout.value = normalizeZipLayout(v)
    },
  })

  function load(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as QueueTrack[]
        tracks.value = parsed.map((t) => ({
          ...t,
          format: normalizeDownloadFormat(t.format),
        }))
      }
    } catch {
      tracks.value = []
    }
  }

  watch(
    tracks,
    (v) => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(v))
    },
    { deep: true },
  )

  watch(
    zipLayout,
    (v) => {
      try {
        localStorage.setItem(LAYOUT_KEY, normalizeZipLayout(v))
      } catch {
        /* ignore */
      }
    },
    { immediate: true },
  )

  load()

  const count = computed(() => tracks.value.length)

  function setPlaybackTransform(t: AudioTransform): void {
    playbackTransform.value = { ...t }
  }

  function add(track: QueueTrack): void {
    error.value = null
    if (tracks.value.some((t) => t.tagId === track.tagId && t.part === track.part)) {
      return
    }
    if (tracks.value.length >= MAX_QUEUE_TRACKS) {
      error.value = `Queue limited to ${MAX_QUEUE_TRACKS} tracks`
      return
    }
    tracks.value = [...tracks.value, track]
  }

  function addMany(items: QueueTrack[]): void {
    for (const item of items) {
      if (tracks.value.length >= MAX_QUEUE_TRACKS) {
        error.value = `Queue limited to ${MAX_QUEUE_TRACKS} tracks`
        break
      }
      add(item)
    }
  }

  function remove(tagId: number, part: string): void {
    tracks.value = tracks.value.filter((t) => !(t.tagId === tagId && t.part === part))
  }

  function clear(): void {
    tracks.value = []
    error.value = null
  }

  function updateTrack(
    tagId: number,
    part: string,
    patch: Partial<Pick<QueueTrack, 'format' | 'transform'>>,
  ): void {
    tracks.value = tracks.value.map((t) =>
      t.tagId === tagId && t.part === part ? { ...t, ...patch } : t,
    )
  }

  function setFormat(fmt: DownloadFormat): void {
    format.value = fmt
    tracks.value = tracks.value.map((item) => ({ ...item, format: fmt }))
  }

  async function downloadZip(): Promise<void> {
    if (!tracks.value.length) return
    busy.value = true
    error.value = null
    progress.value = { done: 0, total: tracks.value.length }
    abort = new AbortController()
    try {
      await zipQueueTracks(tracks.value, {
        onProgress: (done, total) => {
          progress.value = { done, total }
        },
        signal: abort.signal,
        defaultFormat: format.value,
        defaultTransform: IDENTITY_TRANSFORM,
        layout: zipLayoutValue.value,
        encodeQuality: encodeQualityForDownload(format.value),
      })
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        error.value = 'Download cancelled'
      } else {
        error.value = e instanceof Error ? e.message : String(e)
      }
    } finally {
      busy.value = false
      abort = null
    }
  }

  function cancelZip(): void {
    abort?.abort()
  }

  return {
    tracks,
    count,
    busy,
    progress,
    error,
    format,
    encodeQuality,
    zipLayout: zipLayoutValue,
    playbackTransform,
    add,
    addMany,
    remove,
    clear,
    downloadZip,
    cancelZip,
    updateTrack,
    setFormat,
    setPlaybackTransform,
    max: MAX_QUEUE_TRACKS,
  }
})
