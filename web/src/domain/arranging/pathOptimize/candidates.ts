/**
 * Per-moment candidates for Path Optimize (fill / revoice / rechord).
 */
import {
  BARBERSHOP_CHORDS,
  leadRoleInChord,
  TTBB_CLOSE_SPAN_MAX,
  type VoicingPitches,
} from '../chords'
import { defaultVoicingProfile, type VoicingProfile } from '../voicingProfile'
import { phraseRoleAtMelodyIndex } from '../cadences'
import {
  candidatesForMelodyNote,
  candidateToStack,
  type HarmonizeCandidate,
} from '../harmonize'
import type { RankerDeps } from '../harmonize'
import { pillarAtTick } from '../pillars'
import { ensureHomesFromStrongNotes } from '../proposeStrongRoots'
import {
  optimizeSketchHearPath,
  type SketchHearChordRef,
} from '../sketchHearVoicing'
import { natureToSketchQuality } from '../../../lib/tagRoll/harmonySketch'
import type { ArrangementProject, ChordStack, MelodyEvent } from '../types'
import type { IdGenerator } from '../../../ports/IdGenerator'
import type { PathOptimizeWeights } from './types'
import { tickInOptimizeScope } from './moments'
import type { PathOptimizeScope } from './types'
import { partAwareVoiceLeadScore } from './partLeaps'

export type PathOptimizeDeps = {
  idGen?: IdGenerator
  rankerDeps?: RankerDeps
}

function roleOfPc(midi: number, rootPc: number, natureId: string): number {
  const chord = BARBERSHOP_CHORDS.find((c) => c.id === natureId)
  if (!chord) return 1
  const role = leadRoleInChord(chord, rootPc, midi)
  if (role != null) return role
  const rel = (((midi % 12) - rootPc) % 12 + 12) % 12
  for (const [r, off] of Object.entries(chord.offsets)) {
    if (off === rel) return Number(r)
  }
  return 1
}

function voicingStringFromMidi(
  rootPc: number,
  natureId: string,
  midi: VoicingPitches,
): string {
  return (
    String(roleOfPc(midi.bass, rootPc, natureId)) +
    String(roleOfPc(midi.bari, rootPc, natureId)) +
    String(roleOfPc(midi.lead, rootPc, natureId)) +
    String(roleOfPc(midi.tenor, rootPc, natureId))
  )
}

function midiEqual(a: VoicingPitches, b: VoicingPitches): boolean {
  return a.bass === b.bass && a.bari === b.bari && a.lead === b.lead && a.tenor === b.tenor
}

function cadenceBiasToRanker(
  bias: PathOptimizeWeights['cadenceBias'],
): RankerDeps['cadenceBias'] {
  // Pass through Optimize panel bias — do not substitute global Detected prefs.
  if (bias === 'off' || bias === 'moderate' || bias === 'strong') return bias
  return 'moderate'
}

/**
 * Map Basic→Risky into ranker weight knobs.
 * Basic: home triads, soft color/passing demotion, strong VL.
 * Risky: secondary dominants / color / passing freer, less home lock.
 */
