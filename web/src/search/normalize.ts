/** Punctuation-insensitive token folding for SingTags search. */

const APOSTROPHES = /[''`´‘’]/g
const NON_ALNUM = /[^a-z0-9\s]+/g

export function foldText(input: string): string {
  return input
    .toLowerCase()
    .replace(APOSTROPHES, '')
    .replace(NON_ALNUM, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function normalizeToken(token: string): string {
  return foldText(token).replace(/\s+/g, '')
}

export function tokenize(input: string): string[] {
  const folded = foldText(input)
  if (!folded) return []
  return folded.split(' ').filter(Boolean)
}
