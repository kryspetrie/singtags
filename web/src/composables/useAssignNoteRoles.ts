/**
 * Assign Note Roles — navigate notes, toggle Strong/Passing, set Melody part.
 */
import { computed, type ComputedRef } from 'vue'
import {
  findMelodyEventForNote,
  melodyPartIdOf,
  roleForTagNote,
  toggleMelodyRole,
} from '../lib/tagRoll/melodyNoteRoles'
import {
  neighborNoteInStack,
  neighborNoteSamePart,
} from '../lib/tagRoll/noteSelectionNav'
import { natureToSketchQuality } from '../lib/tagRoll/harmonySketch'
import type { TagRollProject } from '../lib/tagRoll/types'
import type { ChordAnalysisSegment } from '../domain/arranging/chordAnalysisBar'
import { useArrangementStore } from '../stores/arrangement'
import { useSnackbarStore } from '../stores/snackbar'
import { useTagRollStore } from '../stores/tagRoll'

export function useAssignNoteRoles(opts: {
  project: ComputedRef<TagRollProject | null | undefined>
  arrangingEnabled: ComputedRef<boolean>
  auditionMidi: (midi: number) => void | Promise<void>
  chordEditSeg: ComputedRef<ChordAnalysisSegment | null>
  chordEditVariant: ComputedRef<'declared' | 'detected' | null>
  promoteToDeclared: (segId: string) => void
  syncSketchToCoachPillars: () => void
}) {
  const store = useTagRollStore()
  const arrStore = useArrangementStore()
  const snackbar = useSnackbarStore()

  function navigateSelectedNote(key: string): boolean {
    const p = opts.project.value
    const id = store.selectedNoteId
    if (!p || !id) return false
    const next =
      key === 'ArrowLeft'
        ? neighborNoteSamePart(p.notes, id, -1)
        : key === 'ArrowRight'
          ? neighborNoteSamePart(p.notes, id, 1)
          : key === 'ArrowUp'
            ? neighborNoteInStack(p.notes, id, 'up')
            : key === 'ArrowDown'
              ? neighborNoteInStack(p.notes, id, 'down')
              : null
    if (!next) return true
    store.selectNotes([next.id])
    store.setPlayheadTick(next.startTick, { snap: false })
    void opts.auditionMidi(next.midi)
    return true
  }

  function onToggleSelectedMelodyRole(want: 'pmn' | 'smn'): void {
    const p = opts.project.value
    const id = store.selectedNoteId
    if (!p || !id || !opts.arrangingEnabled.value) return
    const note = p.notes.find((n) => n.id === id)
    if (!note) return
    const mid = melodyPartIdOf(p)
    if (!mid || note.partId !== mid) {
      snackbar.show('Select a note on the Melody part (or press M)', {
        title: 'Note roles',
        tone: 'info',
        ms: 2500,
      })
      return
    }
    const mel = findMelodyEventForNote(arrStore.current?.melody ?? [], note)
    if (!mel) return
    arrStore.updateMelodyNote(mel.id, { role: toggleMelodyRole(mel.role, want) })
    arrStore.runQa()
  }

  function onAssignMelodyPart(): void {
    const p = opts.project.value
    const id = store.selectedNoteId
    if (!p || !id) return
    const note = p.notes.find((n) => n.id === id)
    if (!note) return
    store.setMelodyPart(note.partId)
    snackbar.show(
      `Melody: ${p.parts.find((x) => x.id === note.partId)?.name ?? 'part'}`,
      { title: 'Melody part', tone: 'ok', ms: 2000 },
    )
  }

  const noteRolesMap = computed(() => {
    const p = opts.project.value
    const melody = arrStore.current?.melody
    if (!p || !melody?.length) return null
    const mid = melodyPartIdOf(p)
    if (!mid) return null
    const map = new Map<string, 'pmn' | 'smn'>()
    for (const n of p.notes) {
      if (n.partId !== mid) continue
      const role = findMelodyEventForNote(melody, n)?.role
      if (role === 'pmn' || role === 'smn') map.set(n.id, role)
    }
    return map.size ? map : null
  })

  const assignRolesMelodyName = computed(() => {
    const p = opts.project.value
    if (!p) return null
    const mid = melodyPartIdOf(p)
    return p.parts.find((x) => x.id === mid)?.name ?? null
  })

  const assignRolesSelectedRole = computed(() => {
    const p = opts.project.value
    const id = store.selectedNoteId
    if (!p || !id) return null
    return roleForTagNote(p, arrStore.current?.melody ?? [], id)
  })

  function onToggleChordPillar(): void {
    const seg = opts.chordEditSeg.value
    if (!seg || seg.rootPc == null) return
    const quality = natureToSketchQuality(seg.quality ?? 'major')
    store.toggleSketchPillar({
      id: seg.id,
      startTick: seg.startTick,
      endTick: seg.endTick,
      rootPc: seg.rootPc,
      quality,
    })
    opts.syncSketchToCoachPillars()
    if (opts.chordEditVariant.value === 'detected') {
      opts.promoteToDeclared(seg.id)
    }
  }

  return {
    navigateSelectedNote,
    onToggleSelectedMelodyRole,
    onAssignMelodyPart,
    noteRolesMap,
    assignRolesMelodyName,
    assignRolesSelectedRole,
    onToggleChordPillar,
  }
}
