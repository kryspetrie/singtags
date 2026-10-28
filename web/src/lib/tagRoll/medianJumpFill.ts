/**
 * After Fill writes tenor, bari, and bass, revoice jumps that stick out from
 * each part's median step. Alternates are other inversions of the named chord
 * that still hold the sung notes. A candidate is kept only when the window
 * median falls and no part's largest connected step grows.
 *
 * Other chords on the same root were tried on the twelve polecats. They cut
 * jumps about as much as inversions and renamed many more stacks, so this
 * pass stays on the named chord.
 */
import { identifyNatureFromMidi } from '../../domain/arranging/chordCompletion'
import { allowlistForProfile, type ContestProfile } from '../../domain/arranging/contestProfile'
import {
  bindMedianJumpPenalty,
  isBassOctaveStep,
  smoothMedianJumpWindow,
  type MedianJumpChord,
  type MedianJumpRole,
} from '../../domain/arranging/medianJumpWindow'
import { listSmoothVoicings } from '../../domain/arranging/sparseStackComplete'
import { isHarmonySketchQuality, type HarmonySketchSpan } from './harmonySketch'
import { medianJumpOnFill } from './medianJumpPrefs'
import type { TagRollNote } from './types'

const ROLES: readonly MedianJumpRole[] = ['tenor', 'bari', 'bass']
const SAME_CHORD_LIMIT = 8

export type MedianFillEdit = {
  tick: number
  rootPc: number
  natureId: string
}

type StackAlt = {
  pitch: Partial<Record<MedianJumpRole, number>>
  rootPc: number
  natureId: string
}

type Beat = {
  tick: number
  pitch: Partial<Record<MedianJumpRole, number>>
  locked: MedianJumpRole[]
  span: HarmonySketchSpan | undefined
  lead: number | undefined
}

function covering(
  notes: readonly TagRollNote[],
  partId: string,
  tick: number,
): TagRollNote | undefined {
  return (
    notes.find((n) => n.partId === partId && n.startTick === tick) ??
    notes.find(
      (n) => n.partId === partId && n.startTick <= tick && tick < n.startTick + n.durationTicks,
    )
  )
}

function connectedMax(notes: readonly TagRollNote[], partId: string, role: MedianJumpRole): number {
  const line = notes.filter((n) => n.partId === partId).sort((a, b) => a.startTick - b.startTick)
  let max = 0
  for (let i = 1; i < line.length; i++) {
    const gap = line[i]!.startTick - (line[i - 1]!.startTick + line[i - 1]!.durationTicks)
    if (gap > 480) continue
    const step = Math.abs(line[i]!.midi - line[i - 1]!.midi)
    if (isBassOctaveStep(role, step)) continue
    max = Math.max(max, step)
  }
  return max
}

function pitchKey(pitch: Partial<Record<MedianJumpRole, number>>): string {
  return ROLES.map((role) => pitch[role] ?? '·').join(',')
}

function harmonyPitch(
  notes: readonly TagRollNote[],
  partByRole: Record<MedianJumpRole, string>,
  tick: number,
): Partial<Record<MedianJumpRole, number>> {
  const pitch: Partial<Record<MedianJumpRole, number>> = {}
  for (const role of ROLES) {
    const note = covering(notes, partByRole[role], tick)
    if (note) pitch[role] = note.midi
  }
  return pitch
}

function catalogsFor(beats: readonly Beat[], profile: ContestProfile): StackAlt[][] {
  const allowed = allowlistForProfile(profile)
  return beats.map((beat, index) => {
    if (!beat.span || beat.lead == null || beat.locked.length === ROLES.length) return []
    const prev = beats[index - 1]?.pitch
    const next = beats[index + 1]?.pitch
    const locked: Partial<Record<MedianJumpRole, number>> = {}
    for (const role of beat.locked) locked[role] = beat.pitch[role]
    const alts: StackAlt[] = []
    const seen = new Set<string>()
    if (!allowed.includes(beat.span.quality)) return alts
    const stacks = listSmoothVoicings({
      natureId: beat.span.quality,
      rootPc: beat.span.rootPc,
      lead: beat.lead,
      locked,
      prev,
      next,
      limit: SAME_CHORD_LIMIT,
    })
    for (const stack of stacks) {
      const pitch: Partial<Record<MedianJumpRole, number>> = {}
      for (const role of ROLES) {
        if (beat.pitch[role] == null) continue
        pitch[role] = stack[role]
      }
      const key = pitchKey(pitch)
      if (seen.has(key)) continue
      seen.add(key)
      alts.push({ pitch, rootPc: beat.span.rootPc, natureId: beat.span.quality })
    }
    return alts
  })
}

function tickInRange(tick: number, range: SmoothJumpsRange | null | undefined): boolean {
  if (!range) return true
  return tick >= range.startTick && tick < range.endTick
}

