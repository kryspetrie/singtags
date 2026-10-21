/**
 * Detect Lead notes that do not fit a covering Sketch chord and propose a
 * same-root PCF color or SCF/passing stack (Approach One).
 *
 * Candidate generation is injected so this module does not import `./harmonize`
 * (avoids circular ESM bindings via the arranging barrel / Vite HMR).
 */
import {
  BARBERSHOP_CHORDS,
  VOICINGS_BY_CHORD,
  chordContainsLead,
  pcName,
  placeVoicingConcert,
} from './chords'
import {
  DEFAULT_CONTEST_PROFILE,
  isNatureAllowed,
  type ContestProfile,
} from './contestProfile'
import { PCF_NATURE_PRIORITY } from './scf'
import type { MelodyEvent, MelodyRole, Pillar, TonalityMode } from './types'

export type PassingSketchSpan = {
  id: string
  startTick: number
  endTick: number
  rootPc: number
  /** Sketch quality / nature id (major, seventh, …). */
  natureId: string
}

export type PassingMelodyNote = {
  id: string
  midi: number
  startTick: number
  durationTicks: number
  role?: MelodyRole | null
}

export type PassingProposalKind =
  | 'sameRootColor'
  | 'passingChord'
  /** Keep covering home root/tones; force Lead = melody (may be non-catalog). */
  | 'melodyLockedVariant'

/** Minimal candidate shape needed to build a proposal (matches HarmonizeCandidate). */
export type PassingCandidate = {
  rootPc: number
  natureId: string
  voicing: string
  spread: boolean
  layer: 'primary' | 'passing'
  scfGroup: number | null
  midi: { tenor: number; lead: number; bari: number; bass: number }
  score: number
  label: string
}

export type PassingProposal = {
  kind: PassingProposalKind
  rootPc: number
  natureId: string
  layer: 'primary' | 'passing'
  scfGroup: number | null
  voicing: string
  spread: boolean
  midi: { tenor: number; lead: number; bari: number; bass: number }
  score: number
  label: string
}

export type PassingMismatch = {
  melodyNoteId: string
  startTick: number
  endTick: number
  coveringSketchId: string
  coveringRootPc: number
  coveringNatureId: string
  melodyRole: MelodyRole | null
  proposal: PassingProposal
}

export type PassingListCandidates = (opts: {
  note: MelodyEvent
  pillar: Pillar
  tonality: number
  mode: TonalityMode
  prevRootPc: number | null
  prevNatureId: string | null
  preferScf: boolean
  allowPassing: boolean
  allowScf: boolean
  allowSpread: boolean
  limit: number
  profile: ContestProfile
  nextMelodyMidi: number | null
  prevMelodyMidi: number | null
}) => readonly PassingCandidate[]

function coveringSpanAt(
  spans: readonly PassingSketchSpan[],
  tick: number,
): PassingSketchSpan | null {
  return spans.find((s) => s.startTick <= tick && tick < s.endTick) ?? null
}

function chordForNature(natureId: string) {
  return (
    BARBERSHOP_CHORDS.find((c) => c.id === natureId) ??
    BARBERSHOP_CHORDS.find((c) => c.id === 'major')!
  )
}

/** True when Lead is a chord tone of the Sketch nature at root. */
export function sketchContainsLead(
  natureId: string,
  rootPc: number,
  leadMidi: number,
): boolean {
  return chordContainsLead(chordForNature(natureId), rootPc, leadMidi)
}

/**
 * First PCF nature on the same root (contest-allowed) that contains Lead,
 * skipping the current Sketch nature. Approach One “color on X”.
 */
export function findSameRootColorNature(opts: {
  rootPc: number
  coveringNatureId: string
  leadMidi: number
  profile?: ContestProfile
  mode?: TonalityMode
}): string | null {
  const profile = opts.profile ?? DEFAULT_CONTEST_PROFILE
  const natures =
    opts.mode === 'minor'
      ? ([
          'minor',
          'm7',
          'seventh',
          'major',
          'ninth',
          'sixth',
          'half-dim',
          'add9',
          'aug',
          'maj7',
          'dim',
        ] as const)
      : PCF_NATURE_PRIORITY
  for (const natureId of natures) {
    if (natureId === opts.coveringNatureId) continue
    if (!isNatureAllowed(profile, natureId)) continue
    if (sketchContainsLead(natureId, opts.rootPc, opts.leadMidi)) return natureId
  }
  return null
}

function toMelodyEvent(n: PassingMelodyNote): MelodyEvent {
  const role: MelodyRole =
    n.role === 'pmn' || n.role === 'smn' || n.role === 'unknown' ? n.role : 'unknown'
  return {
    id: n.id,
    midi: n.midi,
    startTick: n.startTick,
    durationTicks: Math.max(1, n.durationTicks),
    role,
  }
}

function pillarFromSpan(span: PassingSketchSpan): Pillar {
  return {
    id: `pillar-${span.id}`,
    rootPc: span.rootPc,
    startTick: span.startTick,
    endTick: span.endTick,
    source: 'user',
    confirmed: true,
  }
}

