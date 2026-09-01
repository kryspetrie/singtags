export type FavoritesSharePayload = {
  tagIds: number[]
  name?: string
}

function normalizeTagIds(tagIds: number[]): number[] {
  return [
    ...new Set(
      tagIds.filter((id) => Number.isSafeInteger(id) && id > 0),
    ),
  ]
}

/** Parse comma- or whitespace-separated positive integer tag ids. */
export function parseTagIdList(text: string): number[] {
  return normalizeTagIds(
    text
      .split(/[\s,]+/)
      .filter((part) => /^\d+$/.test(part))
      .map(Number),
  )
}

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function fromBase64Url(raw: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(raw)) throw new Error('Invalid payload')
  const base64 = raw.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='))
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
}

/** Encode a versioned, compact, URL-safe favorites share payload. */
export function encodeFavoritesSharePayload(tagIds: number[], name?: string): string {
  const payload: { v: 1; ids: number[]; name?: string } = {
    v: 1,
    ids: normalizeTagIds(tagIds),
  }
  const normalizedName = name?.trim()
  if (normalizedName) payload.name = normalizedName
  return toBase64Url(JSON.stringify(payload))
}

/** Decode and validate a favorites share payload. */
export function decodeFavoritesSharePayload(raw: string): FavoritesSharePayload | null {
  try {
    const parsed = JSON.parse(fromBase64Url(raw)) as unknown
    if (!parsed || typeof parsed !== 'object') return null
    const payload = parsed as Record<string, unknown>
    if (payload.v !== 1 || !Array.isArray(payload.ids)) return null
    if (
      payload.ids.some(
        (id) => typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0,
      )
    ) {
      return null
    }
    if (payload.name !== undefined && typeof payload.name !== 'string') return null

    const tagIds = normalizeTagIds(payload.ids as number[])
    const name = (payload.name as string | undefined)?.trim()
    return name ? { tagIds, name } : { tagIds }
  } catch {
    return null
  }
}

/** Build the app-relative URL for importing a shared favorites list. */
export function favoritesSharePath(tagIds: number[], name?: string): string {
  const payload = encodeFavoritesSharePayload(tagIds, name)
  return `/favorites?import=${encodeURIComponent(payload)}`
}
