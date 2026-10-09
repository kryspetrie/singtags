/**
 * Generate unscored voicing candidates for a melody note (PCF / SCF).
 * Ranking is a separate concern (CandidateRanker).
 */
import {
  BARBERSHOP_CHORDS,
  chordContainsLead,
  leadRoleInChord,
  placeVoicingConcert,
  TTBB_BASS_MIN,
  TTBB_BASS_PREF_MAX,
  TTBB_CLOSE_SPAN_MAX,
  ttbbPartsDistinct,
  VOICINGS_BY_CHORD,
  voicingFitsLead,
  type VoicingPitches,
} from '../chords'
import { classifyRootMotion, scoreRootMotion, isBs7Nature } from '../approachThree'
import { isNatureAllowed, DEFAULT_CONTEST_PROFILE, type ContestProfile } from '../contestProfile'
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
  /**
   * When false, skip secondary-dominant + SCF families.
   * Default true — full catalog for Coach / Risky.
   */
  allowPassing?: boolean
  /**
   * When false, skip SCF groups but still allow secondary V7/V9 of the pillar
   * when allowPassing. Default true when allowPassing.
   */
  allowScf?: boolean
  /**
   * When true, only emit secondary dominants of `nextPillarRoot` (not of the
   * current pillar). Basic uses this to keep II7→V / VI7→ii without V7-of-I flood.
   */
  secDomNextOnly?: boolean
  /** When false, emit closed voicings only (Basic / muddy-bass guard). Default true. */
  allowSpread?: boolean
  /** Optional hard allowlist of nature ids (Basic = major/minor/seventh/…). */
  natureAllowlist?: readonly string[] | null
  profile?: ContestProfile
  nextPillarRoot?: number | null
  prevMidi?: VoicingPitches | null
  /** Stack before prev — Ades post-leap direction. */
  prevPrevMidi?: VoicingPitches | null
  prevDominant?: { rootPc: number; natureId: string; midi: VoicingPitches } | null
}

