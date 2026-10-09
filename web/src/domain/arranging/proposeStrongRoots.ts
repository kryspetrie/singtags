/**
 * Derive harmonic homes from Strong (pmn) melody notes — Auto Coach path.
 * Passing notes inherit the previous strong’s home until the next strong.
 * Does not require user-confirmed pillars.
 */
import { proposeRootForSpan } from './proposePillarAt'
import { assignMelodyRoles } from './melodyRoles'
import { decodeStrongHomesViterbi } from './strongRootCadence'
import { decodeStrongHomesCo5Beam, segFitByHome } from './strongRootCo5'
import { segmentChordToneDiversity, segmentChordToneFit } from './segmentEmission'
import {
  bareMajorHomeDeg,
  barsFromPhraseStart,
  durationBucket,
  intervalClass,
  lookupStrongRootPrior,
} from './strongRootPriors'
import { newId, type ArrangementProject, type MelodyEvent, type Pillar } from './types'

export type StrongHome = {
  rootPc: number
  startTick: number
  endTick: number
  strongNoteId: string
  reason: string
  /** 0..1 — high (≥0.75) = Auto can lock; low = Guided review. */
  confidence: number
}

/** Harness + Guided: treat ≥ this as auto-lockable. */
export const STRONG_HOME_CONF_LOCK = 0.75

export function scaleDegree(midi: number, tonality: number): number {
  return (((midi % 12) - tonality) % 12 + 12) % 12
}

function degRoot(tonality: number, homeDeg: number): number {
  return ((tonality + homeDeg) % 12 + 12) % 12
}

/** Hand-rule fallback when table misses (phrase + neighbor). */
export function majorHomeDeg(
  sd: number,
  opts: {
    phraseEdge?: 'start' | 'end' | null
    nextHomeDeg?: number | null
    prevHomeDeg?: number | null
  },
): number | null {
  if (opts.phraseEdge === 'end') {
    if (sd === 0 || sd === 4) return 0
    if (sd === 7 || sd === 2 || sd === 11) return 7
  }
  if (opts.phraseEdge === 'start') {
    if (sd === 7 || sd === 2 || sd === 11) return 7
    if (sd === 0 || sd === 4) return 0
    if (sd === 5 || sd === 9) return 5
  }
  if (opts.nextHomeDeg === 0 && (sd === 7 || sd === 2 || sd === 11)) return 7
  if (opts.nextHomeDeg === 7 && (sd === 2 || sd === 11)) return 2
  if (opts.prevHomeDeg === 0 && opts.nextHomeDeg === 7 && (sd === 5 || sd === 9)) {
    return 5
  }
  if (opts.prevHomeDeg === 0 && sd === 4) return 9
  if (opts.prevHomeDeg === 0 && (sd === 5 || sd === 9)) return 5
  if (opts.prevHomeDeg === 0 && (sd === 7 || sd === 2 || sd === 11)) return 7
  if (opts.prevHomeDeg === 7 && (sd === 0 || sd === 4 || sd === 7)) return 0
  if (opts.prevHomeDeg === 5 && (sd === 7 || sd === 2 || sd === 11)) return 7
  if (opts.prevHomeDeg === 5 && (sd === 0 || sd === 4)) return 0
  if (opts.prevHomeDeg === 9 && sd === 2) return 2
  return bareMajorHomeDeg(sd)
}

/**
 * Prior for a single Strong note (table → hand rules → span).
 */
