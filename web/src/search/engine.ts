/**
 * In-memory catalog search: inverted indexes over tag summaries and optional lyrics.
 * Parses {@link SearchQuery} from the query DSL and supports browse sort helpers.
 */

import { expandTokens, type ExpansionMap } from './expansions'
import { foldText, tokenize } from './normalize'
import {
  expandNumberToken,
  isDigitToken,
  isNumberWord,
  numberWordPhrases,
  numberWordTokens,
  wordsToDigits,
} from './numbers'
import type { FieldName, SearchQuery } from './query'
import type { TagSummary } from '../types/tag'
import { normalizeYear } from '../lib/year'
import { splitArrangerNames, titleSortLetter } from './browse'
import { collectionSearchTokens, collectionTextTokens, isClassicCollection } from '../lib/collections'

/** Lyrics document keyed by tag id for full-text search. */
export interface LyricDoc {
  id: number
  lyrics: string
}

/** Inputs to build a {@link SearchEngine} index at catalog load. */
export interface SearchEngineOptions {
  tags: TagSummary[]
  expansions: ExpansionMap
  lyrics?: LyricDoc[]
}

/** Inverted index: folded token → set of tag ids. */
type Posting = Map<string, Set<number>>

function emptyPosting(): Posting {
  return new Map()
}

/** Digits / classic booklet / tag-number tokens: match whole value only (c2 ≠ c20, n2 ≠ n20). */
function isExactNumericToken(token: string): boolean {
  return (
    /^\d+$/.test(token) ||
    /^c\d+$/.test(token) ||
    /^classic\d+$/.test(token) ||
    /^p\d+$/.test(token) ||
    /^100days\d+$/.test(token) ||
    /^n\d+$/.test(token)
  )
}

/** Add one posting for `token` → tag `id`. */
function addToken(index: Posting, token: string, id: number): void {
  let set = index.get(token)
  if (!set) {
    set = new Set()
    index.set(token, set)
  }
  set.add(id)
}

/** Tokenize `text`, index tokens (plus digit↔word expansions) for tag `id`. */
function addAllTokens(index: Posting, text: string, id: number): void {
  const toks = tokenize(text)
  for (const tok of toks) {
    addToken(index, tok, id)
    if (isDigitToken(tok)) {
      for (const w of numberWordTokens(tok)) addToken(index, w, id)
    }
  }
  // Number-word runs → digit tokens (e.g. "three forty five" → 345)
  let i = 0
  while (i < toks.length) {
    if (!isNumberWord(toks[i]!)) {
      i++
      continue
    }
    let j = i + 1
    while (j < toks.length && isNumberWord(toks[j]!)) j++
    const run = toks.slice(i, j)
    const digits = wordsToDigits(run)
    if (digits) {
      addToken(index, digits, id)
      for (const w of numberWordTokens(digits)) addToken(index, w, id)
    }
    i = j
  }
}

/** Folded haystack plus digit ↔ word surface forms for phrase / substring checks. */
function enrichFoldedHay(folded: string): string {
  const toks = tokenize(folded)
  const extras: string[] = []
  for (const tok of toks) {
    if (isDigitToken(tok)) extras.push(...numberWordPhrases(tok))
  }
  let i = 0
  while (i < toks.length) {
    if (!isNumberWord(toks[i]!)) {
      i++
      continue
    }
    let j = i + 1
    while (j < toks.length && isNumberWord(toks[j]!)) j++
    const digits = wordsToDigits(toks.slice(i, j))
    if (digits) extras.push(digits, ...numberWordPhrases(digits))
    i = j
  }
  if (!extras.length) return folded
  return `${folded} ${extras.join(' ')}`
}

function intersect(a: Set<number> | null, b: Set<number>): Set<number> {
  if (!a) return new Set(b)
  const out = new Set<number>()
  // iterate smaller
  const [small, large] = a.size <= b.size ? [a, b] : [b, a]
  for (const id of small) if (large.has(id)) out.add(id)
  return out
}

function unionMany(sets: Array<Set<number> | undefined>): Set<number> {
  const out = new Set<number>()
  for (const s of sets) {
    if (!s) continue
    for (const id of s) out.add(id)
  }
  return out
}

