/**
 * Bidirectional digit ↔ English number-word forms for search.
 * Folded output is lowercase, hyphen-free (spaces only).
 */

const ONES = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
] as const

const TENS = [
  '',
  '',
  'twenty',
  'thirty',
  'forty',
  'fifty',
  'sixty',
  'seventy',
  'eighty',
  'ninety',
] as const

const WORD_TO_VALUE: Record<string, number> = (() => {
  const m: Record<string, number> = {
    oh: 0,
    nought: 0,
    hundred: 100,
    thousand: 1000,
  }
  ONES.forEach((w, i) => {
    m[w] = i
  })
  TENS.forEach((w, i) => {
    if (w) m[w] = i * 10
  })
  return m
})()

/** 0–99 → words (e.g. 45 → "forty five"). */
export function twoDigitWords(n: number): string {
  const v = ((n % 100) + 100) % 100
  if (v < 20) return ONES[v]!
  const ten = TENS[Math.floor(v / 10)]!
  const one = v % 10
  return one ? `${ten} ${ONES[one]}` : ten
}

/** Standard cardinal words for a non-negative integer (up to millions). */
export function cardinalWords(n: number): string {
  if (!Number.isFinite(n) || n < 0) return ''
  if (n < 100) return twoDigitWords(n)
  if (n < 1000) {
    const h = Math.floor(n / 100)
    const rest = n % 100
    return rest ? `${ONES[h]} hundred ${twoDigitWords(rest)}` : `${ONES[h]} hundred`
  }
  if (n < 1_000_000) {
    const thousands = Math.floor(n / 1000)
    const rest = n % 1000
    const head = `${cardinalWords(thousands)} thousand`
    if (!rest) return head
    if (rest < 100) return `${head} ${twoDigitWords(rest)}`
    return `${head} ${cardinalWords(rest)}`
  }
  return String(n)
}

/**
 * Year / casual grouping from the right in pairs:
 * 345 → "three forty five", 1776 → "seventeen seventy six".
 */
export function groupedWords(digits: string): string {
  const d = digits.replace(/^0+/, '') || '0'
  if (d.length <= 2) return twoDigitWords(Number(d))
  const parts: string[] = []
  let i = d.length
  while (i > 0) {
    const start = Math.max(0, i - 2)
    const chunk = d.slice(start, i)
    parts.unshift(twoDigitWords(Number(chunk)))
    i = start
  }
  return parts.join(' ')
}

/** Digit-by-digit: 345 → "three four five". */
export function digitByDigitWords(digits: string): string {
  return [...digits].map((ch) => ONES[Number(ch)] ?? ch).join(' ')
}

const DIGITS_RE = /^\d+$/

export function isDigitToken(token: string): boolean {
  return DIGITS_RE.test(token)
}

export function isNumberWord(token: string): boolean {
  return Object.prototype.hasOwnProperty.call(WORD_TO_VALUE, token)
}

/**
 * All searchable surface forms for a digit string (space-separated phrases).
 * Includes the digits themselves, cardinal, grouped, and digit-by-digit readings.
 */
export function numberWordPhrases(digits: string): string[] {
  if (!DIGITS_RE.test(digits)) return []
  const forms = new Set<string>([digits])
  const n = Number(digits)
  if (Number.isSafeInteger(n)) {
    const card = cardinalWords(n)
    if (card) forms.add(card)
  }
  forms.add(groupedWords(digits))
  forms.add(digitByDigitWords(digits))
  return [...forms].filter(Boolean)
}

/** Flatten phrases into individual tokens for inverted-index postings. */
export function numberWordTokens(digits: string): string[] {
  const out = new Set<string>()
  for (const phrase of numberWordPhrases(digits)) {
    if (DIGITS_RE.test(phrase)) {
      out.add(phrase)
      continue
    }
    for (const w of phrase.split(/\s+/)) if (w) out.add(w)
  }
  return [...out]
}

function parseCardinal(tokens: string[]): number | null {
  let total = 0
  let current = 0
  for (const w of tokens) {
    const v = WORD_TO_VALUE[w]
    if (v == null) return null
    if (v === 100) {
      current = (current || 1) * 100
    } else if (v === 1000) {
      total += (current || 1) * 1000
      current = 0
    } else if (v < 10) {
      if (current >= 20 && current % 10 === 0) current += v
      else if (current === 0 || current % 100 === 0) current += v
      else return null
    } else if (v < 20) {
      if (current % 10 !== 0 && current !== 0 && current < 100) return null
      current += v
    } else if (v <= 90) {
      if (current % 100 !== 0 && current !== 0 && current < 100) return null
      current += v
    } else {
      return null
    }
  }
  return total + current
}

/**
 * Parse a run of number-words into a digit string.
 * Supports cardinals ("three hundred forty five" → 345) and
 * grouped readings ("three forty five" → 345, "seventeen seventy six" → 1776).
 */
export function wordsToDigits(tokens: string[]): string | null {
  if (!tokens.length || !tokens.every(isNumberWord)) return null

  if (tokens.some((t) => t === 'hundred' || t === 'thousand')) {
    const n = parseCardinal(tokens)
    return n == null ? null : String(n)
  }

  // Single small number-word
  if (tokens.length === 1) {
    const v = WORD_TO_VALUE[tokens[0]!]!
    if (v <= 90) return String(v)
    return null
  }

  // Grouped: consume into 0–99 chunks, concatenate digit strings
  const parts: number[] = []
  let i = 0
  while (i < tokens.length) {
    const v = WORD_TO_VALUE[tokens[i]!]!
    if (v >= 20 && v <= 90) {
      if (i + 1 < tokens.length) {
        const ones = WORD_TO_VALUE[tokens[i + 1]!]!
        if (ones > 0 && ones < 10) {
          parts.push(v + ones)
          i += 2
          continue
        }
      }
      parts.push(v)
      i++
    } else if (v < 20) {
      parts.push(v)
      i++
    } else {
      return null
    }
  }
  if (!parts.length) return null
  const [head, ...rest] = parts
  return String(head) + rest.map((p) => String(p).padStart(2, '0')).join('')
}

/**
 * Expand a single folded token with digit ↔ word equivalents (single-token forms).
 * Multi-word phrases are handled separately via {@link numberWordPhrases}.
 */
export function expandNumberToken(token: string): string[] {
  const out = new Set<string>([token])
  if (isDigitToken(token)) {
    for (const t of numberWordTokens(token)) out.add(t)
    return [...out]
  }
  if (isNumberWord(token)) {
    const digits = wordsToDigits([token])
    if (digits != null) {
      out.add(digits)
      for (const t of numberWordTokens(digits)) out.add(t)
    }
  }
  return [...out]
}
