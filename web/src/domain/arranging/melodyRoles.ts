/**
 * Strong (pmn) / Passing (smn) auto-label heuristics.
 *
 * Strong = structural harmony carrier (home). Passing = connective toward/from a strong.
 * Auto default when unlabeled: duration + beat strength + phrase edges.
 * User overrides always win unless `force`.
 *
 * Bias sparse Strong labels (~half-note harmonic rhythm) + change-point promotes.
 */
import { bareMajorHomeDeg } from './strongRootPriors'
import { ARRANGING_PPQ, type MelodyEvent, type MelodyRole, type Pillar } from './types'

export type RoleLabelResult = {
  id: string
  role: MelodyRole
  reason: string
}

/** Meter / phrase settings for default role assignment. */
export type MelodyRoleMeter = {
  /** Ticks per quarter; default ARRANGING_PPQ. */
  ppq?: number
  /** Beats per bar; default 4. */
  beatsPerBar?: number
  /** Gap (ticks) that starts a new phrase; default 1.5 × beat. */
  phraseGapTicks?: number
  /** When set with promoteChangePoints, on-beat prior flips become Strong. */
  tonality?: number
  /** Promote on-beat notes whose bare I/IV/V prior differs from previous Strong. */
  promoteChangePoints?: boolean
  /**
   * Promote on-beat / half-bar Lead attacks to cover harmonic rhythm gaps
   * (orphan chart stacks). Caps new promotes per bar. Implies change-points when tonality set.
   */
  promoteCoverage?: boolean
  /** Max coverage promotes per bar (beyond base Strongs). Default 2. */
  maxCoveragePromotesPerBar?: number
}

function meterResolved(meter: MelodyRoleMeter = {}) {
  const ppq = meter.ppq ?? ARRANGING_PPQ
  const beatsPerBar = meter.beatsPerBar ?? 4
  const beat = ppq
  const bar = beat * beatsPerBar
  const phraseGap = meter.phraseGapTicks ?? Math.floor(beat * 1.5)
  return { ppq, beatsPerBar, beat, bar, phraseGap }
}

function isStepwise(a: number, b: number): boolean {
  return Math.abs(a - b) <= 2
}

function scaleDegree(midi: number, tonality: number): number {
  return (((midi % 12) - tonality) % 12 + 12) % 12
}

/**
 * Default Strong/Passing from duration, metric strength, and phrase edges.
 * Does not require pillars. Preserves non-unknown roles unless `force`.
 */
export function assignMelodyRoles(
  melody: readonly MelodyEvent[],
  meter: MelodyRoleMeter = {},
  opts: { force?: boolean } = {},
): MelodyEvent[] {
  const labels = labelMelodyRoles({ melody, force: opts.force, meter })
  return applyRoleLabels(melody, labels)
}

/**
 * Label Strong/Passing. Pillars are optional boosters only (not required).
 */
