/**
 * Preserve PMN/SMN labels when rebuilding melody from the tag roll.
 */
import type { MelodyEvent } from './types'

export function mergeMelodyRoles(
  fresh: readonly MelodyEvent[],
  prior: readonly MelodyEvent[],
): MelodyEvent[] {
  if (!prior.length) return fresh.map((f) => ({ ...f }))
  return fresh.map((f) => {
    const hit =
      prior.find((p) => p.startTick === f.startTick && p.midi === f.midi) ??
      prior.find((p) => p.startTick === f.startTick)
    if (hit && hit.role !== 'unknown') {
      return { ...f, role: hit.role }
    }
    return { ...f }
  })
}