function collectPrefixHits(index: Posting, prefix: string, out: Set<number>): void {
  for (const [key, ids] of index) {
    if (key.startsWith(prefix)) {
      for (const id of ids) out.add(id)
    }
  }
}

function prefixPosting(index: Posting, prefix: string): Set<number> {
  const out = new Set<number>()
  collectPrefixHits(index, prefix, out)
  return out
}

function fieldHaystack(tag: TagSummary, field: FieldName): string {
  switch (field) {
    case 'title':
      return foldText(`${tag.title ?? ''} ${tag.altTitle ?? ''}`)
    case 'arranger':
      return foldText(tag.arranger ?? '')
    case 'key':
      return foldText(`${tag.key ?? ''} ${tag.writKey ?? ''}`)
    case 'type':
      return foldText(tag.type ?? '')
    case 'collection':
      return foldText(tag.collection ?? '')
    case 'classic':
      // Booklet # filter applies to Classic series only (100 Days uses p#).
      return isClassicCollection(tag.collection)
        ? foldText(String(tag.classic ?? ''))
        : ''
    case 'year': {
      const y = normalizeYear(tag.year)
      return y != null ? foldText(String(y)) : ''
    }
    default:
      return ''
  }
}

function titleTextBlob(tag: TagSummary): string {
  return enrichFoldedHay(
    foldText(`${tag.title ?? ''} ${tag.altTitle ?? ''} ${tag.arranger ?? ''} ${tag.key ?? ''}`),
  )
}

/** Full haystack for verify (title text + exact id/classic tokens, no id→word pollution). */
function titleBlobOf(tag: TagSummary): string {
  const booklet = collectionSearchTokens(tag.collection, tag.classic)
    .map((t) => ` ${t}`)
    .join('')
  const collText = collectionTextTokens(tag.collection)
    .map((t) => ` ${t}`)
    .join('')
  return `${titleTextBlob(tag)} ${tag.id} n${tag.id}${booklet}${collText}`.trim()
}

function addExactIdTokens(index: Posting, tag: TagSummary): void {
  addToken(index, String(tag.id), tag.id)
  addToken(index, `n${tag.id}`, tag.id)
  for (const tok of collectionSearchTokens(tag.collection, tag.classic)) {
    addToken(index, tok, tag.id)
  }
  for (const tok of collectionTextTokens(tag.collection)) {
    addToken(index, tok, tag.id)
  }
}

/**
 * In-memory search over ~7.5k tags.
 * Indexes (built once at load; lyrics index when FTS data arrives):
 * - titleTokens: free-text default
 * - fieldTokens: per-field token postings for filter acceleration
 * - lyricTokens: full-text
 * Memory preferred over repeated full scans / network round-trips.
 */
export class SearchEngine {
  private readonly tags: TagSummary[]
  private readonly byId: Map<number, TagSummary>
  private readonly expansions: ExpansionMap
  private readonly titleBlob = new Map<number, string>()
  private readonly titleTokens: Posting = emptyPosting()
  private readonly fieldTokens: Record<FieldName, Posting> = {
    title: emptyPosting(),
    arranger: emptyPosting(),
    key: emptyPosting(),
    type: emptyPosting(),
    collection: emptyPosting(),
    classic: emptyPosting(),
    year: emptyPosting(),
  }
  private readonly fieldBlob = new Map<string, string>() // `${field}:${id}`
  private readonly lyricFold = new Map<number, string>()
  private lyricTokens: Posting | null = null
  private readonly allIds: Set<number>

  /** Build inverted indexes from catalog tags (and optional lyrics). */
  constructor(opts: SearchEngineOptions) {
    this.tags = opts.tags
    this.byId = new Map(opts.tags.map((t) => [t.id, t]))
    this.expansions = opts.expansions
    this.allIds = new Set(opts.tags.map((t) => t.id))

    for (const tag of opts.tags) {
      const text = titleTextBlob(tag)
      this.titleBlob.set(tag.id, titleBlobOf(tag))
      addAllTokens(this.titleTokens, text, tag.id)
      addExactIdTokens(this.titleTokens, tag)

      const fields: FieldName[] = [
        'title',
        'arranger',
        'key',
        'type',
        'collection',
        'classic',
        'year',
      ]
      for (const field of fields) {
        const hay = enrichFoldedHay(fieldHaystack(tag, field))
        this.fieldBlob.set(`${field}:${tag.id}`, hay)
        addAllTokens(this.fieldTokens[field], hay, tag.id)
      }
    }

    if (opts.lyrics) this.setLyrics(opts.lyrics)
  }

