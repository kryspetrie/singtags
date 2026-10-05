/**
 * TTBB middle-range voicings for Sketch / Cadence / Key-change Hear.
 * Prefer catalog barbershop voicing strings + placeVoicing — never dump 9ths as m2 clusters.
 * When prev/next context is provided, pick inversions via arranging VL rules
 * (smooth motion, common tones, avoid parallel 5ths/8ves).
 */
import {
  BARBERSHOP_CHORDS,
  VOICINGS_BY_CHORD,
  leadRoleInChord,
  placeVoicing,
  voicingFitsLead,
  type BarbershopChordNature,
  type ChordToneRole,
  type VoicingPitches,
} from './chords/chords'
import { ringTier } from './contestProfile'
import {
  commonToneScore,
  contraryMotionScore,
  parallelPerfectPenalty,
  voiceLeadScore,
} from './theoryScores'

/** Chord quality / nature id (matches BARBERSHOP_CHORDS and Tag Studio sketch qualities). */
export type SketchHearQuality = string

/** Men’s TTBB preview comfort band (concert MIDI). */
export const SKETCH_HEAR_BASS_MIN = 48 // C3
export const SKETCH_HEAR_TENOR_MAX = 77 // F5
/** Synthetic lead when no melody / lead ∉ chord — mid men’s lead. */
export const SKETCH_HEAR_DEFAULT_LEAD = 60 // C4

/** Prefer closed / Dom9-omit strings first for sketch Hear. */
const CLOSED_DEFAULTS: Record<string, string[]> = {
  major: ['1351', '1513', '1531', '1153'],
  minor: ['1351', '1513', '1531', '1153'],
  seventh: ['5317', '5713', '1357', '1537', '1735'],
  m7: ['5317', '5713', '1357', '1537'],
  maj7: ['1573', '1375'],
  'half-dim': ['5317', '5713', '1357', '1537'],
  dim7: ['1375', '1735', '3715'],
  dim: ['1351'],
  aug: ['1351', '1153'],
  sixth: ['1361', '1365', '1163'],
  madd6: ['1563', '1356', '1653'],
  /** Dom9: omit-root first (Prietto/BAM), then omit-5; lead-on-5/3 shells for melody fit. */
  ninth: ['5793', '5397', '1793', '1379', '1759', '5973', '1973', '3759'],
  add9: ['1593', '1395'],
}

export type SketchHearChordRef = {
  rootPc: number
  quality: SketchHearQuality
  leadMidi?: number | null
}

function chordForQuality(quality: SketchHearQuality): BarbershopChordNature {
  return (
    BARBERSHOP_CHORDS.find((c) => c.id === quality) ??
    BARBERSHOP_CHORDS.find((c) => c.id === 'major')!
  )
}

function orderedVoicings(quality: SketchHearQuality): string[] {
  const preferred = CLOSED_DEFAULTS[quality] ?? CLOSED_DEFAULTS.major!
  const catalog = VOICINGS_BY_CHORD[quality] ?? preferred
  return [...new Set([...preferred, ...catalog])]
}

/** MIDI for a chord-tone role near a target register. */
function roleMidiNear(rootPc: number, chord: BarbershopChordNature, role: ChordToneRole, near: number): number {
  const off = chord.offsets[role]
  if (off == null) return near
  let m = rootPc + off
  while (m < near - 6) m += 12
  while (m > near + 6) m -= 12
  return m
}

function uniquePcs(midis: readonly number[]): number[] {
  return [...new Set(midis.map((m) => ((m % 12) + 12) % 12))]
}

function chordTonePcs(chord: BarbershopChordNature, rootPc: number): Set<number> {
  const out = new Set<number>()
  for (const off of Object.values(chord.offsets)) {
    if (off != null) out.add(((rootPc + off) % 12 + 12) % 12)
  }
  return out
}

function pitchesLegal(p: VoicingPitches): boolean {
  const midis = [p.bass, p.bari, p.lead, p.tenor]
  if (new Set(midis).size < 4) return false
  if (!(p.bass <= p.bari && p.bass <= p.lead && p.tenor > p.lead)) return false
  if (p.bass < SKETCH_HEAR_BASS_MIN - 7 || p.tenor > SKETCH_HEAR_TENOR_MAX + 7) return false
  return true
}