export function rankerDepsForWeights(
  weights: PathOptimizeWeights,
  base?: RankerDeps,
): RankerDeps {
  const risk = Math.min(1, Math.max(0, weights.risk ?? 0.2))
  const basic = 1 - risk
  const vl = Math.max(0.05, weights.voiceLeading)
  const ring = Math.max(0.05, weights.ring)
  const sum = vl + ring
  const b = base?.weights ?? {}
  const cadenceStrong = weights.cadenceBias === 'strong'
  const cadenceMod = weights.cadenceBias === 'moderate'
  const taste = weights.taste ?? 'classic'
  // Strong cadence highways must beat home-triad lock (V7 under ^5, etc.).
  const homeScale = cadenceStrong ? 0.45 : cadenceMod ? 0.75 : 1
  const cadenceScale = cadenceStrong ? 2.4 : cadenceMod ? 1.4 : 1
  const tastePass =
    taste === 'busy' ? 0.55 : taste === 'circle' ? 0.75 : 1.25
  const tasteSec =
    taste === 'circle' ? 1.35 : taste === 'busy' ? 1.15 : 1
  const tasteColor = taste === 'busy' ? 0.7 : 1
  const tasteHome = taste === 'classic' ? 1.1 : 1
  return {
    ...base,
    cadenceBias: cadenceBiasToRanker(weights.cadenceBias),
    weights: {
      ...b,
      voiceLead: (b.voiceLead ?? 1) * (vl / sum) * (1.4 + basic * 1.2),
      motion: (b.motion ?? 1) * (vl / sum) * (1.2 + basic * 0.8),
      ring: (b.ring ?? 1) * (ring / sum) * (1.2 + risk * 0.9),
      harmonicity: (b.harmonicity ?? 1) * (ring / sum) * (1.1 + risk * 0.7),
      // Home triad still matters, but not enough to drown 4-PC sevenths (doubling is rare).
      homeTriad: (b.homeTriad ?? 1) * (0.85 + basic * 1.4) * homeScale * tasteHome,
      // Prefer true 4-part; when doubling, Basic prefers root doubles (not 3rds).
      completeFourPart: (b.completeFourPart ?? 1) * (1.3 + basic * 1.6),
      // Classical function gravity (I / V7 / IV / ii7 / vi) — Basic leans hard here.
      diatonicFunction: (b.diatonicFunction ?? 1) * (1.6 + basic * 3.2),
      // Dom9 stays available (Flinn); colorChordPenalty demotes when Lead isn't the 9th.
      colorChordPenalty:
        (b.colorChordPenalty ?? 1) * (0.65 + basic * 2.3) * tasteColor,
      // Basic: harder demotion of next-pillar sec-dom when PCF home fits (polecat).
      passingSoftPenalty:
        (b.passingSoftPenalty ?? 1) * (0.65 + basic * 2.8) * tastePass,
      // Basic still needs II7→V7 / V7→I circle (polecat highway); don't starve sec-dom.
      secondaryDominant:
        (b.secondaryDominant ?? 1) *
        (0.45 + risk * 1.55 + (cadenceStrong ? 0.55 : cadenceMod ? 0.25 : 0)) *
        tasteSec,
      cadenceFit: (b.cadenceFit ?? 1) * (1.1 + basic * 0.8) * cadenceScale,
      // Keep V7 / II7 competitive on Basic; I7 still gated by seventhBias/homeTriad.
      seventh: (b.seventh ?? 1) * (1.05 + basic * 0.2 + risk * 0.25),
      strongVoice: (b.strongVoice ?? 1) * (1.0 + basic * 0.4),
      // Basic strongly prefers closed spacing (spread drops bari/bass into mud).
      closedVoicing: (b.closedVoicing ?? 1) * (1.0 + basic * 1.8),
      // Basic strongly demotes Cm-under-C when Lead is not the ♭3.
      unforcedMinorPenalty: (b.unforcedMinorPenalty ?? 1) * (0.8 + basic * 2.4),
      // Cadence/tag tonic: prefer major/minor home (Rylander), not automatic I7.
      finalComplete: (b.finalComplete ?? 1) * (1.4 + basic * 0.8),
      // True song/phrase final must be tonic — kill hanging V7 / ii7 endings.
      songFinalHome: (b.songFinalHome ?? 1) * (2.0 + basic * 2.5),
      // Basic resists inversion climb / high bari+tenor parking.
      registerHome: (b.registerHome ?? 1) * (1.2 + basic * 2.0),
      // Ades close = upper trio ≤ octave; Basic leans hard here.
      upperTrioClose: (b.upperTrioClose ?? 1) * (1.1 + basic * 1.6),
      postLeapDirection: (b.postLeapDirection ?? 1) * (1.0 + basic * 1.4),
      hazardousLeap: (b.hazardousLeap ?? 1) * (0.9 + basic * 1.2),
    },
  }
}

/** Major-key diatonic pitch-class degrees (from tonality). */
const DIATONIC_DEGS = new Set([0, 2, 4, 5, 7, 9, 11])

/** Natures allowed at Basic (risk→0). Widens gradually toward Risky. */
export function natureAllowlistForRisk(risk: number): readonly string[] | null {
  const r = Math.min(1, Math.max(0, risk))
  // Basic: diatonic highway + Dom9 (Flinn) + sixth (melody-forced I6/IV6).
  // colorChordPenalty demotes Dom9/sixth when Lead isn't the color tone.
  if (r <= 0.35) return ['major', 'minor', 'seventh', 'm7', 'ninth', 'sixth']
  if (r <= 0.5) return ['major', 'minor', 'seventh', 'm7', 'ninth', 'sixth', 'madd6']
  if (r <= 0.7) {
    return ['major', 'minor', 'seventh', 'm7', 'sixth', 'madd6', 'add9', 'ninth']
  }
  return null // full catalog
}