export function generateCandidates(opts: GenerateCandidatesInput): UnscoredCandidate[] {
  const { note, pillar, tonality, prevRootPc } = opts
  const profile = opts.profile ?? DEFAULT_CONTEST_PROFILE
  const mode = opts.mode ?? 'major'
  const prevNatureId = opts.prevNatureId ?? null
  const allowPassing = opts.allowPassing !== false
  const allowScf = opts.allowScf !== false && allowPassing
  const allowSpread = opts.allowSpread !== false
  const allow = opts.natureAllowlist?.length
    ? new Set(opts.natureAllowlist)
    : null
  const out: UnscoredCandidate[] = []

  const pcfNatures = pcfNaturesForMode(mode).filter((n) => !allow || allow.has(n))
  pushFamily({
    out,
    note,
    rootPc: pillar.rootPc,
    pillarRoot: pillar.rootPc,
    natureIds: pcfNatures.length ? pcfNatures : ['major', 'seventh', 'minor'],
    layer: 'primary',
    scfGroup: null,
    tonality,
    mode,
    prevRootPc,
    prevNatureId,
    profile,
    nextPillarRoot: opts.nextPillarRoot ?? null,
    prevMidi: opts.prevMidi ?? null,
    prevPrevMidi: opts.prevPrevMidi ?? null,
    prevDominant: opts.prevDominant ?? null,
    allowSpread,
  })

  if (!allowPassing) return out

  // Secondary-dominant approaches into the next (or current) pillar.
  const secTargets = new Set<number>()
  if (opts.nextPillarRoot != null) secTargets.add(opts.nextPillarRoot)
  if (!opts.secDomNextOnly) secTargets.add(pillar.rootPc)
  for (const target of secTargets) {
    const secRoot = secondaryDominantRootOf(target)
    if (secRoot === pillar.rootPc) continue
    const secNatures = (['seventh', 'ninth'] as const).filter((n) => !allow || allow.has(n))
    if (!secNatures.length) continue
    pushFamily({
      out,
      note,
      rootPc: secRoot,
      pillarRoot: pillar.rootPc,
      natureIds: secNatures,
      layer: 'passing',
      scfGroup: 1,
      tonality,
      mode,
      prevRootPc,
      prevNatureId,
      profile,
      nextPillarRoot: opts.nextPillarRoot ?? null,
      prevMidi: opts.prevMidi ?? null,
      prevPrevMidi: opts.prevPrevMidi ?? null,
      prevDominant: opts.prevDominant ?? null,
      allowSpread,
    })
  }

  if (allowScf && (opts.preferScf || out.length < 3)) {
    for (const g of [1, 2, 3, 4, 5, 6] as ScfGroup[]) {
      for (const rootPc of scfRoots(pillar.rootPc, g)) {
        const natures = SCF_NATURES[g].filter((n) => !allow || allow.has(n))
        if (!natures.length) continue
        pushFamily({
          out,
          note,
          rootPc,
          pillarRoot: pillar.rootPc,
          natureIds: natures,
          layer: 'passing',
          scfGroup: g,
          tonality,
          mode,
          prevRootPc,
          prevNatureId,
          profile,
          nextPillarRoot: opts.nextPillarRoot ?? null,
          prevMidi: opts.prevMidi ?? null,
          prevPrevMidi: opts.prevPrevMidi ?? null,
          prevDominant: opts.prevDominant ?? null,
          allowSpread,
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
  prevPrevMidi: VoicingPitches | null
  prevDominant: { rootPc: number; natureId: string; midi: VoicingPitches } | null
  allowSpread: boolean
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
    prevPrevMidi,
    prevDominant,
    allowSpread,
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
      const spreads = allowSpread ? [false, true] : [false]
      for (const spread of spreads) {
        // Concert lead → placeVoicingConcert (written-space place + octave fix).
        const midi = placeVoicingConcert({
          chord,
          rootPc,
          leadMidi: note.midi,
          voicing,
          spread,
        })
        if (!midi) continue
        // No unisons — octave doubles OK, shared MIDI between parts is not.
        if (!ttbbPartsDistinct(midi)) continue
        // Hard reject muddy bass — clamp should have lifted; if not, skip.
        if (midi.bass < TTBB_BASS_MIN) continue
        // Basic (!allowSpread): keep near-home outer span. Triads with a legal
        // root double under Lead-on-3 need ~24 (C3–C5); tetrads cap tighter.
        const spanCap =
          natureId === 'major' || natureId === 'minor'
            ? Math.max(TTBB_CLOSE_SPAN_MAX, 24)
            : TTBB_CLOSE_SPAN_MAX
        if (!allowSpread && midi.tenor - midi.bass > spanCap) continue

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

        const pushMidi = (m: VoicingPitches, suffix: string) => {
          out.push({
            rootPc,
            natureId,
            voicing,
            spread,
            layer,
            scfGroup,
            midi: m,
            ruleTags,
            label: `${natureId}@${rootPc}${spread ? ' spread' : ''}${scfGroup ? ` G${scfGroup}` : ''}${suffix}`,
            motionScore,
            towardPillar: rootPc === pillarRoot,
            nextPillarRoot,
            prevMidi,
            prevPrevMidi,
            prevRootPc,
            prevNatureId,
            prevDominant,
          })
        }
        pushMidi(midi, '')

        // Also offer a mid-register settle when the close shell parked bass high.
        // Path Optimize needs D3-under-G4 V7 (span ~21) to leap from low I major;
        // ranker still prefers the tight high shell when leaps allow.
        if (!spread && midi.bass > TTBB_BASS_PREF_MAX) {
          const low: VoicingPitches = {
            bass: midi.bass - 12,
            bari: midi.bari - 12,
            lead: midi.lead,
            tenor: midi.tenor,
          }
          if (
            low.bass >= TTBB_BASS_MIN &&
            low.bari < low.lead &&
            low.bari > low.bass &&
            low.tenor - low.bass <= TTBB_CLOSE_SPAN_MAX &&
            ttbbPartsDistinct(low)
          ) {
            pushMidi(low, ' mid')
          }
        }
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