function coverageScore(
  p: VoicingPitches,
  chord: BarbershopChordNature,
  rootPc: number,
  quality: SketchHearQuality,
): number {
  const pcs = uniquePcs([p.bass, p.bari, p.lead, p.tenor])
  const wanted = chordTonePcs(chord, rootPc)
  let score = 0
  for (const pc of pcs) {
    if (wanted.has(pc)) score += 3
  }
  // Dom9 / add9: require the 9; Dom9 also wants b7 and a clear triad omit (1, 3, or 5).
  if (quality === 'ninth' || quality === 'add9') {
    const ninthPc = ((rootPc + 2) % 12 + 12) % 12
    if (pcs.includes(ninthPc)) score += 8
    else score -= 20
    if (quality === 'ninth') {
      const seventhPc = ((rootPc + 10) % 12 + 12) % 12
      const thirdPc = ((rootPc + 4) % 12 + 12) % 12
      const fifthPc = ((rootPc + 7) % 12 + 12) % 12
      if (pcs.includes(seventhPc)) score += 4
      else score -= 8
      const triadKept = [pcs.includes(rootPc), pcs.includes(thirdPc), pcs.includes(fifthPc)].filter(
        Boolean,
      ).length
      // Four-note Dom9 must omit one tone — prefer omitting a triad member (not 7/9).
      if (triadKept === 2) score += 5
      else if (triadKept === 3) score -= 3
      // Root+9 major-second cluster in adjacent voices sounds harsh.
      const midis = [p.bass, p.bari, p.lead, p.tenor].sort((a, b) => a - b)
      for (let i = 0; i < midis.length - 1; i++) {
        const a = midis[i]!
        const b = midis[i + 1]!
        if (b - a !== 2) continue
        const ap = ((a % 12) + 12) % 12
        const bp = ((b % 12) + 12) % 12
        if (
          (ap === rootPc && bp === ninthPc) ||
          (ap === ninthPc && bp === rootPc)
        ) {
          score -= 14
        }
      }
    }
  }
  // Prefer full 1–3–5–b7 when quality has a 7th (non-ninth)
  if (chord.offsets[7] != null && quality !== 'ninth' && quality !== 'add9') {
    if (pcs.length >= 4) score += 6
    else score -= 8
  }
  if (p.bass >= SKETCH_HEAR_BASS_MIN && p.bass <= 60) score += 2
  if (p.tenor <= SKETCH_HEAR_TENOR_MAX && p.tenor >= 64) score += 2
  const span = p.tenor - p.bass
  if (span >= 12 && span <= 28) score += 2
  return score
}

function shiftToMidRange(p: VoicingPitches): VoicingPitches {
  let { bass, bari, lead, tenor } = p
  while (bass < SKETCH_HEAR_BASS_MIN && tenor + 12 <= SKETCH_HEAR_TENOR_MAX + 7) {
    bass += 12
    bari += 12
    lead += 12
    tenor += 12
  }
  while (tenor > SKETCH_HEAR_TENOR_MAX && bass - 12 >= SKETCH_HEAR_BASS_MIN - 7) {
    bass -= 12
    bari -= 12
    lead -= 12
    tenor -= 12
  }
  return { bass, bari, lead, tenor }
}

/**
 * Keep melody lead fixed; only octave-nudge bass/bari/tenor into a legal TTBB stack.
 * Used when Lead-lock is on so mid-range shifting cannot yank the tune up an octave.
 */
function settleAroundLockedLead(p: VoicingPitches): VoicingPitches {
  const lead = p.lead
  let bass = p.bass
  let bari = p.bari
  let tenor = p.tenor
  for (let guard = 0; guard < 16; guard++) {
    const next = { bass, bari, lead, tenor }
    if (pitchesLegal(next)) return next
    if (tenor <= lead || tenor === bass || tenor === bari) {
      tenor += 12
      continue
    }
    if (bari >= tenor || bari === lead || bari === bass) {
      bari -= 12
      continue
    }
    if (bass > lead || bass === bari || bass === lead || bass === tenor) {
      bass -= 12
      continue
    }
    if (bass < SKETCH_HEAR_BASS_MIN - 7) {
      bass += 12
      continue
    }
    if (tenor > SKETCH_HEAR_TENOR_MAX + 7) {
      tenor -= 12
      continue
    }
    break
  }
  const out = { bass, bari, lead, tenor }
  return pitchesLegal(out) ? out : p
}

function midisToPitches(midis: readonly number[]): VoicingPitches {
  return {
    bass: midis[0]!,
    bari: midis[1]!,
    lead: midis[2]!,
    tenor: midis[3]!,
  }
}

