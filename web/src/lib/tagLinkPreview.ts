/**
 * Share-card copy for tag pages (browser document meta + prerender parity).
 * Server-side Open Graph HTML is built by build/prerender_tag_link_previews.py.
 */
import type { TagDetail, TagSummary } from '../types/tag'
import { collectionBadge, collectionLabel } from './collections'
import { normalizeYear } from './year'

function hasText(v: string | null | undefined): v is string {
  return typeof v === 'string' && v.trim().length > 0
}

function isPreviewImagePath(path: string | null | undefined): boolean {
  if (!hasText(path)) return false
  const clean = path.split('?', 1)[0].toLowerCase()
  return /\.(webp|png|jpe?g|gif)$/.test(clean)
}

/** True when metadata has a raster thumb suitable for og:image. */
export function tagHasOgImage(
  d: Pick<TagDetail, 'sheet_og' | 'sheet_preview'> | null | undefined,
): boolean {
  if (!d) return false
  return isPreviewImagePath(d.sheet_og) || isPreviewImagePath(d.sheet_preview)
}

function lyricsExcerpt(
  lyrics: string | null | undefined,
  maxChars = 180,
): string | null {
  if (!hasText(lyrics)) return null
  const oneLine = lyrics.trim().replace(/\s+/g, ' ')
  if (oneLine.length <= maxChars) return oneLine
  const cut = oneLine.slice(0, maxChars - 1).replace(/\s+\S*$/, '').replace(/[,;:]+$/, '')
  return `${cut || oneLine.slice(0, maxChars - 1)}…`
}

/** One-line description for og:description / document meta. */
export function tagLinkPreviewDescription(
  d: Pick<
    TagDetail,
    | 'arranger'
    | 'key'
    | 'year'
    | 'type'
    | 'collection'
    | 'classic'
    | 'lyrics'
    | 'sheet_og'
    | 'sheet_preview'
  >,
  opts?: { includeLyricsFallback?: boolean },
): string {
  const parts: string[] = []
  if (hasText(d.arranger)) parts.push(`Arranged by ${d.arranger.trim()}`)
  if (hasText(d.key)) parts.push(d.key.trim())
  const year = normalizeYear(d.year)
  if (year != null) parts.push(String(year))
  const badge = collectionBadge(d.collection, d.classic)
  if (badge) parts.push(badge.label)
  else if (hasText(d.collection)) {
    parts.push(collectionLabel(d.collection) || d.collection.trim())
  }
  if (hasText(d.type)) parts.push(d.type.trim())
  const base = parts.length ? parts.join(' · ') : 'Barbershop tag on SingTags'
  const wantLyrics = opts?.includeLyricsFallback !== false && !tagHasOgImage(d)
  if (wantLyrics) {
    const excerpt = lyricsExcerpt(d.lyrics)
    if (excerpt) return `${base} — ${excerpt}`
  }
  return base
}

export function tagLinkPreviewTitle(
  title: string | null | undefined,
  tagId: number | string,
): string {
  const t = (title ?? '').trim()
  return t || `Tag ${tagId}`
}

export function tagDocumentTitle(
  title: string | null | undefined,
  tagId: number | string,
): string {
  return `${tagLinkPreviewTitle(title, tagId)} · SingTags`
}

/** Prefer full detail; fall back to catalog summary fields. */
export function tagLinkPreviewDescriptionFromSources(
  detail: TagDetail | null | undefined,
  summary: TagSummary | null | undefined,
): string {
  if (detail) return tagLinkPreviewDescription(detail)
  if (summary) {
    return tagLinkPreviewDescription({
      arranger: summary.arranger,
      key: summary.key,
      year: summary.year,
      type: summary.type,
      collection: summary.collection,
      classic: summary.classic,
    })
  }
  return 'Barbershop tag on SingTags'
}