function coveringTonePcs(natureId: string, rootPc: number): Set<number> {
  const chord = chordForNature(natureId)
  const pcs = new Set<number>()
  for (const off of Object.values(chord.offsets)) {
    if (off != null) pcs.add((((rootPc + off) % 12) + 12) % 12)
  }
  return pcs
}

function sharedPcScore(
  midi: { tenor: number; bari: number; bass: number; lead: number },
  coverPcs: Set<number>,
): number {
  let n = 0
  for (const m of [midi.bass, midi.bari, midi.tenor, midi.lead]) {
    if (coverPcs.has(((m % 12) + 12) % 12)) n += 1
  }
  return n
}

/** Nearest MIDI of a covering chord tone to the melody pitch (for shell placement). */
function nearestChordToneMidi(natureId: string, rootPc: number, leadMidi: number): number {
  const chord = chordForNature(natureId)
  const leadPc = ((leadMidi % 12) + 12) % 12
  let best = Math.round(leadMidi)
  let bestDist = 99
  for (const off of Object.values(chord.offsets)) {
    if (off == null) continue
    const pc = (((rootPc + off) % 12) + 12) % 12
    const base = leadMidi - leadPc + pc
    for (const cand of [base - 12, base, base + 12]) {
      const d = Math.abs(cand - leadMidi)
      if (d < bestDist) {
        bestDist = d
        best = Math.round(cand)
      }
    }
  }
  return best
}

/**
 * Keep the covering home root (and as many home tones as possible) while forcing
 * Lead = the actual melody MIDI — even when that is not a catalog chord tone.
 */
export function buildMelodyLockedProposal(opts: {
  note: MelodyEvent
  span: PassingSketchSpan
  cands: readonly PassingCandidate[]
  preferFlats?: boolean
}): PassingProposal | null {
  const { note, span, cands } = opts
  const lead = Math.round(note.midi)
  const coverPcs = coveringTonePcs(span.natureId, span.rootPc)
  const flats = opts.preferFlats ?? false
  const homeLabel = `${pcName(span.rootPc, flats)}${chordForNature(span.natureId).notation || ''}·mel`

  let best: PassingCandidate | null = null
  let bestScore = -1
  for (const c of cands) {
    // Prefer same-root shells so Sketch label stays on the phrase home.
    const score =
      sharedPcScore(c.midi, coverPcs) + (c.rootPc === span.rootPc ? 3 : 0)
    if (score > bestScore) {
      bestScore = score
      best = c
    }
  }
  if (best) {
    return {
      kind: 'melodyLockedVariant',
      rootPc: span.rootPc,
      natureId: best.rootPc === span.rootPc ? best.natureId : span.natureId,
      layer: 'primary',
      scfGroup: null,
      voicing: best.voicing,
      spread: best.spread,
      midi: { ...best.midi, lead },
      score: best.score * 0.45,
      label: homeLabel,
    }
  }

  const approx = nearestChordToneMidi(span.natureId, span.rootPc, lead)
  const chord = chordForNature(span.natureId)
  for (const voicing of VOICINGS_BY_CHORD[span.natureId] ?? []) {
    const placed = placeVoicingConcert({
      chord,
      rootPc: span.rootPc,
      leadMidi: approx,
      voicing,
      spread: false,
    })
    if (!placed) continue
    return {
      kind: 'melodyLockedVariant',
      rootPc: span.rootPc,
      natureId: span.natureId,
      layer: 'primary',
      scfGroup: null,
      voicing,
      spread: false,
      midi: {
        tenor: placed.tenor,
        bari: placed.bari,
        bass: placed.bass,
        lead,
      },
      score: 0,
      label: homeLabel,
    }
  }
  return null
}

function pickProposal(opts: {
  note: MelodyEvent
  span: PassingSketchSpan
  sameRootNature: string | null
  cands: readonly PassingCandidate[]
}): PassingProposal | null {
  const { note, span, sameRootNature, cands } = opts
  if (!cands.length) return null

  if (sameRootNature) {
    const exact = cands.find(
      (c) =>
        c.rootPc === span.rootPc &&
        c.natureId === sameRootNature &&
        c.layer === 'primary',
    )
    const anySame = cands.find(
      (c) => c.rootPc === span.rootPc && c.natureId === sameRootNature,
    )
    const pick = exact ?? anySame
    if (pick) {
      return {
        kind: 'sameRootColor',
        rootPc: pick.rootPc,
        natureId: pick.natureId,
        layer: 'primary',
        scfGroup: pick.scfGroup,
        voicing: pick.voicing,
        spread: pick.spread,
        midi: pick.midi,
        score: pick.score,
        label: pick.label,
      }
    }
  }

  const passing = cands.find((c) => c.layer === 'passing')
  const pick = passing ?? cands[0]!
  // Prefer not to re-emit the covering Sketch nature if Lead still doesn't fit it.
  if (
    pick.rootPc === span.rootPc &&
    pick.natureId === span.natureId &&
    !sketchContainsLead(span.natureId, span.rootPc, note.midi)
  ) {
    const alt = cands.find(
      (c) => !(c.rootPc === span.rootPc && c.natureId === span.natureId),
    )
    if (!alt) return null
    return {
      kind: alt.layer === 'passing' ? 'passingChord' : 'sameRootColor',
      rootPc: alt.rootPc,
      natureId: alt.natureId,
      layer: alt.layer,
      scfGroup: alt.scfGroup,
      voicing: alt.voicing,
      spread: alt.spread,
      midi: alt.midi,
      score: alt.score,
      label: alt.label,
    }
  }

  return {
    kind: pick.layer === 'passing' ? 'passingChord' : 'sameRootColor',
    rootPc: pick.rootPc,
    natureId: pick.natureId,
    layer: pick.layer === 'passing' ? 'passing' : 'primary',
    scfGroup: pick.scfGroup,
    voicing: pick.voicing,
    spread: pick.spread,
    midi: pick.midi,
    score: pick.score,
    label: pick.label,
  }
}