function leadRoleFromVoicing(voicing: string | undefined): number {
  if (!voicing || voicing.length < 3) return 0
  const n = Number(voicing[2])
  return Number.isFinite(n) ? n : 0
}

/** Chord-tone role of Lead MIDI vs root (major-ish map; 9=6th for I6). */
export function leadRoleFromMidi(midi: number, rootPc: number): number {
  const rel = (((Math.round(midi) % 12) - rootPc) % 12 + 12) % 12
  const roles: Record<number, number> = {
    0: 1,
    4: 3,
    3: 3,
    7: 5,
    9: 6,
    10: 7,
    2: 9,
  }
  return roles[rel] ?? 0
}

function degreeOf(rootPc: number, tonality: number): number {
  return (((rootPc - tonality) % 12) + 12) % 12
}

/** Top-K ranked choices for one melody note (pillar or Strong-derived home). */
export function candidatesForMoment(
  project: ArrangementProject,
  note: MelodyEvent,
  opts: {
    topK: number
    weights: PathOptimizeWeights
    deps?: PathOptimizeDeps
    /** Revoice: only keep candidates matching current root+nature. */
    lockRootNature?: { rootPc: number; natureId: string }
  },
): HarmonizeCandidate[] {
  let working = project
  let pillar = pillarAtTick(working.pillars, note.startTick)
  if (!pillar) {
    working = ensureHomesFromStrongNotes(working, { idGen: opts.deps?.idGen })
    pillar = pillarAtTick(working.pillars, note.startTick)
  }
  if (!pillar) return []
  project = working
  const priorStacks = [...project.stacks]
    .filter((s) => s.startTick < note.startTick)
    .sort((a, b) => b.startTick - a.startTick)
  const prev = priorStacks[0]
  const prevPrev = priorStacks[1]
  const melodySorted = [...project.melody].sort((a, b) => a.startTick - b.startTick)
  const noteIdx = melodySorted.findIndex((m) => m.id === note.id)
  const idx =
    noteIdx >= 0
      ? noteIdx
      : melodySorted.findIndex((m) => m.startTick === note.startTick)
  const nextMel = idx >= 0 ? melodySorted[idx + 1] ?? null : null
  const prevMel = idx > 0 ? melodySorted[idx - 1]! : null
  const songEnd = Math.max(
    1,
    ...melodySorted.map((m) => m.startTick + Math.max(1, m.durationTicks)),
  )
  const phraseRole =
    idx >= 0 ? phraseRoleAtMelodyIndex(melodySorted, idx, songEnd) : undefined
  const nextPillar = [...project.pillars]
    .filter((x) => x.startTick > pillar.startTick)
    .sort((a, b) => a.startTick - b.startTick)[0]

  const risk = opts.weights.risk ?? 0.2
  const taste = opts.weights.taste ?? 'classic'
  const natureAllowlist = natureAllowlistForRisk(risk)
  // Sec-dom stays on at Basic so II7→V and VI7→ii approaches exist, but Basic
  // only targets the *next* pillar (not V7-of-current under every I). SCF later.
  // Chromatic pillars (bII / bV / bVI…): stay on the pillar root — no sec-dom flood.
  // Classic taste: also suppress mid-phrase passing (triad-leaning Classic Tags).
  const tonality = project.tonality
  const pillarDeg =
    tonality == null ? null : degreeOf(pillar.rootPc, tonality)
  const chromaticPillar =
    pillarDeg != null && !DIATONIC_DEGS.has(pillarDeg)
  const midOpen = phraseRole === 'mid' || phraseRole === 'open'
  const notesToNextPillar =
    nextPillar == null
      ? 99
      : melodySorted.filter(
          (m) => m.startTick >= note.startTick && m.startTick < nextPillar.startTick,
        ).length
  const nearNextPillar = notesToNextPillar <= 2
  const freerPassing = taste === 'circle' || taste === 'busy' || risk > 0.35
  const isPassingNote = note.role === 'smn'
  const isStrongNote = note.role === 'pmn'
  let allowPassing = true
  if (chromaticPillar && risk <= 0.35) {
    allowPassing = false
  } else if (isPassingNote && taste === 'classic' && risk <= 0.35) {
    // Passing: allow approach into next home only (near next pillar / next strong).
    allowPassing = nearNextPillar || freerPassing
  } else if (risk <= 0.25 && midOpen && !freerPassing && !nearNextPillar) {
    // Classic: stay on pillar roots mid-phrase (sparse triad charts).
    allowPassing = false
  }
  const allowScf = risk > 0.5
  const allowSpread = risk > 0.4
  // Busy: allow V7-of-current as well as next-pillar approaches.
  const secDomNextOnly = risk <= 0.25 && taste !== 'busy'

  // Passing: hold previous root only while still under the same home pillar.
  // When the covering pillar changes, use the new home (do not smear V under I).
  const homePillar =
    isPassingNote &&
    prev?.rootPc != null &&
    prev.rootPc === pillar.rootPc
      ? { ...pillar, rootPc: prev.rootPc }
      : pillar

  let ranked = candidatesForMelodyNote({
    note,
    pillar: homePillar,
    tonality: project.tonality,
    mode: project.tonalityMode ?? 'major',
    prevRootPc: prev?.rootPc ?? null,
    prevNatureId: prev?.natureId ?? null,
    preferScf: allowScf && risk > 0.55,
    allowPassing,
    allowScf,
    allowSpread,
    secDomNextOnly,
    natureAllowlist,
    limit: Math.max(opts.topK * 2, 16),
    profile: project.contestProfile,
    nextPillarRoot: nextPillar?.rootPc ?? null,
    prevMidi: prev?.midi ?? null,
    prevPrevMidi: prevPrev?.midi ?? null,
    rankerDeps: rankerDepsForWeights(opts.weights, opts.deps?.rankerDeps),
    nextMelodyMidi: nextMel?.midi ?? null,
    prevMelodyMidi: prevMel?.midi ?? null,
    phraseRole,
  })
  if (opts.lockRootNature) {
    ranked = ranked.filter(
      (c) =>
        c.rootPc === opts.lockRootNature!.rootPc &&
        c.natureId === opts.lockRootNature!.natureId,
    )
  }
  // Classic Basic: Dom9 only when Lead is the 9th (Flinn); else drop — charts are Mm7.
  if (taste === 'classic' && risk <= 0.35) {
    ranked = ranked.filter((c) => {
      if (c.natureId !== 'ninth') return true
      return leadRoleFromMidi(note.midi, c.rootPc) === 9
    })
  }
  // B1: Classic Strong allowlist — I / IV / V / II / vi (+ natures). Demote III / chromatic roots.
  if (taste === 'classic' && risk <= 0.35 && isStrongNote && tonality != null) {
    const allowed = new Set([0, 2, 5, 7, 9])
    const filtered = ranked.filter((c) => allowed.has(degreeOf(c.rootPc, tonality)))
    if (filtered.length) ranked = filtered
  }
  // Auto Strong homes: lock root to inferred home; guided/user pillars stay free to re-root.
  if (
    taste === 'classic' &&
    risk <= 0.35 &&
    isStrongNote &&
    homePillar.source === 'inferred'
  ) {
    const locked = ranked.filter((c) => c.rootPc === homePillar.rootPc)
    if (locked.length) ranked = locked
  }
  // A4: Passing — prefer current home pillar root; approach next only when near it.
  if (isPassingNote && ranked.length >= 2) {
    const holdRoot = homePillar.rootPc
    const approachRoot = nearNextPillar ? (nextPillar?.rootPc ?? null) : null
    ranked = [...ranked].sort((a, b) => {
      const ah = a.rootPc === holdRoot ? 1 : 0
      const bh = b.rootPc === holdRoot ? 1 : 0
      if (ah !== bh) return bh - ah
      if (approachRoot != null) {
        const aa = a.rootPc === approachRoot ? 1 : 0
        const ba = b.rootPc === approachRoot ? 1 : 0
        if (aa !== ba) return ba - aa
      }
      return (b.score ?? 0) - (a.score ?? 0)
    })
  }
  // Prefer smoother tenor/bass among near-tied ranker scores (Basic amplifies).
  const jumpTie = 0.35 + (1 - risk) * 0.55
  ranked = [...ranked].sort((a, b) => {
    if (Math.abs(a.score - b.score) > jumpTie) return b.score - a.score
    const ja = a.midi && prev?.midi ? partAwareVoiceLeadScore(prev.midi, a.midi) : 0.5
    const jb = b.midi && prev?.midi ? partAwareVoiceLeadScore(prev.midi, b.midi) : 0.5
    if (Math.abs(ja - jb) > 0.02) return jb - ja
    return b.score - a.score
  })
  // Basic highway soft prefers among near-tied same-root natures.
  if (risk <= 0.25 && ranked.length >= 2) {
    const top = ranked[0]!
    const deg =
      tonality == null ? null : degreeOf(top.rootPc, tonality)
    const leadRole = Math.max(
      leadRoleFromVoicing(top.voicing),
      leadRoleFromMidi(note.midi, top.rootPc),
    )
    // Chromatic approach pillars: prefer Mm7 (bII7 / bV7 / bVI7 chains).
    if (chromaticPillar) {
      const mm7 = ranked.find(
        (c) => c.rootPc === homePillar.rootPc && c.natureId === 'seventh',
      )
      if (mm7) ranked = [mm7, ...ranked.filter((c) => c !== mm7)]
    }
    // Dom9 → Mm7 unless Lead is literally the 9th.
    else if (top.natureId === 'ninth' && leadRole !== 9) {
      const mm7 = ranked.find(
        (c) => c.rootPc === top.rootPc && c.natureId === 'seventh',
      )
      if (mm7) {
        ranked = [mm7, ...ranked.filter((c) => c !== mm7)]
      }
    }
    // I6 / IV6 when Lead is the 6th (Honey, Dream, Classic added6) — melody-forced.
    else if (
      (deg === 0 || deg === 5) &&
      leadRole === 6 &&
      top.natureId !== 'sixth'
    ) {
      const sixth = ranked.find(
        (c) => c.rootPc === top.rootPc && c.natureId === 'sixth',
      )
      if (sixth) ranked = [sixth, ...ranked.filter((c) => c !== sixth)]
    }
    // V / V7: prefer Mm7 dominant (charts are full of V7).
    else if (deg === 7 && top.natureId === 'major') {
      const v7 = ranked.find(
        (c) => c.rootPc === top.rootPc && c.natureId === 'seventh',
      )
      if (v7) ranked = [v7, ...ranked.filter((c) => c !== v7)]
    }
    // IV7 when Lead is 3 or ♭7 of IV (Sweet Roses / polecat IV7 holds); else triad below.
    else if (
      deg === 5 &&
      (leadRole === 3 || leadRole === 7) &&
      top.natureId === 'major'
    ) {
      const iv7 = ranked.find(
        (c) => c.rootPc === top.rootPc && c.natureId === 'seventh',
      )
      if (iv7) ranked = [iv7, ...ranked.filter((c) => c !== iv7)]
    }
    // I / IV: prefer triad when Lead is 1 or 5 (sparse Classic charts); keep Mm7 when Lead is 3 or 7.
    else if (
      (deg === 0 || deg === 5) &&
      (leadRole === 1 || leadRole === 5) &&
      (top.natureId === 'seventh' || top.natureId === 'ninth' || top.natureId === 'sixth')
    ) {
      const triad = ranked.find(
        (c) => c.rootPc === top.rootPc && c.natureId === 'major',
      )
      if (triad) ranked = [triad, ...ranked.filter((c) => c !== triad)]
    }
    // VI7 / VII7: force Mm7 when Lead carries 3 or ♭7 (color); Lead-on-root → keep vi/vii
    // (honest charts mix vi and VI7; always-force invented VI7 under ^6).
    else if (
      deg === 9 &&
      (leadRole === 3 || leadRole === 7) &&
      (top.natureId === 'minor' || top.natureId === 'm7')
    ) {
      const vi7 = ranked.find(
        (c) => c.rootPc === top.rootPc && c.natureId === 'seventh',
      )
      if (vi7) ranked = [vi7, ...ranked.filter((c) => c !== vi7)]
    } else if (
      deg === 11 &&
      (leadRole === 3 || leadRole === 7) &&
      (top.natureId === 'm7' || top.natureId === 'minor')
    ) {
      const vii7 = ranked.find(
        (c) => c.rootPc === top.rootPc && c.natureId === 'seventh',
      )
      if (vii7) ranked = [vii7, ...ranked.filter((c) => c !== vii7)]
    } else if (deg === 4) {
      // Mediant: Lead-on-7 → III7 (Honey); else prefer iii triad (Irish Rose).
      if (leadRole === 7) {
        const iii7 = ranked.find(
          (c) => c.rootPc === top.rootPc && c.natureId === 'seventh',
        )
        if (iii7) ranked = [iii7, ...ranked.filter((c) => c !== iii7)]
      } else if (top.natureId === 'seventh' || top.natureId === 'm7') {
        const iii = ranked.find(
          (c) => c.rootPc === top.rootPc && c.natureId === 'minor',
        )
        if (iii) ranked = [iii, ...ranked.filter((c) => c !== iii)]
      }
    }
  }
  return ranked.slice(0, opts.topK)
}

