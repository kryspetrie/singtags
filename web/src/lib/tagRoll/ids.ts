/**
 * Short URL-friendly Tag Studio project ids (nanoid).
 * Local-only — length favors typability over global uniqueness.
 */
import { customAlphabet } from 'nanoid'

/** Alphanumeric only — easier to type/read in `/tag-studio/:id` URLs. */
const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'

/** ~10 chars ≈ 60 bits — fine for a handful of local projects. */
export const TAG_ROLL_PROJECT_ID_LENGTH = 10

const gen = customAlphabet(alphabet, TAG_ROLL_PROJECT_ID_LENGTH)

export function newTagRollProjectId(): string {
  return gen()
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Legacy keys from `newLocalId('tr')` → `tr_<uuid>`, or a bare UUID.
 */
export function isLegacyTagRollProjectId(id: string): boolean {
  const s = id.trim()
  if (!s) return false
  if (UUID_RE.test(s)) return true
  if (s.startsWith('tr_') && UUID_RE.test(s.slice(3))) return true
  return false
}
