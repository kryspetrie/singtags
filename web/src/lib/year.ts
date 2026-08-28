/** Coerce catalog `year` values to a calendar year.

 * Indexes sometimes store `date_posted` strings like `Wed, 13 Dec 2023`
 * when no explicit Year field exists — those must not become sort sections.
 */
export function normalizeYear(raw: string | number | null | undefined): number | null {
  if (raw == null || raw === '') return null
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return null
    const n = Math.trunc(raw)
    return n >= 1000 && n <= 2100 ? n : null
  }
  const s = String(raw).trim()
  if (/^\d{4}$/.test(s)) {
    const n = Number(s)
    return n >= 1000 && n <= 2100 ? n : null
  }
  // Prefer a plausible calendar year token inside date strings / free text.
  const matches = s.match(/\b(?:1[7-9]\d{2}|20\d{2})\b/g)
  if (!matches?.length) return null
  return Number(matches[matches.length - 1])
}
