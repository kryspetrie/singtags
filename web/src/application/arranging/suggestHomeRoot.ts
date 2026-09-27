/**
 * Resolve a home-root span for Harmonize Suggest without requiring pillars.
 * Order: real pillar → locked Sketch → Detected → implied-from-melody.
 */
import {
  inferImpliedChordsFromMelody,
  reorderImpliedByMelodyRole,
  type MelodyRoleBias,
} from '../../domain/arranging/impliedMelodyChord'
import type { MelodyEvent, Pillar, TonalityMode } from '../../domain/arranging/types'

export type SoftHomeRootSpan = {
  startTick: number
  endTick: number
  rootPc: number
  /** Sketch only — Detected holes are unlocked until promoted. */
  locked?: boolean
}

export type SoftSuggestContext = {
  sketchSpans?: readonly SoftHomeRootSpan[]
  detectedSpans?: readonly SoftHomeRootSpan[]
}

export type SuggestHomeRootSource = 'pillar' | 'sketch' | 'detected' | 'implied'

export type SuggestHomeRoot = {
  pillar: Pillar
  source: SuggestHomeRootSource
  /** True when the pillar is not in Arrangement.pillars (apply → pillarId null). */
  ephemeral: boolean
}

function covers(startTick: number, endTick: number, tick: number): boolean {
  return startTick <= tick && tick < endTick
}

function ephemeralPillar(
  rootPc: number,
  note: MelodyEvent,
  tag: SuggestHomeRootSource,
  span?: { startTick: number; endTick: number },
): Pillar {
  return {
    id: `soft:${tag}`,
    rootPc: ((rootPc % 12) + 12) % 12,
    startTick: span?.startTick ?? note.startTick,
    endTick: span?.endTick ?? note.startTick + Math.max(1, note.durationTicks),
    source: 'inferred',
    confirmed: false,
  }
}

/**
 * Best local harmony context for ranking voicings at a melody onset.
 * Returns null only when even implied chords cannot be inferred.
 */
export function resolveSuggestHomeRoot(opts: {
  note: MelodyEvent
  pillars: readonly Pillar[]
  soft?: SoftSuggestContext | null
  tonality: number
  mode?: TonalityMode
  nextMelodyMidi?: number | null
  prevMelodyMidi?: number | null
  prevRootPc?: number | null
  prevNatureId?: string | null
  melodyRole?: MelodyRoleBias
}): SuggestHomeRoot | null {
  const tick = opts.note.startTick
  const real = opts.pillars.find((p) => covers(p.startTick, p.endTick, tick))
  if (real) return { pillar: real, source: 'pillar', ephemeral: false }

  const lockedSketch = (opts.soft?.sketchSpans ?? []).find(
    (s) => s.locked === true && covers(s.startTick, s.endTick, tick),
  )
  if (lockedSketch) {
    return {
      pillar: ephemeralPillar(lockedSketch.rootPc, opts.note, 'sketch', lockedSketch),
      source: 'sketch',
      ephemeral: true,
    }
  }

  const detected = (opts.soft?.detectedSpans ?? []).find((s) =>
    covers(s.startTick, s.endTick, tick),
  )
  if (detected) {
    return {
      pillar: ephemeralPillar(detected.rootPc, opts.note, 'detected', detected),
      source: 'detected',
      ephemeral: true,
    }
  }

  const mode = opts.mode ?? 'major'
  const inferred = inferImpliedChordsFromMelody({
    melodyMidi: opts.note.midi,
    tonality: opts.tonality,
    mode,
    limit: 3,
    nextMelodyMidi: opts.nextMelodyMidi ?? null,
    prevMelodyMidi: opts.prevMelodyMidi ?? null,
    prevRootPc: opts.prevRootPc ?? null,
    prevNatureId: opts.prevNatureId ?? null,
  })
  const role =
    opts.melodyRole ??
    (opts.note.role === 'pmn' || opts.note.role === 'smn' ? opts.note.role : null)
  const ranked = reorderImpliedByMelodyRole(inferred, role)
  const top = ranked[0]
  if (!top) return null
  return {
    pillar: ephemeralPillar(top.rootPc, opts.note, 'implied'),
    source: 'implied',
    ephemeral: true,
  }
}
