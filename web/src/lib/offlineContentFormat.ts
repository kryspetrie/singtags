/**
 * Media-format stamps for Browse offline packs (the actual sheet/track bytes).
 *
 * Bump {@link SHEETS_CONTENT_FORMAT_ID} / {@link AUDIO_CONTENT_FORMAT_ID} **only** when
 * SingTags.com publish output changes such that old cached *files* would break the app
 * (incompatible encoding/container). Do **not** bump for catalog growth, path list
 * updates, or Drive manifest metadata — those keep existing Drive objects.
 *
 * A media-format bump clears that pack locally and deletes only that pack’s hashed
 * objects on Drive (the other pack’s ~hundreds of MB stay put).
 */

export const SHEETS_CONTENT_FORMAT_ID = 'sheets-webp-v1'
export const AUDIO_CONTENT_FORMAT_ID = 'audio-lofi-v1'

export const OFFLINE_CONTENT_FORMAT_KEY = 'singtags.offline.contentFormat.v1'

export type OfflineContentFormatStamp = {
  sheets: string
  audio: string
}

export function currentOfflineContentFormat(): OfflineContentFormatStamp {
  return {
    sheets: SHEETS_CONTENT_FORMAT_ID,
    audio: AUDIO_CONTENT_FORMAT_ID,
  }
}

export function readOfflineContentFormatStamp(): OfflineContentFormatStamp | null {
  try {
    const raw = localStorage.getItem(OFFLINE_CONTENT_FORMAT_KEY)
    if (!raw) return null
    const v = JSON.parse(raw) as Partial<OfflineContentFormatStamp>
    if (typeof v.sheets !== 'string' || typeof v.audio !== 'string') return null
    return { sheets: v.sheets, audio: v.audio }
  } catch {
    return null
  }
}

export function writeOfflineContentFormatStamp(stamp: OfflineContentFormatStamp): void {
  try {
    localStorage.setItem(OFFLINE_CONTENT_FORMAT_KEY, JSON.stringify(stamp))
  } catch {
    /* ignore */
  }
}

/** Which packs must be cleared because their *media* format no longer matches. */
export function packsNeedingFormatReset(
  stored: OfflineContentFormatStamp | null,
  current: OfflineContentFormatStamp = currentOfflineContentFormat(),
): { sheets: boolean; audio: boolean } {
  if (!stored) {
    // First run: stamp current formats without wiping (empty cache is fine).
    return { sheets: false, audio: false }
  }
  return {
    sheets: stored.sheets !== current.sheets,
    audio: stored.audio !== current.audio,
  }
}
