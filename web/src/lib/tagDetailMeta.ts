/**
 * Build condensed metadata rows for the tag detail panel.
 * Omits empty fields; lyrics is the only multiline value.
 */

import type { TagDetail } from '../types/tag'
import { collectionLabel, collectionNumberBadge } from './collections'
import { normalizeYear } from './year'
import { barbershopTagsTagUrl } from './barbershopTags'

/** One label/value pair (optional link or multiline body) in the tag detail list. */
export type TagDetailRow = {
  label: string
  value: string
  multiline?: boolean
  href?: string
}

/** True when a catalog string field has non-whitespace content. */
function hasText(v: string | null | undefined): v is string {
  return typeof v === 'string' && v.trim().length > 0
}

/** Condensed detail rows — omit empty fields; lyrics is the only multiline value. */
export function buildTagDetailRows(d: TagDetail): TagDetailRow[] {
  const rows: TagDetailRow[] = []

  if (hasText(d.alt_title)) rows.push({ label: 'Alt title', value: d.alt_title.trim() })
  if (hasText(d.arranger)) rows.push({ label: 'Arranger', value: d.arranger.trim() })
  if (hasText(d.key)) rows.push({ label: 'Key', value: d.key.trim() })
  if (hasText(d.writ_key) && d.writ_key.trim() !== d.key?.trim()) {
    rows.push({ label: 'Written key', value: d.writ_key.trim() })
  }
  if (hasText(d.type)) rows.push({ label: 'Type', value: d.type.trim() })
  if (hasText(d.collection)) {
    rows.push({
      label: 'Collection',
      value: collectionLabel(d.collection) || d.collection.trim(),
    })
  }
  const booklet = collectionNumberBadge(d.collection, d.classic)
  if (booklet) {
    rows.push({ label: booklet.label.split(' #')[0] + ' #', value: String(booklet.number) })
  }
  const year = normalizeYear(d.year)
  if (year != null) rows.push({ label: 'Year', value: String(year) })
  if (d.rating != null) {
    let rating = `★ ${d.rating.toFixed(2)}`
    if (d.rating_count != null) rating += ` (${d.rating_count})`
    rows.push({ label: 'Rating', value: rating })
  }
  if (d.download_count != null) rows.push({ label: 'Downloads', value: String(d.download_count) })

  const audioParts = Object.keys(d.audio)
  if (audioParts.length) rows.push({ label: 'Audio', value: audioParts.join(', ') })

  if (d.sheet_pages?.length) {
    rows.push({ label: 'Sheet', value: `${d.sheet_pages.length} pg` })
  } else if (d.sheet) {
    rows.push({ label: 'Sheet', value: 'Yes' })
  }

  rows.push({
    label: 'Source',
    value: 'barbershoptags.com',
    href: barbershopTagsTagUrl(d.tag_id, d.title),
  })

  if (hasText(d.lyrics)) rows.push({ label: 'Lyrics', value: d.lyrics.trim(), multiline: true })

  return rows
}
