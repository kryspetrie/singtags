/**
 * Lightweight zip-queue types (no fflate / encode / bake imports).
 * Keep this module free of heavy download deps so Browse/shell can import types safely.
 */

import type { PartId } from '../types/tag'
import type { AudioTransform, DownloadFormat } from '../types/audio'
import { mediaUrl } from '../lib/mediaUrl'

/** Maximum tracks allowed in one zip (guard against huge queues). */
export const MAX_QUEUE_TRACKS = 100

/** How tracks are arranged inside the downloaded zip. */
export type ZipLayout = 'flat' | 'folders'

/** Audio or sheet row in the bulk download zip queue. */
export type QueueItemKind = 'audio' | 'sheet'

/** Normalize persisted layout preference (`flat` or default `folders`). */
export function normalizeZipLayout(value: unknown): ZipLayout {
  return value === 'flat' ? 'flat' : 'folders'
}

/** One queued audio part or sheet asset awaiting download. */
export interface QueueTrack {
  tagId: number
  title: string
  /**
   * Audio part id, or sheet asset id (e.g. `pdf-…`, `image-…`).
   * Used with tagId as the stable queue key.
   */
  part: PartId | string
  /** Relative path under media base or absolute URL. */
  path: string
  /** Defaults to `audio` for older persisted queue rows. */
  kind?: QueueItemKind
  /** Display label for sheets (PDF / Image) or optional audio override. */
  label?: string
  format?: DownloadFormat
  transform?: AudioTransform
}

/** Resolve audio vs sheet for a queue row (defaults to audio). */
export function queueItemKind(t: Pick<QueueTrack, 'kind'>): QueueItemKind {
  return t.kind === 'sheet' ? 'sheet' : 'audio'
}

/** Absolute fetch URL for a catalog-relative queue path. */
export function sampleUrl(path: string): string {
  return mediaUrl(path)
}