  /** Replace or attach lyrics docs and invalidate the lazy lyric index. */
  setLyrics(docs: LyricDoc[]): void {
    this.lyricFold.clear()
    this.lyricTokens = null
    for (const doc of docs) {
      this.lyricFold.set(doc.id, enrichFoldedHay(foldText(doc.lyrics)))
    }
  }

  private ensureLyricIndex(): Posting {
    if (this.lyricTokens) return this.lyricTokens
    const idx = emptyPosting()
    for (const [id, text] of this.lyricFold) {
      addAllTokens(idx, text, id)
    }
    this.lyricTokens = idx
    return idx
  }

  private idsForToken(token: string, fullText: boolean): Set<number> {
    // Digit queries: exact digit / n{digit} only, plus AND of full number-word phrases.
    // Never OR individual words from expansions (3558 must not match every "five").
    if (isDigitToken(token)) {
      const sets: Array<Set<number> | undefined> = [
        this.titleTokens.get(token),
        this.titleTokens.get(`n${token}`),
      ]
      if (fullText) {
        const lyr = this.ensureLyricIndex()
        sets.push(lyr.get(token), lyr.get(`n${token}`))
      }
      for (const phrase of numberWordPhrases(token)) {
        if (isDigitToken(phrase)) continue
        const words = phrase.split(/\s+/).filter(Boolean)
        if (!words.length) continue
        if (words.length === 1) {
          sets.push(this.titleTokens.get(words[0]!))
          if (fullText) sets.push(this.ensureLyricIndex().get(words[0]!))
          continue
        }
        let hit: Set<number> | null = null
        let ok = true
        for (const w of words) {
          const posting = unionMany([
            this.titleTokens.get(w),
            fullText ? this.ensureLyricIndex().get(w) : undefined,
          ])
          if (!posting.size) {
            ok = false
            break
          }
          hit = intersect(hit, posting)
        }
        if (ok && hit) sets.push(hit)
      }
      return unionMany(sets)
    }

    const alts = new Set<string>([
      ...expandTokens([token], this.expansions),
      ...expandNumberToken(token),
    ])
    const sets: Array<Set<number> | undefined> = []
    for (const a of alts) {
      sets.push(this.titleTokens.get(a))
      if (fullText) {
        sets.push(this.ensureLyricIndex().get(a))
      }
    }
    // Prefix / partial: "apri" → april (not for digits / c12 / n12 tokens).
    if (!isExactNumericToken(token)) {
      sets.push(this.idsMatchingPrefix(token, fullText))
      for (const a of alts) {
        if (a !== token && !isExactNumericToken(a)) {
          sets.push(this.idsMatchingPrefix(a, fullText))
        }
      }
    }
    return unionMany(sets)
  }

  /** Tokens in the inverted index that start with `prefix` (case already folded). */
  private idsMatchingPrefix(prefix: string, fullText: boolean): Set<number> {
    if (!prefix) return new Set()
    const out = new Set<number>()
    collectPrefixHits(this.titleTokens, prefix, out)
    if (fullText) collectPrefixHits(this.ensureLyricIndex(), prefix, out)
    return out
  }

