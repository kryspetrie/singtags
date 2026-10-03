/**
 * Pure helpers for Harmonize Suggest — match/canApply/open-seed without Vue.
 */

export type SuggestApplyMode = 'sketch' | 'stack'

export type SuggestCandidateKey = {
  rootPc: number
  natureId: string
  voicing?: string | null
  spread?: boolean | null
}

export type SuggestCandidateLike = SuggestCandidateKey & {
  midi?: { bass: number; bari: number; lead: number; tenor: number }
}

/**
 * Prefer exact voicing+spread, then voicing, then chord identity.
 * Pass `exact: true` to require voicing+spread when those fields are set (Stack Apply).
 */
export function matchSuggestCandidate<T extends SuggestCandidateLike>(
  list: readonly T[],
  key: SuggestCandidateKey,
  opts?: { exact?: boolean },
): T | null {
  if (!list.length) return null
  const { rootPc, natureId, voicing, spread } = key
  if (voicing) {
    if (spread != null) {
      const exactHit = list.find(
        (c) =>
          c.rootPc === rootPc &&
          c.natureId === natureId &&
          c.voicing === voicing &&
          !!c.spread === !!spread,
      )
      if (exactHit) return exactHit
      if (opts?.exact) return null
    } else if (opts?.exact) {
      return (
        list.find(
          (c) => c.rootPc === rootPc && c.natureId === natureId && c.voicing === voicing,
        ) ?? null
      )
    }
    const byVoicing = list.find(
      (c) => c.rootPc === rootPc && c.natureId === natureId && c.voicing === voicing,
    )
    if (byVoicing) return byVoicing
    if (opts?.exact) return null
  }
  if (opts?.exact && voicing) return null
  return list.find((c) => c.rootPc === rootPc && c.natureId === natureId) ?? null
}

export function canApplyHarmonizeSuggest(opts: {
  hasMatch: boolean
  hasMelody: boolean
  hasChord: boolean
  applyMode: SuggestApplyMode
  hasVoicing: boolean
}): boolean {
  if (opts.hasMatch) return true
  if (!opts.hasMelody || !opts.hasChord) return false
  if (opts.applyMode === 'sketch') return true
  return opts.hasVoicing
}

export function coachOpenSeedFromSelection(opts: {
  tick: number
  match?: SuggestCandidateKey | null
  rootPc?: number
  natureId?: string | null
  voicing?: string | null
}): {
  tick: number
  rootPc?: number
  natureId?: string
  voicing?: string | null
} {
  const match = opts.match
  return {
    tick: opts.tick,
    rootPc: match?.rootPc ?? (opts.natureId ? opts.rootPc : undefined),
    natureId: match?.natureId ?? opts.natureId ?? undefined,
    voicing: match?.voicing ?? opts.voicing ?? null,
  }
}

/** Index into `filtered` for a seed; prefers exact voicing then chord identity. */
export function indexOfSeedInCandidates<T extends SuggestCandidateLike>(
  filtered: readonly T[],
  seed: { rootPc?: number; natureId?: string; voicing?: string | null },
): number {
  if (seed.rootPc == null || !seed.natureId) return -1
  if (seed.voicing) {
    const exact = filtered.findIndex(
      (c) =>
        c.rootPc === seed.rootPc && c.natureId === seed.natureId && c.voicing === seed.voicing,
    )
    if (exact >= 0) return exact
  }
  return filtered.findIndex((c) => c.rootPc === seed.rootPc && c.natureId === seed.natureId)
}
