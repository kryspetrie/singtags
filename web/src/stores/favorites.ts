/**
 * Favorites (user-curated tags with optional offline media).
 *
 * UI and product copy use “Favorites”; persistence still goes through the legacy
 * `starred*` IndexedDB API (`starTag`, `listStarred`, `StarredTagRecord`, etc.)
 * for backward-compatible storage and import/export.
 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { TagDetail, TagSummary } from '../types/tag'
import {
  getStarred,
  importStarredFile,
  listStarred,
  parseStarredFile,
  refreshStarMedia,
  removeStarred,
  starTag,
  toStarredFile,
  type StarOptions,
  type StarProgress,
  type StarredTagRecord,
  type StarredTagsFile,
} from '../offline/favoritesDb'
import { isFavoriteMediaStale } from '../lib/mediaCacheKey'
import { tagDetailUrl } from '../lib/mediaUrl'
import { fetchCached } from '../lib/manualOfflineFetch'
import { sheetOfflinePaths, summarySheetPages } from '../lib/sheetPaths'
import { packHasAnySheets } from '../offline/resolveMedia'
import { DEVICE_AUDIO_STORAGE_QUALITY } from '../types/audio'
import { noticeFromFavoriteRecord, type FavoritesNotice } from './favoritesNotice'

/**
 * Optimistic in-memory row shown before IDB write completes.
 * Uses `starredAt` field name from the legacy record shape.
 */
function buildPlaceholder(summary: TagSummary, detail: TagDetail | null): StarredTagRecord {
  return {
    tagId: summary.id,
    starredAt: new Date().toISOString(),
    summary,
    detail,
    offlineMedia: false,
    quotaWarning: null,
  }
}

