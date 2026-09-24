import type { ChordStack, MelodyEvent, Pillar, TonalityMode } from '../types'
import type { ContestProfile } from '../contestProfile'
import { DEFAULT_CONTEST_PROFILE } from '../contestProfile'
import type { IdGenerator } from '../../../ports/IdGenerator'
import type { VoicingPitches } from '../chords'
import type { PhraseRole } from '../cadences'
import { loadCadenceBias, phraseRoleAtMelodyIndex } from '../cadences'
import { generateCandidates } from './candidateGenerator'
import { createCandidateRanker, type RankerDeps } from './candidateRanker'
import type { HarmonizeCandidate } from './types'
import { newId } from '../types'

export function candidateToStack(
  note: MelodyEvent,
  c: HarmonizeCandidate,
  pillarId: string | null,
  idGen?: IdGenerator,
): ChordStack {
  return {
    id: idGen ? idGen.next('stk') : newId('stk'),
    startTick: note.startTick,
    durationTicks: note.durationTicks,
    rootPc: c.rootPc,
    natureId: c.natureId,
    voicing: c.voicing,
    spread: c.spread,
    layer: c.layer,
    scfGroup: c.scfGroup,
    pillarId,
    midi: c.midi,
    ruleTags: c.ruleTags,
  }
}

export type CandidatesForNoteOpts = {
  note: MelodyEvent
  pillar: Pillar
  tonality: number
  mode?: TonalityMode
  prevRootPc: number | null
  prevNatureId?: string | null
  preferScf?: boolean
  limit?: number
  profile?: ContestProfile
  nextPillarRoot?: number | null
  prevMidi?: VoicingPitches | null
  prevDominant?: { rootPc: number; natureId: string; midi: VoicingPitches } | null
  rankerDeps?: RankerDeps
  /** Next Lead pitch for cadence ranking (V7→I, etc.). */
  nextMelodyMidi?: number | null
  prevMelodyMidi?: number | null
  phraseRole?: PhraseRole
}

/** Application-facing: generate + rank + limit. */
export function candidatesForMelodyNote(opts: CandidatesForNoteOpts): HarmonizeCandidate[] {
  const mode = opts.mode ?? 'major'
  const generated = generateCandidates({
    note: opts.note,
    pillar: opts.pillar,
    tonality: opts.tonality,
    mode,
    prevRootPc: opts.prevRootPc,
    prevNatureId: opts.prevNatureId ?? null,
    preferScf: opts.preferScf,
    profile: opts.profile,
    nextPillarRoot: opts.nextPillarRoot,
    prevMidi: opts.prevMidi,
    prevDominant: opts.prevDominant,
  })
  const cadenceContext = {
    tonality: opts.tonality,
    mode,
    melodyMidi: opts.note.midi,
    nextMelodyMidi: opts.nextMelodyMidi ?? null,
    prevMelodyMidi: opts.prevMelodyMidi ?? null,
    prevRootPc: opts.prevRootPc,
    prevNatureId: opts.prevNatureId ?? null,
    nextPillarRoot: opts.nextPillarRoot ?? null,
    pillarRoot: opts.pillar.rootPc,
    phraseRole: opts.phraseRole,
  }
  const ranker = createCandidateRanker({
    ...opts.rankerDeps,
    cadenceContext: opts.rankerDeps?.cadenceContext ?? cadenceContext,
    cadenceBias: opts.rankerDeps?.cadenceBias ?? loadCadenceBias(),
  })
  return ranker.rank(generated, opts.limit ?? 12)
}

type BeamState = {
  stacks: ChordStack[]
  score: number
  prevRoot: number | null
  prevNature: string | null
  prevMidi: VoicingPitches | null
  prevDominant: { rootPc: number; natureId: string; midi: VoicingPitches } | null
}

/**
 * Auto-harmonize with a small beam so classic cadence highways survive greedy locals.
 */
