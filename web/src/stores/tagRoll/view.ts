/** View, mix, part, and measure actions for Tag Studio. */

import { lazyFn, type StoreDeps } from './deps'

import { toggleMelodyHandoff } from '../../lib/tagRoll/melodyPass'

import { ensureLengthForTick } from '../../lib/tagRoll/snap'

import { syncProjectMix } from '../../lib/tagRoll/mix'

import { measureTicks } from '../../lib/tagRoll/tempoMap'

import {
  canDeleteProjectMeasure,
  deleteProjectMeasure,
  extendProjectMeasures,
  insertProjectMeasure,
  shrinkProjectMeasures,
} from '../../lib/tagRoll/measureEdit'

import {
  applyMelodyRolesToTagNotes,
  melodyPartIdOf,
} from '../../lib/tagRoll/melodyNoteRoles'

import type { MelodyEvent } from '../../domain/arranging/types'

import type {
  TagRollClefFamily,
  TagRollEditorMode,
  TagRollPart,
  TagRollPartMix,
  TagRollPointerTool,
  TagRollScoreSurface,
  TagRollViewPrefs,
} from '../../lib/tagRoll/types'

import {
  TAG_ROLL_CELL_H_MAX,
  TAG_ROLL_CELL_H_MIN,
  TAG_ROLL_CELL_W_MAX,
  TAG_ROLL_CELL_W_MIN,
} from '../../lib/tagRoll/types'

import { usePreferencesStore } from '../preferences'

import { now, svc } from './runtime'