/** Count Lead onsets under Sketch that are not chord tones (no candidate gen). */
export function countLeadSketchMismatches(opts: {
  sketchSpans: readonly PassingSketchSpan[]
  melody: readonly PassingMelodyNote[]
}): number {
  const spans = opts.sketchSpans
  if (!spans.length) return 0
  let n = 0
  for (const raw of opts.melody) {
    const span = coveringSpanAt(spans, raw.startTick)
    if (!span || span.natureId === 'blank') continue
    if (!sketchContainsLead(span.natureId, span.rootPc, raw.midi)) n += 1
  }
  return n
}

/**
 * Scan Lead onsets under Sketch; propose stack chords for non-chord tones.
 * SMN mismatches are listed before PMN when tied by tick.
 */
export function proposePassingUnderSketch(opts: {
  sketchSpans: readonly PassingSketchSpan[]
  melody: readonly PassingMelodyNote[]
  tonality: number
  mode?: TonalityMode
  profile?: ContestProfile
  /** Candidate pool size per note (default 24). */
  limit?: number
  listCandidates: PassingListCandidates
  /**
   * Previous root/nature for motion ranking (optional; often the covering Sketch).
   */
  prevRootPc?: number | null
  prevNatureId?: string | null
}): PassingMismatch[] {
  const profile = opts.profile ?? DEFAULT_CONTEST_PROFILE
  const mode = opts.mode ?? 'major'
  const limit = opts.limit ?? 24
  const spans = [...opts.sketchSpans].sort(
    (a, b) => a.startTick - b.startTick || a.id.localeCompare(b.id),
  )
  const melody = [...opts.melody].sort(
    (a, b) => a.startTick - b.startTick || a.id.localeCompare(b.id),
  )
  const out: PassingMismatch[] = []

  for (let i = 0; i < melody.length; i++) {
    const raw = melody[i]!
    const span = coveringSpanAt(spans, raw.startTick)
    if (!span || span.natureId === 'blank') continue
    if (sketchContainsLead(span.natureId, span.rootPc, raw.midi)) continue

    const note = toMelodyEvent(raw)
    const sameRootNature = findSameRootColorNature({
      rootPc: span.rootPc,
      coveringNatureId: span.natureId,
      leadMidi: note.midi,
      profile,
      mode,
    })

    const nextMel = melody[i + 1] ?? null
    const prevMel = i > 0 ? melody[i - 1]! : null
    const cands = opts.listCandidates({
      note,
      pillar: pillarFromSpan(span),
      tonality: opts.tonality,
      mode,
      prevRootPc: opts.prevRootPc ?? span.rootPc,
      prevNatureId: opts.prevNatureId ?? span.natureId,
      preferScf: true,
      allowPassing: true,
      allowScf: true,
      allowSpread: true,
      limit,
      profile,
      nextMelodyMidi: nextMel?.midi ?? null,
      prevMelodyMidi: prevMel?.midi ?? null,
    })

    const catalog = pickProposal({ note, span, sameRootNature, cands })
    const locked = buildMelodyLockedProposal({ note, span, cands })
    // Prefer same-root catalog color; else keep home tones + melody; else SCF pass.
    const proposal =
      catalog?.kind === 'sameRootColor'
        ? catalog
        : (locked ?? catalog)
    if (!proposal) continue

    out.push({
      melodyNoteId: note.id,
      startTick: note.startTick,
      endTick: note.startTick + note.durationTicks,
      coveringSketchId: span.id,
      coveringRootPc: span.rootPc,
      coveringNatureId: span.natureId,
      melodyRole: note.role === 'unknown' ? null : note.role,
      proposal,
    })
  }

  // SMN before others at the same tick; otherwise chronological.
  out.sort((a, b) => {
    if (a.startTick !== b.startTick) return a.startTick - b.startTick
    const aSmn = a.melodyRole === 'smn' ? 0 : 1
    const bSmn = b.melodyRole === 'smn' ? 0 : 1
    if (aSmn !== bSmn) return aSmn - bSmn
    return a.melodyNoteId.localeCompare(b.melodyNoteId)
  })
  return out
}