export function applyCandidateAtNote(
  project: ArrangementProject,
  note: MelodyEvent,
  candidate: HarmonizeCandidate,
  deps?: PathOptimizeDeps,
): ArrangementProject {
  const pillar = pillarAtTick(project.pillars, note.startTick)
  const stack = candidateToStack(note, candidate, pillar?.id ?? null, deps?.idGen)
  const stacks = project.stacks
    .filter((s) => s.startTick !== note.startTick)
    .concat(stack)
    .sort((a, b) => a.startTick - b.startTick)
  return { ...project, stacks }
}

export function stackAtTick(
  project: ArrangementProject,
  tick: number,
): ChordStack | undefined {
  return project.stacks.find(
    (s) => s.startTick === tick && s.layer !== 'embellishment',
  )
}

export function hasKnownStack(project: ArrangementProject, tick: number): boolean {
  const s = stackAtTick(project, tick)
  return !!(s && s.natureId !== 'unknown' && s.midi)
}

export type RevoiceOpts = {
  /** Basic→Risky — Basic keeps near-home outer spans (≤ TTBB_CLOSE_SPAN_MAX). */
  risk?: number
  /** Ensemble bands / outer-span / pitch center (defaults to TTBB). */
  profile?: VoicingProfile
  /** Run-again diversity seed for sketch-hear candidate order. */
  exploreSeed?: number
  /** Allow single-stack revoice (Coach walk / one chord). */
  allowSingle?: boolean
}

