/**
 * Build / enqueue download-queue items from selected catalog tags.
 */
import type { PartId, TagDetail } from '../types/tag'
import type { QueueTrack } from '../download/zip'
import { catalogOriginalPaths } from './audioTiers'
import { downloadableSheetAssets } from './sheetAssets'
import { partTrackLabel } from './parts'

export type QueueDownloadMode = 'sheets' | 'tracks' | 'all'

/** Queue rows for one tag detail according to sheets / tracks / everything. */
export function queueTracksFromTagDetail(
  d: TagDetail,
  mode: QueueDownloadMode,
): QueueTrack[] {
  const title = d.title || `Tag ${d.tag_id}`
  const items: QueueTrack[] = []

  if (mode === 'sheets' || mode === 'all') {
    for (const s of downloadableSheetAssets(d)) {
      items.push({
        kind: 'sheet',
        tagId: d.tag_id,
        title,
        part: s.id,
        path: s.path,
        label: s.label,
      })
    }
  }

  if (mode === 'tracks' || mode === 'all') {
    const originals = catalogOriginalPaths(d)
    const parts = Object.keys(originals) as PartId[]
    const prefer = parts.filter((p) => p !== 'mix')
    const use = prefer.length ? prefer : parts
    for (const part of use) {
      items.push({
        kind: 'audio',
        tagId: d.tag_id,
        title,
        part,
        path: originals[part]!,
        label: partTrackLabel(part),
      })
    }
  }

  return items
}

export type QueueSelectedTagsResult = {
  ok: number
  skipped: number
  message: string
}

function modeLabel(mode: QueueDownloadMode): string {
  if (mode === 'sheets') return 'sheets'
  if (mode === 'tracks') return 'tracks'
  return 'sheets and tracks'
}

/**
 * Load details for selected tag ids and add matching files to the export queue.
 */
export async function queueSelectedTags(opts: {
  ids: Iterable<number>
  mode: QueueDownloadMode
  offline: boolean
  loadDetail: (id: number) => Promise<TagDetail | null>
  addMany: (items: QueueTrack[]) => void
}): Promise<QueueSelectedTagsResult> {
  let ok = 0
  let skipped = 0
  for (const id of opts.ids) {
    const d = await opts.loadDetail(id)
    if (!d) {
      skipped++
      continue
    }
    const items = queueTracksFromTagDetail(d, opts.mode)
    if (!items.length) {
      skipped++
      continue
    }
    opts.addMany(items)
    ok++
  }
  const what = modeLabel(opts.mode)
  const message =
    skipped > 0
      ? opts.offline
        ? `Queued ${what} from ${ok} tag(s); ${skipped} skipped (not cached on device).`
        : `Queued ${what} from ${ok} tag(s); skipped ${skipped}.`
      : ok
        ? `Queued ${what} from ${ok} tag(s).`
        : opts.offline
          ? 'No cached tag details — open tags online once, or reconnect.'
          : 'No files queued.'
  return { ok, skipped, message }
}
