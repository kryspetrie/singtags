/**
 * Transpose / lead-range FixStrategies (destructive — require confirmDestructive).
 */
import type { ArrangementProject } from '../../types'
import type { FixStrategy, ProjectPatch } from './illegalChordFix'

function clampMidi(n: number): number {
  return Math.max(0, Math.min(127, Math.round(n)))
}

function transposeBy(project: ArrangementProject, semi: number): ProjectPatch | null {
  if (!Number.isFinite(semi) || semi === 0) return null
  const melody = project.melody.map((n) => ({
    ...n,
    midi: clampMidi(Math.max(36, Math.min(84, n.midi + semi))),
  }))
  const stacks = project.stacks.map((s) => {
    if (!s.midi) return s
    return {
      ...s,
      midi: {
        bass: clampMidi(s.midi.bass + semi),
        bari: clampMidi(s.midi.bari + semi),
        lead: clampMidi(s.midi.lead + semi),
        tenor: clampMidi(s.midi.tenor + semi),
      },
    }
  })
  const tonality = (((project.tonality + semi) % 12) + 12) % 12
  const pillars = project.pillars.map((p) => ({
    ...p,
    rootPc: (((p.rootPc + semi) % 12) + 12) % 12,
  }))
  return { melody, stacks, tonality, pillars }
}

export const keySuggestionFix: FixStrategy = {
  ruleId: 'key-suggestion',
  canFix(lint) {
    return lint.ruleId === 'key-suggestion' && typeof lint.data?.semitones === 'number'
  },
  apply(lint, project, ctx) {
    if (!ctx?.confirmDestructive) return null
    return transposeBy(project, Number(lint.data?.semitones))
  },
}

export const leadRangeFix: FixStrategy = {
  ruleId: 'lead-range',
  canFix(lint, project) {
    if (lint.ruleId !== 'lead-range' || !lint.noteId) return false
    return project.melody.some((n) => n.id === lint.noteId)
  },
  apply(lint, project, ctx) {
    if (!ctx?.confirmDestructive) return null
    const note = project.melody.find((n) => n.id === lint.noteId)
    if (!note) return null
    let semi = 0
    if (note.midi < 50) semi = 50 - note.midi
    else if (note.midi > 77) semi = 77 - note.midi
    return transposeBy(project, semi)
  },
}
