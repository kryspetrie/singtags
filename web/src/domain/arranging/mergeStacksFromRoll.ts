/**
 * Merge coach stacks with a fresh roll import: keep named Apply results when MIDI
 * matches; otherwise prefer freshly identified stacks (re-ID after TBB edits).
 */
import type { ChordStack } from './types'
import { isKnownStack } from './coachEntryMode'

function midiEqual(
  a: NonNullable<ChordStack['midi']>,
  b: NonNullable<ChordStack['midi']>,
): boolean {
  return a.bass === b.bass && a.bari === b.bari && a.lead === b.lead && a.tenor === b.tenor
}

export function mergeStacksFromRollImport(
  fresh: readonly ChordStack[],
  existing: readonly ChordStack[],
): ChordStack[] {
  const byTick = new Map(fresh.map((s) => [s.startTick, s]))
  for (const s of existing) {
    if (!s.midi || !isKnownStack(s)) continue
    const f = byTick.get(s.startTick)
    if (!f?.midi) {
      byTick.set(s.startTick, s)
      continue
    }
    // Same sounding voicing → keep coach-named nature; otherwise accept re-ID.
    if (midiEqual(s.midi, f.midi)) byTick.set(s.startTick, s)
  }
  return [...byTick.values()].sort((a, b) => a.startTick - b.startTick)
}