  private applyFieldFilter(candidates: Set<number>, field: FieldName, values: string[]): Set<number> {
    let out: Set<number> | null = null
    for (const value of values) {
      const folded = foldText(value)
      if (!folded) continue

      // Classic booklet #: exact numeric match only (classic:2 ≠ classic 20).
      if (field === 'classic') {
        const n = Number(folded.replace(/^c(?:lassic)?\s*/i, '').trim())
        const verified = new Set<number>()
        if (Number.isFinite(n)) {
          for (const id of candidates) {
            const tag = this.byId.get(id)
            if (tag && Number(tag.classic) === n) verified.add(id)
          }
        }
        out = out ? new Set([...out, ...verified]) : verified
        continue
      }

      const toks = tokenize(folded)
      let hit: Set<number> | null = null
      if (toks.length) {
        for (const tok of toks) {
          const posting = unionMany([
            this.fieldTokens[field].get(tok),
            isExactNumericToken(tok) ? undefined : prefixPosting(this.fieldTokens[field], tok),
          ])
          hit = intersect(hit, posting)
        }
      } else {
        hit = new Set()
      }
      // Substring verify (handles partial arranger names / punctuation fold edge cases)
      const verified = new Set<number>()
      for (const id of hit ?? []) {
        if (!candidates.has(id)) continue
        const hay = this.fieldBlob.get(`${field}:${id}`) ?? ''
        if (field === 'arranger') {
          const tag = this.byId.get(id)
          const names = splitArrangerNames(tag?.arranger)
          if (
            names.some((n) => {
              const fn = foldText(n)
              return fn === folded || fn.includes(folded)
            }) ||
            hay.includes(folded)
          ) {
            verified.add(id)
          }
          continue
        }
        if (hay.includes(folded)) verified.add(id)
      }
      out = out ? new Set([...out, ...verified]) : verified
    }
    return out ?? new Set()
  }

  private matchesMeta(tag: TagSummary, query: SearchQuery): boolean {
    if (query.hasAudio === true && tag.audioParts.length === 0) return false
    if (query.hasAudio === false && tag.audioParts.length > 0) return false
    if (query.hasSheet === true && !tag.hasSheet) return false
    if (query.hasSheet === false && tag.hasSheet) return false
    if (query.yearMin != null || query.yearMax != null) {
      const y = normalizeYear(tag.year)
      if (y == null) {
        // Browse "<1920" includes missing years — keep them when only an upper bound < 1920 is set.
        return query.yearMin == null && query.yearMax != null && query.yearMax < 1920
      }
      if (query.yearMin != null && y < query.yearMin) return false
      if (query.yearMax != null && y > query.yearMax) return false
    }
    if (query.titleLetters?.length) {
      const letter = titleSortLetter(tag.title)
      if (!query.titleLetters.includes(letter)) return false
    }
    return true
  }

  private textOk(id: number, query: SearchQuery): boolean {
    const title = this.titleBlob.get(id) ?? ''
    const lyric = query.fullText ? (this.lyricFold.get(id) ?? '') : ''
    const hay = query.fullText ? `${title} ${lyric}` : title
    const hayTokens = new Set(tokenize(hay))

    for (const phrase of query.phrases) {
      if (!this.phraseOk(hay, hayTokens, phrase)) return false
    }
    for (const raw of query.exclude) {
      if (this.tokenMatchesHay(raw, hay, hayTokens)) return false
    }
    for (const raw of query.include) {
      if (!this.tokenMatchesHay(raw, hay, hayTokens)) return false
    }
    return true
  }

  private tokenMatchesHay(raw: string, hay: string, hayTokens: Set<string>): boolean {
    const alts = new Set<string>([
      ...expandTokens([raw], this.expansions),
      ...(isDigitToken(raw) ? [raw, `n${raw}`] : expandNumberToken(raw)),
    ])
    for (const a of alts) {
      if (!a) continue
      // Exact numeric / classic / tag-number tokens: whole-token only (c2 ≠ c20, 2 ≠ 20).
      if (isExactNumericToken(a) || isDigitToken(a)) {
        if (hayTokens.has(a)) return true
        continue
      }
      if (hay.includes(a) || hayTokens.has(a)) return true
      // Prefix: query "apri" vs token "april"
      for (const ht of hayTokens) {
        if (ht.startsWith(a)) return true
      }
    }
    // Digit query: full number-word phrase must appear (quoted-style), not loose OR of words.
    if (isDigitToken(raw)) {
      for (const phrase of numberWordPhrases(raw)) {
        if (isDigitToken(phrase)) continue
        if (hay.includes(phrase)) return true
        const words = phrase.split(/\s+/).filter(Boolean)
        if (words.length === 1 && hayTokens.has(words[0]!)) return true
        if (words.length > 1 && words.every((w) => hayTokens.has(w))) return true
      }
      return false
    }
    // Word → digit against numeric tokens present in the haystack
    for (const ht of hayTokens) {
      if (isDigitToken(ht)) {
        const forms = new Set(expandNumberToken(ht))
        if ([...alts].some((a) => forms.has(a))) return true
      }
      if (expandNumberToken(raw).includes(ht)) return true
    }
    return false
  }