/**
 * Revoice a contiguous (or selected) stack list with optimizeSketchHearPath.
 * Lead stays locked to melody; seeds anchor toward the current placement.
 */
export function revoiceStackList(
  project: ArrangementProject,
  sorted: readonly ChordStack[],
  opts: RevoiceOpts = {},
): { project: ArrangementProject; changedIds: string[] } {
  if (sorted.length < 1) {
    return { project, changedIds: [] }
  }
  if (sorted.length < 2 && !opts.allowSingle) {
    return { project, changedIds: [] }
  }

  const risk = opts.risk ?? 0.35
  const profile = opts.profile ?? defaultVoicingProfile()
  const spanCap = profile.allowSpread
    ? Math.max(profile.maxOuterSpan, TTBB_CLOSE_SPAN_MAX + 7)
    : profile.maxOuterSpan

  const refs: SketchHearChordRef[] = sorted.map((s) => {
    const mel = project.melody.find((m) => m.startTick === s.startTick)
    return {
      rootPc: s.rootPc,
      quality: natureToSketchQuality(s.natureId),
      leadMidi: mel?.midi ?? s.midi!.lead,
    }
  })
  const seeds = sorted.map((s) => s.midi!)
  const path = optimizeSketchHearPath(refs, {
    tonality: project.tonality,
    seedPitches: seeds,
    partAware: true,
    risk,
    profile,
    exploreSeed: opts.exploreSeed,
  })
  if (path.length !== sorted.length) {
    return { project, changedIds: [] }
  }

  const byId = new Map<string, ChordStack>()
  const changedIds: string[] = []
  for (let i = 0; i < sorted.length; i++) {
    const prev = sorted[i]!
    const nextMidi = path[i]!
    const mel = project.melody.find((m) => m.startTick === prev.startTick)
    const midi: VoicingPitches = {
      bass: nextMidi.bass,
      bari: nextMidi.bari,
      lead: mel?.midi ?? nextMidi.lead,
      tenor: nextMidi.tenor,
    }
    if (midi.tenor <= midi.lead) {
      midi.tenor = midi.lead + Math.max(1, nextMidi.tenor - nextMidi.lead)
    }
    // Reject only when wider than the active ensemble profile allows.
    if (midi.tenor - midi.bass > spanCap) {
      byId.set(prev.id, prev)
      continue
    }
    // Never accept part unisons from sketch-hear revoice.
    if (new Set([midi.bass, midi.bari, midi.lead, midi.tenor]).size < 4) {
      byId.set(prev.id, prev)
      continue
    }
    if (prev.midi && midiEqual(prev.midi, midi)) {
      byId.set(prev.id, prev)
      continue
    }
    changedIds.push(prev.id)
    byId.set(prev.id, {
      ...prev,
      midi,
      voicing: voicingStringFromMidi(prev.rootPc, prev.natureId, midi),
      // Keep close unless the ensemble profile explicitly allows spread shells.
      spread: profile.allowSpread && midi.tenor - midi.bass > 19 ? true : false,
    })
  }
  if (!changedIds.length) return { project, changedIds: [] }
  return {
    project: { ...project, stacks: project.stacks.map((s) => byId.get(s.id) ?? s) },
    changedIds,
  }
}

