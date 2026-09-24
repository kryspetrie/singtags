/**
 * Next-chord autocomplete: generate + theory-aware rank + teaching chips.
 */
import { generateCandidates } from './candidateGenerator'
import { rankCandidates, type RankerDeps } from './candidateRanker'
import { romanForChord } from '../secondaryDominant'
import { functionTagForStack } from '../tensionRelease'
import { listSubstitutionBranches } from '../substitutions'
import { leadAllowsCounterpartSwap, counterpartRoot } from '../counterpart'
import { isDominantOf, secondaryDominantRootOf } from '../secondaryDominant'
import { theoryRankBonuses } from '../theoryScores'
import { scoreCadenceFit } from '../cadences'
import type { ChordSuggestion, TheoryFactor } from '../chordSuggestion'
import type { ContestProfile } from '../contestProfile'
import { DEFAULT_CONTEST_PROFILE } from '../contestProfile'
import type { MelodyEvent, Pillar, TonalityMode } from '../types'
import type { VoicingPitches } from '../chords'
import type { HarmonizeCandidate } from './types'

export type AutocompleteInput = {
  note: MelodyEvent
  pillar: Pillar
  tonality: number
  mode?: TonalityMode
  profile?: ContestProfile
  prevRootPc: number | null
  prevNatureId?: string | null
  prevMidi?: VoicingPitches | null
  prevDominant?: { rootPc: number; natureId: string; midi: VoicingPitches } | null
  nextPillarRoot?: number | null
  preferScf?: boolean
  limit?: number
  rankerDeps?: RankerDeps
  /** When true, boost sevenths if arrangement BS7 density is low. */
  preferSevenths?: boolean
  nextMelodyMidi?: number | null
  prevMelodyMidi?: number | null
}

function chipFor(
  c: HarmonizeCandidate,
  pillarRoot: number,
  nextPillarRoot: number | null,
  leadMidi: number,
): string | undefined {
  if (
    nextPillarRoot != null &&
    (c.natureId === 'seventh' || c.natureId === 'ninth') &&
    isDominantOf(c.rootPc, nextPillarRoot)
  ) {
    return 'secondary_dom'
  }
  if (
    (c.natureId === 'seventh' || c.natureId === 'ninth') &&
    c.rootPc === counterpartRoot(pillarRoot) &&
    leadAllowsCounterpartSwap({ originalRoot: pillarRoot, leadMidi })
  ) {
    return 'counterpart'
  }
  if (c.scfGroup != null && c.scfGroup > 0) return `scf_g${c.scfGroup}`
  if (c.rootPc === pillarRoot && c.layer === 'primary') return 'pillar_pcf'
  return undefined
}

function whySentence(
  _c: HarmonizeCandidate,
  roman: string,
  tag: string,
  factors: TheoryFactor[],
): string {
  const top = [...factors].sort((a, b) => Math.abs(b.value) - Math.abs(a.value))[0]
  if (tag === 'tension' && top?.id === 'secondaryDominant') {
    return `${roman} — secondary-dominant tension driving toward the next pillar.`
  }
  if (tag === 'tension') {
    return `${roman} — dominant tension; resolve 3↑ / ♭7↓ into the release chord.`
  }
  if (tag === 'release') {
    return `${roman} — resting / release color under the lead.`
  }
  if (top?.id === 'cadenceFit' || top?.teachingId === 'classic_cadences') {
    return `${roman} — classic cadence fit (${top.label}).`
  }
  if (top?.teachingId === 'tension_release') {
    return `${roman} — ranked for tension/release into the harmonic highway.`
  }
  if (top) return `${roman} — favored for ${top.label}.`
  return `${roman} fits the lead and contest vocabulary.`
}

