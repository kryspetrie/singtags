import { zipSync } from 'fflate'
import type { PartId } from '../types/tag'
import type { AudioTransform, AudioEncodeQuality, DownloadFormat } from '../types/audio'
import { encodeQualityForDownload, IDENTITY_TRANSFORM, normalizeDownloadFormat } from '../types/audio'
import { mediaUrl } from '../lib/mediaUrl'
import { downloadFilename, prepareDownloadBytes } from './transform'

export const MAX_QUEUE_TRACKS = 100

/** How tracks are arranged inside the downloaded zip. */
export type ZipLayout = 'flat' | 'folders'

export function normalizeZipLayout(value: unknown): ZipLayout {
  return value === 'flat' ? 'flat' : 'folders'
}

export interface QueueTrack {
  tagId: number
  title: string
  part: PartId
  /** Relative path under media base or absolute URL. */
  path: string
  format?: DownloadFormat
  transform?: AudioTransform
}

export function sampleUrl(path: string): string {
  return mediaUrl(path)
}

export async function fetchBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Download failed ${res.status}: ${url}`)
  return new Uint8Array(await res.arrayBuffer())
}

export function buildZip(
  files: Array<{ name: string; data: Uint8Array }>,
): Uint8Array {
  const tree: Record<string, Uint8Array> = {}
  for (const f of files) tree[f.name] = f.data
  return zipSync(tree, { level: 6 })
}

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

export interface ZipOptions {
  onProgress?: (done: number, total: number) => void
  signal?: AbortSignal
  defaultFormat?: DownloadFormat
  defaultTransform?: AudioTransform
  /** `folders` = one folder per tag; `flat` = all files in zip root. */
  layout?: ZipLayout
  encodeQuality?: AudioEncodeQuality
}

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
    throw new Error(`Zip limited to ${MAX_QUEUE_TRACKS} tracks`)
  }
  const files: Array<{ name: string; data: Uint8Array }> = []
  let done = 0
  for (const t of tracks) {
    if (opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const raw = await fetchBytes(sampleUrl(t.path))
    const format = normalizeDownloadFormat(t.format ?? opts.defaultFormat)
    const transform = t.transform ?? opts.defaultTransform ?? IDENTITY_TRANSFORM
    const data = await prepareDownloadBytes({
      input: raw,
      format,
      transform,
      signal: opts.signal,
      encodeQuality: encodeQualityForDownload(format),
    })
    const fileName = downloadFilename(t.part, format, transform)
    files.push({
      name: queueTrackZipPath(t, fileName, layout),
      data,
    })
    done += 1
    opts.onProgress?.(done, tracks.length)
  }
  const zipped = buildZip(files)
  downloadBlob(zipped, `singtags-${tracks.length}-tracks.zip`, 'application/zip')
}
