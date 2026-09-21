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
