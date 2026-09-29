/**
 * Soft-score a modulation path against Lead notes in the span (Phase K3).
 * Prefer paths where Lead PCs sit in chord tones; never blocks Apply.
 */
import { BARBERSHOP_CHORDS } from './chords/chords'
import type { ModulationPath } from './keyChangeShared'
import { pcOf } from './secondaryDominant'

export type MelodySoftNote = {
  startTick: number
  endTick?: number
  midi: number
}

export type MelodySoftScoreResult = {
  /** 0..1 — higher = Lead sits in chord tones more often. */
  score: number
  hits: number
  samples: number
  /** True when Lead leaps > M2 between consecutive notes under the path. */
  leapHeavy: boolean
}

function chordTonePcs(rootPc: number, natureId: string): Set<number> {
  const nature = BARBERSHOP_CHORDS.find((c) => c.id === natureId)
  const out = new Set<number>()
  if (!nature) {
    out.add(pcOf(rootPc))
    return out
  }
  for (const off of Object.values(nature.offsets)) {
    if (off != null) out.add(pcOf(rootPc + off))
  }
  return out
}

function stepAtTick(
  _path: ModulationPath,
  packedStarts: readonly number[],
  packedEnds: readonly number[],
  tick: number,
): number {
  for (let i = 0; i < packedStarts.length; i++) {
    if (tick >= packedStarts[i]! && tick < packedEnds[i]!) return i
  }
  return Math.max(0, packedStarts.length - 1)
}

/**
 * Score how well Lead notes fit the path's chord tones.
 * When `packedTicks` omitted, divides `[spanStart, spanEnd)` evenly by step count.
 */
export function melodySoftScore(
  path: ModulationPath,
  notes: readonly MelodySoftNote[],
  opts: {
    startTick: number
    endTick: number
    packedStarts?: readonly number[]
    packedEnds?: readonly number[]
  },
): MelodySoftScoreResult {
  const n = path.steps.length
  if (n < 1 || opts.endTick <= opts.startTick) {
    return { score: 0, hits: 0, samples: 0, leapHeavy: false }
  }

  const starts =
    opts.packedStarts ??
    Array.from({ length: n }, (_, i) => {
      const span = opts.endTick - opts.startTick
      return opts.startTick + Math.floor((span * i) / n)
    })
  const ends =
    opts.packedEnds ??
    Array.from({ length: n }, (_, i) =>
      i === n - 1 ? opts.endTick : starts[i + 1]!,
    )

  const inSpan = notes.filter(
    (note) => note.startTick >= opts.startTick && note.startTick < opts.endTick,
  )
  if (!inSpan.length) {
    return { score: 0.5, hits: 0, samples: 0, leapHeavy: false }
  }

  let hits = 0
  let leaps = 0
  let prevMidi: number | null = null
  for (const note of inSpan) {
    const si = stepAtTick(path, starts, ends, note.startTick)
    const step = path.steps[si]!
    const tones = chordTonePcs(step.rootPc, step.natureId)
    if (tones.has(pcOf(note.midi))) hits += 1
    if (prevMidi != null && Math.abs(note.midi - prevMidi) > 2) leaps += 1
    prevMidi = note.midi
  }
  const samples = inSpan.length
  const score = samples ? hits / samples : 0.5
  return {
    score,
    hits,
    samples,
    leapHeavy: samples > 1 && leaps / (samples - 1) >= 0.5,
  }
}

/** Rank paths by melody soft-score (desc), stable on ties. */
export function rankPathsByMelody(
  paths: readonly ModulationPath[],
  notes: readonly MelodySoftNote[],
  span: { startTick: number; endTick: number },
): { path: ModulationPath; soft: MelodySoftScoreResult }[] {
  return paths
    .map((path) => ({
      path,
      soft: melodySoftScore(path, notes, span),
    }))
    .sort((a, b) => {
      if (b.soft.score !== a.soft.score) return b.soft.score - a.soft.score
      return a.path.rank - b.path.rank
    })
}