  private phraseOk(hay: string, hayTokens: Set<string>, phrase: string): boolean {
    if (hay.includes(phrase)) return true
    const words = tokenize(phrase)
    if (words.length && words.every(isNumberWord)) {
      const digits = wordsToDigits(words)
      if (digits && (hay.includes(digits) || hayTokens.has(digits))) return true
    }
    // Number-word phrase vs digit-indexed title: all words present as tokens
    if (words.length > 1 && words.every(isNumberWord) && words.every((w) => hayTokens.has(w))) {
      return true
    }
    return false
  }

  /**
   * Run a search and return matching tags in catalog order.
   * Empty query (no text, fields, or meta filters) returns the full tag list.
   */
  search(query: SearchQuery): TagSummary[] {
    const empty =
      !query.include.length &&
      !query.exclude.length &&
      !query.phrases.length &&
      !query.fields.length &&
      query.hasAudio == null &&
      query.hasSheet == null &&
      query.yearMin == null &&
      query.yearMax == null &&
      !query.titleLetters?.length

    if (empty) return this.tags.slice()

    let candidates: Set<number> | null = null

    for (const tok of query.include) {
      const hit = this.idsForToken(tok, query.fullText)
      candidates = intersect(candidates, hit)
    }

    if (candidates == null) candidates = new Set(this.allIds)

    for (const f of query.fields) {
      candidates = this.applyFieldFilter(candidates, f.field, f.values)
    }

    const out: TagSummary[] = []
    for (const id of candidates) {
      const tag = this.byId.get(id)
      if (!tag) continue
      if (!this.matchesMeta(tag, query)) continue
      if (!this.textOk(id, query)) continue
      out.push(tag)
    }
    return out
  }
}

/** Sort tag summaries for browse or legacy list modes (does not mutate input). */
export function sortTags(
  tags: TagSummary[],
  mode: 'title' | 'arranger' | 'rating' | 'downloads' | 'classic' | 'year',
): TagSummary[] {
  const copy = [...tags]
  /** Punctuation-insensitive, case-insensitive string order. */
  const cmpStr = (a: string | null | undefined, b: string | null | undefined) =>
    foldText(a ?? '').localeCompare(foldText(b ?? ''), undefined, { sensitivity: 'base' })
  switch (mode) {
    case 'title':
      return copy.sort((a, b) => cmpStr(a.title, b.title))
    case 'arranger':
      return copy.sort(
        (a, b) => cmpStr(a.arranger, b.arranger) || cmpStr(a.title, b.title),
      )
    case 'rating':
      return copy.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
    case 'downloads':
      return copy.sort((a, b) => (b.downloads ?? 0) - (a.downloads ?? 0))
    case 'classic':
      return copy.sort((a, b) => {
        const ac = Number(a.classic ?? Infinity)
        const bc = Number(b.classic ?? Infinity)
        return ac - bc || cmpStr(a.title, b.title)
      })
    case 'year':
      return copy.sort((a, b) => (normalizeYear(b.year) ?? 0) - (normalizeYear(a.year) ?? 0))
    default:
      return copy
  }
}

/** Distinct non-empty string values for a tag field (sorted, folded). */
export function uniqueFieldValues(
  tags: TagSummary[],
  field: 'arranger' | 'key' | 'type' | 'collection',
): string[] {
  const set = new Set<string>()
  for (const t of tags) {
    const v = t[field]
    if (typeof v === 'string' && v.trim()) set.add(v)
  }
  return [...set].sort((a, b) => foldText(a).localeCompare(foldText(b)))
}

export { tokenize }
