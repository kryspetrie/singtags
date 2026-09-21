/**
 * PMN / SMN auto-label heuristics (Approach Two).
 * PMN ≈ structural / stressed; SMN ≈ connective.
 * User override always wins when role was set to non-unknown manually —
 * callers pass `force` to recompute everything.
 */
import type { MelodyEvent, MelodyRole, Pillar } from './types'

export type RoleLabelResult = {
  id: string
  role: MelodyRole
  reason: string
}

export function labelMelodyRoles(opts: {
  melody: readonly MelodyEvent[]
  pillars?: readonly Pillar[]
  /** Only relabel notes currently `unknown` unless force. */
  force?: boolean
}): RoleLabelResult[] {
  const sorted = [...opts.melody].sort((a, b) => a.startTick - b.startTick)
  if (!sorted.length) return []

  const beat = 480
  const out: RoleLabelResult[] = []

  for (let i = 0; i < sorted.length; i++) {
    const n = sorted[i]!
    if (!opts.force && n.role !== 'unknown') {
      out.push({ id: n.id, role: n.role, reason: 'user/kept' })
      continue
    }

    const onBeat = n.startTick % beat === 0
    const long = n.durationTicks >= beat
    const pillar =
      opts.pillars?.find((p) => p.startTick <= n.startTick && n.startTick < p.endTick) ?? null
    const pc = ((n.midi % 12) + 12) % 12
    const onPillarTone =
      pillar != null &&
      [0, 4, 7, 10].some((off) => ((pillar.rootPc + off) % 12 + 12) % 12 === pc)

    const prev = sorted[i - 1]
    const next = sorted[i + 1]
    const stepIn =
      prev != null && Math.abs(n.midi - prev.midi) <= 2 && n.startTick - (prev.startTick + prev.durationTicks) <= beat / 2
    const stepOut =
      next != null && Math.abs(next.midi - n.midi) <= 2 && next.startTick - (n.startTick + n.durationTicks) <= beat / 2

    let role: MelodyRole = 'smn'
    let reason = 'default connective'

    if (onBeat && (long || onPillarTone)) {
      role = 'pmn'
      reason = long ? 'stressed long onset' : 'beat-aligned pillar tone'
    } else if (onBeat && !stepIn && !stepOut) {
      role = 'pmn'
      reason = 'isolated beat onset'
    } else if (stepIn || stepOut) {
      role = 'smn'
      reason = 'stepwise connective'
    } else if (onPillarTone && n.durationTicks >= beat / 2) {
      role = 'pmn'
      reason = 'pillar chord-tone hold'
    }

    out.push({ id: n.id, role, reason })
  }

  return out
}

export function applyRoleLabels(
  melody: readonly MelodyEvent[],
  labels: readonly RoleLabelResult[],
): MelodyEvent[] {
  const byId = new Map(labels.map((l) => [l.id, l.role]))
  return melody.map((n) => {
    const role = byId.get(n.id)
    return role != null ? { ...n, role } : n
  })
}
