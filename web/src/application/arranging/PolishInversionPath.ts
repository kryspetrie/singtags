/**
 * Coach Polish — revoice existing stacks along a global inversion path
 * (I/V home-bass starts, minimize part motion, favor ring). Keeps root + nature;
 * only TTBB placement / voicing string change.
 *
 * Anchors the search to current stack MIDI so a cold sketch-midrange path cannot
 * yank a already-smooth coach highway into jumpy register shifts.
 */
import { BARBERSHOP_CHORDS, leadRoleInChord, type VoicingPitches } from '../../domain/arranging/chords/chords'
import type { ArrangementProject, ChordStack } from '../../domain/arranging/types'
import {
  optimizeSketchHearPath,
  type SketchHearChordRef,
} from '../../domain/arranging/sketchHearVoicing'
import { natureToSketchQuality } from '../../lib/tagRoll/harmonySketch'

function roleOfPc(
  midi: number,
  rootPc: number,
  natureId: string,
): number {
  const chord = BARBERSHOP_CHORDS.find((c) => c.id === natureId)
  if (!chord) return 1
  const role = leadRoleInChord(chord, rootPc, midi)
  if (role != null) return role
  const rel = (((midi % 12) - rootPc) % 12 + 12) % 12
  for (const [r, off] of Object.entries(chord.offsets)) {
    if (off === rel) return Number(r)
  }
  return 1
}

function voicingStringFromMidi(
  rootPc: number,
  natureId: string,
  midi: VoicingPitches,
): string {
  return (
    String(roleOfPc(midi.bass, rootPc, natureId)) +
    String(roleOfPc(midi.bari, rootPc, natureId)) +
    String(roleOfPc(midi.lead, rootPc, natureId)) +
    String(roleOfPc(midi.tenor, rootPc, natureId))
  )
}

function midiEqual(a: VoicingPitches, b: VoicingPitches): boolean {
  return a.bass === b.bass && a.bari === b.bari && a.lead === b.lead && a.tenor === b.tenor
}

function harmonyMotion(seq: readonly VoicingPitches[]): number {
  let m = 0
  for (let i = 1; i < seq.length; i++) {
    const a = seq[i - 1]!
    const b = seq[i]!
    m += Math.abs(b.bass - a.bass) + Math.abs(b.bari - a.bari) + Math.abs(b.tenor - a.tenor)
  }
  return m
}

function maxHarmonyLeap(seq: readonly VoicingPitches[]): number {
  let max = 0
  for (let i = 1; i < seq.length; i++) {
    const a = seq[i - 1]!
    const b = seq[i]!
    max = Math.max(
      max,
      Math.abs(b.bass - a.bass),
      Math.abs(b.bari - a.bari),
      Math.abs(b.tenor - a.tenor),
    )
  }
  return max
}

/**
 * Revoice primary/passing stacks with {@link optimizeSketchHearPath}.
 * Embellishments and stacks without MIDI are left untouched.
 * Rejects a “polish” that worsens total motion or the largest part leap.
 */
export function polishInversionPath(project: ArrangementProject): {
  project: ArrangementProject
  changed: number
  stackIds: string[]
} {
  const sorted = [...project.stacks]
    .filter((s) => s.layer !== 'embellishment' && s.midi)
    .sort((a, b) => a.startTick - b.startTick || a.id.localeCompare(b.id))
  if (sorted.length < 2) {
    return { project, changed: 0, stackIds: [] }
  }

  const refs: SketchHearChordRef[] = sorted.map((s) => {
    const mel = project.melody.find((m) => m.startTick === s.startTick)
    return {
      rootPc: s.rootPc,
      quality: natureToSketchQuality(s.natureId),
      leadMidi: mel?.midi ?? s.midi!.lead,
    }
  })
  const seeds = sorted.map((s) => s.midi!)

  const path = optimizeSketchHearPath(refs, {
    tonality: project.tonality,
    seedPitches: seeds,
  })
  if (path.length !== sorted.length) {
    return { project, changed: 0, stackIds: [] }
  }

  // Gate: never accept a polish that jumps more than the current highway.
  const beforeMotion = harmonyMotion(seeds)
  const afterMotion = harmonyMotion(path)
  const beforeLeap = maxHarmonyLeap(seeds)
  const afterLeap = maxHarmonyLeap(path)
  if (afterMotion > beforeMotion || afterLeap > beforeLeap + 1) {
    return { project, changed: 0, stackIds: [] }
  }

  const byId = new Map<string, ChordStack>()
  const changedIds: string[] = []
  for (let i = 0; i < sorted.length; i++) {
    const prev = sorted[i]!
    const nextMidi = path[i]!
    const mel = project.melody.find((m) => m.startTick === prev.startTick)
    // Keep Lead locked to the melody MIDI when present.
    const midi: VoicingPitches = {
      bass: nextMidi.bass,
      bari: nextMidi.bari,
      lead: mel?.midi ?? nextMidi.lead,
      tenor: nextMidi.tenor,
    }
    // If lead was forced, tenor must stay above lead.
    if (midi.tenor <= midi.lead) {
      midi.tenor = midi.lead + Math.max(1, nextMidi.tenor - nextMidi.lead)
    }
    if (prev.midi && midiEqual(prev.midi, midi)) {
      byId.set(prev.id, prev)
      continue
    }
    changedIds.push(prev.id)
    byId.set(prev.id, {
      ...prev,
      midi,
      voicing: voicingStringFromMidi(prev.rootPc, prev.natureId, midi),
    })
  }

  if (!changedIds.length) {
    return { project, changed: 0, stackIds: [] }
  }

  const stacks = project.stacks.map((s) => byId.get(s.id) ?? s)
  return {
    project: { ...project, stacks },
    changed: changedIds.length,
    stackIds: changedIds,
  }
}
