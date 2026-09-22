/**
 * Incomplete-chord completion and repair-after-remove.
 * @see docs/theory-teaching-integration-plan.md C1–C6
 */
import {
  BARBERSHOP_CHORDS,
  chordContainsLead,
  leadRoleInChord,
  placeVoicing,
  VOICINGS_BY_CHORD,
  voicingFitsLead,
  type ChordToneRole,
  type VoicingPitches,
} from './chords'
import { isNatureAllowed, ringTier, type ContestProfile } from './contestProfile'
import { romanForChord } from './secondaryDominant'
import { theoryRankBonuses } from './theoryScores'
import { isDominantNature } from './tensionRelease'
import type { TonalityMode } from './types'
import type { ChordSuggestion, TheoryFactor } from './chordSuggestion'

export type CompletionRequest = {
  presentMidi: number[]
  leadMidi?: number
  lockedParts?: Partial<VoicingPitches>
  removedParts?: ('tenor' | 'lead' | 'bari' | 'bass')[]
  tonality: number
  mode?: TonalityMode
  profile: ContestProfile
  pillarRoot?: number
  nextPillarRoot?: number | null
  prevMidi?: VoicingPitches | null
  prevDominant?: { rootPc: number; natureId: string; midi: VoicingPitches } | null
  limit?: number
}

export type InferredNature = {
  natureId: string
  rootPc: number
  confidence: number
  missingRoles: ChordToneRole[]
  reason: string
}

export type CompletionResult = {
  inferredNatures: InferredNature[]
  suggestions: ChordSuggestion[]
}

function pc(m: number): number {
  return ((m % 12) + 12) % 12
}

function uniquePcs(midis: readonly number[]): number[] {
  return [...new Set(midis.map(pc))]
}

function chordTonePcs(rootPc: number, natureId: string): number[] {
  const chord = BARBERSHOP_CHORDS.find((c) => c.id === natureId)
  if (!chord) return []
  return Object.values(chord.offsets)
    .filter((o): o is number => o != null)
    .map((o) => pc(rootPc + o))
}

function rolesPresent(rootPc: number, natureId: string, pcs: number[]): ChordToneRole[] {
  const chord = BARBERSHOP_CHORDS.find((c) => c.id === natureId)
  if (!chord) return []
  const out: ChordToneRole[] = []
  for (const [role, off] of Object.entries(chord.offsets)) {
    if (off == null) continue
    if (pcs.includes(pc(rootPc + off))) out.push(Number(role) as ChordToneRole)
  }
  return out
}

function missingStructural(
  rootPc: number,
  natureId: string,
  pcs: number[],
): ChordToneRole[] {
  const present = new Set(rolesPresent(rootPc, natureId, pcs))
  const need: ChordToneRole[] = [1, 3]
  if (isDominantNature(natureId) || natureId === 'm7' || natureId === 'maj7') need.push(7)
  return need.filter((r) => !present.has(r))
}

function candidateRoots(present: number[], tonality: number, pillarRoot?: number): number[] {
  const roots = new Set<number>()
  for (const p of present) roots.add(p)
  for (const deg of [0, 5, 7, 2, 9, 4, 11, 1, 3, 6, 8, 10]) {
    roots.add(pc(tonality + deg))
  }
  if (pillarRoot != null) {
    roots.add(pillarRoot)
    roots.add(pc(pillarRoot + 7))
    roots.add(pc(pillarRoot + 6))
  }
  return [...roots]
}

function structuralScore(natureId: string, missing: ChordToneRole[]): number {
  let s = 1 - missing.length * 0.25
  if (missing.includes(3)) s -= 0.2
  if (isDominantNature(natureId) && missing.includes(7)) s -= 0.25
  if (missing.includes(1)) s -= 0.15
  return Math.max(0, s)
}

