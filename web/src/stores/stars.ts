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
} from '../offline/starredDb'
import { tagDetailUrl } from '../lib/mediaUrl'
import { fetchCached } from '../lib/manualOfflineFetch'
import { sheetOfflinePaths, summarySheetPages } from '../lib/sheetPaths'
import { packHasAnySheets } from '../offline/resolveMedia'
import { usePreferencesStore } from './preferences'
import { noticeFromStarRecord, type StarsNotice } from './starNotice'

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

export const useStarsStore = defineStore('stars', () => {
  const records = ref<StarredTagRecord[]>([])
  const loaded = ref(false)
  /** Blocks UI for explicit long operations (update, import, cache-all). */
  const busy = ref(false)
  const backgroundCount = ref(0)
  const error = ref<string | null>(null)
  const lastNotice = ref<StarsNotice | null>(null)
  /** Global progress for explicit bulk operations (settings, import). */
  const progress = ref<StarProgress | null>(null)
  /** Per-tag progress while background caching from browse rows. */
  const tagProgress = ref<Record<number, StarProgress>>({})

  const tagJobGen = new Map<number, number>()

  const ids = computed(() => new Set(records.value.map((r) => r.tagId)))
  const count = computed(() => records.value.length)
  const backgroundActive = computed(() => backgroundCount.value > 0)

  function applyRecords(next: StarredTagRecord[]): void {
    records.value = next
    loaded.value = true
  }

  function nextTagGen(tagId: number): number {
    const gen = (tagJobGen.get(tagId) ?? 0) + 1
    tagJobGen.set(tagId, gen)
    return gen
  }

  function isTagJobCurrent(tagId: number, gen: number): boolean {
    return tagJobGen.get(tagId) === gen
  }

  function setTagProgress(tagId: number, p: StarProgress | null): void {
    if (p === null) {
      const next = { ...tagProgress.value }
      delete next[tagId]
      tagProgress.value = next
      return
    }
    tagProgress.value = { ...tagProgress.value, [tagId]: p }
  }

  function isTagCaching(tagId: number): boolean {
    return tagId in tagProgress.value
  }

  function tagCachingLabel(tagId: number): string | null {
    return tagProgress.value[tagId]?.label ?? null
  }

  async function refresh(): Promise<void> {
    applyRecords(await listStarred())
  }

  async function ensureLoaded(): Promise<void> {
    if (!loaded.value) await refresh()
  }

  function isStarred(tagId: number): boolean {
    return records.value.some((r) => r.tagId === tagId)
  }

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
        lastNotice.value = noticeFromStarRecord(metaRec, summary, d, {
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

      const prefs = usePreferencesStore()
      const fullRec = await refreshStarMedia(metaRec, d, {
        skipSheets,
        audioQuality: prefs.audioEncodeQuality,
        onProgress: (p) => {
          setTagProgress(tagId, p)
        },
      })
      if (!isTagJobCurrent(tagId, gen) || !isStarred(tagId)) return
      applyRecords([fullRec, ...records.value.filter((r) => r.tagId !== tagId)])
      lastNotice.value = noticeFromStarRecord(fullRec, summary, d, {
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

  /** Favorite many tags from browse (fetch detail when missing). */
  async function starMany(
    summaries: TagSummary[],
    options: Pick<StarOptions, 'metadataOnly'> = {},
  ): Promise<number> {
    await ensureLoaded()
    error.value = null

    const pending = summaries.filter((s) => !isStarred(s.id))
    if (!pending.length) {
      lastNotice.value = { type: 'text', message: 'Nothing new to favorite' }
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

  /** Fetch audio for favorited tags that lack audio blobs (background queue). */
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
          audioQuality: usePreferencesStore().audioEncodeQuality,
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
      lastNotice.value = {
        type: 'text',
        message: n
          ? `Saved audio for ${n} favorited tag(s)`
          : 'All favorited tags already have audio',
      }
      return n
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
      return n
    } finally {
      busy.value = false
      progress.value = null
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
        audioQuality: usePreferencesStore().audioEncodeQuality,
        onProgress: (p) => {
          progress.value = p
        },
      })
      applyRecords([rec, ...records.value.filter((r) => r.tagId !== tagId)])
      lastNotice.value = noticeFromStarRecord(rec, existing.summary, d, { skipSheets })
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      busy.value = false
      progress.value = null
    }
  }

  async function unstar(tagId: number): Promise<void> {
    nextTagGen(tagId)
    await removeStarred(tagId)
    applyRecords(records.value.filter((r) => r.tagId !== tagId))
  }

  function exportFile(): StarredTagsFile {
    return toStarredFile(records.value)
  }

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
            audioQuality: usePreferencesStore().audioEncodeQuality,
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

  async function get(tagId: number): Promise<StarredTagRecord | undefined> {
    return getStarred(tagId)
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
    unstar,
    exportFile,
    importFromJson,
    get,
    clearError: () => {
      error.value = null
    },
  }
})