export function createTagRollViewActions(deps: StoreDeps) {

  const clearNoteSelection = lazyFn(() => deps.clearNoteSelection)
  const current = deps.current
  const patchProject = lazyFn(() => deps.patchProject)
  const patchView = lazyFn(() => deps.patchView)
  const persistNow = lazyFn(() => deps.persistNow)
  const pointerTool = deps.pointerTool
  const pushHistory = lazyFn(() => deps.pushHistory)
  const scheduleSave = lazyFn(() => deps.scheduleSave)
  const selectedExpressionId = deps.selectedExpressionId
  const selectedNoteIds = deps.selectedNoteIds
  const setExpressionTool = lazyFn(() => deps.setExpressionTool)
  const tupletTool = deps.tupletTool
  const updateNote = lazyFn(() => deps.updateNote)
  const withHistory = lazyFn(() => deps.withHistory)

  function setMode(mode: TagRollEditorMode): void {
    if (mode !== 'compose') clearNoteSelection()
    if (mode === 'view') setExpressionTool(null)
    patchView({ mode })
  }

  function setClefFamily(clefFamily: TagRollClefFamily): void {
    patchProject({ clefFamily: clefFamily === 'ssaa' ? 'ssaa' : 'ttbb' })
  }

  function setScoreSurface(scoreSurface: TagRollScoreSurface): void {
    patchView({ scoreSurface: scoreSurface === 'sheet' ? 'sheet' : 'roll' })
  }

  function setActivePart(partId: string): void {
    patchView({ activePartId: partId })
    const p = current.value
    if (p?.view.focusActivePart) {
      selectedNoteIds.value = selectedNoteIds.value.filter((id: any) => {
        const n = p.notes.find((x: any) => x.id === id)
        return !!n && n.partId === partId
      })
    }
  }

  /** Cycle active part forward (+1) or backward (−1) for quick stack entry. */
  function cycleActivePart(dir: 1 | -1 = 1): void {
    const p = current.value
    if (!p?.parts.length) return
    const parts = p.parts
    const cur = p.view.activePartId
    let i = parts.findIndex((x: any) => x.id === cur)
    if (i < 0) i = 0
    const next = parts[(i + dir + parts.length) % parts.length]
    if (next) setActivePart(next.id)
  }

  function setFocusActivePart(on: boolean): void {
    patchView({ focusActivePart: on })
    if (on) {
      const p = current.value
      const active = p?.view.activePartId
      if (p && active) {
        selectedNoteIds.value = selectedNoteIds.value.filter((id: any) => {
          const n = p.notes.find((x: any) => x.id === id)
          return !!n && n.partId === active
        })
      }
    }
  }

  function setScaleHighlight(on: boolean): void {
    patchView({ scaleHighlight: on })
  }

  function setShowNoteNames(on: boolean): void {
    patchView({ showNoteNames: on })
  }

  function setShowNoteLyrics(on: boolean): void {
    patchView({ showNoteLyrics: on })
  }

  function patchPartMix(
    partId: string,
    patch: Partial<Omit<TagRollPartMix, 'partId'>>,
    opts?: { history?: boolean },
  ): void {
    const p = current.value
    if (!p) return
    if (opts?.history !== false) pushHistory()
    const mix = syncProjectMix(p.parts, p.mix).map((m) =>
      m.partId === partId
        ? {
            ...m,
            ...(patch.volume != null ? { volume: Math.max(0, Math.min(1.5, patch.volume)) } : {}),
            ...(patch.pan != null ? { pan: Math.max(-1, Math.min(1, patch.pan)) } : {}),
            ...(patch.mute != null ? { mute: patch.mute } : {}),
            ...(patch.solo != null ? { solo: patch.solo } : {}),
          }
        : m,
    )
    current.value = { ...p, mix, updatedAt: now() }
    // Mute/solo must hit IndexedDB immediately — debounced save races with
    // navigate/refresh and used to reopen everything unmuted.
    if (patch.mute != null || patch.solo != null) void persistNow()
    else scheduleSave()
  }

  function clearMixSolos(): void {
    const p = current.value
    if (!p || !p.mix.some((m: any) => m.solo)) return
    pushHistory()
    current.value = {
      ...p,
      mix: syncProjectMix(p.parts, p.mix).map((m) => ({ ...m, solo: false })),
      updatedAt: now(),
    }
    void persistNow()
  }

  function setMelodyPart(partId: string): void {
    patchView({ melodyPartId: partId })
  }

  /** Melody moves to this note's part from here on. Press again on that note to undo. */
  function toggleMelodyHandoffAtNote(noteId: string): string | null {
    const p = current.value
    if (!p) return null
    const result = toggleMelodyHandoff(p, noteId)
    if (!result) return null
    if (result.changed) {
      pushHistory()
      current.value = {
        ...p,
        melodyPasses: result.passes,
        view: result.startingPartId
          ? { ...p.view, melodyPartId: result.startingPartId }
          : p.view,
        updatedAt: now(),
      }
      scheduleSave()
    }
    return result.message
  }

  function setRoleDisplay(roleDisplay: TagRollViewPrefs['roleDisplay']): void {
    patchView({ roleDisplay })
  }

  /** Persist Strong / Passing / clear on a Tag Roll note (document source of truth). */
  function setNoteRole(id: string, role: 'pmn' | 'smn' | 'unknown'): void {
    const p = current.value
    if (!p) return
    const note = p.notes.find((n: any) => n.id === id)
    if (!note) return
    const cur = note.role === 'pmn' || note.role === 'smn' ? note.role : 'unknown'
    if (cur === role) return
    pushHistory()
    const notes = p.notes.map((n: any) => {
      if (n.id !== id) return n
      if (role === 'unknown') {
        if (!n.role) return n
        const { role: _r, ...rest } = n
        return rest
      }
      return { ...n, role }
    })
    current.value = { ...p, notes, updatedAt: now() }
    scheduleSave()
  }

  /**
   * One-shot: copy Arrangement melody roles onto Tag Roll notes when the
   * project has none yet (Coach → Roles migration).
   */
  function importMelodyRolesFromArrangement(melody: readonly MelodyEvent[]): void {
    const p = current.value
    if (!p || !melody.length) return
    const mid = melodyPartIdOf(p)
    if (!mid) return
    if (p.notes.some((n: any) => n.partId === mid && (n.role === 'pmn' || n.role === 'smn'))) {
      return
    }
    if (!melody.some((m) => m.role === 'pmn' || m.role === 'smn')) return
    const notes = applyMelodyRolesToTagNotes(p, melody)
    if (notes === p.notes) return
    let changed = false
    for (let i = 0; i < notes.length; i++) {
      if (notes[i] !== p.notes[i]) {
        changed = true
        break
      }
    }
    if (!changed) return
    pushHistory()
    current.value = { ...p, notes, updatedAt: now() }
    scheduleSave()
  }

  function setCellSize(cellW: number, cellH: number): void {
    const w = Math.max(TAG_ROLL_CELL_W_MIN, Math.min(TAG_ROLL_CELL_W_MAX, cellW))
    const h = Math.max(TAG_ROLL_CELL_H_MIN, Math.min(TAG_ROLL_CELL_H_MAX, cellH))
    patchView({ cellW: w, cellH: h })
    usePreferencesStore().setTagRollCellSize(w, h)
  }

  function nudgeCellW(delta: number): void {
    const p = current.value
    if (!p) return
    // Floor is enforced by the active viewport on resize / wheel; still honor absolute min.
    setCellSize(p.view.cellW + delta, p.view.cellH)
  }

  function nudgeCellH(delta: number): void {
    const p = current.value
    if (!p) return
    setCellSize(p.view.cellW, p.view.cellH + delta)
  }

  function setLockPiano(on: boolean): void {
    patchView({ lockPiano: on })
  }

  function setScroll(scrollX: number, scrollY: number): void {
    patchView({
      scrollX: Math.max(0, scrollX),
      scrollY: Math.max(0, scrollY),
    })
  }

  /**
   * Grow the timeline so `tick` (plus trailing empty measures) fits.
   * Used for infinite right-scroll and sketch-only charts without notes.
   */
  function extendLengthToTick(tick: number, opts?: { history?: boolean; padMeasures?: number }): void {
    const p = current.value
    if (!p) return
    const next = ensureLengthForTick(
      p.lengthTicks,
      tick,
      measureTicks(p.timeSignature),
      opts?.padMeasures ?? 2,
    )
    if (next <= p.lengthTicks) return
    patchProject({ lengthTicks: next }, { history: opts?.history === true })
  }

  function setSheetScroll(sheetScrollX: number, sheetScrollY: number): void {
    patchView({
      sheetScrollX: Math.max(0, sheetScrollX),
      sheetScrollY: Math.max(0, sheetScrollY),
    })
  }

  function setPointerTool(tool: TagRollPointerTool): void {
    pointerTool.value = tool === 'pan' ? 'pan' : 'edit'
    // Pointer tools are mutually exclusive with the tuplet span tool.
    tupletTool.value = false
  }

  function addPart(name: string, color: string, hotkey?: string): void {
    const p = current.value
    if (!p) return
    pushHistory()
    const part: TagRollPart = {
      id: svc().idGen.next('trp'),
      name: name.trim() || 'Part',
      color,
      midiGroup: 'solo',
      ...(hotkey ? { hotkey } : {}),
    }
    current.value = {
      ...p,
      parts: [...p.parts, part],
      mix: syncProjectMix([...p.parts, part], p.mix),
      updatedAt: now(),
    }
    scheduleSave()
  }

  function updatePart(id: string, patch: Partial<TagRollPart>): void {
    const p = current.value
    if (!p) return
    pushHistory()
    current.value = {
      ...p,
      parts: p.parts.map((x: any) => {
        if (x.id !== id) return x
        const next = { ...x, ...patch }
        if ('hotkey' in patch) {
          const hk = patch.hotkey
          if (hk) next.hotkey = hk
          else delete next.hotkey
        }
        return next
      }),
      updatedAt: now(),
    }
    scheduleSave()
  }

  function removePart(id: string): void {
    const p = current.value
    if (!p || p.parts.length <= 1) return
    pushHistory()
    const parts = p.parts.filter((x: any) => x.id !== id)
    const notes = p.notes.filter((n: any) => n.partId !== id)
    const activePartId =
      p.view.activePartId === id ? parts[0]?.id ?? null : p.view.activePartId
    const melodyPartId =
      p.view.melodyPartId === id ? parts[0]?.id ?? null : p.view.melodyPartId
    const sheetLyricOffsets = { ...(p.view.sheetLyricOffsets ?? {}) }
    const sheetLyricPartVisible = { ...(p.view.sheetLyricPartVisible ?? {}) }
    delete sheetLyricOffsets[id]
    delete sheetLyricPartVisible[id]
    current.value = {
      ...p,
      parts,
      notes,
      mix: syncProjectMix(parts, p.mix),
      view: { ...p.view, activePartId, melodyPartId, sheetLyricOffsets, sheetLyricPartVisible },
      updatedAt: now(),
    }
    scheduleSave()
  }

  function setLyric(noteId: string, lyric: string | undefined): void {
    updateNote(noteId, { lyric: lyric || undefined })
  }

  function extendMeasures(count = 1): void {
    const p = current.value
    if (!p) return
    withHistory(() => {
      current.value = extendProjectMeasures(p, count)
      scheduleSave()
    })
  }

  function shrinkMeasures(count = 1): void {
    const p = current.value
    if (!p) return
    const m = measureTicks(p.timeSignature)
    if (p.lengthTicks <= m) return
    withHistory(() => {
      current.value = shrinkProjectMeasures(p, count)
      clearNoteSelection()
      selectedExpressionId.value = null
      scheduleSave()
    })
  }

  function insertMeasure(side: 'before' | 'after'): void {
    const p = current.value
    if (!p) return
    withHistory(() => {
      current.value = insertProjectMeasure(p, p.view.playheadTick, side)
      scheduleSave()
    })
  }

  function deleteMeasure(side: 'before' | 'after'): void {
    const p = current.value
    if (!p) return
    if (!canDeleteProjectMeasure(p, p.view.playheadTick, side)) return
    withHistory(() => {
      current.value = deleteProjectMeasure(p, p.view.playheadTick, side)
      clearNoteSelection()
      selectedExpressionId.value = null
      scheduleSave()
    })
  }

  function canShrinkMeasures(): boolean {
    const p = current.value
    if (!p) return false
    return p.lengthTicks > measureTicks(p.timeSignature)
  }

  function canDeleteMeasure(side: 'before' | 'after'): boolean {
    const p = current.value
    if (!p) return false
    return canDeleteProjectMeasure(p, p.view.playheadTick, side)
  }

  const actions = {
    setMode,
    setClefFamily,
    setScoreSurface,
    setActivePart,
    cycleActivePart,
    setFocusActivePart,
    setScaleHighlight,
    setShowNoteNames,
    setShowNoteLyrics,
    patchPartMix,
    clearMixSolos,
    setMelodyPart,
    toggleMelodyHandoffAtNote,
    setRoleDisplay,
    setNoteRole,
    importMelodyRolesFromArrangement,
    setCellSize,
    nudgeCellW,
    nudgeCellH,
    setLockPiano,
    setScroll,
    extendLengthToTick,
    setSheetScroll,
    setPointerTool,
    addPart,
    updatePart,
    removePart,
    setLyric,
    extendMeasures,
    shrinkMeasures,
    insertMeasure,
    deleteMeasure,
    canShrinkMeasures,
    canDeleteMeasure,
  }
  Object.assign(deps, actions)

  function bindWatches(): void {}

  return { actions, bindWatches }

}
