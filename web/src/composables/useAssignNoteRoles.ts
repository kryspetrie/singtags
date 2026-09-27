/**
 * Assign Note Roles — navigate notes, toggle Strong/Passing, set Melody part.
 * Roles persist on Tag Roll notes; Arrangement is mirrored when linked.
 */
import { computed, type ComputedRef } from 'vue'
import {
  findMelodyEventForNote,
  melodyPartIdOf,
  noteRolesMapFromProject,
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

  function mirrorRoleToArrangement(noteId: string, role: 'pmn' | 'smn' | 'unknown'): void {
    if (!opts.arrangingEnabled.value) return
    const p = opts.project.value
    const note = p?.notes.find((n) => n.id === noteId)
    if (!p || !note || !arrStore.current) return
    const linkId = `arr_${p.id}`
    if (arrStore.current.id !== linkId) return
    const mel = findMelodyEventForNote(arrStore.current.melody, note)
    if (!mel) return
    arrStore.updateMelodyNote(mel.id, { role }, { recordHistory: false })
    arrStore.runQa()
  }

  function onToggleSelectedMelodyRole(want: 'pmn' | 'smn'): void {
    const p = opts.project.value
    const id = store.selectedNoteId
    if (!p || !id) return
    const note = p.notes.find((n) => n.id === id)
    if (!note) return
    const mid = melodyPartIdOf(p)
    if (!mid || note.partId !== mid) {
      snackbar.show('Select a note on the Melody part (or press M)', {
        title: 'Melody roles',
        tone: 'info',
        ms: 2500,
      })
      return
    }
    const next = toggleMelodyRole(note.role ?? 'unknown', want)
    store.setNoteRole(id, next)
    mirrorRoleToArrangement(id, next)
  }

  function onAssignMelodyPart(): void {
    const p = opts.project.value
    const id = store.selectedNoteId
    if (!p || !id) return
    const note = p.notes.find((n) => n.id === id)
    if (!note) return
    store.setMelodyPart(note.partId)
    if (p.view.roleDisplay === 'off') store.setRoleDisplay('melody')
    snackbar.show(
      `Melody: ${p.parts.find((x) => x.id === note.partId)?.name ?? 'part'}`,
      { title: 'Melody part', tone: 'ok', ms: 2000 },
    )
  }

  /** Always available; viewport paints roles only when Marks filter allows. */
  const noteRolesMap = computed(() => {
    const p = opts.project.value
    if (!p) return null
    return noteRolesMapFromProject(p)
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
    return roleForTagNote(p, id)
  })

  function togglePillarForSeg(
    seg: ChordAnalysisSegment,
    optsExtra?: { promoteDetected?: boolean },
  ): void {
    if (seg.rootPc == null) return
    const quality = natureToSketchQuality(seg.quality ?? 'major')
    store.toggleSketchPillar({
      id: seg.id,
      startTick: seg.startTick,
      endTick: seg.endTick,
      rootPc: seg.rootPc,
      quality,
    })
    opts.syncSketchToCoachPillars()
    if (optsExtra?.promoteDetected) opts.promoteToDeclared(seg.id)
  }

  function onToggleChordPillar(): void {
    const seg = opts.chordEditSeg.value
    if (!seg) return
    togglePillarForSeg(seg, {
      promoteDetected: opts.chordEditVariant.value === 'detected',
    })
  }

  /** Sketch-lane Alt+click / badge — toggle pillar without requiring the dock. */
  function onToggleLanePillar(seg: ChordAnalysisSegment): void {
    togglePillarForSeg(seg)
  }

  /**
   * Detected-lane Alt+click / badge — lock that hole into Sketch as a pillar
   * (no need to open Sketch first).
   */
  function onToggleDetectedPillar(seg: ChordAnalysisSegment): void {
    togglePillarForSeg(seg, { promoteDetected: true })
  }

  return {
    navigateSelectedNote,
    onToggleSelectedMelodyRole,
    onAssignMelodyPart,
    noteRolesMap,
    assignRolesMelodyName,
    assignRolesSelectedRole,
    onToggleChordPillar,
    onToggleLanePillar,
    onToggleDetectedPillar,
  }
}