export function proposeRootForStrongNote(opts: {
  note: MelodyEvent
  melody: readonly MelodyEvent[]
  tonality: number
  mode?: 'major' | 'minor'
  prevRootPc?: number | null
  nextStrongMidi?: number | null
  phraseEdge?: 'start' | 'end' | null
  nextHomeDegHint?: number | null
  ppq?: number
  prevStrongMidi?: number | null
  phraseStartTick?: number
  /** End of harmonic span (next Strong onset); defaults to note end. */
  segmentEndTick?: number
}): {
  rootPc: number
  reason: string
  homeDeg: number
  confidence: number
  /** C1 spike: top homes by base score (best first; may include overturn pick). */
  alternatives: { homeDeg: number; rootPc: number; base: number }[]
} {
  const mode = opts.mode ?? 'major'
  const n = opts.note
  const ppq = opts.ppq ?? 480
  const segmentEnd =
    opts.segmentEndTick ?? n.startTick + Math.max(1, n.durationTicks)
  const prevHomeDeg =
    opts.prevRootPc != null
      ? (((opts.prevRootPc - opts.tonality) % 12) + 12) % 12
      : null
  const nextHomeDeg =
    opts.nextHomeDegHint ??
    (opts.nextStrongMidi != null
      ? bareMajorHomeDeg(scaleDegree(opts.nextStrongMidi, opts.tonality))
      : null)

  if (mode === 'major') {
    const sd = scaleDegree(n.midi, opts.tonality)
    const beatInBar = Math.floor((n.startTick / ppq) % 4)
    const tableDeg = lookupStrongRootPrior({
      scaleDegree: sd,
      prevHomeDeg,
      nextBareDeg: nextHomeDeg,
      phraseEdge: opts.phraseEdge ?? null,
      beatInBar,
      durationBucket: durationBucket(n.durationTicks, ppq),
      intervalClass: intervalClass(opts.prevStrongMidi ?? null, n.midi),
      barsFromPhraseStart: barsFromPhraseStart(
        n.startTick,
        opts.phraseStartTick ?? n.startTick,
        ppq * 4,
      ),
    })
    const ruleDeg = majorHomeDeg(sd, {
      phraseEdge: opts.phraseEdge ?? null,
      nextHomeDeg,
      prevHomeDeg,
    })
    // Score diatonic homes; table + rules + Lead fit + neighbor transitions.
    // M1: segment emission is a *tie-break* when base scores are close (≤2.5 apart).
    const HOMES = [0, 2, 5, 7, 9] as const
    const segFit: Record<number, number> = {}
    for (const deg of HOMES) {
      segFit[deg] = segmentChordToneFit({
        melody: opts.melody,
        startTick: n.startTick,
        endTick: segmentEnd,
        tonality: opts.tonality,
        homeDeg: deg,
      })
    }
    type Scored = { deg: number; base: number; reason: string }
    const scored: Scored[] = []
    for (const deg of HOMES) {
      let s = 0
      if (tableDeg === deg) s += 5.5
      if (ruleDeg === deg) s += 2.5
      const rel = (((sd - deg) % 12) + 12) % 12
      if (rel === 0 || rel === 4 || rel === 7 || rel === 10) s += 2
      else if (rel === 3 || rel === 9) s += 0.5
      else s -= 1.5
      // Mild error-mode nudges (confusion dump); keep weaker than table.
      if (prevHomeDeg === 0 && sd === 7 && deg === 7) s += 1.5
      if (prevHomeDeg === 0 && sd === 4 && deg === 9) s += 1.5
      if (sd === 9 && deg === 2 && (prevHomeDeg === 2 || prevHomeDeg === 9)) s += 1.5
      if (prevHomeDeg === 7 && deg === 0) s += 2
      if (prevHomeDeg === 0 && deg === 5) s += 1.5
      if (prevHomeDeg === 2 && deg === 7) s += 2
      if (prevHomeDeg === 5 && deg === 7) s += 1.5
      if (prevHomeDeg === 9 && deg === 2) s += 1.5
      if (nextHomeDeg === 0 && deg === 7) s += 1.5
      if (nextHomeDeg === 7 && deg === 2) s += 1.5
      if (opts.phraseEdge === 'end' && deg === 0) s += 1.5
      if (opts.phraseEdge === 'start' && (deg === 7 || deg === 0)) s += 1
      const reason =
        tableDeg === deg
          ? 'fitted strong prior'
          : ruleDeg === deg
            ? opts.phraseEdge
              ? `strong ${opts.phraseEdge} prior`
              : 'strong scale-degree prior'
            : 'scored strong prior'
      scored.push({ deg, base: s, reason })
    }
    scored.sort((a, b) => b.base - a.base)
    const top = scored[0]!
    const runner = scored[1]!
    const segRanked = [...HOMES].sort((a, b) => (segFit[b] ?? 0) - (segFit[a] ?? 0))
    const segBest = segRanked[0]!
    const segSecond = segRanked[1]!
    const segMargin = (segFit[segBest] ?? 0) - (segFit[segSecond] ?? 0)
    // Ambiguous Lead tones: clear span may overturn table (I↔V / II↔IV family).
    const ambiguousSd = sd === 2 || sd === 4 || sd === 7 || sd === 9
    const segDiversity = segmentChordToneDiversity({
      melody: opts.melody,
      startTick: n.startTick,
      endTick: segmentEnd,
      tonality: opts.tonality,
      homeDeg: segBest,
    })
    // Overturn only toward I / II (the flips that helped 90003).
    // Overturns toward V/IV regressed 90011 (II7/IV/vi → V7).
    const safeSegTarget = segBest === 0 || segBest === 2
    const clearSegOverturn =
      ambiguousSd &&
      safeSegTarget &&
      (segFit[segBest] ?? 0) >= 0.75 &&
      segMargin >= 0.25 &&
      segDiversity >= 2 &&
      segBest !== top.deg
    const tieBreak =
      !clearSegOverturn &&
      top.base - runner.base <= 2.5 &&
      (segFit[runner.deg] ?? 0) - (segFit[top.deg] ?? 0) >= 0.2

    // No general soft blend (hurt 90011). Clear I/II overturn, tie-break, or II-vs-IV pattern.
    let bestDeg = top.deg
    let bestReason = top.reason
    const iiOverIv =
      (sd === 9 || sd === 5) &&
      top.deg === 5 &&
      (segFit[2] ?? 0) >= 0.55 &&
      (segFit[2] ?? 0) - (segFit[5] ?? 0) >= 0.12 &&
      segmentChordToneDiversity({
        melody: opts.melody,
        startTick: n.startTick,
        endTick: segmentEnd,
        tonality: opts.tonality,
        homeDeg: 2,
      }) >= 2
    if (clearSegOverturn) {
      bestDeg = segBest
      bestReason = 'segment emission'
    } else if (iiOverIv) {
      bestDeg = 2
      bestReason = 'segment emission'
    } else if (tieBreak) {
      const runnerSafe = runner.deg === 0 || runner.deg === 2
      const pick =
        runnerSafe && (segFit[runner.deg] ?? 0) > (segFit[top.deg] ?? 0)
          ? runner
          : top
      bestDeg = pick.deg
      bestReason = pick.deg !== top.deg ? 'segment emission' : top.reason
    }
    // Authentic setup: ^5 labeled I but span favors V (next→I and/or prev II).
    if (
      bestDeg === 0 &&
      sd === 7 &&
      (nextHomeDeg === 0 || prevHomeDeg === 2) &&
      (segFit[7] ?? 0) >= 0.6 &&
      (segFit[7] ?? 0) - (segFit[0] ?? 0) >= 0.1
    ) {
      bestDeg = 7
      bestReason = 'segment emission'
    }
    // After I on ^3: span-vi beats I (relative) when clear — top I→vi miss bucket.
    if (
      bestDeg === 0 &&
      sd === 4 &&
      prevHomeDeg === 0 &&
      (segFit[9] ?? 0) >= 0.65 &&
      (segFit[9] ?? 0) - (segFit[0] ?? 0) >= 0.15 &&
      segmentChordToneDiversity({
        melody: opts.melody,
        startTick: n.startTick,
        endTick: segmentEnd,
        tonality: opts.tonality,
        homeDeg: 9,
      }) >= 2
    ) {
      bestDeg = 9
      bestReason = 'segment emission'
    }
    // Confidence: empirical cues beat raw margin (margin alone ≈ chance on 12).
    const baseMargin = Math.max(0, Math.min(1, (top.base - runner.base) / 8))
    const altFit = Math.max(
      ...HOMES.filter((d) => d !== bestDeg).map((d) => segFit[d] ?? 0),
      0,
    )
    const segMarginNorm = Math.max(
      0,
      Math.min(1, ((segFit[bestDeg] ?? 0) - altFit) / 0.45),
    )
    const segAgrees = (segFit[bestDeg] ?? 0) >= (segFit[top.deg] ?? 0) - 0.05
    let confidence = segAgrees
      ? Math.min(
          0.55,
          0.35 * baseMargin + 0.65 * segMarginNorm + (baseMargin >= 0.35 ? 0.1 : 0),
        )
      : Math.min(0.35, 0.5 * baseMargin)
    // High-precision bands (polecat dump): end-I ~0.86; Lead=root@edge ~0.70.
    if (opts.phraseEdge === 'end' && bestDeg === 0) confidence = 0.9
    else if (
      (opts.phraseEdge === 'start' || opts.phraseEdge === 'end') &&
      sd === bestDeg
    ) {
      confidence = Math.max(confidence, 0.78)
    } else if (bestDeg === 0 && sd === 0) {
      confidence = Math.max(confidence, 0.72)
    }
    const altSorted = [
      { deg: bestDeg, base: scored.find((s) => s.deg === bestDeg)?.base ?? top.base },
      ...scored.filter((s) => s.deg !== bestDeg),
    ]
    const alternatives = altSorted.slice(0, 2).map((s) => ({
      homeDeg: s.deg,
      rootPc: degRoot(opts.tonality, s.deg),
      base: s.base,
    }))
    return {
      rootPc: degRoot(opts.tonality, bestDeg),
      reason: bestReason,
      homeDeg: bestDeg,
      confidence,
      alternatives,
    }
  }
  const span = proposeRootForSpan({
    melody: opts.melody,
    startTick: n.startTick,
    endTick: n.startTick + Math.max(1, n.durationTicks),
    tonality: opts.tonality,
    mode,
  })
  if (span) {
    const homeDeg = (((span.rootPc - opts.tonality) % 12) + 12) % 12
    return {
      rootPc: span.rootPc,
      reason: span.reason,
      homeDeg,
      confidence: 0.4,
      alternatives: [
        { homeDeg, rootPc: span.rootPc, base: 1 },
      ],
    }
  }
  if (opts.prevRootPc != null) {
    const homeDeg = (((opts.prevRootPc - opts.tonality) % 12) + 12) % 12
    return {
      rootPc: opts.prevRootPc,
      reason: 'hold previous strong',
      homeDeg,
      confidence: 0.35,
      alternatives: [
        { homeDeg, rootPc: opts.prevRootPc, base: 1 },
      ],
    }
  }
  return {
    rootPc: opts.tonality,
    reason: 'tonality fallback',
    homeDeg: 0,
    confidence: 0.2,
    alternatives: [{ homeDeg: 0, rootPc: opts.tonality, base: 0 }],
  }
}

