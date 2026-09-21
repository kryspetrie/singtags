/**
 * Generate unscored voicing candidates for a melody note (PCF / SCF).
 * Ranking is a separate concern (CandidateRanker).
 */
import {
  BARBERSHOP_CHORDS,
  chordContainsLead,
  leadRoleInChord,
  placeVoicing,
  VOICINGS_BY_CHORD,
  voicingFitsLead,
  type VoicingPitches,
} from '../chords'
import { classifyRootMotion, scoreRootMotion, isBs7Nature } from '../approachThree'
import { isNatureAllowed, type ContestProfile } from '../contestProfile'
import { leadAllowsCounterpartSwap } from '../counterpart'
import { secondaryDominantRootOf } from '../secondaryDominant'
import { PCF_NATURE_PRIORITY, SCF_NATURES, scfRoots, type ScfGroup } from '../scf'
import type { MelodyEvent, Pillar, RuleTag, TonalityMode } from '../types'
import type { UnscoredCandidate } from './types'

export type GenerateCandidatesInput = {
  note: MelodyEvent
  pillar: Pillar
  tonality: number
  mode?: TonalityMode
  prevRootPc: number | null
  /** Nature of the previous stack (for R2/R3/R5 unlock — must be the *from* chord). */
  prevNatureId?: string | null
  preferScf?: boolean
  profile?: ContestProfile
  nextPillarRoot?: number | null
  prevMidi?: VoicingPitches | null
  prevDominant?: { rootPc: number; natureId: string; midi: VoicingPitches } | null
}

export function generateCandidates(opts: GenerateCandidatesInput): UnscoredCandidate[] {
  const { note, pillar, tonality, prevRootPc } = opts
  const profile = opts.profile ?? 'sai11'
  const mode = opts.mode ?? 'major'
  const prevNatureId = opts.prevNatureId ?? null
  const out: UnscoredCandidate[] = []

  pushFamily({
    out,
    note,
    rootPc: pillar.rootPc,
    pillarRoot: pillar.rootPc,
    natureIds: pcfNaturesForMode(mode),
    layer: 'primary',
    scfGroup: null,
    tonality,
    mode,
    prevRootPc,
    prevNatureId,
    profile,
    nextPillarRoot: opts.nextPillarRoot ?? null,
    prevMidi: opts.prevMidi ?? null,
    prevDominant: opts.prevDominant ?? null,
  })

  // Secondary-dominant approaches into the next (or current) pillar
  const secTargets = new Set<number>()
  if (opts.nextPillarRoot != null) secTargets.add(opts.nextPillarRoot)
  secTargets.add(pillar.rootPc)
  for (const target of secTargets) {
    const secRoot = secondaryDominantRootOf(target)
    if (secRoot === pillar.rootPc) continue
    pushFamily({
      out,
      note,
      rootPc: secRoot,
      pillarRoot: pillar.rootPc,
      natureIds: ['seventh', 'ninth'],
      layer: 'passing',
      scfGroup: 1,
      tonality,
      mode,
      prevRootPc,
      prevNatureId,
      profile,
      nextPillarRoot: opts.nextPillarRoot ?? null,
      prevMidi: opts.prevMidi ?? null,
      prevDominant: opts.prevDominant ?? null,
    })
  }

  if (opts.preferScf || out.length < 3) {
    for (const g of [1, 2, 3, 4, 5, 6] as ScfGroup[]) {
      for (const rootPc of scfRoots(pillar.rootPc, g)) {
        pushFamily({
          out,
          note,
          rootPc,
          pillarRoot: pillar.rootPc,
          natureIds: SCF_NATURES[g],
          layer: 'passing',
          scfGroup: g,
          tonality,
          mode,
          prevRootPc,
          prevNatureId,
          profile,
          nextPillarRoot: opts.nextPillarRoot ?? null,
          prevMidi: opts.prevMidi ?? null,
          prevDominant: opts.prevDominant ?? null,
        })
      }
    }
  }

  return out
}

function pcfNaturesForMode(mode: TonalityMode): readonly string[] {
  if (mode === 'minor') {
    return ['minor', 'm7', 'seventh', 'major', 'ninth', 'sixth', 'half-dim', 'add9', 'aug', 'maj7', 'dim']
  }
  return PCF_NATURE_PRIORITY
}