/** True when every sounding pitch-class is a chord tone of the sketch quality. */
function voicingUsesOnlyChordTones(
  pitches: VoicingPitches,
  chord: BarbershopChordNature,
  rootPc: number,
): boolean {
  const wanted = chordTonePcs(chord, rootPc)
  for (const m of [pitches.bass, pitches.bari, pitches.lead, pitches.tenor]) {
    if (!wanted.has(((m % 12) + 12) % 12)) return false
  }
  return true
}

/**
 * After path/local ranking, snap lead to the melody MIDI when it is a chord tone
 * (Realize / Polish do the same). Prefer a fresh catalog placement that already
 * carries that lead role — never invent non-chord tenor/bari by arithmetic shift.
 */
export function lockVoicingLeadToMelody(
  pitches: VoicingPitches,
  ref: SketchHearChordRef,
): VoicingPitches {
  const leadMidi = ref.leadMidi
  if (leadMidi == null || !Number.isFinite(leadMidi)) return pitches
  const chord = chordForQuality(ref.quality)
  const rootPc = ((ref.rootPc % 12) + 12) % 12
  const leadRole = leadRoleInChord(chord, rootPc, leadMidi)
  if (leadRole == null) return pitches

  const lead = Math.round(leadMidi)
  if (pitches.lead === lead && voicingUsesOnlyChordTones(pitches, chord, rootPc)) {
    return pitches
  }

  // Re-place with voicings that already put the melody role in the lead slot.
  const fitting = orderedVoicings(ref.quality).filter((v) => voicingFitsLead(v, leadRole))
  let best: VoicingPitches | null = null
  let bestScore = Number.NEGATIVE_INFINITY
  for (const voicing of fitting) {
    const placed = placeVoicing({
      chord,
      rootPc,
      leadMidi: lead,
      voicing,
      spread: false,
    })
    if (!placed) continue
    const mid = settleAroundLockedLead(placed)
    if (
      !pitchesLegal(mid) ||
      mid.lead !== lead ||
      !voicingUsesOnlyChordTones(mid, chord, rootPc)
    ) {
      continue
    }
    // Prefer staying near the path's chosen bass (VL continuity) among legal fits.
    const score =
      coverageScore(mid, chord, rootPc, ref.quality) -
      Math.abs(mid.bass - pitches.bass) * 0.35
    if (score > bestScore) {
      bestScore = score
      best = mid
    }
  }
  if (best) return best

  // Last resort: keep original if it already has the lead MIDI; else leave unchanged.
  return pitches.lead === lead ? pitches : pitches
}

/** Enumerate legal TTBB preview candidates for one sketch chord (no context ranking). */
export function enumerateSketchHearCandidates(opts: SketchHearChordRef): VoicingPitches[] {
  const chord = chordForQuality(opts.quality)
  const rootPc = ((opts.rootPc % 12) + 12) % 12
  const rawLead = opts.leadMidi
  const leadRole = rawLead != null ? leadRoleInChord(chord, rootPc, rawLead) : null

  const allVoicings = orderedVoicings(opts.quality)
  const fitting =
    leadRole != null ? allVoicings.filter((v) => voicingFitsLead(v, leadRole)) : []

  const out: VoicingPitches[] = []
  const seen = new Set<string>()

  const tryPlace = (voicing: string, leadMidi: number, lockLead: boolean) => {
    const placed = placeVoicing({
      chord,
      rootPc,
      leadMidi,
      voicing,
      spread: false,
    })
    if (!placed) return
    const mid = lockLead ? settleAroundLockedLead(placed) : shiftToMidRange(placed)
    if (!pitchesLegal(mid)) return
    if (lockLead && mid.lead !== Math.round(leadMidi)) return
    const key = `${mid.bass},${mid.bari},${mid.lead},${mid.tenor}`
    if (seen.has(key)) return
    seen.add(key)
    out.push(mid)
  }

  // Melody is a chord tone: only inversions that carry that lead (no synthetic rivals).
  if (rawLead != null && fitting.length) {
    for (const v of fitting) tryPlace(v, rawLead, true)
    if (out.length) return out
  }

  // No melody, melody ∉ chord, or no legal melody-fit placement — synthetic lead.
  for (const v of allVoicings) {
    const role = Number(v[2]) as ChordToneRole
    const synth = roleMidiNear(rootPc, chord, role, SKETCH_HEAR_DEFAULT_LEAD)
    tryPlace(v, synth, false)
  }
  return out
}