/** Infer natures whose chord tones contain all present PCs. */
export function inferNaturesFromPcs(opts: {
  presentMidi: number[]
  profile: ContestProfile
  tonality: number
  pillarRoot?: number
}): InferredNature[] {
  const pcs = uniquePcs(opts.presentMidi)
  if (!pcs.length) return []
  const out: InferredNature[] = []
  for (const nature of BARBERSHOP_CHORDS) {
    if (!isNatureAllowed(opts.profile, nature.id)) continue
    for (const rootPc of candidateRoots(pcs, opts.tonality, opts.pillarRoot)) {
      const tones = chordTonePcs(rootPc, nature.id)
      if (!pcs.every((p) => tones.includes(p))) continue
      const missing = missingStructural(rootPc, nature.id, pcs)
      const conf =
        structuralScore(nature.id, missing) *
        (0.5 + 0.5 * (pcs.length / Math.max(1, tones.length))) *
        (Math.max(0, 7 - ringTier(nature.id)) / 7)
      out.push({
        natureId: nature.id,
        rootPc,
        confidence: conf,
        missingRoles: missing,
        reason:
          missing.length === 0
            ? 'Present pitches already complete this nature'
            : `Missing roles: ${missing.join(',')}`,
      })
    }
  }
  out.sort((a, b) => b.confidence - a.confidence)
  // Dedupe same nature+root
  const seen = new Set<string>()
  return out.filter((x) => {
    const k = `${x.natureId}@${x.rootPc}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

function roleOfPc(
  rootPc: number,
  natureId: string,
  midi: number,
): ChordToneRole | null {
  const chord = BARBERSHOP_CHORDS.find((c) => c.id === natureId)
  if (!chord) return null
  const p = pc(midi)
  for (const [role, off] of Object.entries(chord.offsets)) {
    if (off != null && pc(rootPc + off) === p) return Number(role) as ChordToneRole
  }
  return null
}

/** Best-effort voicing string bass→tenor from sounding MIDI. */
export function voicingStringFromMidi(
  midi: Partial<VoicingPitches> & { lead: number },
  rootPc: number,
  natureId: string,
): string {
  if (midi.bass == null || midi.bari == null || midi.tenor == null) return ''
  const roles = [midi.bass, midi.bari, midi.lead, midi.tenor].map((m) =>
    roleOfPc(rootPc, natureId, m),
  )
  if (roles.some((r) => r == null)) return ''
  return roles.join('')
}

/**
 * Identify a library nature (+ root / voicing) from sounding TTBB MIDI.
 * Prefers an exact (or octave-tolerant) match against the voicing catalogue so
 * omit-root / incomplete spellings still resolve to the intended library chord.
 */
export function identifyNatureFromMidi(opts: {
  midi: Partial<VoicingPitches> & { lead: number }
  profile: ContestProfile
  tonality: number
}): { natureId: string; rootPc: number; voicing: string; confidence: number } | null {
  const lead = opts.midi.lead
  const presentMidi = [opts.midi.tenor, opts.midi.lead, opts.midi.bari, opts.midi.bass].filter(
    (m): m is number => m != null,
  )
  const presentPcs = uniquePcs(presentMidi)
  const bassPc = opts.midi.bass != null ? pc(opts.midi.bass) : null
  let best: {
    natureId: string
    rootPc: number
    voicing: string
    score: number
    tie: number
  } | null = null

  for (const nature of BARBERSHOP_CHORDS) {
    if (!isNatureAllowed(opts.profile, nature.id)) continue
    const voicings = VOICINGS_BY_CHORD[nature.id] ?? []
    for (let rootPc = 0; rootPc < 12; rootPc++) {
      const lr = leadRoleInChord(nature, rootPc, lead)
      if (lr == null) continue
      for (const voicing of voicings) {
        if (!voicingFitsLead(voicing, lr)) continue
        for (const spread of [false, true]) {
          const placed = placeVoicing({
            chord: nature,
            rootPc,
            leadMidi: lead,
            voicing,
            spread,
          })
          if (!placed) continue
          const score = voicingMatchScore(placed, opts.midi)
          if (score <= 0) continue
          const tie = catalogueTieBreak(nature.id, rootPc, presentPcs, bassPc)
          if (
            !best ||
            score > best.score ||
            (score === best.score && tie > best.tie)
          ) {
            best = { natureId: nature.id, rootPc, voicing, score, tie }
          }
        }
      }
    }
  }

  const partsPresent = (['bass', 'bari', 'lead', 'tenor'] as const).filter(
    (k) => opts.midi[k] != null,
  ).length

  // Full TTBB catalogue hits only — partial stacks are too ambiguous across natures.
  if (best && best.score >= 3.5 && partsPresent >= 4) {
    // Classic dual: omit-root Dom9 ≡ complete bass-rooted m6 (F+Ab+C+D = Fm6 / Bb9).
    if (
      bassPc != null &&
      best.rootPc !== bassPc &&
      (best.natureId === 'ninth' || best.natureId === 'seventh') &&
      !presentPcs.includes(best.rootPc)
    ) {
      const dual = inferNaturesFromPcs({
        presentMidi,
        profile: opts.profile,
        tonality: opts.tonality,
        pillarRoot: bassPc,
      }).find(
        (x) =>
          (x.natureId === 'madd6' || x.natureId === 'sixth') &&
          x.rootPc === bassPc &&
          x.missingRoles.length === 0,
      )
      if (dual) {
        return {
          natureId: dual.natureId,
          rootPc: dual.rootPc,
          voicing: voicingStringFromMidi(opts.midi, dual.rootPc, dual.natureId),
          confidence: Math.max(dual.confidence, 0.75),
        }
      }
    }
    return {
      natureId: best.natureId,
      rootPc: best.rootPc,
      voicing: best.voicing,
      confidence: Math.min(1, best.score / 4),
    }
  }

  // Fallback: PC-subset inference (incomplete / non-catalogue voicings).
  const inferred = inferNaturesFromPcs({
    presentMidi,
    profile: opts.profile,
    tonality: opts.tonality,
    pillarRoot: bassPc ?? undefined,
  })
  if (!inferred.length) return null
  const ranked = [...inferred].sort((a, b) => {
    // Prefer natures that explain extensions actually present (7/6/9) — stops
    // “Dm add6” winning over G7 when the sounding set is {B,D,F}.
    const aExt = extensionPresenceBonus(a.natureId, a.rootPc, presentPcs)
    const bExt = extensionPresenceBonus(b.natureId, b.rootPc, presentPcs)
    if (bExt !== aExt) return bExt - aExt
    const aRing = ringTier(a.natureId)
    const bRing = ringTier(b.natureId)
    if (aRing !== bRing) return aRing - bRing
    const aComplete = a.missingRoles.length === 0 ? 1 : 0
    const bComplete = b.missingRoles.length === 0 ? 1 : 0
    if (bComplete !== aComplete) return bComplete - aComplete
    // Omit-root dominants are common; don't lose to bass=root of a weaker nature.
    const aOmitRoot =
      isDominantNature(a.natureId) && a.missingRoles.length === 1 && a.missingRoles[0] === 1
        ? 1
        : 0
    const bOmitRoot =
      isDominantNature(b.natureId) && b.missingRoles.length === 1 && b.missingRoles[0] === 1
        ? 1
        : 0
    if (bOmitRoot !== aOmitRoot) return bOmitRoot - aOmitRoot
    if (bassPc != null) {
      const aBass = a.rootPc === bassPc ? 1 : 0
      const bBass = b.rootPc === bassPc ? 1 : 0
      if (bBass !== aBass) return bBass - aBass
    }
    return b.confidence - a.confidence
  })
  const top = ranked[0]!
  return {
    natureId: top.natureId,
    rootPc: top.rootPc,
    voicing: voicingStringFromMidi(opts.midi, top.rootPc, top.natureId),
    confidence: top.confidence,
  }
}

/** Higher = better when voicing-match scores tie (partial stacks). */
function catalogueTieBreak(
  natureId: string,
  rootPc: number,
  presentPcs: number[],
  bassPc: number | null,
): number {
  let t = extensionPresenceBonus(natureId, rootPc, presentPcs) * 10
  // Omit-root Dom9 (etc.) shares PCs with a bass-rooted m6/6 — prefer the bass root.
  if (!presentPcs.includes(pc(rootPc))) t -= 12
  if (bassPc != null && bassPc === rootPc) t += 15
  t += Math.max(0, 7 - ringTier(natureId))
  return t
}

function extensionPresenceBonus(natureId: string, rootPc: number, presentPcs: number[]): number {
  const chord = BARBERSHOP_CHORDS.find((c) => c.id === natureId)
  if (!chord) return 0
  let n = 0
  for (const role of [6, 7, 9] as const) {
    const off = chord.offsets[role]
    if (off != null && presentPcs.includes(pc(rootPc + off))) n += 1
  }
  return n
}

function voicingMatchScore(
  placed: VoicingPitches,
  got: Partial<VoicingPitches>,
): number {
  let score = 0
  let compared = 0
  for (const k of ['bass', 'bari', 'lead', 'tenor'] as const) {
    if (got[k] == null) continue
    compared++
    if (got[k] === placed[k]) score += 1
    else if (pc(got[k]!) === pc(placed[k])) score += 0.5
    else return -1
  }
  return compared > 0 ? score : -1
}

function assignLocked(
  midi: VoicingPitches,
  locked?: Partial<VoicingPitches>,
): boolean {
  if (!locked) return true
  for (const k of ['bass', 'bari', 'lead', 'tenor'] as const) {
    if (locked[k] != null && midi[k] !== locked[k]) {
      // Allow octave equivalents for non-lead if same PC? Prefer exact for lead.
      if (k === 'lead') return false
      if (pc(midi[k]) !== pc(locked[k]!)) return false
    }
  }
  return true
}

function containsPresentPitches(midi: VoicingPitches, present: number[]): boolean {
  const stackPcs = new Set(
    [midi.bass, midi.bari, midi.lead, midi.tenor].map(pc),
  )
  return uniquePcs(present).every((p) => stackPcs.has(p))
}

function whyForCompletion(
  inf: InferredNature,
  factors: TheoryFactor[],
  roman: string,
): string {
  if (inf.missingRoles.length === 0) {
    return `${roman}: present tones already spell this chord.`
  }
  const adds = inf.missingRoles
    .map((r) => (r === 3 ? '3rd' : r === 7 ? '7th' : r === 1 ? 'root' : `role ${r}`))
    .join(' + ')
  const top = factors[0]
  return `Complete as ${roman} by adding ${adds}${top ? ` (${top.label})` : ''}.`
}

/**
 * Complete a partial chord (1–3 known pitches) into ranked TTBB suggestions.
 */
export function completePartialChord(req: CompletionRequest): CompletionResult {
  const leadMidi = req.leadMidi ?? req.lockedParts?.lead ?? req.presentMidi[0]
  if (leadMidi == null) {
    return { inferredNatures: [], suggestions: [] }
  }
  const present = [...req.presentMidi]
  if (!present.some((m) => pc(m) === pc(leadMidi))) present.push(leadMidi)

  const inferred = inferNaturesFromPcs({
    presentMidi: present,
    profile: req.profile,
    tonality: req.tonality,
    pillarRoot: req.pillarRoot,
  })

  const suggestions: ChordSuggestion[] = []
  const limit = req.limit ?? 12
  const mode = req.mode ?? 'major'

  for (const inf of inferred.slice(0, 24)) {
    const chord = BARBERSHOP_CHORDS.find((c) => c.id === inf.natureId)
    if (!chord) continue
    if (!chordContainsLead(chord, inf.rootPc, leadMidi)) continue
    const leadRole = leadRoleInChord(chord, inf.rootPc, leadMidi)
    if (leadRole == null) continue
    const voicings = VOICINGS_BY_CHORD[inf.natureId] ?? []
    for (const voicing of voicings) {
      if (!voicingFitsLead(voicing, leadRole)) continue
      for (const spread of [false, true]) {
        const midi = placeVoicing({
          chord,
          rootPc: inf.rootPc,
          leadMidi,
          voicing,
          spread,
        })
        if (!midi) continue
        if (!(midi.tenor > midi.lead && midi.bass <= Math.min(midi.bari, midi.lead))) continue
        if (!containsPresentPitches(midi, present)) continue
        if (!assignLocked(midi, { ...req.lockedParts, lead: leadMidi })) continue

        const bonuses = theoryRankBonuses({
          midi,
          prevMidi: req.prevMidi,
          natureId: inf.natureId,
          rootPc: inf.rootPc,
          layer: 'primary',
          nextPillarRoot: req.nextPillarRoot ?? null,
          towardPillar: req.pillarRoot != null && inf.rootPc === req.pillarRoot,
          prevDominant: req.prevDominant ?? null,
        })
        const completeness = structuralScore(inf.natureId, inf.missingRoles)
        const score =
          inf.confidence * 8 +
          completeness * 4 +
          bonuses.spacing * 2 +
          bonuses.tensionRelease * 2 +
          bonuses.resolution * 1.5 +
          bonuses.contrary +
          bonuses.commonTone -
          bonuses.parallelPenalty * 2 +
          (isDominantNature(inf.natureId) ? 1.5 : 0) -
          (spread ? 0.3 : 0)

        const roman = romanForChord({
          rootPc: inf.rootPc,
          natureId: inf.natureId,
          tonality: req.tonality,
          mode,
          resolvesToRoot: req.nextPillarRoot ?? null,
        })
        const factors: TheoryFactor[] = [
          {
            id: 'completion',
            label: 'chord completion',
            value: completeness,
            teachingId: 'incomplete_chord',
          },
          {
            id: 'spacing',
            label: 'series spacing',
            value: bonuses.spacing,
            teachingId: 'harmonic_series_spacing',
          },
          {
            id: 'tensionRelease',
            label: 'tension/release',
            value: bonuses.tensionRelease,
            teachingId: 'tension_release',
          },
        ].filter((f) => f.value > 0)

        suggestions.push({
          rootPc: inf.rootPc,
          natureId: inf.natureId,
          voicing,
          spread,
          midi,
          score,
          roman,
          functionTag: isDominantNature(inf.natureId) ? 'tension' : 'release',
          factors,
          why: whyForCompletion(inf, factors, roman),
        })
      }
    }
  }

  suggestions.sort((a, b) => b.score - a.score)
  // Dedupe identical midi stacks
  const seen = new Set<string>()
  const deduped = suggestions.filter((s) => {
    const k = `${s.midi.bass},${s.midi.bari},${s.midi.lead},${s.midi.tenor},${s.natureId}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })

  return {
    inferredNatures: inferred.slice(0, 16),
    suggestions: deduped.slice(0, limit),
  }
}

