/**
 * Multi-track download queue: fetch, transform, zip, and trigger browser save.
 */

import { zipSync } from 'fflate'
import type { AudioTransform, AudioEncodeQuality, DownloadFormat } from '../types/audio'
import { encodeQualityForDownload, IDENTITY_TRANSFORM, normalizeDownloadFormat } from '../types/audio'
import { downloadFilename, prepareDownloadBytes } from './transform'
import {
  MAX_QUEUE_TRACKS,
  queueItemKind,
  sampleUrl,
  type QueueTrack,
  type ZipLayout,
} from './zipTypes'

export {
  MAX_QUEUE_TRACKS,
  normalizeZipLayout,
  queueItemKind,
  sampleUrl,
  type QueueTrack,
  type QueueItemKind,
  type ZipLayout,
} from './zipTypes'

/** Final filename inside the zip for one queue item. */
export function queueItemFileName(t: QueueTrack, format: DownloadFormat, transform: AudioTransform): string {
  if (queueItemKind(t) === 'sheet') {
    return t.path.split('/').pop() || t.label || 'sheet'
  }
  return downloadFilename(String(t.part), format, transform)
}

/** Fetch a URL and return raw bytes (throws on non-OK status). */
export async function fetchBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Download failed ${res.status}: ${url}`)
  return new Uint8Array(await res.arrayBuffer())
}

/** Build a deflate zip from named file entries (level 6). */
export function buildZip(
  files: Array<{ name: string; data: Uint8Array }>,
): Uint8Array {
  const tree: Record<string, Uint8Array> = {}
  for (const f of files) tree[f.name] = f.data
  return zipSync(tree, { level: 6 })
}

/** Trigger a browser download of in-memory bytes. */
export function downloadBlob(
  data: Uint8Array,
  filename: string,
  mime = 'application/octet-stream',
): void {
  const copy = new Uint8Array(data.byteLength)
  copy.set(data)
  const blob = new Blob([copy.buffer], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** Path inside the zip for one track (flat or per-tag folder layout). */
export function queueTrackZipPath(
  track: Pick<QueueTrack, 'tagId' | 'title'>,
  fileName: string,
  layout: ZipLayout = 'folders',
): string {
  const safeTitle = (track.title || `tag-${track.tagId}`).replace(/[^\w.\-]+/g, '_')
  const folder = `${track.tagId}-${safeTitle}`
  if (layout === 'flat') return `${folder}-${fileName}`
  return `${folder}/${fileName}`
}

/** Progress, abort, format, and layout options for {@link zipQueueTracks}. */
export interface ZipOptions {
  onProgress?: (done: number, total: number) => void
  signal?: AbortSignal
  defaultFormat?: DownloadFormat
  defaultTransform?: AudioTransform
  /** `folders` = one folder per tag; `flat` = all files in zip root. */
  layout?: ZipLayout
  encodeQuality?: AudioEncodeQuality
}

/**
 * Download all queue tracks, encode audio, zip, and save `singtags-N-files.zip`.
 */
export async function zipQueueTracks(
  tracks: QueueTrack[],
  onProgressOrOpts?: ((done: number, total: number) => void) | ZipOptions,
): Promise<void> {
  const opts: ZipOptions =
    typeof onProgressOrOpts === 'function'
      ? { onProgress: onProgressOrOpts }
      : (onProgressOrOpts ?? {})
  const layout = opts.layout ?? 'folders'

  if (tracks.length > MAX_QUEUE_TRACKS) {
    throw new Error(`Zip limited to ${MAX_QUEUE_TRACKS} files`)
  }
  const files: Array<{ name: string; data: Uint8Array }> = []
  let done = 0
  for (const t of tracks) {
    if (opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const raw = await fetchBytes(sampleUrl(t.path))
    const format = normalizeDownloadFormat(t.format ?? opts.defaultFormat)
    const transform = t.transform ?? opts.defaultTransform ?? IDENTITY_TRANSFORM
    let data = raw
    if (queueItemKind(t) === 'audio') {
      data = await prepareDownloadBytes({
        input: raw,
        format,
        transform,
        signal: opts.signal,
        encodeQuality: opts.encodeQuality ?? encodeQualityForDownload(format),
      })
    }
    const fileName = queueItemFileName(t, format, transform)
    files.push({
      name: queueTrackZipPath(t, fileName, layout),
      data,
    })
    done += 1
    opts.onProgress?.(done, tracks.length)
  }
  const zipped = buildZip(files)
  downloadBlob(zipped, `singtags-${tracks.length}-files.zip`, 'application/zip')
}
