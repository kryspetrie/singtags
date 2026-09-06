/**
 * Filename heuristics for Local Library imports: part ids + song titles.
 */
import { PRIMARY_PARTS, partLabel, type PrimaryPartId } from './parts'

/** Trailing voice / mix tokens stripped from titles and mapped to part ids. */
const PART_TOKEN_ALIASES: Array<{ re: RegExp; partId: PrimaryPartId | 'custom' }> = [
  { re: /^(full|mix|all\s*parts?|together|learning\s*tracks?|ultr?a?\s*mix)$/i, partId: 'mix' },
  { re: /^(lead|melody|melody\s*lead)$/i, partId: 'lead' },
  { re: /^(tenor|ten)$/i, partId: 'tenor' },
  { re: /^(bari|baritone|bar)$/i, partId: 'bari' },
  { re: /^(bass|basses)$/i, partId: 'bass' },
  { re: /^(solo|other)$/i, partId: 'custom' },
]

const TRAILING_PART_RE =
  /\s*[-–—_]\s*(full|mix|all\s*parts?|together|learning\s*tracks?|lead|melody|tenor|ten|bari|baritone|bar|bass|basses|solo|other)\s*$/i

const PAREN_PART_RE =
  /\s*[\(\[]\s*(full|mix|all\s*parts?|together|lead|melody|tenor|ten|bari|baritone|bar|bass|basses|solo|other)\s*[\)\]]\s*$/i

function stemFromFilename(filename: string): string {
  return filename.replace(/\.[^.]+$/, '').trim() || filename.trim()
}

function normalizePartToken(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ')
}

function mapTokenToPartId(token: string): string | null {
  const t = normalizePartToken(token)
  if (!t) return null
  for (const { re, partId } of PART_TOKEN_ALIASES) {
    if (re.test(t)) {
      if (partId === 'custom') return slugifyPartId(t)
      return partId
    }
  }
  return null
}

/** Stable custom part id from a free-form stem. */
export function slugifyPartId(raw: string): string {
  const s = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return s || 'track'
}

/**
 * Guess a catalog-shaped part id from a filename or label.
 * Returns null when nothing voice-like is found (caller may keep a custom id).
 */
export function guessPartIdFromFilename(filename: string): string | null {
  const stem = stemFromFilename(filename)
  if (!stem) return null

  // Whole stem is a part name: "Lead.mp3"
  const whole = mapTokenToPartId(stem)
  if (whole) return whole

  // Trailing " - Lead" / "_Bass"
  const trail = stem.match(TRAILING_PART_RE)
  if (trail?.[1]) {
    const mapped = mapTokenToPartId(trail[1])
    if (mapped) return mapped
  }

  // Trailing "(Lead)" / "[Bass]"
  const paren = stem.match(PAREN_PART_RE)
  if (paren?.[1]) {
    const mapped = mapTokenToPartId(paren[1])
    if (mapped) return mapped
  }

  // Embedded token: "Song Title Lead Track"
  for (const primary of PRIMARY_PARTS) {
    const re = new RegExp(`(?:^|[\\s_\\-–—])${primary}(?:$|[\\s_\\-–—])`, 'i')
    if (re.test(stem)) return primary
  }
  if (/\bbaritone\b/i.test(stem)) return 'bari'
  if (/\bmelody\b/i.test(stem)) return 'lead'
  if (/\bfull\b/i.test(stem)) return 'mix'

  return null
}

/**
 * Display label for a track after import: prefer part label for known voices,
 * otherwise the cleaned filename stem.
 */
export function defaultTrackLabel(filename: string, partId: string | null | undefined): string {
  if (partId && (PRIMARY_PARTS as readonly string[]).includes(partId)) {
    return partLabel(partId)
  }
  return songTitleFromFilename(filename)
}

/** Strip trailing part tokens from a filename stem for a song title. */
export function songTitleFromFilename(filename: string): string {
  let stem = stemFromFilename(filename)
  stem = stem.replace(TRAILING_PART_RE, '').replace(PAREN_PART_RE, '').trim()
  return stem || stemFromFilename(filename) || 'Untitled'
}

/** Longest common prefix of stems, trimmed at word boundaries when possible. */
export function guessSongTitleFromFilenames(filenames: string[]): string {
  if (!filenames.length) return 'Untitled'
  const stems = filenames.map(songTitleFromFilename)
  if (stems.length === 1) return stems[0] || 'Untitled'
  let prefix = stems[0] ?? ''
  for (let i = 1; i < stems.length; i++) {
    const s = stems[i] ?? ''
    let j = 0
    while (j < prefix.length && j < s.length && prefix[j]!.toLowerCase() === s[j]!.toLowerCase()) {
      j++
    }
    prefix = prefix.slice(0, j)
  }
  prefix = prefix.replace(/[\s_\-–—]+$/g, '').trim()
  if (prefix.length >= 2) return prefix
  return stems[0] || 'Untitled'
}

/**
 * Pick a unique TagPlayer part key for a track asset.
 * Prefers `partId`, then a slug of the label/filename; disambiguates collisions.
 */
export function uniqueTrackPartKey(
  preferred: string | null | undefined,
  fallbackLabel: string,
  used: Set<string>,
): string {
  const base =
    (preferred?.trim() && slugifyPartId(preferred)) ||
    slugifyPartId(fallbackLabel) ||
    'track'
  if (!used.has(base)) {
    used.add(base)
    return base
  }
  let n = 2
  while (used.has(`${base}${n}`)) n++
  const key = `${base}${n}`
  used.add(key)
  return key
}

/** Infer partId for an existing asset (migration / hydrate). */
export function inferPartIdForAsset(asset: {
  role: string
  filename: string
  label: string
}): string | null {
  if (asset.role !== 'track') return null
  return (
    guessPartIdFromFilename(asset.filename) ??
    guessPartIdFromFilename(asset.label) ??
    null
  )
}