/**
 * Revoice stacks in scope with optimizeSketchHearPath (lead locked to melody).
 * Same reject-friendly seed anchoring as Coach polish.
 */
export function revoiceStacksInScope(
  project: ArrangementProject,
  scope: PathOptimizeScope,
  opts: RevoiceOpts = {},
): { project: ArrangementProject; changedIds: string[] } {
  const sorted = [...project.stacks]
    .filter(
      (s) =>
        s.layer !== 'embellishment' &&
        s.midi &&
        tickInOptimizeScope(s.startTick, scope),
    )
    .sort((a, b) => a.startTick - b.startTick || a.id.localeCompare(b.id))
  return revoiceStackList(project, sorted, opts)
}

/** Revoice only stacks that land on the given moment ticks (windowed Revoice). */
export function revoiceStacksForMoments(
  project: ArrangementProject,
  moments: readonly MelodyEvent[],
  opts: RevoiceOpts = {},
): { project: ArrangementProject; changedIds: string[] } {
  const seen = new Set<number>()
  const sorted: ChordStack[] = []
  for (const m of moments) {
    if (seen.has(m.startTick)) continue
    seen.add(m.startTick)
    const s = stackAtTick(project, m.startTick)
    if (s?.midi && s.layer !== 'embellishment') sorted.push(s)
  }
  return revoiceStackList(project, sorted, opts)
}

