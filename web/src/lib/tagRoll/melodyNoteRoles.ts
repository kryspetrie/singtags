/**
 * Map Tag Roll notes ↔ arrangement melody roles (Strong / Passing).
 */
import type { MelodyEvent, MelodyRole } from '../../domain/arranging/types'
import type { TagRollNote, TagRollProject } from './types'

export function melodyPartIdOf(project: TagRollProject): string | null {
  return (
    project.view.melodyPartId ??
    project.parts.find((p) => p.name === 'Lead')?.id ??
    project.parts[0]?.id ??
    null
  )
}

/** Match arrangement melody to a Tag Roll note by onset + pitch. */
export function findMelodyEventForNote(
  melody: readonly MelodyEvent[],
  note: TagRollNote,
): MelodyEvent | null {
  return (
    melody.find((m) => m.startTick === note.startTick && m.midi === note.midi) ??
    melody.find(
      (m) =>
        m.midi === note.midi &&
        m.startTick <= note.startTick &&
        note.startTick < m.startTick + m.durationTicks,
    ) ??
    null
  )
}

export function toggleMelodyRole(current: MelodyRole, want: 'pmn' | 'smn'): MelodyRole {
  return current === want ? 'unknown' : want
}

export function roleForTagNote(
  project: TagRollProject,
  melody: readonly MelodyEvent[],
  noteId: string,
): MelodyRole | null {
  const note = project.notes.find((n) => n.id === noteId)
  if (!note) return null
  const mid = melodyPartIdOf(project)
  if (!mid || note.partId !== mid) return null
  return findMelodyEventForNote(melody, note)?.role ?? null
}
