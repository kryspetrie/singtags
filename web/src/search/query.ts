/**
 * Search query AST and string parser (`field:value`, phrases, year bounds, …).
 */

import { foldText, tokenize } from './normalize'

/** Indexed tag field names for `field:value` filters. */
export type FieldName =
  | 'title'
  | 'arranger'
  | 'key'
  | 'type'
  | 'collection'
  | 'classic'
  | 'year'

/** One field filter with one or more OR/AND values (engine unions values per field). */
export interface FieldFilter {
  field: FieldName
  values: string[]
  /** OR within values (default true). */
  mode: 'or' | 'and'
}

/** Parsed search state consumed by {@link SearchEngine.search}. */
export interface SearchQuery {
  /** Inclusive free-text tokens (title by default; lyrics when fullText). */
  include: string[]
  /** Exclusive tokens — hit docs are removed. */
  exclude: string[]
  /** Exact phrase (already folded). */
  phrases: string[]
  fields: FieldFilter[]
  fullText: boolean
  hasAudio: boolean | null
  hasSheet: boolean | null
  /** Inclusive calendar year lower bound (from chips or yearMin: DSL). */
  yearMin: number | null
  /** Inclusive calendar year upper bound (from chips or yearMax: DSL). */
  yearMax: number | null
  /** Title sort letters to keep (A–Z, 0–9, #). */
  titleLetters: string[]
  raw: string
}

const FIELD_RE =
  /\b(arranger|title|key|type|collection|classic|year):(?:"([^"]+)"|(\S+))/gi
const PHRASE_RE = /"([^"]+)"/g
const YEAR_MIN_RE = /\byearMin:(\d{4})\b/gi
const YEAR_MAX_RE = /\byearMax:(\d{4})\b/gi
const HAS_AUDIO_RE = /\b(hasAudio|noAudio)\b/gi
const HAS_SHEET_RE = /\b(hasSheet|noSheet)\b/gi
/** Strip legacy minRating: tokens so shared URLs do not become free-text noise. */
const LEGACY_MIN_RATING_RE = /\bminRating:(\d+(?:\.\d+)?)/gi

function parseYearToken(n: string): number | null {
  const y = Number(n)
  return y >= 1000 && y <= 2100 ? y : null
}

/**
 * Parse a raw search box string into a {@link SearchQuery}.
 * @param fullText When true, free-text tokens also match lyrics (when indexed).
 */
export function parseQuery(raw: string, fullText = false): SearchQuery {
  let rest = raw
  const fields: FieldFilter[] = []
  const phrases: string[] = []

  rest = rest.replace(LEGACY_MIN_RATING_RE, ' ')

  let yearMin: number | null = null
  rest = rest.replace(YEAR_MIN_RE, (_m, n: string) => {
    yearMin = parseYearToken(n)
    return ' '
  })

  let yearMax: number | null = null
  rest = rest.replace(YEAR_MAX_RE, (_m, n: string) => {
    yearMax = parseYearToken(n)
    return ' '
  })

  let hasAudio: boolean | null = null
  rest = rest.replace(HAS_AUDIO_RE, (_m, flag: string) => {
    hasAudio = flag.toLowerCase() === 'hasaudio'
    return ' '
  })

  let hasSheet: boolean | null = null
  rest = rest.replace(HAS_SHEET_RE, (_m, flag: string) => {
    hasSheet = flag.toLowerCase() === 'hassheet'
    return ' '
  })

  rest = rest.replace(FIELD_RE, (_m, field: string, quoted?: string, bare?: string) => {
    const value = (quoted ?? bare ?? '').trim()
    if (value) {
      fields.push({
        field: field.toLowerCase() as FieldName,
        values: [value],
        mode: 'or',
      })
    }
    return ' '
  })

  rest = rest.replace(PHRASE_RE, (_m, phrase: string) => {
    const f = foldText(phrase)
    if (f) phrases.push(f)
    return ' '
  })

  const include: string[] = []
  const exclude: string[] = []
  for (const part of rest.split(/\s+/)) {
    if (!part) continue
    if (part.startsWith('-') && part.length > 1) {
      exclude.push(...tokenize(part.slice(1)))
    } else if (part.startsWith('+') && part.length > 1) {
      include.push(...tokenize(part.slice(1)))
    } else {
      include.push(...tokenize(part))
    }
  }

  return {
    include,
    exclude,
    phrases,
    fields,
    fullText,
    hasAudio,
    hasSheet,
    yearMin,
    yearMax,
    titleLetters: [],
    raw,
  }
}