/**
 * VL / common-tone / parallel scores between two stacks (arranging theory rules).
 * Scaled to sit alongside coverageScore (~0–30).
 */
function linkScore(from: VoicingPitches, to: VoicingPitches): number {
  return (
    voiceLeadScore(from, to) * 12 +
    commonToneScore(from, to) * 8 +
    contraryMotionScore(from, to) * 3 -
    parallelPerfectPenalty(from, to) * 10
  )
}

/** Heavier VL weighting for full-path search (Detected / Realize sequences). */
function pathLinkScore(from: VoicingPitches, to: VoicingPitches): number {
  return (
    voiceLeadScore(from, to) * 22 +
    commonToneScore(from, to) * 12 +
    contraryMotionScore(from, to) * 5 -
    parallelPerfectPenalty(from, to) * 14
  )
}

function bassPcRole(bassMidi: number, rootPc: number, chord: BarbershopChordNature): number | null {
  const rel = (((bassMidi % 12) - rootPc) % 12 + 12) % 12
  for (const [role, off] of Object.entries(chord.offsets)) {
    if (off === rel) return Number(role)
  }
  return null
}

function isIorV(rootPc: number, tonality: number): boolean {
  const deg = (((rootPc - tonality) % 12) + 12) % 12
  return deg === 0 || deg === 7
}

function nodeScore(
  pitches: VoicingPitches,
  ref: SketchHearChordRef,
  chord: BarbershopChordNature,
  opts: {
    tonality: number
    index: number
    isStartSeed: boolean
    /** Soften cold mid-range / opening-home bias when polishing existing stacks. */
    preserveRegister?: boolean
  },
): number {
  const rootPc = ((ref.rootPc % 12) + 12) % 12
  let s = coverageScore(pitches, chord, rootPc, ref.quality)
  s += Math.max(0, 7 - ringTier(ref.quality)) * 2.25
  const role = bassPcRole(pitches.bass, rootPc, chord)
  if (isIorV(rootPc, opts.tonality)) {
    const homeBass = role === 1 || role === 5
    const isTonic = (((rootPc - opts.tonality) % 12) + 12) % 12 === 0
    if (opts.index === 0) {
      // Cold sketch paths: strongly prefer opening I/V in root or 2nd (bass 5).
      // When polishing an existing chart, keep this light so VL can keep walking.
      if (opts.preserveRegister) {
        s += homeBass ? 3 : -1
      } else {
        s += homeBass ? 12 : -4
        if (opts.isStartSeed && homeBass) s += 3
      }
    } else if (homeBass) {
      // Mid-path: light preference so bass can still walk through I/V.
      s += opts.preserveRegister ? 1.5 : 3.5
    }
    // Settled home I: first inv is almost never sung — VL from a prior odd
    // inversion must not stick (Bonnie m16). Penalize the bad option instead of
    // heavily rewarding every root-position I/V (which made paths jumpy).
    if (isTonic && ref.quality === 'major' && role === 3) s -= 18
  }
  // Dom7 / Dom9: discourage 3rd/7th/9th-bass shells (Bonnie V7(9)/V) without a
  // large root/5 bonus that forces bass leaps on every dominant.
  if (ref.quality === 'seventh' || ref.quality === 'ninth') {
    if (role === 7 || role === 9) s -= 14
    else if (role === 3) s -= 12
  }
  return s
}

function pitchesKey(p: VoicingPitches): string {
  return `${p.bass},${p.bari},${p.lead},${p.tenor}`
}

/** Cap fan-out per chord so Viterbi stays responsive on long charts. */
const PATH_CAND_CAP = 28

function rankedCandidates(ref: SketchHearChordRef): VoicingPitches[] {
  const chord = chordForQuality(ref.quality)
  const rootPc = ((ref.rootPc % 12) + 12) % 12
  const raw = enumerateSketchHearCandidates(ref)
  if (raw.length <= PATH_CAND_CAP) return raw
  return [...raw]
    .sort(
      (a, b) =>
        coverageScore(b, chord, rootPc, ref.quality) - coverageScore(a, chord, rootPc, ref.quality),
    )
    .slice(0, PATH_CAND_CAP)
}

/**
 * Opening seeds: prefer every legal root / 5th-bass inversion on I or V,
 * then remaining candidates — explores a wide variety of starts.
 */
