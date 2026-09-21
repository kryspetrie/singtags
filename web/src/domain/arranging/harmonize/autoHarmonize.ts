import type { ChordStack, MelodyEvent, Pillar, TonalityMode } from '../types'
import type { ContestProfile } from '../contestProfile'
import type { IdGenerator } from '../../../ports/IdGenerator'
import type { VoicingPitches } from '../chords'
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
}

/** Application-facing: generate + rank + limit. */
export function candidatesForMelodyNote(opts: CandidatesForNoteOpts): HarmonizeCandidate[] {
  const generated = generateCandidates({
    note: opts.note,
    pillar: opts.pillar,
    tonality: opts.tonality,
    mode: opts.mode,
    prevRootPc: opts.prevRootPc,
    prevNatureId: opts.prevNatureId ?? null,
    preferScf: opts.preferScf,
    profile: opts.profile,
    nextPillarRoot: opts.nextPillarRoot,
    prevMidi: opts.prevMidi,
    prevDominant: opts.prevDominant,
  })
  const ranker = createCandidateRanker(opts.rankerDeps)
  return ranker.rank(generated, opts.limit ?? 12)
}

export function autoHarmonizeMelody(opts: {
  melody: readonly MelodyEvent[]
  pillars: readonly Pillar[]
  tonality: number
  mode?: TonalityMode
  preferScfForSmn?: boolean
  profile?: ContestProfile
  rankerDeps?: RankerDeps
  idGen?: IdGenerator
}): ChordStack[] {
  const { melody, pillars, tonality } = opts
  const profile = opts.profile ?? 'sai11'
  const mode = opts.mode ?? 'major'
  const sorted = [...melody].sort((a, b) => a.startTick - b.startTick)
  const stacks: ChordStack[] = []
  let prevRoot: number | null = null
  let prevNature: string | null = null
  let prevMidi: VoicingPitches | null = null
  let prevDominant: { rootPc: number; natureId: string; midi: VoicingPitches } | null = null
  for (let i = 0; i < sorted.length; i++) {
    const note = sorted[i]!
    const pillar =
      pillars.find((p) => p.startTick <= note.startTick && note.startTick < p.endTick) ?? null
    if (!pillar) continue
    const nextNote = sorted[i + 1]
    const nextPillar = nextNote
      ? pillars.find((p) => p.startTick <= nextNote.startTick && nextNote.startTick < p.endTick)
      : null
    const preferScf = opts.preferScfForSmn && note.role === 'smn'
    const cands = candidatesForMelodyNote({
      note,
      pillar,
      tonality,
      mode,
      prevRootPc: prevRoot,
      prevNatureId: prevNature,
      preferScf,
      limit: 8,
      profile,
      nextPillarRoot: nextPillar?.rootPc ?? null,
      prevMidi,
      prevDominant,
      rankerDeps: opts.rankerDeps,
    })
    const best = cands[0]
    if (!best) continue
    stacks.push(candidateToStack(note, best, pillar.id, opts.idGen))
    prevRoot = best.rootPc
    prevNature = best.natureId
    prevMidi = best.midi
    prevDominant =
      best.natureId === 'seventh' || best.natureId === 'ninth'
        ? { rootPc: best.rootPc, natureId: best.natureId, midi: best.midi }
        : null
  }
  return stacks
}