/** Pinia store for favoriting tags and managing offline favorite media. */
export const useFavoritesStore = defineStore('favorites', () => {
  const records = ref<StarredTagRecord[]>([])
  const loaded = ref(false)
  /** Blocks UI for explicit long operations (update, import, cache-all). */
  const busy = ref(false)
  const backgroundCount = ref(0)
  const error = ref<string | null>(null)
  const lastNotice = ref<FavoritesNotice | null>(null)
  /** Global progress for explicit bulk operations (settings, import). */
  const progress = ref<StarProgress | null>(null)
  /** Per-tag progress while background caching from browse rows. */
  const tagProgress = ref<Record<number, StarProgress>>({})

  /** Generation counter per tag — stale background jobs bail when superseded. */
  const tagJobGen = new Map<number, number>()

  const ids = computed(() => new Set(records.value.map((r) => r.tagId)))
  const count = computed(() => records.value.length)
  const backgroundActive = computed(() => backgroundCount.value > 0)

  /** Replace in-memory list and mark store loaded (does not write IDB). */
  function applyRecords(next: StarredTagRecord[]): void {
    records.value = next
    loaded.value = true
  }

  /** Bump job generation for a tag; returns the new generation id. */
  function nextTagGen(tagId: number): number {
    const gen = (tagJobGen.get(tagId) ?? 0) + 1
    tagJobGen.set(tagId, gen)
    return gen
  }

  /** True when `gen` is still the active background job for `tagId`. */
  function isTagJobCurrent(tagId: number, gen: number): boolean {
    return tagJobGen.get(tagId) === gen
  }

  /** Set or clear per-tag caching progress for browse-row UI. */
  function setTagProgress(tagId: number, p: StarProgress | null): void {
    if (p === null) {
      const next = { ...tagProgress.value }
      delete next[tagId]
      tagProgress.value = next
      return
    }
    tagProgress.value = { ...tagProgress.value, [tagId]: p }
  }

  /** Whether a tag currently has an active background media fetch. */
  function isTagCaching(tagId: number): boolean {
    return tagId in tagProgress.value
  }

  /** Human-readable progress label for a caching tag, if any. */
  function tagCachingLabel(tagId: number): string | null {
    return tagProgress.value[tagId]?.label ?? null
  }

  /**
   * Reload all favorite records from IndexedDB (`listStarred`).
   * Side effect: IDB read.
   */
  async function refresh(): Promise<void> {
    applyRecords(await listStarred())
  }

  /** Load from IDB once if not yet loaded. */
  async function ensureLoaded(): Promise<void> {
    if (!loaded.value) await refresh()
  }

  /** Whether a tag id is in the in-memory favorites list. */
  function isStarred(tagId: number): boolean {
    return records.value.some((r) => r.tagId === tagId)
  }

  /**
   * Background favorite pipeline: metadata via `starTag`, then optional media via `refreshStarMedia`.
   * Aborts when unfavorited or superseded by a newer job generation.
   *
   * Side effects: network (detail fetch), IndexedDB writes, `lastNotice`, `error` on failure.
   */
  async function runStarBackground(
    tagId: number,
    gen: number,
    summary: TagSummary,
    detail: TagDetail | null,
    options: Pick<StarOptions, 'metadataOnly'>,
  ): Promise<void> {
    backgroundCount.value++
    try {
      let d = detail
      if (!d && !options.metadataOnly) {
        try {
          const res = await fetchCached(tagDetailUrl(summary.id))
          if (res.ok) d = (await res.json()) as TagDetail
        } catch {
          /* metadata-only fallback */
        }
      }

      if (!isTagJobCurrent(tagId, gen) || !isStarred(tagId)) return

      const metaRec = await starTag(summary, d, { metadataOnly: true })
      if (!isTagJobCurrent(tagId, gen) || !isStarred(tagId)) return
      applyRecords([metaRec, ...records.value.filter((r) => r.tagId !== tagId)])

      if (options.metadataOnly || !d) {
        lastNotice.value = noticeFromFavoriteRecord(metaRec, summary, d, {
          metadataOnly: true,
        })
        return
      }

      let skipSheets = false
      try {
        const offlinePages = sheetOfflinePaths(d)
        const pages = offlinePages.length ? offlinePages : summarySheetPages(summary)
        if (pages.length && (await packHasAnySheets(pages))) skipSheets = true
      } catch {
        /* ignore */
      }

      const fullRec = await refreshStarMedia(metaRec, d, {
        skipSheets,
        audioQuality: DEVICE_AUDIO_STORAGE_QUALITY,
        onProgress: (p) => {
          setTagProgress(tagId, p)
        },
      })
      if (!isTagJobCurrent(tagId, gen) || !isStarred(tagId)) return
      applyRecords([fullRec, ...records.value.filter((r) => r.tagId !== tagId)])
      lastNotice.value = noticeFromFavoriteRecord(fullRec, summary, d, {
        metadataOnly: false,
        skipSheets,
      })
    } catch (e) {
      if (isTagJobCurrent(tagId, gen) && isStarred(tagId)) {
        error.value = e instanceof Error ? e.message : String(e)
        await refresh()
      }
    } finally {
      setTagProgress(tagId, null)
      backgroundCount.value--
      if (backgroundCount.value <= 0) backgroundCount.value = 0
    }
  }

  /**
   * Favorite or unfavorite one tag (optimistic UI).
   * Favorite path persists via `starTag` / `refreshStarMedia`; unfavorite via `removeStarred`.
   *
   * @param summary - Tag to toggle.
   * @param detail - Optional detail (fetched when missing and not metadata-only).
   * @param options.metadataOnly - Skip audio/sheet blob download.
   */
  async function toggle(
    summary: TagSummary,
    detail: TagDetail | null,
    options: Pick<StarOptions, 'metadataOnly'> = {},
  ): Promise<void> {
    await ensureLoaded()
    error.value = null

    if (isStarred(summary.id)) {
      nextTagGen(summary.id)
      applyRecords(records.value.filter((r) => r.tagId !== summary.id))
      lastNotice.value = { type: 'removed' }
      void (async () => {
        try {
          await removeStarred(summary.id)
        } catch (e) {
          error.value = e instanceof Error ? e.message : String(e)
          await refresh()
        }
      })()
      return
    }

    const gen = nextTagGen(summary.id)
    applyRecords([
      buildPlaceholder(summary, detail),
      ...records.value.filter((r) => r.tagId !== summary.id),
    ])
    void runStarBackground(summary.id, gen, summary, detail, options)
  }

  /**
   * Favorite many tags from browse (fetch detail when missing).
   *
   * @param summaries - Tags to favorite (already-favorited ids are skipped).
   * @param options.metadataOnly - Skip media download for each tag.
   * @returns Count of newly favorited tags.
   */
  async function starMany(
    summaries: TagSummary[],
    options: Pick<StarOptions, 'metadataOnly'> = {},
  ): Promise<number> {
    await ensureLoaded()
    error.value = null

    const pending = summaries.filter((s) => !isStarred(s.id))
    if (!pending.length) {
      return 0
    }

    const pendingIds = new Set(pending.map((s) => s.id))
    applyRecords([
      ...pending.map((s) => buildPlaceholder(s, null)),
      ...records.value.filter((r) => !pendingIds.has(r.tagId)),
    ])

    for (const summary of pending) {
      const gen = nextTagGen(summary.id)
      void runStarBackground(summary.id, gen, summary, null, options)
    }

    lastNotice.value = { type: 'text', message: `Favorited ${pending.length} tag(s)` }
    return pending.length
  }

  /**
   * Fetch audio for favorited tags that lack audio blobs (background queue).
   * Side effects: network, IndexedDB via `refreshStarMedia`, sets `busy` and `progress`.
   *
   * @returns Number of tags that received new audio blobs.
   */
  async function ensureAudioForAllStarred(): Promise<number> {
    busy.value = true
    error.value = null
    lastNotice.value = null
    progress.value = null
    let n = 0
    try {
      await ensureLoaded()
      const need = records.value.filter(
        (r) => !r.audioBlobs || !Object.keys(r.audioBlobs).length,
      )
      const total = need.length
      for (let i = 0; i < need.length; i++) {
        const existing = need[i]!
        progress.value = {
          label: `Audio ${i + 1}/${total}`,
          done: i,
          total,
          ratio: total ? i / total : 1,
        }
        let d = existing.detail
        if (!d) {
          try {
            const res = await fetchCached(tagDetailUrl(existing.tagId))
            if (res.ok) d = (await res.json()) as TagDetail
          } catch {
            continue
          }
        }
        if (!d) continue
        await refreshStarMedia(existing, d, {
          skipSheets: true,
          audioQuality: DEVICE_AUDIO_STORAGE_QUALITY,
          onProgress: (p) => {
            progress.value = {
              ...p,
              label: `${existing.summary.title || existing.tagId}: ${p.label}`,
            }
          },
        })
        n++
      }
      await refresh()
      return n
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
      return n
    } finally {
      busy.value = false
      progress.value = null
    }
  }

  /**
   * Re-download offline media for one favorited tag (settings “update cache”).
   * Side effects: network, IndexedDB, `busy`, global `progress`.
   *
   * @throws Sets `error` when tag is not favorited or detail cannot load.
   */

  /**
   * Silently re-cache favorited offline media when catalog media fingerprint changed
   * (`downloaded_at` / `last_updated_remote` + media paths). No-op when fresh or offline-only.
   * Does not surface a success notice (automatic maintenance).
   *
   * @returns true when media was refreshed.
   */
  async function refreshOfflineMediaIfStale(
    tagId: number,
    detail: TagDetail,
  ): Promise<boolean> {
    await ensureLoaded()
    const existing = await getStarred(tagId)
    if (!existing || !isFavoriteMediaStale(existing, detail)) return false

    const gen = nextTagGen(tagId)
    backgroundCount.value++
    setTagProgress(tagId, { label: 'Refreshing media…', done: 0, total: 1, ratio: 0 })
    try {
      const skipSheets = await packHasAnySheets(sheetOfflinePaths(detail)).catch(() => false)
      if (!isTagJobCurrent(tagId, gen) || !isStarred(tagId)) return false
      const rec = await refreshStarMedia(existing, detail, {
        skipSheets,
        audioQuality: DEVICE_AUDIO_STORAGE_QUALITY,
        onProgress: (p) => {
          if (!isTagJobCurrent(tagId, gen)) return
          setTagProgress(tagId, p)
        },
      })
      if (!isTagJobCurrent(tagId, gen)) return false
      applyRecords([rec, ...records.value.filter((r) => r.tagId !== tagId)])
      return true
    } catch (e) {
      // Soft-fail: keep existing cache; surface only if nothing else is showing.
      if (!error.value) {
        error.value = e instanceof Error ? e.message : String(e)
      }
      return false
    } finally {
      if (isTagJobCurrent(tagId, gen)) setTagProgress(tagId, null)
      backgroundCount.value = Math.max(0, backgroundCount.value - 1)
    }
  }

  async function updateOfflineMedia(tagId: number, detail: TagDetail | null): Promise<void> {
    busy.value = true
    error.value = null
    lastNotice.value = null
    progress.value = null
    try {
      await ensureLoaded()
      const existing = await getStarred(tagId)
      if (!existing) throw new Error('Tag is not favorited')
      let d = detail ?? existing.detail
      if (!d) {
        const res = await fetchCached(tagDetailUrl(tagId))
        if (!res.ok) throw new Error(`Could not load tag detail (${res.status})`)
        d = (await res.json()) as TagDetail
      }
      const skipSheets = await packHasAnySheets(sheetOfflinePaths(d)).catch(() => false)
      const rec = await refreshStarMedia(existing, d, {
        skipSheets,
        audioQuality: DEVICE_AUDIO_STORAGE_QUALITY,
        onProgress: (p) => {
          progress.value = p
        },
      })
      applyRecords([rec, ...records.value.filter((r) => r.tagId !== tagId)])
      lastNotice.value = noticeFromFavoriteRecord(rec, existing.summary, d, { skipSheets })
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      busy.value = false
      progress.value = null
    }
  }

  /**
   * Remove a favorite by id (awaitable, no optimistic race with toggle).
   * Side effect: IndexedDB `removeStarred`.
   */
  async function unstar(tagId: number): Promise<void> {
    nextTagGen(tagId)
    await removeStarred(tagId)
    applyRecords(records.value.filter((r) => r.tagId !== tagId))
  }

  /** Export favorites as JSON file shape (`StarredTagsFile` / legacy backup format). */
  function exportFile(): StarredTagsFile {
    return toStarredFile(records.value)
  }

  /**
   * Import favorites from parsed JSON backup.
   *
   * @param raw - Unknown JSON (validated by `parseStarredFile`).
   * @param fetchMedia - When true, re-fetch media blobs after metadata import.
   * @returns Number of tags imported. Side effects: IndexedDB, optional network.
   */
  async function importFromJson(raw: unknown, fetchMedia = false): Promise<number> {
    busy.value = true
    error.value = null
    try {
      const file = parseStarredFile(raw)
      const n = await importStarredFile(file)
      await refresh()
      if (fetchMedia) {
        let fetched = 0
        for (const t of file.tags) {
          if (!t.summary?.id || !t.detail) continue
          const existing = await getStarred(t.summary.id)
          if (!existing) continue
          await refreshStarMedia(existing, t.detail, {
            audioQuality: DEVICE_AUDIO_STORAGE_QUALITY,
            onProgress: (p) => {
              progress.value = p
            },
          })
          fetched++
        }
        await refresh()
        lastNotice.value = { type: 'text', message: `Imported ${n}; fetched media for ${fetched}` }
      } else {
        lastNotice.value = {
          type: 'text',
          message: `Imported ${n} favorited tag(s) (metadata; media not restored)`,
        }
      }
      return n
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
      throw e
    } finally {
      busy.value = false
      progress.value = null
    }
  }

  /**
   * Read one favorite record from IndexedDB (`getStarred`).
   * Does not require `ensureLoaded`.
   */
  async function get(tagId: number): Promise<StarredTagRecord | undefined> {
    return getStarred(tagId)
  }

  /** Clear the last favorites operation error message. */
  function clearError(): void {
    error.value = null
  }

  return {
    records,
    loaded,
    busy,
    backgroundActive,
    error,
    lastNotice,
    progress,
    tagProgress,
    isTagCaching,
    tagCachingLabel,
    ids,
    count,
    refresh,
    ensureLoaded,
    isStarred,
    toggle,
    starMany,
    ensureAudioForAllStarred,
    updateOfflineMedia,
    refreshOfflineMediaIfStale,
    unstar,
    exportFile,
    importFromJson,
    get,
    clearError,
  }
})