function startSeeds(
  cands: readonly VoicingPitches[],
  ref: SketchHearChordRef,
  tonality: number,
): VoicingPitches[] {
  if (!cands.length) return []
  const chord = chordForQuality(ref.quality)
  const rootPc = ((ref.rootPc % 12) + 12) % 12
  if (!isIorV(rootPc, tonality)) return [...cands]
  const home: VoicingPitches[] = []
  const rest: VoicingPitches[] = []
  for (const c of cands) {
    const role = bassPcRole(c.bass, rootPc, chord)
    if (role === 1 || role === 5) home.push(c)
    else rest.push(c)
  }
  // Deduplicate while keeping home-first order
  const out: VoicingPitches[] = []
  const seen = new Set<string>()
  for (const c of [...home, ...rest]) {
    const k = pitchesKey(c)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(c)
  }
  return out
}

export type OptimizeSketchHearPathOpts = {
  tonality?: number
  /**
   * Existing TTBB placements (e.g. Coach stacks). Injected as candidates and
   * strongly preferred so polish cannot yank a smooth path into mid-range jumps.
   */
  seedPitches?: readonly (VoicingPitches | null | undefined)[]
}

function seedStayBonus(candidate: VoicingPitches, seed: VoicingPitches | null | undefined): number {
  if (!seed) return 0
  if (
    candidate.bass === seed.bass &&
    candidate.bari === seed.bari &&
    candidate.lead === seed.lead &&
    candidate.tenor === seed.tenor
  ) {
    return 32
  }
  // Prefer staying in the same register even when inversion changes.
  const d =
    Math.abs(candidate.bass - seed.bass) +
    Math.abs(candidate.bari - seed.bari) +
    Math.abs(candidate.tenor - seed.tenor)
  return Math.max(0, 20 - d * 1.1)
}

function injectSeedCandidate(
  cands: readonly VoicingPitches[],
  seed: VoicingPitches | null | undefined,
  ref: SketchHearChordRef,
): VoicingPitches[] {
  if (!seed) return [...cands]
  const locked = lockVoicingLeadToMelody(seed, ref)
  const out: VoicingPitches[] = []
  const seen = new Set<string>()
  for (const c of [locked, ...cands]) {
    const k = pitchesKey(c)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(c)
  }
  return out
}

/**
 * Global inversion path for a Detected / Sketch chord sequence.
 * Explores all legal inversions (preferring I/V openings with bass on 1 or 5),
 * then picks the path with best voice leading + ring + chord coverage.
 * Pass {@link OptimizeSketchHearPathOpts.seedPitches} when polishing an existing chart.
 */
export function optimizeSketchHearPath(
  chords: readonly SketchHearChordRef[],
  opts?: OptimizeSketchHearPathOpts,
): VoicingPitches[] {
  if (!chords.length) return []
  const tonality = opts?.tonality ?? 0
  const seeds = opts?.seedPitches
  const preserve = !!seeds?.some((s) => s != null)
  const layers = chords.map((c, i) => {
    const ranked = rankedCandidates(c)
    // Put I/V home-bass inversions first so ties lean that way
    const ordered = startSeeds(ranked, c, tonality)
    return injectSeedCandidate(ordered, seeds?.[i], c)
  })
  if (layers.some((L) => !L.length)) {
    const out: VoicingPitches[] = []
    let prev: VoicingPitches | null = null
    for (let i = 0; i < chords.length; i++) {
      const next = chords[i + 1] ?? null
      const v = sketchHearVoicing({ ...chords[i]!, prev, next })
      if (!v) continue
      out.push(v)
      prev = v
    }
    return out
  }

  const T = chords.length
  const scores: number[][] = new Array(T)
  const back: number[][] = new Array(T)

  scores[0] = layers[0]!.map((p) =>
    nodeScore(p, chords[0]!, chordForQuality(chords[0]!.quality), {
      tonality,
      index: 0,
      isStartSeed: true,
      preserveRegister: preserve,
    }) + seedStayBonus(p, seeds?.[0]),
  )
  back[0] = layers[0]!.map(() => -1)

  for (let i = 1; i < T; i++) {
    const layer = layers[i]!
    const prevLayer = layers[i - 1]!
    const chord = chordForQuality(chords[i]!.quality)
    scores[i] = new Array(layer.length).fill(Number.NEGATIVE_INFINITY)
    back[i] = new Array(layer.length).fill(-1)
    for (let j = 0; j < layer.length; j++) {
      const node =
        nodeScore(layer[j]!, chords[i]!, chord, {
          tonality,
          index: i,
          isStartSeed: false,
          preserveRegister: preserve,
        }) + seedStayBonus(layer[j]!, seeds?.[i])
      for (let k = 0; k < prevLayer.length; k++) {
        const total = scores[i - 1]![k]! + pathLinkScore(prevLayer[k]!, layer[j]!) + node
        if (total > scores[i]![j]!) {
          scores[i]![j] = total
          back[i]![j] = k
        }
      }
    }
  }

  const last = scores[T - 1]!
  let endJ = 0
  for (let j = 1; j < last.length; j++) {
    if (last[j]! > last[endJ]!) endJ = j
  }
  const path: VoicingPitches[] = new Array(T)
  let j = endJ
  for (let i = T - 1; i >= 0; i--) {
    path[i] = layers[i]![j]!
    if (i === 0) break
    j = back[i]![j]!
  }
  return path.map((p, i) => lockVoicingLeadToMelody(p, chords[i]!))
}

