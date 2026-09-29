/**
 * Trim long modulation paths to fit a chord/measure budget (Phase K3b).
 */
import type { ModulationChord, ModulationPath } from './keyChangeShared'
import { modulationPathId as pathId } from './keyChangeShared'

export type TrimPathOpts = {
  /** Max chords including arrival. */
  maxLength: number
}

function keepEssential(steps: ModulationChord[]): ModulationChord[] {
  if (steps.length <= 2) return [...steps]
  const first = steps[0]!
  const last = steps[steps.length - 1]!
  const v7 = steps.find(
    (s, i) =>
      i > 0 &&
      i < steps.length - 1 &&
      s.natureId === 'seventh' &&
      (s.romanTo === 'V7' || /V7 of new|swing to V7|confirm new/i.test(s.role)),
  )
  const mid = steps.slice(1, -1)
  const essentialMid = v7 ? [v7] : mid.length ? [mid[Math.floor(mid.length / 2)]!] : []
  const merged = [first, ...essentialMid, last]
  const out: ModulationChord[] = []
  for (const s of merged) {
    const prev = out[out.length - 1]
    if (prev && prev.rootPc === s.rootPc && prev.natureId === s.natureId) continue
    out.push(s)
  }
  return out
}

/**
 * Produce shorter variants of a path that still start and end the same trip.
 * Returns [] if already within budget or cannot shrink safely.
 */
export function trimModulationPath(
  path: ModulationPath,
  opts: TrimPathOpts,
): ModulationPath[] {
  const max = Math.max(2, opts.maxLength)
  if (path.length <= max) return []

  const variants: ModulationPath[] = []

  // Variant A: first + last only (hitch-like) when max >= 2
  if (max >= 2 && path.steps.length >= 2) {
    const steps = [path.steps[0]!, path.steps[path.steps.length - 1]!]
    variants.push({
      ...path,
      id: pathId(path.character, `trim-ends-${path.templateId ?? 'x'}`, path.fromTonality, path.toTonality, steps),
      length: steps.length,
      steps,
      label: `${path.label} (trimmed)`,
      reason: `${path.reason} Trimmed to fit budget — keep departure and arrival only.`,
      rank: path.rank + 3,
      templateId: path.templateId ? `${path.templateId}-trim` : 'trim-ends',
    })
  }

  // Variant B: essential skeleton (first + V7 + last)
  if (max >= 3) {
    const steps = keepEssential(path.steps)
    if (steps.length >= 3 && steps.length <= max && steps.length < path.length) {
      variants.push({
        ...path,
        id: pathId(path.character, `trim-skel-${path.templateId ?? 'x'}`, path.fromTonality, path.toTonality, steps),
        length: steps.length,
        steps,
        label: `${path.label} (skeleton)`,
        reason: `${path.reason} Skeleton trim keeps dominant drive under the measure budget.`,
        rank: path.rank + 2,
        templateId: path.templateId ? `${path.templateId}-skel` : 'trim-skel',
      })
    }
  }

  // Variant C: drop middle connectors one-by-one until within max
  if (path.steps.length > max) {
    let steps = [...path.steps]
    while (steps.length > max && steps.length > 2) {
      // Drop the middle-most non-final connector
      const dropAt = Math.floor(steps.length / 2)
      if (dropAt === 0 || dropAt === steps.length - 1) break
      steps = [...steps.slice(0, dropAt), ...steps.slice(dropAt + 1)]
    }
    if (steps.length <= max && steps.length < path.length) {
      variants.push({
        ...path,
        id: pathId(path.character, `trim-mid-${path.templateId ?? 'x'}`, path.fromTonality, path.toTonality, steps),
        length: steps.length,
        steps,
        label: `${path.label} (short)`,
        reason: `${path.reason} Middle connectors dropped to fit the span.`,
        rank: path.rank + 4,
        templateId: path.templateId ? `${path.templateId}-short` : 'trim-short',
      })
    }
  }

  const seen = new Set<string>()
  return variants.filter((v) => {
    const key = v.steps.map((s) => `${s.rootPc}:${s.natureId}`).join('|')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** Max chords that fit a tick span at ≥1 beat each. */
export function maxChordsForSpan(opts: {
  startTick: number
  endTick: number
  ppq: number
  denominator?: number
}): number {
  const beat = Math.max(1, Math.round((opts.ppq * 4) / (opts.denominator ?? 4)))
  const span = Math.max(0, opts.endTick - opts.startTick)
  return Math.max(1, Math.floor(span / beat))
}