function applyPass(opts: {
  notes: TagRollNote[]
  originalIds: ReadonlySet<string>
  sketch: readonly HarmonySketchSpan[]
  melodyAt: (tick: number) => string | null
  partByRole: Record<MedianJumpRole, string>
  profile: ContestProfile
  /** free = notes Fill just wrote. all = every harmony onset in range. */
  onsets?: 'free' | 'all'
  range?: SmoothJumpsRange | null
  /** Name a chord from the sounding stack when Sketch has no span. */
  identifyMissing?: boolean
  tonality?: number
  mode?: 'major' | 'minor'
  /** Part whose pitch the other voices move around. Fill uses the melody. */
  anchorPartId?: string
}): { edits: MedianFillEdit[]; reverted: boolean } {
  const ticks = [
    ...new Set(
      opts.notes
        .filter((n) => {
          if (!ROLES.some((role) => n.partId === opts.partByRole[role])) return false
          if (opts.onsets !== 'all' && opts.originalIds.has(n.id)) return false
          return tickInRange(n.startTick, opts.range)
        })
        .map((n) => n.startTick),
    ),
  ].sort((a, b) => a - b)
  if (ticks.length < 2) return { edits: [], reverted: false }
  const beats: Beat[] = ticks.map((tick) => {
    const pitch = harmonyPitch(opts.notes, opts.partByRole, tick)
    const locked: MedianJumpRole[] = []
    for (const role of ROLES) {
      const note = covering(opts.notes, opts.partByRole[role], tick)
      if (!note || opts.originalIds.has(note.id) || note.startTick !== tick) locked.push(role)
    }
    let span = opts.sketch.find((s) => s.startTick <= tick && tick < s.endTick)
    const melodyPartId = opts.melodyAt(tick)
    const melodyNote = melodyPartId ? covering(opts.notes, melodyPartId, tick) : undefined
    const anchorNote = opts.anchorPartId
      ? covering(opts.notes, opts.anchorPartId, tick) ?? melodyNote
      : melodyNote
    if (!span && opts.identifyMissing && anchorNote) {
      const found = identifyNatureFromMidi({
        midi: {
          lead: anchorNote.midi,
          ...(pitch.tenor != null ? { tenor: pitch.tenor } : {}),
          ...(pitch.bari != null ? { bari: pitch.bari } : {}),
          ...(pitch.bass != null ? { bass: pitch.bass } : {}),
        },
        profile: opts.profile,
        tonality: opts.tonality ?? 0,
        mode: opts.mode,
      })
      if (found && isHarmonySketchQuality(found.natureId)) {
        span = {
          id: `smooth-${tick}`,
          startTick: tick,
          endTick: tick + 1,
          rootPc: found.rootPc,
          quality: found.natureId,
          source: 'detect',
          locked: false,
        }
      }
    }
    return { tick, pitch, locked, span, lead: anchorNote?.midi }
  })
  const catalogs = catalogsFor(beats, opts.profile)
  const chords: MedianJumpChord[] = beats.map((beat, index) => ({
    id: String(beat.tick),
    pitch: beat.pitch,
    locked: beat.locked,
    alternates: catalogs[index]!.map((alt) => alt.pitch),
  }))
  const smoothed = smoothMedianJumpWindow(chords, { isOrdinaryStep: isBassOctaveStep })
  const before = new Map(opts.notes.map((n) => [n.id, n.midi]))
  const beforeMax = Object.fromEntries(
    ROLES.map((role) => [role, connectedMax(opts.notes, opts.partByRole[role], role)]),
  ) as Record<MedianJumpRole, number>
  const edits: MedianFillEdit[] = []
  smoothed.chords.forEach((chord, index) => {
    const beat = beats[index]!
    if (pitchKey(chord.pitch) === pitchKey(beat.pitch)) return
    for (const role of ROLES) {
      if (beat.locked.includes(role) || chord.pitch[role] == null) continue
      const note = opts.notes.find(
        (n) => n.partId === opts.partByRole[role] && n.startTick === beat.tick && !opts.originalIds.has(n.id),
      )
      if (note) note.midi = chord.pitch[role]!
    }
    const named = catalogs[index]!.find((alt) => pitchKey(alt.pitch) === pitchKey(chord.pitch))
    if (
      named &&
      beat.span &&
      beat.span.startTick === beat.tick &&
      (named.natureId !== beat.span.quality || named.rootPc !== beat.span.rootPc)
    ) {
      edits.push({ tick: beat.tick, rootPc: named.rootPc, natureId: named.natureId })
    }
  })
  const grew = ROLES.some(
    (role) => connectedMax(opts.notes, opts.partByRole[role], role) > beforeMax[role],
  )
  if (grew) {
    for (const note of opts.notes) {
      const midi = before.get(note.id)
      if (midi != null) note.midi = midi
    }
    return { edits: [], reverted: true }
  }
  return { edits, reverted: false }
}

