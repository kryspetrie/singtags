/**
 * Enumerate hybrid path pairs with beam caps (Phase K5).
 */
import { combineKeyChangePaths } from './keyChangeHybrids'
import type { ModulationPath } from './keyChangeShared'

export type EnumerateHybridOpts = {
  /** Max combined chord count. */
  maxLength: number
  /** Max first-path candidates considered (beam). */
  beamWidth?: number
  /** Max hybrids returned. */
  limit?: number
}

/**
 * Combine compatible same-trip paths (different characters) under length + beam caps.
 */
export function enumerateHybridPairs(
  paths: readonly ModulationPath[],
  opts: EnumerateHybridOpts,
): ModulationPath[] {
  const beam = Math.max(1, opts.beamWidth ?? 8)
  const limit = Math.max(1, opts.limit ?? 12)
  const maxLength = Math.max(2, opts.maxLength)

  // Prefer non-hybrid bases; take best by rank within character.
  const bases = paths
    .filter((p) => p.character !== 'hybrid' && p.length >= 2)
    .slice()
    .sort((a, b) => a.rank - b.rank || a.length - b.length)
    .slice(0, beam * 2)

  const byChar = new Map<string, ModulationPath[]>()
  for (const p of bases) {
    const list = byChar.get(p.character) ?? []
    list.push(p)
    byChar.set(p.character, list)
  }
  for (const [k, list] of byChar) {
    byChar.set(k, list.slice(0, beam))
  }

  const chars = [...byChar.keys()]
  const out: ModulationPath[] = []
  const seen = new Set<string>()

  for (let i = 0; i < chars.length; i++) {
    for (let j = 0; j < chars.length; j++) {
      if (i === j) continue
      const aList = byChar.get(chars[i]!) ?? []
      const bList = byChar.get(chars[j]!) ?? []
      for (const a of aList) {
        for (const b of bList) {
          if (a.id === b.id) continue
          if (
            a.fromTonality !== b.fromTonality ||
            a.toTonality !== b.toTonality
          ) {
            continue
          }
          const combined = combineKeyChangePaths(a, b)
          if (!combined) continue
          if (combined.length > maxLength) continue
          const key = combined.steps.map((s) => `${s.rootPc}:${s.natureId}`).join('|')
          if (seen.has(key)) continue
          seen.add(key)
          out.push({
            ...combined,
            templateId: `hybrid-${a.character}-${b.character}`,
            label: `${a.character} ⊕ ${b.character} (${combined.length} chords)`,
            reason: `Beam-capped hybrid: ${a.label} spliced into ${b.label}.`,
            rank: Math.min(a.rank, b.rank) + 5,
          })
          if (out.length >= limit) return out
        }
      }
    }
  }
  return out
}
