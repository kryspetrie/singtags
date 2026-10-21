/**
 * Pure helpers: cycle inversion / Closed↔Wide among ranked Coach candidates.
 */
import type { HarmonizeCandidate } from '../../domain/arranging/harmonize'

function sameChord(a: HarmonizeCandidate, b: HarmonizeCandidate): boolean {
  return a.rootPc === b.rootPc && a.natureId === b.natureId
}

/**
 * Next candidate index that keeps root+nature, steps unique voicing labels.
 * Prefers matching the current spread when choosing the new voicing row.
 */
export function indexAfterVoicingStep(
  list: readonly HarmonizeCandidate[],
  fromIndex: number,
  dir: -1 | 1,
): number | null {
  if (!list.length) return null
  const cur = list[Math.max(0, Math.min(fromIndex, list.length - 1))]!
  const same = list
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => sameChord(c, cur))
  const seen = new Set<string>()
  const byVoice: { i: number; v: string }[] = []
  for (const { c, i } of same) {
    const v = c.voicing ?? ''
    if (seen.has(v)) continue
    seen.add(v)
    byVoice.push({ i, v })
  }
  if (byVoice.length < 2) return null
  const curV = cur.voicing ?? ''
  let idx = byVoice.findIndex((x) => x.v === curV)
  if (idx < 0) idx = 0
  const next = byVoice[(idx + dir + byVoice.length) % byVoice.length]!
  const prefer = list.findIndex(
    (c) =>
      sameChord(c, cur) &&
      (c.voicing ?? '') === next.v &&
      !!c.spread === !!cur.spread,
  )
  return prefer >= 0 ? prefer : next.i
}

/** Candidate with same root+nature+voicing and opposite Closed/Wide. */
export function indexAfterSpreadToggle(
  list: readonly HarmonizeCandidate[],
  fromIndex: number,
): number | null {
  if (!list.length) return null
  const cur = list[Math.max(0, Math.min(fromIndex, list.length - 1))]!
  const want = !cur.spread
  const hit = list.findIndex(
    (c) =>
      sameChord(c, cur) &&
      (c.voicing ?? '') === (cur.voicing ?? '') &&
      !!c.spread === want,
  )
  return hit >= 0 ? hit : null
}