export function autoHarmonizeMelody(opts: {
  melody: readonly MelodyEvent[]
  pillars: readonly Pillar[]
  tonality: number
  mode?: TonalityMode
  preferScfForSmn?: boolean
  profile?: ContestProfile
  rankerDeps?: RankerDeps
  idGen?: IdGenerator
  /** Beam width (default 3). Set 1 for greedy. */
  beamWidth?: number
  branchLimit?: number
}): ChordStack[] {
  const { melody, pillars, tonality } = opts
  const profile = opts.profile ?? DEFAULT_CONTEST_PROFILE
  const mode = opts.mode ?? 'major'
  const beamWidth = Math.max(1, opts.beamWidth ?? 3)
  const branchLimit = Math.max(1, opts.branchLimit ?? 4)
  const sorted = [...melody].sort((a, b) => a.startTick - b.startTick)
  const songEnd = sorted.reduce((m, n) => Math.max(m, n.startTick + n.durationTicks), 1)

  let beams: BeamState[] = [
    {
      stacks: [],
      score: 0,
      prevRoot: null,
      prevNature: null,
      prevMidi: null,
      prevDominant: null,
    },
  ]

  for (let i = 0; i < sorted.length; i++) {
    const note = sorted[i]!
    const pillar =
      pillars.find((p) => p.startTick <= note.startTick && note.startTick < p.endTick) ?? null
    if (!pillar) continue

    const nextNote = sorted[i + 1]
    const nextPillar = nextNote
      ? pillars.find((p) => p.startTick <= nextNote.startTick && nextNote.startTick < p.endTick)
      : null
    const preferScf = !!(opts.preferScfForSmn && note.role === 'smn')
    const phraseRole = phraseRoleAtMelodyIndex(
      sorted.map((n) => ({ startTick: n.startTick, durationTicks: n.durationTicks })),
      i,
      songEnd,
    )

    const nextBeams: BeamState[] = []
    for (const beam of beams) {
      const cands = candidatesForMelodyNote({
        note,
        pillar,
        tonality,
        mode,
        prevRootPc: beam.prevRoot,
        prevNatureId: beam.prevNature,
        preferScf,
        limit: branchLimit,
        profile,
        nextPillarRoot: nextPillar?.rootPc ?? null,
        prevMidi: beam.prevMidi,
        prevDominant: beam.prevDominant,
        rankerDeps: opts.rankerDeps,
        nextMelodyMidi: nextNote?.midi ?? null,
        prevMelodyMidi: sorted[i - 1]?.midi ?? null,
        phraseRole,
      })
      if (!cands.length) {
        nextBeams.push(beam)
        continue
      }

      for (const cand of cands) {
        let pathScore = beam.score + cand.score
        if (nextNote && nextPillar) {
          const peek = candidatesForMelodyNote({
            note: nextNote,
            pillar: nextPillar,
            tonality,
            mode,
            prevRootPc: cand.rootPc,
            prevNatureId: cand.natureId,
            preferScf: !!(opts.preferScfForSmn && nextNote.role === 'smn'),
            limit: 2,
            profile,
            nextPillarRoot: nextPillar.rootPc,
            prevMidi: cand.midi,
            prevDominant:
              cand.natureId === 'seventh' || cand.natureId === 'ninth'
                ? { rootPc: cand.rootPc, natureId: cand.natureId, midi: cand.midi }
                : null,
            rankerDeps: opts.rankerDeps,
            nextMelodyMidi: sorted[i + 2]?.midi ?? null,
            phraseRole: phraseRoleAtMelodyIndex(
              sorted.map((n) => ({ startTick: n.startTick, durationTicks: n.durationTicks })),
              i + 1,
              songEnd,
            ),
          })[0]
          if (peek) pathScore += peek.score * 0.35
        }

        nextBeams.push({
          stacks: [...beam.stacks, candidateToStack(note, cand, pillar.id, opts.idGen)],
          score: pathScore,
          prevRoot: cand.rootPc,
          prevNature: cand.natureId,
          prevMidi: cand.midi,
          prevDominant:
            cand.natureId === 'seventh' || cand.natureId === 'ninth'
              ? { rootPc: cand.rootPc, natureId: cand.natureId, midi: cand.midi }
              : null,
        })
      }
    }

    nextBeams.sort((a, b) => b.score - a.score)
    beams = nextBeams.slice(0, beamWidth)
  }

  return beams[0]?.stacks ?? []
}
