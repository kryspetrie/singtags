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
import { packHasAnySheets } from '../offline/resolveMedia'
import { usePreferencesStore } from './preferences'

export const useStarsStore = defineStore('stars', () => {
  const records = ref<StarredTagRecord[]>([])
  const loaded = ref(false)
  const busy = ref(false)
  const error = ref<string | null>(null)
  const lastMessage = ref<string | null>(null)
  const progress = ref<StarProgress | null>(null)

  const ids = computed(() => new Set(records.value.map((r) => r.tagId)))
  const count = computed(() => records.value.length)

  async function refresh(): Promise<void> {
    records.value = await listStarred()
    loaded.value = true
  }

  async function ensureLoaded(): Promise<void> {
    if (!loaded.value) await refresh()
  }

  function isStarred(tagId: number): boolean {
    return ids.value.has(tagId)
  }

  async function toggle(
    summary: TagSummary,
    detail: TagDetail | null,
    options: Pick<StarOptions, 'metadataOnly'> = {},
  ): Promise<void> {
    busy.value = true
    error.value = null
    lastMessage.value = null
    progress.value = null
    try {
      await ensureLoaded()
      if (ids.value.has(summary.id)) {
        await removeStarred(summary.id)
        lastMessage.value = 'Removed from starred'
      } else {
        let skipSheets = false
        try {
          const pages = detail?.sheet_pages ?? summary.sheetPages ?? []
          if (pages.length && (await packHasAnySheets(pages))) skipSheets = true
        } catch {
          /* ignore */
        }
        const prefs = usePreferencesStore()
        const rec = await starTag(summary, detail, {
          ...options,
          skipSheets,
          audioQuality: prefs.audioEncodeQuality,
          onProgress: (p) => {
            progress.value = p
          },
        })
        if (rec.quotaWarning) lastMessage.value = rec.quotaWarning
        else if (options.metadataOnly) lastMessage.value = 'Starred (metadata only)'
        else if (rec.audioBlobs && Object.keys(rec.audioBlobs).length)
          lastMessage.value = skipSheets
            ? 'Starred with offline audio (sheets from library pack)'
            : 'Starred with offline media'
        else if (rec.offlineMedia) lastMessage.value = 'Starred with offline sheets'
        else lastMessage.value = 'Starred (metadata)'
      }
      await refresh()
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      busy.value = false
      progress.value = null
    }
  }

  /** Star many tags from browse (fetch detail when missing). */
  async function starMany(
    summaries: TagSummary[],
    options: Pick<StarOptions, 'metadataOnly'> = {},
  ): Promise<number> {
    busy.value = true
    error.value = null
    lastMessage.value = null
    progress.value = null
    let n = 0
    try {
      await ensureLoaded()
      const total = summaries.length
      for (let i = 0; i < summaries.length; i++) {
        const summary = summaries[i]!
        if (ids.value.has(summary.id)) continue
        progress.value = {
          label: `Starring ${i + 1}/${total}`,
          done: i,
          total,
          ratio: total ? i / total : 1,
        }
        let detail: TagDetail | null = null
        if (!options.metadataOnly) {
          try {
            const res = await fetch(tagDetailUrl(summary.id))
            if (res.ok) detail = (await res.json()) as TagDetail
          } catch {
            /* metadata-only fallback */
          }
        }
        await starTag(summary, detail, {
          metadataOnly: options.metadataOnly || !detail,
          skipSheets: detail
            ? await packHasAnySheets(detail.sheet_pages ?? []).catch(() => false)
            : false,
          audioQuality: usePreferencesStore().audioEncodeQuality,
          onProgress: (p) => {
            progress.value = {
              ...p,
              label: `${summary.title || summary.id}: ${p.label}`,
            }
          },
        })
        n++
      }
      await refresh()
      lastMessage.value = n ? `Starred ${n} tag(s)` : 'Nothing new to star'
      return n
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
      return n
    } finally {
      busy.value = false
      progress.value = null
    }
  }

  /** Fetch audio for starred tags that lack audio blobs (background queue). */
  async function ensureAudioForAllStarred(): Promise<number> {
    busy.value = true
    error.value = null
    lastMessage.value = null
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
            const res = await fetch(tagDetailUrl(existing.tagId))
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
      lastMessage.value = n ? `Cached audio for ${n} starred tag(s)` : 'All starred tags already have audio'
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
    lastMessage.value = null
    progress.value = null
    try {
      await ensureLoaded()
      const existing = await getStarred(tagId)
      if (!existing) throw new Error('Tag is not starred')
      let d = detail ?? existing.detail
      if (!d) {
        const res = await fetch(tagDetailUrl(tagId))
        if (!res.ok) throw new Error(`Could not load tag detail (${res.status})`)
        d = (await res.json()) as TagDetail
      }
      const rec = await refreshStarMedia(existing, d, {
        skipSheets: await packHasAnySheets(d.sheet_pages ?? []).catch(() => false),
        audioQuality: usePreferencesStore().audioEncodeQuality,
        onProgress: (p) => {
          progress.value = p
        },
      })
      lastMessage.value = rec.audioBlobs && Object.keys(rec.audioBlobs).length
        ? 'Offline audio updated'
        : rec.offlineMedia
          ? 'Offline sheets updated'
          : rec.quotaWarning || 'Saved metadata (no media cached)'
      await refresh()
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      busy.value = false
      progress.value = null
    }
  }

  /** Fetch hosted originals for every part and store them on the starred record. */
  async function cacheOriginalAudio(tagId: number, detail: TagDetail): Promise<void> {
    busy.value = true
    error.value = null
    lastMessage.value = null
    progress.value = null
    try {
      await ensureLoaded()
      const existing = await getStarred(tagId)
      if (!existing) throw new Error('Tag is not starred')
      const rec = await refreshStarMedia(existing, detail, {
        skipSheets: true,
        audioQuality: 'original',
        onProgress: (p) => {
          progress.value = p
        },
      })
      lastMessage.value =
        rec.audioBlobs && Object.keys(rec.audioBlobs).length
          ? 'High-quality audio cached'
          : rec.quotaWarning || 'Could not cache high-quality audio'
      await refresh()
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      busy.value = false
      progress.value = null
    }
  }

  async function unstar(tagId: number): Promise<void> {
    await removeStarred(tagId)
    await refresh()
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
        lastMessage.value = `Imported ${n}; fetched media for ${fetched}`
      } else {
        lastMessage.value = `Imported ${n} starred tag(s) (metadata; media not restored)`
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
    error,
    lastMessage,
    progress,
    ids,
    count,
    refresh,
    ensureLoaded,
    isStarred,
    toggle,
    starMany,
    ensureAudioForAllStarred,
    updateOfflineMedia,
    cacheOriginalAudio,
    unstar,
    exportFile,
    importFromJson,
    get,
  }
})