/** Deterministic mulberry32 for explore sampling. */
export function mulberry32(seed: number): () => number {
  let t = seed >>> 0
  return () => {
    t += 0x6d2b79f5
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

/** Pick among candidates within floor of best (temperature softens). */
export function pickExploreCandidate(
  cands: readonly HarmonizeCandidate[],
  opts: {
    temperature: number
    rand: () => number
    floorRatio?: number
    /** Prefer a pick that differs from the current stack (Try again). */
    avoid?: { rootPc: number; natureId: string; voicing: string } | null
  },
): HarmonizeCandidate | null {
  if (!cands.length) return null
  const best = cands[0]!.score
  const floor = best - Math.max(0.75, Math.abs(best) * (opts.floorRatio ?? 0.35))
  let pool = cands.filter((c) => c.score >= floor)
  if (opts.avoid) {
    const diversified = pool.filter(
      (c) =>
        c.rootPc !== opts.avoid!.rootPc ||
        c.natureId !== opts.avoid!.natureId ||
        c.voicing !== opts.avoid!.voicing,
    )
    if (diversified.length) pool = diversified
  }
  if (pool.length <= 1) return pool[0] ?? cands[0]!
  const t = Math.max(0.05, opts.temperature)
  const weights = pool.map((c) => Math.exp((c.score - best) / t))
  const sum = weights.reduce((a, b) => a + b, 0)
  let r = opts.rand() * sum
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i]!
    if (r <= 0) return pool[i]!
  }
  return pool[pool.length - 1]!
}
