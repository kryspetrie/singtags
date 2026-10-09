/**
 * Cadence highway seeds for Path Optimize windows.
 */
import { phraseRoleAtMelodyIndex, suggestCadencesForPhrase } from '../cadences'
import type { ArrangementProject, MelodyEvent } from '../types'
import type { PathOptimizeWeights } from './types'

export type CadenceSeed = { rootPc: number; natureId: string }

/**
 * Map moment startTick → preferred root/nature pairs from catalog cadence plans.
 * Moderate bias: only attach seeds at phrase cadence/tag (not mid-phrase).
 * Strong bias: full phrase plans (Risky / circle chains).
 */
export function cadenceSeedsByTick(
  project: ArrangementProject,
  moments: readonly MelodyEvent[],
  bias: PathOptimizeWeights['cadenceBias'],
): Map<number, CadenceSeed[]> {
  const map = new Map<number, CadenceSeed[]>()
  if (bias === 'off' || !moments.length) return map

  const plans = suggestCadencesForPhrase({
    moments: moments.map((m) => ({
      startTick: m.startTick,
      endTick: m.startTick + Math.max(1, m.durationTicks),
      melodyMidi: m.midi,
    })),
    tonality: project.tonality,
    mode: project.tonalityMode ?? 'major',
    pillars: project.pillars.map((p) => ({
      startTick: p.startTick,
      rootPc: p.rootPc,
    })),
    bias,
    limit: 10,
  })

  const songEnd = Math.max(
    1,
    ...moments.map((m) => m.startTick + Math.max(1, m.durationTicks)),
  )

  for (const plan of plans) {
    for (const step of plan.steps) {
      const mi = plan.startMomentIndex + step.momentOffset
      const note = moments[mi]
      if (!note) continue
      // Moderate: don't plant V7→I / circle seeds through mid-phrase moments
      // (Nellie / Mill Stream regress when seeds fire mid-highway).
      if (bias === 'moderate') {
        const role = phraseRoleAtMelodyIndex(moments, mi, songEnd)
        if (role !== 'cadence' && role !== 'tag') continue
      }
      const list = map.get(note.startTick) ?? []
      if (!list.some((s) => s.rootPc === step.rootPc && s.natureId === step.natureId)) {
        list.push({ rootPc: step.rootPc, natureId: step.natureId })
      }
      map.set(note.startTick, list)
    }
  }
  return map
}

/**
 * Soft-prefer cadence seeds among near-best scores only.
 * Never let a weak seed (e.g. home I) outrank a strong V7 highway pick.
 * At Basic risk, the score window is tighter so seeds rarely override the ranker.
 */
export function preferCadenceSeeds<T extends { rootPc: number; natureId: string; score: number }>(
  cands: readonly T[],
  seeds: readonly CadenceSeed[] | undefined,
  opts?: { risk?: number },
): T[] {
  if (!seeds?.length || !cands.length) return [...cands]
  const risk = Math.min(1, Math.max(0, opts?.risk ?? 0.5))
  const best = Math.max(...cands.map((c) => c.score))
  // Basic: only near-ties; Risky: wider seed promotion window.
  const slack =
    risk <= 0.35
      ? Math.max(2, Math.abs(best) * 0.08)
      : Math.max(6, Math.abs(best) * 0.2)
  const floor = best - slack
  return [...cands].sort((a, b) => {
    const aHit =
      a.score >= floor &&
      seeds.some((s) => s.rootPc === a.rootPc && s.natureId === a.natureId)
    const bHit =
      b.score >= floor &&
      seeds.some((s) => s.rootPc === b.rootPc && s.natureId === b.natureId)
    if (aHit !== bHit) return aHit ? -1 : 1
    return b.score - a.score
  })
}