export function labelMelodyRoles(opts: {
  melody: readonly MelodyEvent[]
  pillars?: readonly Pillar[]
  /** Only relabel notes currently `unknown` unless force. */
  force?: boolean
  meter?: MelodyRoleMeter
}): RoleLabelResult[] {
  const sorted = [...opts.melody].sort((a, b) => a.startTick - b.startTick)
  if (!sorted.length) return []

  const { beat, bar, phraseGap } = meterResolved(opts.meter)
  const out: RoleLabelResult[] = []

  const phraseOf: number[] = []
  let phrase = 0
  for (let i = 0; i < sorted.length; i++) {
    const n = sorted[i]!
    if (i > 0) {
      const prev = sorted[i - 1]!
      const gap = n.startTick - (prev.startTick + prev.durationTicks)
      if (gap > phraseGap) phrase += 1
    }
    phraseOf[i] = phrase
  }
  const phraseFirst = new Set<number>()
  const phraseLast = new Set<number>()
  for (let i = 0; i < sorted.length; i++) {
    const p = phraseOf[i]!
    if (i === 0 || phraseOf[i - 1] !== p) phraseFirst.add(i)
    if (i === sorted.length - 1 || phraseOf[i + 1] !== p) phraseLast.add(i)
  }

  for (let i = 0; i < sorted.length; i++) {
    const n = sorted[i]!
    if (!opts.force && n.role !== 'unknown') {
      out.push({ id: n.id, role: n.role, reason: 'user/kept' })
      continue
    }

    const onBeat = n.startTick % beat === 0
    const downbeat = n.startTick % bar === 0
    const onHalf = n.startTick % (beat * 2) === 0
    const long = n.durationTicks >= beat
    const held = n.durationTicks >= beat * 2
    const medium = n.durationTicks >= beat / 2
    const short = n.durationTicks < beat / 2

    const pillar =
      opts.pillars?.find((p) => p.startTick <= n.startTick && n.startTick < p.endTick) ?? null
    const pc = ((n.midi % 12) + 12) % 12
    const onPillarTone =
      pillar != null &&
      [0, 4, 7, 10].some((off) => ((pillar.rootPc + off) % 12 + 12) % 12 === pc)

    const prev = sorted[i - 1]
    const next = sorted[i + 1]
    const gapIn =
      prev != null
        ? n.startTick - (prev.startTick + prev.durationTicks)
        : Number.POSITIVE_INFINITY
    const gapOut =
      next != null
        ? next.startTick - (n.startTick + n.durationTicks)
        : Number.POSITIVE_INFINITY
    const stepIn = prev != null && isStepwise(n.midi, prev.midi) && gapIn <= beat / 2
    const stepOut = next != null && isStepwise(next.midi, n.midi) && gapOut <= beat / 2
    const leapIn = prev != null && Math.abs(n.midi - prev.midi) > 2 && gapIn <= beat
    const leapOut = next != null && Math.abs(next.midi - n.midi) > 2 && gapOut <= beat
    const scaleRun = stepIn && stepOut

    let role: MelodyRole = 'smn'
    let reason = 'default connective'

    if (phraseFirst.has(i) || phraseLast.has(i)) {
      role = 'pmn'
      reason = phraseFirst.has(i) ? 'phrase start' : 'phrase end'
    } else if (held) {
      role = 'pmn'
      reason = 'long hold'
    } else if (downbeat && medium) {
      role = 'pmn'
      reason = 'downbeat hold'
    } else if (onHalf && long && !scaleRun) {
      role = 'pmn'
      reason = 'half-grid home'
    } else if (onBeat && medium && (leapIn || leapOut) && !scaleRun) {
      role = 'pmn'
      reason = 'leap arrival'
    } else if (onPillarTone && held) {
      role = 'pmn'
      reason = 'pillar chord-tone hold'
    } else if (short || scaleRun || !onBeat) {
      role = 'smn'
      reason = scaleRun ? 'scale-run connective' : 'stepwise / offbeat'
    } else {
      role = 'smn'
      reason = 'weak-beat quarter'
    }

    out.push({ id: n.id, role, reason })
  }

  // Promote on-beat change-points (P2: aim ~0.7–1.3× chart-change density).
  const tonality = opts.meter?.tonality
  const wantChangePoints = !!opts.meter?.promoteChangePoints
  // Opt-in: Auto path / honest harness set promoteCoverage when chasing orphan rate.
  const wantCoverage = !!opts.meter?.promoteCoverage
  if (wantChangePoints && tonality != null) {
    let prevBare: number | null = null
    for (let i = 0; i < sorted.length; i++) {
      const n = sorted[i]!
      const lab = out[i]!
      const sd = scaleDegree(n.midi, tonality)
      const bare = bareMajorHomeDeg(sd)
      const onBeat = n.startTick % beat === 0
      const onHalf = n.startTick % (beat * 2) === 0
      const medium = n.durationTicks >= beat / 2
      const long = n.durationTicks >= beat
      if (lab.role === 'pmn') {
        if (bare != null) prevBare = bare
        continue
      }
      // Prefer half-grid / long; allow plain on-beat when prior flips.
      if (
        medium &&
        bare != null &&
        prevBare != null &&
        bare !== prevBare &&
        (onHalf || long || onBeat) &&
        (opts.force || n.role === 'unknown' || lab.reason !== 'user/kept')
      ) {
        out[i] = { id: n.id, role: 'pmn', reason: 'home-change point' }
        prevBare = bare
      }
    }
  }

  // Coverage promote: fill harmonic-rhythm gaps without chart roots.
  // Prefer half-bar / longer-than-neighbors / leap arrivals; cap per bar.
  if (wantCoverage) {
    const maxPerBar = opts.meter?.maxCoveragePromotesPerBar ?? 2
    const promotedInBar = new Map<number, number>()
    type Cand = { i: number; score: number }
    const cands: Cand[] = []
    for (let i = 0; i < sorted.length; i++) {
      const n = sorted[i]!
      const lab = out[i]!
      if (lab.role === 'pmn') continue
      if (!opts.force && n.role !== 'unknown' && lab.reason === 'user/kept') continue
      const onBeat = n.startTick % beat === 0
      const onHalf = n.startTick % (beat * 2) === 0
      if (!onBeat && !onHalf) continue
      const medium = n.durationTicks >= beat / 2
      const short = n.durationTicks < beat / 2
      const prev = sorted[i - 1]
      const next = sorted[i + 1]
      const gapIn =
        prev != null
          ? n.startTick - (prev.startTick + prev.durationTicks)
          : Number.POSITIVE_INFINITY
      const gapOut =
        next != null
          ? next.startTick - (n.startTick + n.durationTicks)
          : Number.POSITIVE_INFINITY
      const stepIn = prev != null && isStepwise(n.midi, prev.midi) && gapIn <= beat / 2
      const stepOut = next != null && isStepwise(next.midi, n.midi) && gapOut <= beat / 2
      if (short && stepIn && stepOut) continue // clear connective eighths
      const leapIn = prev != null && Math.abs(n.midi - prev.midi) > 2 && gapIn <= beat
      const longerThanNeighbors =
        (prev == null || n.durationTicks > prev.durationTicks) &&
        (next == null || n.durationTicks > next.durationTicks)
      const bare =
        tonality != null ? bareMajorHomeDeg(scaleDegree(n.midi, tonality)) : null
      if (!medium && !(onHalf && n.durationTicks >= beat / 4)) continue
      if (!longerThanNeighbors && !leapIn && !(onHalf && bare != null)) continue

      let score = 0
      if (onHalf) score += 3
      else if (onBeat) score += 1
      if (longerThanNeighbors) score += 2
      if (leapIn) score += 2
      if (bare != null) score += 1
      if (n.durationTicks >= beat) score += 1
      cands.push({ i, score })
    }
    cands.sort((a, b) => b.score - a.score || a.i - b.i)
    for (const c of cands) {
      const n = sorted[c.i]!
      const barIdx = Math.floor(n.startTick / bar)
      const used = promotedInBar.get(barIdx) ?? 0
      if (used >= maxPerBar) continue
      out[c.i] = { id: n.id, role: 'pmn', reason: 'coverage rhythm' }
      promotedInBar.set(barIdx, used + 1)
    }
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
