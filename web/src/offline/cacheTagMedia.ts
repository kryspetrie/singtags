/**
 * Cache one tag’s sheets and/or lo-fi audio into the offline packs — without favoriting.
 *
 * Used by Offline-mode “Load Sheet” / “Load Tracks” so constrained connections can
 * pull a single song’s media while Offline mode stays on.
 */

import type { TagDetail } from '../types/tag'
import type { AudioEncodeQuality } from '../types/audio'
import { listAudioParts, storageAudioPath } from '../lib/audioTiers'
import { mediaUrl, tagDetailUrl } from '../lib/mediaUrl'
import { sheetDisplayPages } from '../lib/sheetPaths'
import { withOfflineNetworkAllow } from '../lib/manualOfflineFetch'
import { isPlausibleDownloadBody } from './downloadQueue'
import { audioPack, sheetsPack } from './libraryPack'

/** Progress while caching one tag into the packs. */
export type CacheTagMediaProgress = {
  label: string
  done: number
  total: number
  ratio: number
}

type PackJob = {
  pack: 'sheets' | 'audio'
  url: string
  path: string
  label: string
}

function report(
  onProgress: ((p: CacheTagMediaProgress) => void) | undefined,
  label: string,
  done: number,
  total: number,
): void {
  onProgress?.({
    label,
    done,
    total,
    ratio: total > 0 ? done / total : 0,
  })
}

/**
 * Prefer lo-fi / compact hosted paths for minimal download size; fall back to standard.
 */
function audioPathForCache(detail: TagDetail, part: string, quality: AudioEncodeQuality): string | null {
  return (
    storageAudioPath(detail, part, quality) ??
    storageAudioPath(detail, part, 'lofi') ??
    storageAudioPath(detail, part, 'compact') ??
    storageAudioPath(detail, part, 'standard') ??
    storageAudioPath(detail, part, 'original')
  )
}

/**
 * Download this tag’s sheet pages and/or learning tracks into {@link sheetsPack} /
 * {@link audioPack}. Does **not** create a favorite.
 */
export async function cacheTagMediaToPacks(
  detail: TagDetail,
  opts: {
    sheets?: boolean
    audio?: boolean
    /** Default `lofi` — smallest published tier when available. */
    audioQuality?: AudioEncodeQuality
    onProgress?: (p: CacheTagMediaProgress) => void
  } = {},
): Promise<void> {
  const wantSheets = opts.sheets !== false
  const wantAudio = opts.audio !== false
  if (!wantSheets && !wantAudio) return
  const quality = opts.audioQuality ?? 'lofi'

  await withOfflineNetworkAllow(async () => {
    const jobs: PackJob[] = []

    if (wantSheets) {
      // Keep metadata with the sheets pack so Offline reopen doesn’t need the network.
      const metaPath = `tags/${detail.tag_id}/metadata.json`
      jobs.push({
        pack: 'sheets',
        url: tagDetailUrl(detail.tag_id),
        path: metaPath,
        label: 'Tag details',
      })
      for (const path of sheetDisplayPages(detail)) {
        jobs.push({ pack: 'sheets', url: mediaUrl(path), path, label: 'Sheet' })
      }
    }

    if (wantAudio) {
      for (const part of listAudioParts(detail)) {
        const path = audioPathForCache(detail, part, quality)
        if (!path) continue
        jobs.push({
          pack: 'audio',
          url: mediaUrl(path),
          path,
          label: part,
        })
      }
    }

    const total = Math.max(jobs.length, 1)
    let done = 0
    report(opts.onProgress, 'Loading media…', done, total)

    for (const job of jobs) {
      const store = job.pack === 'sheets' ? sheetsPack : audioPack
      if (await store.has(job.url)) {
        done++
        report(opts.onProgress, `Already cached · ${job.label}`, done, total)
        continue
      }
      report(opts.onProgress, `Loading ${job.label}…`, done, total)
      const res = await fetch(job.url)
      if (!res.ok) {
        throw new Error(`Could not load ${job.label} (${res.status})`)
      }
      const contentType = res.headers.get('Content-Type') || ''
      const buf = await res.arrayBuffer()
      if (!isPlausibleDownloadBody(buf, contentType, job.path)) {
        throw new Error(`Invalid media body for ${job.label}`)
      }
      await store.put(
        job.url,
        new Response(buf, {
          status: 200,
          headers: {
            'Content-Type': contentType || 'application/octet-stream',
          },
        }),
      )
      done++
      report(opts.onProgress, `Saved ${job.label}`, done, total)
    }
  })
}
