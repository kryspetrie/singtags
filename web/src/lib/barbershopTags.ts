/**
 * URL helpers for barbershoptags.com tag pages (slug is best-effort; id is authoritative).
 */

/** Slug for barbershoptags.com tag URLs (best-effort; site resolves by id). */
export function barbershopTagsTitleSlug(title: string): string {
  return title
    .trim()
    .replace(/[''""]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Public tag page on barbershoptags.com. */
export function barbershopTagsTagUrl(tagId: number, title?: string | null): string {
  const base = `https://www.barbershoptags.com/tag-${tagId}`
  if (!title?.trim()) return base
  const slug = barbershopTagsTitleSlug(title)
  return slug ? `${base}-${slug}` : base
}