/** C1: top-2 Strong homes for two-hypothesis Guided / oracle probes. */
export function rankStrongHomeAlternatives(
  opts: Parameters<typeof proposeRootForStrongNote>[0],
): { homeDeg: number; rootPc: number; base: number }[] {
  return proposeRootForStrongNote(opts).alternatives
}

/**
 * Ordered homes from Strong notes. Consecutive same roots merge.
 * Spans cover through the next Strong onset (Passing notes sit under the prior home).
 */
export function deriveStrongHomes(opts: {
  melody: readonly MelodyEvent[]
  tonality: number
  mode?: 'major' | 'minor'
  ppq?: number
}): { homes: StrongHome[]; melody: MelodyEvent[] } {
  let melody = assignMelodyRoles(opts.melody, {
    ppq: opts.ppq,
    tonality: opts.tonality,
    promoteChangePoints: true,
    promoteCoverage: true,
  })
  const mode = opts.mode ?? 'major'
  const beat = opts.ppq ?? 480
  const phraseGap = Math.floor(beat * 1.5)

  const roleStrong = new Set(
    melody.filter((n) => n.role === 'pmn').map((n) => n.id),
  )
  const homeIds = new Set(roleStrong)
  const ordered = [...melody].sort((a, b) => a.startTick - b.startTick)
  let prevBare: number | null = null
  for (const n of ordered) {
    const sd = scaleDegree(n.midi, opts.tonality)
    const bare = mode === 'major' ? bareMajorHomeDeg(sd) : 0
    const onBeat = n.startTick % beat === 0
    const onHalf = n.startTick % (beat * 2) === 0
    const medium = n.durationTicks >= beat / 2
    const long = n.durationTicks >= beat
    if (roleStrong.has(n.id)) {
      homeIds.add(n.id)
      if (bare != null) prevBare = bare
      continue
    }
    if (onHalf && long) {
      homeIds.add(n.id)
      if (bare != null) prevBare = bare
      continue
    }
    if (
      onBeat &&
      medium &&
      bare != null &&
      prevBare != null &&
      bare !== prevBare
    ) {
      homeIds.add(n.id)
      prevBare = bare
    }
  }
  const strongs = ordered.filter((n) => homeIds.has(n.id))
  if (!strongs.length) return { homes: [], melody }

  const melSorted = [...melody].sort((a, b) => a.startTick - b.startTick)
  const phraseStartIds = new Set<string>()
  const phraseEndIds = new Set<string>()
  let phrase = 0
  const phraseOfMel = new Map<string, number>()
  for (let i = 0; i < melSorted.length; i++) {
    const n = melSorted[i]!
    if (i > 0) {
      const prev = melSorted[i - 1]!
      if (n.startTick - (prev.startTick + prev.durationTicks) > phraseGap) phrase += 1
    }
    phraseOfMel.set(n.id, phrase)
  }
  const byPhrase = new Map<number, MelodyEvent[]>()
  for (const n of melSorted) {
    const p = phraseOfMel.get(n.id) ?? 0
    const list = byPhrase.get(p) ?? []
    list.push(n)
    byPhrase.set(p, list)
  }
  for (const list of byPhrase.values()) {
    const strongIn = list.filter((n) => homeIds.has(n.id))
    if (strongIn[0]) phraseStartIds.add(strongIn[0].id)
    if (strongIn[strongIn.length - 1]) {
      phraseEndIds.add(strongIn[strongIn.length - 1]!.id)
    }
  }

  const seedDegs = strongs.map((n) => {
    const sd = scaleDegree(n.midi, opts.tonality)
    return mode === 'major' ? (bareMajorHomeDeg(sd) ?? 0) : 0
  })

  type Pref = {
    note: MelodyEvent
    preferredDeg: number
    phraseEdge: 'start' | 'end' | null
    reason: string
    startTick: number
    endTick: number
    confidence: number
  }
  const prefs: Pref[] = []
  let prevRoot: number | null = null
  let prevStrongMidi: number | null = null
  for (let i = 0; i < strongs.length; i++) {
    const n = strongs[i]!
    const next = strongs[i + 1]
    const phraseId = phraseOfMel.get(n.id) ?? 0
    const phraseEdge = phraseStartIds.has(n.id)
      ? 'start'
      : phraseEndIds.has(n.id)
        ? 'end'
        : null
    const startTick = i === 0 ? Math.min(melody[0]?.startTick ?? 0, n.startTick) : n.startTick
    const endTick = next
      ? next.startTick
      : Math.max(
          n.startTick + Math.max(1, n.durationTicks),
          ...melody.map((m) => m.startTick + Math.max(1, m.durationTicks)),
        )
    const phraseStartTick = (() => {
      const list = byPhrase.get(phraseId) ?? []
      const strongIn = list.filter((x) => homeIds.has(x.id))
      return strongIn[0]?.startTick ?? n.startTick
    })()
    const prop = proposeRootForStrongNote({
      note: n,
      melody,
      tonality: opts.tonality,
      mode,
      prevRootPc: prevRoot,
      nextStrongMidi: next?.midi ?? null,
      phraseEdge,
      nextHomeDegHint: i + 1 < seedDegs.length ? seedDegs[i + 1]! : null,
      ppq: beat,
      prevStrongMidi,
      phraseStartTick,
      segmentEndTick: endTick,
    })
    prefs.push({
      note: n,
      preferredDeg: prop.homeDeg,
      phraseEdge,
      reason: prop.reason,
      startTick,
      endTick: Math.max(endTick, startTick + 1),
      confidence: prop.confidence,
    })
    prevRoot = prop.rootPc
    prevStrongMidi = n.midi
  }

  // A2 Viterbi (soft) then M3 Co5 beam (hard legal edges). Prefer Co5 when it
  // beats preferred path; else keep prior Viterbi-or-preferred.
  let rankedDegs = prefs.map((p) => p.preferredDeg)
  if (mode === 'major' && prefs.length >= 2) {
    const notes = prefs.map((p) => ({
      scaleDegree: scaleDegree(p.note.midi, opts.tonality),
      preferredDeg: p.preferredDeg,
      phraseEdge: p.phraseEdge,
    }))
    const cand = decodeStrongHomesViterbi(notes)
    const scorePath = (degs: number[]) => {
      let s = 0
      for (let i = 0; i < degs.length; i++) {
        const n = notes[i]!
        const prev = i > 0 ? degs[i - 1]! : null
        if (degs[i] === n.preferredDeg) s += 2
        if (prev === 7 && degs[i] === 0) s += 3
        if (prev === 2 && degs[i] === 7) s += 3
        if (prev === 0 && degs[i] === 5) s += 2
        if (n.phraseEdge === 'end' && degs[i] === 0) s += 2
      }
      return s
    }
    const hasEdge = notes.some((n) => n.phraseEdge === 'start' || n.phraseEdge === 'end')
    const margin = hasEdge ? 0.5 : 1.5
    if (scorePath(cand) >= scorePath(rankedDegs) + margin) rankedDegs = cand

    const co5Notes = prefs.map((p) => ({
      scaleDegree: scaleDegree(p.note.midi, opts.tonality),
      preferredDeg: p.preferredDeg,
      phraseEdge: p.phraseEdge,
      segFit: segFitByHome({
        melody,
        startTick: p.startTick,
        endTick: p.endTick,
        tonality: opts.tonality,
      }),
    }))
    const co5 = decodeStrongHomesCo5Beam(co5Notes)
    // M3c: apply Co5 per Strong only when span fit clearly prefers Co5 over ranked.
    // Always-apply (m3b) churned winners; scorePath margin (m3a) was a no-op.
    rankedDegs = rankedDegs.map((ranked, i) => {
      const alt = co5[i]!
      if (alt === ranked) return ranked
      const fit = co5Notes[i]!.segFit ?? {}
      const fitAlt = fit[alt] ?? 0
      const fitRanked = fit[ranked] ?? 0
      // Tight gate: protect I→IV false flips (90008 I°); keep II→V / I→II helps.
      if (fitAlt < 0.58 || fitAlt < fitRanked + 0.14) return ranked
      if (ranked === 0 && alt === 5) return ranked
      // Don't leave V for II on ^2 (Lead already names II).
      if (ranked === 7 && alt === 2 && co5Notes[i]!.scaleDegree === 2) return ranked
      return alt
    })
  }

  const raw: StrongHome[] = prefs.map((p, i) => {
    const deg = rankedDegs[i] ?? p.preferredDeg
    const rootPc = degRoot(opts.tonality, deg)
    const pathChanged = deg !== p.preferredDeg
    return {
      rootPc,
      startTick: p.startTick,
      endTick: p.endTick,
      strongNoteId: p.note.id,
      reason: pathChanged ? `viterbi:${p.reason}` : p.reason,
      // Sequence rewrite lowers lock confidence unless already a high-precision cue.
      confidence: pathChanged
        ? Math.min(p.confidence, STRONG_HOME_CONF_LOCK - 0.01)
        : p.confidence,
    }
  })

  const merged: StrongHome[] = []
  for (const h of raw) {
    const last = merged[merged.length - 1]
    if (last && last.rootPc === h.rootPc && last.endTick >= h.startTick) {
      last.endTick = Math.max(last.endTick, h.endTick)
      last.confidence = Math.min(last.confidence, h.confidence)
      continue
    }
    merged.push({ ...h })
  }
  return { homes: merged, melody }
}