export function autocompleteNextChord(input: AutocompleteInput): ChordSuggestion[] {
  const profile = input.profile ?? DEFAULT_CONTEST_PROFILE
  const mode = input.mode ?? 'major'
  const nextPillarRoot = input.nextPillarRoot ?? null
  const generated = generateCandidates({
    note: input.note,
    pillar: input.pillar,
    tonality: input.tonality,
    mode,
    prevRootPc: input.prevRootPc,
    prevNatureId: input.prevNatureId ?? null,
    // SCF stays opt-in (SMN / wizard); default homes are PCF so Bonnie-style charts
    // do not surface ♭II / ♭VII / add9 as the top pick.
    preferScf: input.preferScf ?? false,
    profile,
    nextPillarRoot,
    prevMidi: input.prevMidi ?? null,
  })

  // Annotate with prevDominant for resolution scoring via ranker deps path:
  // we re-score with theory bonuses on top of rankCandidates.
  const cadenceContext = {
    tonality: input.tonality,
    mode,
    melodyMidi: input.note.midi,
    nextMelodyMidi: input.nextMelodyMidi ?? null,
    prevMelodyMidi: input.prevMelodyMidi ?? null,
    prevRootPc: input.prevRootPc,
    prevNatureId: input.prevNatureId ?? null,
    nextPillarRoot,
    pillarRoot: input.pillar.rootPc,
  }
  const ranked = rankCandidates(generated, {
    ...input.rankerDeps,
    cadenceContext: input.rankerDeps?.cadenceContext ?? cadenceContext,
  })

  const out: ChordSuggestion[] = []
  for (const c of ranked) {
    const towardPillar = c.rootPc === input.pillar.rootPc
    const bonuses = theoryRankBonuses({
      midi: c.midi,
      prevMidi: input.prevMidi,
      natureId: c.natureId,
      rootPc: c.rootPc,
      layer: c.layer,
      nextPillarRoot,
      towardPillar,
      prevDominant: input.prevDominant ?? null,
    })
    const cad = scoreCadenceFit(
      { rootPc: c.rootPc, natureId: c.natureId, layer: c.layer },
      cadenceContext,
      { includeColor: true, bias: input.rankerDeps?.cadenceBias },
    )
    let score = c.score
    score += bonuses.spacing * 1.5
    score += bonuses.contrary * 1.25
    score += bonuses.commonTone * 1.25
    score += bonuses.tensionRelease * 2
    score += bonuses.resolution * 2
    score += cad.boost
    score -= bonuses.parallelPenalty * 2
    // Density nudge only when the lead already carries dominant color (3/7),
    // never to force I7 / IV7 on a root-melody home.
    if (input.preferSevenths && (c.natureId === 'seventh' || c.natureId === 'ninth')) {
      const leadRole = Number(c.voicing[2])
      if (leadRole === 3 || leadRole === 7) score += 2
    }

    const roman = romanForChord({
      rootPc: c.rootPc,
      natureId: c.natureId,
      tonality: input.tonality,
      mode,
      resolvesToRoot: nextPillarRoot,
    })
    const functionTag = functionTagForStack(
      {
        id: 'tmp',
        startTick: input.note.startTick,
        durationTicks: input.note.durationTicks,
        rootPc: c.rootPc,
        natureId: c.natureId,
        voicing: c.voicing,
        spread: c.spread,
        layer: c.layer,
        scfGroup: c.scfGroup,
        pillarId: input.pillar.id,
        midi: c.midi,
        ruleTags: c.ruleTags,
      },
      { pillarRoot: input.pillar.rootPc, nextPillarRoot },
    )

    const isSecDom =
      nextPillarRoot != null &&
      c.natureId === 'seventh' &&
      isDominantOf(c.rootPc, nextPillarRoot)

    const factors: TheoryFactor[] = [
      { id: 'rank', label: 'base rank', value: c.score },
      {
        id: 'tensionRelease',
        label: 'tension/release',
        value: bonuses.tensionRelease * 2,
        teachingId: 'tension_release',
      },
      {
        id: 'resolution',
        label: 'resolution',
        value: bonuses.resolution * 2,
        teachingId: 'tension_release',
      },
      {
        id: 'cadenceFit',
        label: cad.hint?.label ?? 'cadence fit',
        value: cad.boost,
        teachingId: 'classic_cadences',
      },
      {
        id: 'spacing',
        label: 'series spacing',
        value: bonuses.spacing * 1.5,
        teachingId: 'harmonic_series_spacing',
      },
      {
        id: 'contrary',
        label: 'contrary motion',
        value: bonuses.contrary * 1.25,
        teachingId: 'contrary_motion',
      },
      {
        id: 'commonTone',
        label: 'common tone',
        value: bonuses.commonTone * 1.25,
        teachingId: 'common_tone',
      },
      {
        id: 'parallelPenalty',
        label: 'parallel penalty',
        value: -bonuses.parallelPenalty * 2,
        teachingId: 'parallel_5_8',
      },
    ]
    if (isSecDom) {
      factors.push({
        id: 'secondaryDominant',
        label: 'secondary dominant',
        value: 3,
        teachingId: 'secondary_dom',
      })
    }

    out.push({
      rootPc: c.rootPc,
      natureId: c.natureId,
      voicing: c.voicing,
      spread: c.spread,
      midi: c.midi,
      score,
      roman,
      functionTag,
      factors: factors.filter((f) => f.value !== 0),
      why: whySentence(c, roman, functionTag, factors),
      chip: chipFor(c, input.pillar.rootPc, nextPillarRoot, input.note.midi),
    })
  }

  out.sort((a, b) => b.score - a.score)
  const limit = input.limit ?? 12
  return out.slice(0, limit)
}

/** Named substitution chips for the current lead under the pillar. */
export function autocompleteSubstitutionChips(opts: {
  leadMidi: number
  pillarRoot: number
  tonality: number
  mode?: TonalityMode
  nextPillarRoot?: number | null
}): { id: string; label: string; rootPc: number; natureIds: readonly string[]; teachingId: string }[] {
  const branches = listSubstitutionBranches({
    leadMidi: opts.leadMidi,
    pillarRoot: opts.pillarRoot,
    tonality: opts.tonality,
    mode: opts.mode,
    nextPillarRoot: opts.nextPillarRoot,
  })
  return branches.slice(0, 6).map((b) => ({
    id: b.strategy,
    label: b.label,
    rootPc: b.rootPc,
    natureIds: b.natureIds,
    teachingId:
      b.strategy === 'secondary_dom'
        ? 'secondary_dom'
        : b.strategy === 'relative_minor'
          ? 'common_tone'
          : b.strategy === 'scf_group' && b.rootPc === counterpartRoot(opts.pillarRoot)
            ? 'counterpart'
            : 'circle_fifths',
  }))
}

export function secondaryDominantChipRoot(nextPillarRoot: number): number {
  return secondaryDominantRootOf(nextPillarRoot)
}
