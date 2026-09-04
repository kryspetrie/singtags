/**
 * Zip download queue: tracks selected audio/sheet parts, layout, and batch download progress.
 * Queue and zip layout persist in localStorage.
 */
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

/** Read zip folder layout preference from localStorage. */
function loadLayout(): ZipLayout {
  try {
    return normalizeZipLayout(localStorage.getItem(LAYOUT_KEY))
  } catch {
    return 'folders'
  }
}

/** Pinia store for the multi-file zip download queue. */
export const useQueueStore = defineStore('queue', () => {
  const tracks = ref<QueueTrack[]>([])
  const busy = ref(false)
  const progress = ref({ done: 0, total: 0 })
  const error = ref<string | null>(null)
  const format = ref<DownloadFormat>('mp3')
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

  /** Restore queue from localStorage; normalizes track kind and format. */
  function load(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as QueueTrack[]
        tracks.value = parsed.map((t) => ({
          ...t,
          kind: t.kind === 'sheet' ? 'sheet' : 'audio',
          format: t.kind === 'sheet' ? undefined : normalizeDownloadFormat(t.format),
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

  /** Stash playback transform for preview while editing queue items (not used in zip encode). */
  function setPlaybackTransform(t: AudioTransform): void {
    playbackTransform.value = { ...t }
  }

  /**
   * Add one track if not duplicate and under `MAX_QUEUE_TRACKS`.
   * Side effect: localStorage via watcher.
   */
  function add(track: QueueTrack): void {
    error.value = null
    if (tracks.value.some((t) => t.tagId === track.tagId && t.part === track.part)) {
      return
    }
    if (tracks.value.length >= MAX_QUEUE_TRACKS) {
      error.value = `Queue limited to ${MAX_QUEUE_TRACKS} files`
      return
    }
    tracks.value = [...tracks.value, track]
  }

  /** Add many tracks; stops at queue limit and sets error when capped. */
  function addMany(items: QueueTrack[]): void {
    for (const item of items) {
      if (tracks.value.length >= MAX_QUEUE_TRACKS) {
        error.value = `Queue limited to ${MAX_QUEUE_TRACKS} files`
        break
      }
      add(item)
    }
  }

  /** Remove a track by tag id and part name. Side effect: localStorage. */
  function remove(tagId: number, part: string): void {
    tracks.value = tracks.value.filter((t) => !(t.tagId === tagId && t.part === part))
  }

  /** Empty the queue and clear errors. Side effect: localStorage. */
  function clear(): void {
    tracks.value = []
    error.value = null
  }

  /**
   * Patch format or transform on one queue row.
   * Side effect: localStorage.
   */
  function updateTrack(
    tagId: number,
    part: string,
    patch: Partial<Pick<QueueTrack, 'format' | 'transform'>>,
  ): void {
    tracks.value = tracks.value.map((t) =>
      t.tagId === tagId && t.part === part ? { ...t, ...patch } : t,
    )
  }

  /** Set default download format for all audio tracks in the queue. */
  function setFormat(fmt: DownloadFormat): void {
    format.value = fmt
    tracks.value = tracks.value.map((item) =>
      item.kind === 'sheet' ? item : { ...item, format: fmt },
    )
  }

  /**
   * Build and download a zip of all queued tracks.
   * Side effect: network fetches, browser download; updates `progress` and `busy`.
   */
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

  /** Abort an in-progress zip download if any. */
  function cancelZip(): void {
    abort?.abort()
  }

  /** Clear queue error message. */
  function clearError(): void {
    error.value = null
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
    clearError,
  }
})