function contextBonus(
  pitches: VoicingPitches,
  prev: VoicingPitches | null | undefined,
  nextCands: readonly VoicingPitches[] | null | undefined,
): number {
  let s = 0
  if (prev) s += linkScore(prev, pitches)
  if (nextCands?.length) {
    let best = Number.NEGATIVE_INFINITY
    for (const n of nextCands) {
      const L = linkScore(pitches, n)
      if (L > best) best = L
    }
    if (Number.isFinite(best)) s += best * 0.85 // slightly less weight than arriving from prev
  }
  return s
}

function fallbackMidis(opts: SketchHearChordRef): number[] {
  const chord = chordForQuality(opts.quality)
  const rootPc = ((opts.rootPc % 12) + 12) % 12
  const offs = [0, chord.offsets[3] ?? 4, chord.offsets[5] ?? 7]
  const seventh = chord.offsets[7]
  if (seventh != null && opts.quality !== 'ninth') offs.push(seventh)
  else if (opts.quality === 'ninth') {
    offs.length = 0
    offs.push(chord.offsets[5] ?? 7, chord.offsets[7] ?? 10, chord.offsets[9] ?? 2, chord.offsets[3] ?? 4)
  }
  let root = rootPc + 48
  while (root < SKETCH_HEAR_BASS_MIN) root += 12
  while (root > 55) root -= 12
  return offs.map((o) => root + o).sort((a, b) => a - b)
}

/**
 * Best TTBB preview voicing for a sketch chord, optionally context-aware.
 */
export function sketchHearVoicing(opts: SketchHearChordRef & {
  /** Previous sounding sketch voicing (mixer / Hear chain). */
  prev?: VoicingPitches | null
  /** Following chord — lookahead chooses an inversion that also connects forward. */
  next?: SketchHearChordRef | null
}): VoicingPitches | null {
  const chord = chordForQuality(opts.quality)
  const rootPc = ((opts.rootPc % 12) + 12) % 12
  const cands = enumerateSketchHearCandidates(opts)
  if (!cands.length) {
    const fb = fallbackMidis(opts)
    return fb.length === 4 ? midisToPitches(fb) : null
  }
  const nextCands = opts.next ? enumerateSketchHearCandidates(opts.next) : null
  let best: VoicingPitches | null = null
  let bestScore = Number.NEGATIVE_INFINITY
  for (const mid of cands) {
    const score =
      coverageScore(mid, chord, rootPc, opts.quality) +
      contextBonus(mid, opts.prev, nextCands)
    if (score > bestScore) {
      bestScore = score
      best = mid
    }
  }
  return best ? lockVoicingLeadToMelody(best, opts) : null
}

/**
 * Build a 4-note TTBB preview for a sketch chord (bass→tenor MIDI).
 * Chord-tone melody locks the lead MIDI; non-chord melody uses a synthetic
 * mid-range chord-tone lead (does not force the sung pitch into the stab).
 */
export function sketchHearMidis(opts: SketchHearChordRef & {
  prev?: VoicingPitches | null
  next?: SketchHearChordRef | null
}): number[] {
  const best = sketchHearVoicing(opts)
  if (best) return [best.bass, best.bari, best.lead, best.tenor]
  return fallbackMidis(opts)
}
