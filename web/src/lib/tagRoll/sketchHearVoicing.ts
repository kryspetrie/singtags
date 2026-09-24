/**
 * TTBB middle-range voicings for Declared/Detected/Sketch Hear (and mixer Sketch).
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
} from '../../domain/arranging/chords/chords'
import { ringTier } from '../../domain/arranging/contestProfile'
import {
  commonToneScore,
  contraryMotionScore,
  parallelPerfectPenalty,
  voiceLeadScore,
} from '../../domain/arranging/theoryScores'
import type { HarmonySketchQuality } from './types'

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
  /** Dom9: omit-root first (Prietto/BAM), then omit-5. */
  ninth: ['5793', '5397', '1793', '1379'],
  add9: ['1593', '1395'],
}

export type SketchHearChordRef = {
  rootPc: number
  quality: HarmonySketchQuality
  leadMidi?: number | null
}

function chordForQuality(quality: HarmonySketchQuality): BarbershopChordNature {
  return (
    BARBERSHOP_CHORDS.find((c) => c.id === quality) ??
    BARBERSHOP_CHORDS.find((c) => c.id === 'major')!
  )
}

function orderedVoicings(quality: HarmonySketchQuality): string[] {
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
  quality: HarmonySketchQuality,
): number {
  const pcs = uniquePcs([p.bass, p.bari, p.lead, p.tenor])
  const wanted = chordTonePcs(chord, rootPc)
  let score = 0
  for (const pc of pcs) {
    if (wanted.has(pc)) score += 3
  }
  // Dom9 / add9: require the 9, and exactly one of root/5 omitted for Dom9
  if (quality === 'ninth' || quality === 'add9') {
    const ninthPc = ((rootPc + 2) % 12 + 12) % 12
    if (pcs.includes(ninthPc)) score += 8
    else score -= 20
    if (quality === 'ninth') {
      const root = rootPc
      const fifth = ((rootPc + 7) % 12 + 12) % 12
      const hasRoot = pcs.includes(root)
      const hasFifth = pcs.includes(fifth)
      if (hasRoot && hasFifth) score -= 12 // five-note dump / no omit
      else if (hasRoot || hasFifth) score += 4
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

function midisToPitches(midis: readonly number[]): VoicingPitches {
  return {
    bass: midis[0]!,
    bari: midis[1]!,
    lead: midis[2]!,
    tenor: midis[3]!,
  }
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

  const tryPlace = (voicing: string, leadMidi: number) => {
    const placed = placeVoicing({
      chord,
      rootPc,
      leadMidi,
      voicing,
      spread: false,
    })
    if (!placed) return
    const mid = shiftToMidRange(placed)
    if (!pitchesLegal(mid)) return
    const key = `${mid.bass},${mid.bari},${mid.lead},${mid.tenor}`
    if (seen.has(key)) return
    seen.add(key)
    out.push(mid)
  }

  if (rawLead != null && fitting.length) {
    for (const v of fitting) tryPlace(v, rawLead)
  }
  for (const v of allVoicings) {
    const role = Number(v[2]) as ChordToneRole
    const synth = roleMidiNear(rootPc, chord, role, SKETCH_HEAR_DEFAULT_LEAD)
    tryPlace(v, synth)
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
  opts: { tonality: number; index: number; isStartSeed: boolean },
): number {
  const rootPc = ((ref.rootPc % 12) + 12) % 12
  let s = coverageScore(pitches, chord, rootPc, ref.quality)
  s += Math.max(0, 7 - ringTier(ref.quality)) * 2.25
  if (isIorV(rootPc, opts.tonality)) {
    const role = bassPcRole(pitches.bass, rootPc, chord)
    const homeBass = role === 1 || role === 5
    if (opts.index === 0) {
      // Multi-start: strongly prefer opening I/V in root or 2nd (bass 5).
      s += homeBass ? 12 : -4
      if (opts.isStartSeed && homeBass) s += 3
    } else if (homeBass) {
      s += 3.5
    }
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

/**
 * Global inversion path for a Detected / Sketch chord sequence.
 * Explores all legal inversions (preferring I/V openings with bass on 1 or 5),
 * then picks the path with best voice leading + ring + chord coverage.
 */
export function optimizeSketchHearPath(
  chords: readonly SketchHearChordRef[],
  opts?: { tonality?: number },
): VoicingPitches[] {
  if (!chords.length) return []
  const tonality = opts?.tonality ?? 0
  const layers = chords.map((c) => {
    const ranked = rankedCandidates(c)
    // Put I/V home-bass inversions first so ties lean that way
    return startSeeds(ranked, c, tonality)
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
    }),
  )
  back[0] = layers[0]!.map(() => -1)

  for (let i = 1; i < T; i++) {
    const layer = layers[i]!
    const prevLayer = layers[i - 1]!
    const chord = chordForQuality(chords[i]!.quality)
    scores[i] = new Array(layer.length).fill(Number.NEGATIVE_INFINITY)
    back[i] = new Array(layer.length).fill(-1)
    for (let j = 0; j < layer.length; j++) {
      const node = nodeScore(layer[j]!, chords[i]!, chord, {
        tonality,
        index: i,
        isStartSeed: false,
      })
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
  return path
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
  return best
}

/**
 * Build a 4-note TTBB preview for a sketch chord (bass→tenor MIDI).
 * When lead PC is not in the chord (loose Declared map), uses a synthetic mid-range
 * chord-tone lead so placeVoicing can pick a closed stack — does not force the melody MIDI.
 */
export function sketchHearMidis(opts: SketchHearChordRef & {
  prev?: VoicingPitches | null
  next?: SketchHearChordRef | null
}): number[] {
  const best = sketchHearVoicing(opts)
  if (best) return [best.bass, best.bari, best.lead, best.tenor]
  return fallbackMidis(opts)
}
