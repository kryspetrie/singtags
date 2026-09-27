/**
 * Map Tag Roll notes ↔ melody part / Strong–Passing roles (project source of truth).
 */
import type { MelodyEvent, MelodyRole } from '../../domain/arranging/types'
import type { TagRollMelodyRole, TagRollNote, TagRollProject } from './types'

export function melodyPartIdOf(project: TagRollProject): string | null {
  return (
    project.view.melodyPartId ??
    project.parts.find((p) => p.name === 'Lead')?.id ??
    project.parts[0]?.id ??
    null
  )
}

export function noteRoleOf(note: TagRollNote): TagRollMelodyRole {
  return note.role === 'pmn' || note.role === 'smn' ? note.role : 'unknown'
}

export function toggleMelodyRole(
  current: MelodyRole | TagRollMelodyRole,
  want: 'pmn' | 'smn',
): TagRollMelodyRole {
  return current === want ? 'unknown' : want
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

export function roleForTagNote(project: TagRollProject, noteId: string): TagRollMelodyRole | null {
  const note = project.notes.find((n) => n.id === noteId)
  if (!note) return null
  const mid = melodyPartIdOf(project)
  if (!mid || note.partId !== mid) return null
  return noteRoleOf(note)
}

/** Build note-id → role map for piano-roll chrome (melody part only). */
export function noteRolesMapFromProject(
  project: TagRollProject,
): Map<string, 'pmn' | 'smn'> | null {
  const mid = melodyPartIdOf(project)
  if (!mid) return null
  const map = new Map<string, 'pmn' | 'smn'>()
  for (const n of project.notes) {
    if (n.partId !== mid) continue
    if (n.role === 'pmn' || n.role === 'smn') map.set(n.id, n.role)
  }
  return map.size ? map : null
}

/**
 * Apply arrangement melody roles onto Tag Roll notes (by tick+midi on melody part).
 * Used when migrating Coach-session roles into the project document.
 */
export function applyMelodyRolesToTagNotes(
  project: TagRollProject,
  melody: readonly MelodyEvent[],
): TagRollNote[] {
  const mid = melodyPartIdOf(project)
  if (!mid || !melody.length) return project.notes
  return project.notes.map((n) => {
    if (n.partId !== mid) return n.role ? { ...n, role: undefined } : n
    const mel = findMelodyEventForNote(melody, n)
    if (!mel) return n
    if (mel.role === 'pmn' || mel.role === 'smn') {
      return n.role === mel.role ? n : { ...n, role: mel.role }
    }
    if (!n.role) return n
    const { role: _drop, ...rest } = n
    return rest
  })
}