export function strongHomesToPillars(
  homes: readonly StrongHome[],
  idGen?: { next: (prefix: string) => string },
): Pillar[] {
  return homes.map((h) => ({
    id: idGen?.next('pil') ?? newId('pil'),
    rootPc: h.rootPc,
    startTick: h.startTick,
    endTick: h.endTick,
    source: 'inferred' as const,
    confirmed: h.confidence >= STRONG_HOME_CONF_LOCK,
    reason: h.reason,
    confidence: h.confidence,
  }))
}

export function ensureHomesFromStrongNotes(
  project: ArrangementProject,
  opts?: { idGen?: { next: (prefix: string) => string }; force?: boolean },
): ArrangementProject {
  if (!opts?.force && project.pillars.length > 0) return project
  const assigned = assignMelodyRoles(
    project.melody,
    {
      ppq: project.ppq,
      tonality: project.tonality,
      promoteChangePoints: true,
      promoteCoverage: true,
    },
    { force: !!opts?.force },
  )
  const { homes, melody } = deriveStrongHomes({
    melody: assigned,
    tonality: project.tonality,
    mode: project.tonalityMode ?? 'major',
    ppq: project.ppq,
  })
  if (!homes.length) return { ...project, melody }
  return {
    ...project,
    melody,
    pillars: strongHomesToPillars(homes, opts?.idGen),
  }
}