export function smoothFilledMedianWindow(opts: {
  notes: TagRollNote[]
  originalNotes: readonly TagRollNote[]
  sketch: readonly HarmonySketchSpan[]
  melodyAt: (tick: number) => string | null
  tenorId: string
  bariId: string
  bassId: string
  profile: ContestProfile
}): { notes: TagRollNote[]; edits: MedianFillEdit[] } {
  const originalIds = new Set(opts.originalNotes.map((n) => n.id))
  const notes = opts.notes.map((n) => ({ ...n }))
  const partByRole: Record<MedianJumpRole, string> = {
    tenor: opts.tenorId,
    bari: opts.bariId,
    bass: opts.bassId,
  }
  const pass = applyPass({
    notes,
    originalIds,
    sketch: opts.sketch,
    melodyAt: opts.melodyAt,
    partByRole,
    profile: opts.profile,
  })
  return { notes, edits: pass.edits }
}

export type SmoothJumpsRange = { startTick: number; endTick: number }

/**
 * Bounding range of the current selection. Selected notes win; otherwise
 * selected Sketch spans. No selection means the whole song.
 */
export function selectionSmoothRange(
  notes: readonly { id: string; startTick: number; durationTicks: number }[],
  selectedNoteIds: readonly string[],
  spans: readonly { id: string; startTick: number; endTick: number }[],
  selectedSpanIds: readonly string[],
): SmoothJumpsRange | null {
  const noteSet = new Set(selectedNoteIds)
  const pickedNotes = notes.filter((n) => noteSet.has(n.id))
  if (pickedNotes.length) {
    const startTick = Math.min(...pickedNotes.map((n) => n.startTick))
    const endTick = Math.max(...pickedNotes.map((n) => n.startTick + n.durationTicks))
    return { startTick, endTick }
  }
  const spanSet = new Set(selectedSpanIds)
  const pickedSpans = spans.filter((s) => spanSet.has(s.id))
  if (!pickedSpans.length) return null
  return {
    startTick: Math.min(...pickedSpans.map((s) => s.startTick)),
    endTick: Math.max(...pickedSpans.map((s) => s.endTick)),
  }
}

/**
 * Revoice tenor, bari, and bass inside `range` (or the whole song) so jumps
 * sit closer to each part's median step. `holdPartIds` locks those parts for
 * the whole pass. `lockMelody` locks whichever note is the melody at its
 * onset, including after a handoff. Lead is the voicing anchor.
 */
export function smoothJumpsInProject(opts: {
  notes: readonly TagRollNote[]
  parts: readonly { id: string; name: string }[]
  sketch: readonly HarmonySketchSpan[]
  melodyAt: (tick: number) => string | null
  range: SmoothJumpsRange | null
  holdPartIds: ReadonlySet<string>
  /** Lock the melody note at each onset, following handoffs. */
  lockMelody?: boolean
  profile: ContestProfile
  tonality: number
  mode: 'major' | 'minor'
}): { notes: TagRollNote[]; changed: number; reverted: boolean } {
  const tenor = opts.parts.find((p) => p.name === 'Tenor')
  const bari = opts.parts.find((p) => p.name === 'Bari')
  const bass = opts.parts.find((p) => p.name === 'Bass')
  const lead = opts.parts.find((p) => p.name === 'Lead')
  const notes = opts.notes.map((n) => ({ ...n }))
  if (!tenor || !bari || !bass) return { notes, changed: 0, reverted: false }
  const originalIds = new Set<string>()
  for (const note of notes) {
    if (opts.holdPartIds.has(note.partId)) originalIds.add(note.id)
    if (opts.lockMelody && opts.melodyAt(note.startTick) === note.partId) originalIds.add(note.id)
  }
  const before = new Map(notes.map((n) => [n.id, n.midi]))
  const pass = applyPass({
    notes,
    originalIds,
    sketch: opts.sketch,
    melodyAt: opts.melodyAt,
    partByRole: { tenor: tenor.id, bari: bari.id, bass: bass.id },
    profile: opts.profile,
    onsets: 'all',
    range: opts.range,
    identifyMissing: true,
    tonality: opts.tonality,
    mode: opts.mode,
    anchorPartId: lead?.id,
  })
  if (pass.reverted) {
    for (const note of notes) {
      const midi = before.get(note.id)
      if (midi != null) note.midi = midi
    }
    return { notes, changed: 0, reverted: true }
  }
  const changed = notes.filter((n) => before.get(n.id) !== n.midi).length
  return { notes, changed, reverted: false }
}

bindMedianJumpPenalty(medianJumpOnFill)
