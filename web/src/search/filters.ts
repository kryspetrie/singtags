/**
 * Structured catalog filter chips merged with debounced free-text search.
 * Serializes to URL query params alongside `q`.
 */

import type { FieldFilter, SearchQuery } from './query'
import { parseQuery } from './query'

/** Chip/filter state applied immediately (merged with debounced free-text `q`). */
export interface CatalogFilters {
  fullText: boolean
  hasSheet: boolean | null
  hasAudio: boolean | null
  minRating: number | null
  /** Inclusive calendar year lower bound. */
  yearMin: number | null
  /** Inclusive calendar year upper bound. */
  yearMax: number | null
  arrangers: string[]
  types: string[]
  collections: string[]
  /** Title A–Z / 0–9 / # section letters (from browse section “Filter to”). */
  titleLetters: string[]
}

/** Default empty chip filter state. */
export const EMPTY_FILTERS: CatalogFilters = {
  fullText: false,
  hasSheet: null,
  hasAudio: null,
  minRating: null,
  yearMin: null,
  yearMax: null,
  arrangers: [],
  types: [],
  collections: [],
  titleLetters: [],
}

/** Count active chip filters (for badge display). */
export function activeFilterCount(f: CatalogFilters): number {
  let n = 0
  if (f.hasSheet === true) n++
  if (f.hasAudio === true) n++
  if (f.minRating != null) n++
  if (f.yearMin != null || f.yearMax != null) n++
  n += f.arrangers.length + f.types.length + f.collections.length + f.titleLetters.length
  return n
}

/** Merge debounced free-text DSL with structured chip filters. Chips win on conflicts. */
export function buildSearchQuery(text: string, filters: CatalogFilters): SearchQuery {
  const base = parseQuery(text, filters.fullText)
  const fields: FieldFilter[] = [...base.fields]

  const pushField = (field: FieldFilter['field'], values: string[]) => {
    const cleaned = values.map((v) => v.trim()).filter(Boolean)
    if (!cleaned.length) return
    // One filter per field so values OR within the field (engine unions values).
    fields.push({ field, values: cleaned, mode: 'or' })
  }
  pushField('arranger', filters.arrangers)
  pushField('type', filters.types)
  pushField('collection', filters.collections)

  return {
    ...base,
    fullText: filters.fullText,
    fields,
    minRating: filters.minRating ?? base.minRating,
    hasAudio: filters.hasAudio ?? base.hasAudio,
    hasSheet: filters.hasSheet ?? base.hasSheet,
    yearMin: filters.yearMin ?? base.yearMin,
    yearMax: filters.yearMax ?? base.yearMax,
    titleLetters: filters.titleLetters.length ? [...filters.titleLetters] : base.titleLetters,
  }
}

/** Serialize structured filters into URL query params (alongside q). */
export function filtersToRouteQuery(f: CatalogFilters): Record<string, string | undefined> {
  return {
    ft: f.fullText ? '1' : undefined,
    sheet: f.hasSheet === true ? '1' : f.hasSheet === false ? '0' : undefined,
    audio: f.hasAudio === true ? '1' : f.hasAudio === false ? '0' : undefined,
    min: f.minRating != null ? String(f.minRating) : undefined,
    ymin: f.yearMin != null ? String(f.yearMin) : undefined,
    ymax: f.yearMax != null ? String(f.yearMax) : undefined,
    arr: f.arrangers.length ? f.arrangers.join('|') : undefined,
    type: f.types.length ? f.types.join('|') : undefined,
    col: f.collections.length ? f.collections.join('|') : undefined,
    tl: f.titleLetters.length ? f.titleLetters.join('|') : undefined,
  }
}

function parseYearParam(raw: string): number | null {
  if (!/^\d{4}$/.test(raw)) return null
  const n = Number(raw)
  return n >= 1000 && n <= 2100 ? n : null
}

/** Rehydrate {@link CatalogFilters} from Vue Router query params. */
export function filtersFromRouteQuery(query: Record<string, unknown>): Partial<CatalogFilters> {
  const str = (k: string) => (typeof query[k] === 'string' ? (query[k] as string) : '')
  const split = (k: string) => str(k).split('|').map((s) => s.trim()).filter(Boolean)
  const sheet = str('sheet')
  const audio = str('audio')
  const min = str('min')
  return {
    fullText: str('ft') === '1' || str('ft') === 'true',
    hasSheet: sheet === '1' ? true : sheet === '0' ? false : null,
    hasAudio: audio === '1' ? true : audio === '0' ? false : null,
    minRating: min ? Number(min) : null,
    yearMin: parseYearParam(str('ymin')),
    yearMax: parseYearParam(str('ymax')),
    arrangers: split('arr'),
    types: split('type'),
    collections: split('col'),
    titleLetters: split('tl'),
  }
}