function pushFamily(opts: {
  out: UnscoredCandidate[]
  note: MelodyEvent
  rootPc: number
  pillarRoot: number
  natureIds: readonly string[]
  layer: 'primary' | 'passing'
  scfGroup: number | null
  tonality: number
  mode: TonalityMode
  prevRootPc: number | null
  prevNatureId: string | null
  profile: ContestProfile
  nextPillarRoot: number | null
  prevMidi: VoicingPitches | null
  prevDominant: { rootPc: number; natureId: string; midi: VoicingPitches } | null
}): void {
  const {
    out,
    note,
    rootPc,
    pillarRoot,
    natureIds,
    layer,
    scfGroup,
    tonality,
    mode,
    prevRootPc,
    prevNatureId,
    profile,
    nextPillarRoot,
    prevMidi,
    prevDominant,
  } = opts
  for (const natureId of natureIds) {
    if (!isNatureAllowed(profile, natureId)) continue
    const chord = BARBERSHOP_CHORDS.find((c) => c.id === natureId)
    if (!chord) continue
    if (!chordContainsLead(chord, rootPc, note.midi)) continue
    const leadRole = leadRoleInChord(chord, rootPc, note.midi)
    if (leadRole == null) continue
    const voicings = VOICINGS_BY_CHORD[natureId] ?? []
    for (const voicing of voicings) {
      if (!voicingFitsLead(voicing, leadRole)) continue
      for (const spread of [false, true]) {
        const midi = placeVoicing({
          chord,
          rootPc,
          leadMidi: note.midi,
          voicing,
          spread,
        })
        if (!midi) continue
        if (!(midi.tenor > midi.lead && midi.bass <= Math.min(midi.bari, midi.lead))) continue

        // R2/R3/R5 unlock from the *previous* BS7/9, never from the candidate nature.
        const fromIsSeventh = prevNatureId != null && isBs7Nature(prevNatureId)
        const motion =
          prevRootPc == null
            ? 'springboard'
            : classifyRootMotion({
                fromRoot: prevRootPc,
                toRoot: rootPc,
                tonality,
                fromIsSeventh,
                mode,
              })
        const ruleTags = motionToTags(motion)

        // SCF Group 5: only tag R3 when melody legally allows counterpart swap
        if (
          scfGroup === 5 &&
          (natureId === 'seventh' || natureId === 'ninth') &&
          leadAllowsCounterpartSwap({
            originalRoot: pillarRoot,
            leadMidi: note.midi,
          })
        ) {
          if (!ruleTags.includes('R3_tritone')) ruleTags.push('R3_tritone')
        } else if (
          scfGroup === 5 &&
          (natureId === 'seventh' || natureId === 'ninth') &&
          !leadAllowsCounterpartSwap({
            originalRoot: pillarRoot,
            leadMidi: note.midi,
          })
        ) {
          // Soft-rank: still emit without R3 tag when melody gate fails (coach, not hard ban)
        }

        const motionScore = scoreRootMotion(motion, rootPc === pillarRoot, {
          targetIsSeventh: isBs7Nature(natureId),
        })

        out.push({
          rootPc,
          natureId,
          voicing,
          spread,
          layer,
          scfGroup,
          midi,
          ruleTags,
          label: `${natureId}@${rootPc}${spread ? ' spread' : ''}${scfGroup ? ` G${scfGroup}` : ''}`,
          motionScore,
          towardPillar: rootPc === pillarRoot,
          nextPillarRoot,
          prevMidi,
          prevRootPc,
          prevDominant,
        })
      }
    }
  }
}

function motionToTags(motion: string): RuleTag[] {
  switch (motion) {
    case 'p5_down':
    case 'p5_up_cadential':
      return ['R1_p5']
    case 'p5_up_retro':
      return ['R1_retro']
    case 'chromatic':
      return ['R2_chromatic']
    case 'tritone':
      return ['R3_tritone']
    case 'm3_up':
      return ['R5_m3up']
    case 'springboard':
      return ['springboard']
    default:
      return []
  }
}