/**
 * Repair a stack after removing one or two parts — lead stays locked when present.
 */
export function repairStackAfterRemovingParts(opts: {
  midi: VoicingPitches
  natureId: string
  rootPc: number
  remove: ('tenor' | 'lead' | 'bari' | 'bass')[]
  profile: ContestProfile
  tonality: number
  mode?: TonalityMode
  pillarRoot?: number
  nextPillarRoot?: number | null
  prevMidi?: VoicingPitches | null
  limit?: number
}): CompletionResult {
  const remove = new Set(opts.remove)
  if (remove.has('lead')) {
    // Lead-locked repair: refuse to move melody — treat as unknown lead only if forced
  }
  const present: number[] = []
  const locked: Partial<VoicingPitches> = {}
  for (const part of ['bass', 'bari', 'lead', 'tenor'] as const) {
    if (remove.has(part)) continue
    present.push(opts.midi[part])
    locked[part] = opts.midi[part]
  }
  return completePartialChord({
    presentMidi: present,
    leadMidi: remove.has('lead') ? undefined : opts.midi.lead,
    lockedParts: locked,
    removedParts: opts.remove,
    tonality: opts.tonality,
    mode: opts.mode,
    profile: opts.profile,
    pillarRoot: opts.pillarRoot,
    nextPillarRoot: opts.nextPillarRoot,
    prevMidi: opts.prevMidi,
    limit: opts.limit ?? 12,
  })
}
