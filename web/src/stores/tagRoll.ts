/**
 * Tag Studio projects — list, open, create, save, note CRUD, undo/redo.
 */
import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import { newLocalId } from '../offline/localLibraryDb'
import {
  applyDocumentSnapshot,
  captureDocumentSnapshot,
  pushUndoStack,
  type TagRollDocumentSnapshot,
} from '../lib/tagRoll/history'
import {
  createEmptyTagRollProject,
  normalizeTagRollProject,
} from '../lib/tagRoll/normalize'
import { ensureLengthForNote, snapTick } from '../lib/tagRoll/snap'
import { normalizeSoundEnvelope } from '../lib/tagRoll/soundEnvelope'
import { applyHarmonyToNotes } from '../lib/tagRoll/harmonizer/applyHarmony'
import { syncProjectMix } from '../lib/tagRoll/mix'
import {
  clipboardToNotesAt,
  notesToClipboard,
  type ClipboardNote,
} from '../lib/tagRoll/selection'
import { measureTicks, upsertRampEndMarker } from '../lib/tagRoll/tempoMap'
import {
  extendProjectMeasures,
  insertProjectMeasure,
  shrinkProjectMeasures,
} from '../lib/tagRoll/measureEdit'
import type {
  TagRollClefFamily,
  TagRollEditorMode,
  TagRollExpression,
  TagRollExpressionTool,
  TagRollNote,
  TagRollPart,
  TagRollPartMix,
  TagRollPointerTool,
  TagRollProject,
  TagRollScoreSurface,
  TagRollTempoMarker,
  TagRollTimeSignature,
  TagRollViewPrefs,
} from '../lib/tagRoll/types'
import {
  TAG_ROLL_CELL_H_MAX,
  TAG_ROLL_CELL_H_MIN,
  TAG_ROLL_CELL_W_MAX,
  TAG_ROLL_CELL_W_MIN,
  TAG_ROLL_DEFAULT_SNAP_TICKS,
  TAG_ROLL_MIDI_MAX,
  TAG_ROLL_MIDI_MIN,
  TAG_ROLL_PPQ,
  TAG_ROLL_SHEET_ZOOM_MAX,
  TAG_ROLL_SHEET_ZOOM_MIN,
} from '../lib/tagRoll/types'
import { createTagRollDefaultProjects } from '../lib/tagRoll/seedDefaultProjects'
import {
  deleteTagRollProject,
  getTagRollHistory,
  getTagRollProject,
  listTagRollProjects,
  putTagRollHistory,
  putTagRollProject,
  type TagRollProjectSummary,
} from '../offline/tagRollDb'
import { usePreferencesStore } from './preferences'

export const useTagRollStore = defineStore('tagRoll', () => {
  const summaries = ref<TagRollProjectSummary[]>([])
  const current = shallowRef<TagRollProject | null>(null)
  const loaded = ref(false)
  const busy = ref(false)
  const error = ref<string | null>(null)
  const selectedNoteIds = ref<string[]>([])
  const selectedExpressionId = ref<string | null>(null)
  const expressionTool = ref<TagRollExpressionTool>(null)
  const pointerTool = ref<TagRollPointerTool>('edit')
  const addDurationTicks = ref(TAG_ROLL_PPQ)
  const transportPlaying = ref(false)
  const noteClipboard = shallowRef<ClipboardNote[] | null>(null)
  const undoStack = ref<TagRollDocumentSnapshot[]>([])
  const redoStack = ref<TagRollDocumentSnapshot[]>([])
  const canUndo = computed(() => undoStack.value.length > 0)
  const canRedo = computed(() => redoStack.value.length > 0)

  let saveTimer: ReturnType<typeof setTimeout> | null = null
  let historyTimer: ReturnType<typeof setTimeout> | null = null
  let historySuspended = false

  const notesByPartId = computed(() => {
    const p = current.value
    const map = new Map<string, TagRollNote[]>()
    if (!p) return map
    for (const part of p.parts) map.set(part.id, [])
    for (const n of p.notes) {
      const list = map.get(n.partId)
      if (list) list.push(n)
      else map.set(n.partId, [n])
    }
    return map
  })

  /** Primary selection (last id) — duration strip / lyrics still use one note. */
  const selectedNoteId = computed(() => {
    const ids = selectedNoteIds.value
    return ids.length ? ids[ids.length - 1]! : null
  })

  const selectedNote = computed(() => {
    const id = selectedNoteId.value
    if (!id || !current.value) return null
    return current.value.notes.find((n) => n.id === id) ?? null
  })

  const selectedNotes = computed(() => {
    const p = current.value
    if (!p || !selectedNoteIds.value.length) return [] as TagRollNote[]
    const set = new Set(selectedNoteIds.value)
    return p.notes.filter((n) => set.has(n.id))
  })

  function clearNoteSelection(): void {
    selectedNoteIds.value = []
  }

  function scheduleHistoryPersist(): void {
    const p = current.value
    if (!p) return
    if (historyTimer) clearTimeout(historyTimer)
    historyTimer = setTimeout(() => {
      historyTimer = null
      void putTagRollHistory({
        projectId: p.id,
        undo: undoStack.value,
        redo: redoStack.value,
        updatedAt: Date.now(),
      }).catch(() => {
        /* ignore history persist errors */
      })
    }, 350)
  }

  function pushHistory(): void {
    const p = current.value
    if (!p || historySuspended) return
    undoStack.value = pushUndoStack(undoStack.value, captureDocumentSnapshot(p))
    redoStack.value = []
    scheduleHistoryPersist()
  }

  function withHistory(fn: () => void): void {
    pushHistory()
    fn()
  }

  async function refreshList(): Promise<void> {
    try {
      let list = await listTagRollProjects()
      if (!list.length) {
        const seeded = createTagRollDefaultProjects()
        for (const p of seeded) {
          await putTagRollProject(p)
          await putTagRollHistory({
            projectId: p.id,
            undo: [],
            redo: [],
            updatedAt: p.updatedAt,
          })
        }
        if (seeded.length) list = await listTagRollProjects()
      }
      summaries.value = list
      loaded.value = true
      error.value = null
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load Tag Studio projects'
      loaded.value = true
    }
  }

  async function openProject(id: string): Promise<TagRollProject | null> {
    busy.value = true
    try {
      const p = await getTagRollProject(id)
      current.value = p
      clearNoteSelection()
      selectedExpressionId.value = null
      expressionTool.value = null
      undoStack.value = []
      redoStack.value = []
      if (p) {
        const hist = await getTagRollHistory(p.id)
        undoStack.value = hist.undo
        redoStack.value = hist.redo
      }
      error.value = null
      return p
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to open project'
      current.value = null
      return null
    } finally {
      busy.value = false
    }
  }

  async function createProject(title?: string): Promise<TagRollProject> {
    try {
      const prefs = usePreferencesStore()
      const p = createEmptyTagRollProject({ title })
      const cellW = Math.max(
        TAG_ROLL_CELL_W_MIN,
        Math.min(TAG_ROLL_CELL_W_MAX, Math.round(prefs.tagRollCellW)),
      )
      const cellH = Math.max(
        TAG_ROLL_CELL_H_MIN,
        Math.min(TAG_ROLL_CELL_H_MAX, Math.round(prefs.tagRollCellH)),
      )
      p.view.cellW = cellW
      p.view.cellH = cellH
      p.view.scrollY = (TAG_ROLL_MIDI_MAX - 60) * cellH
      await putTagRollProject(p)
      await putTagRollHistory({
        projectId: p.id,
        undo: [],
        redo: [],
        updatedAt: Date.now(),
      })
      current.value = p
      clearNoteSelection()
      selectedExpressionId.value = null
      expressionTool.value = null
      undoStack.value = []
      redoStack.value = []
      await refreshList()
      return p
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to create project'
      throw e
    }
  }

  function scheduleSave(): void {
    if (!current.value) return
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      saveTimer = null
      void persistNow()
    }, 400)
  }

  async function persistNow(): Promise<void> {
    const p = current.value
    if (!p) return
    try {
      const next = { ...p, updatedAt: Date.now() }
      await putTagRollProject(next)
      current.value = normalizeTagRollProject(next)
      await refreshList()
      error.value = null
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to save project'
    }
  }

  function patchProject(patch: Partial<TagRollProject>, opts?: { history?: boolean }): void {
    const p = current.value
    if (!p) return
    if (opts?.history !== false) {
      const musicalKeys: (keyof TagRollProject)[] = [
        'title',
        'bpm',
        'snapTicks',
        'lengthTicks',
        'timeSignature',
        'tempoMarkers',
        'expressions',
        'soundEngine',
        'pitchPipeSoundId',
        'blowPitchEnabled',
        'metronomeEnabled',
        'soundEnvelope',
        'tonality',
        'preferFlats',
        'clefFamily',
        'parts',
        'notes',
        'localEntryId',
      ]
      const touchesMusic = musicalKeys.some((k) => k in patch)
      if (touchesMusic) pushHistory()
    }
    current.value = { ...p, ...patch, updatedAt: Date.now() }
    scheduleSave()
  }

  function patchView(patch: Partial<TagRollViewPrefs>): void {
    const p = current.value
    if (!p) return
    current.value = {
      ...p,
      view: { ...p.view, ...patch },
      updatedAt: Date.now(),
    }
    scheduleSave()
  }

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
      selectedNoteIds.value = selectedNoteIds.value.filter((id) => {
        const n = p.notes.find((x) => x.id === id)
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
    let i = parts.findIndex((x) => x.id === cur)
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
        selectedNoteIds.value = selectedNoteIds.value.filter((id) => {
          const n = p.notes.find((x) => x.id === id)
          return !!n && n.partId === active
        })
      }
    }
  }

  function setScaleHighlight(on: boolean): void {
    patchView({ scaleHighlight: on })
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
    current.value = { ...p, mix, updatedAt: Date.now() }
    scheduleSave()
  }

  function clearMixSolos(): void {
    const p = current.value
    if (!p || !p.mix.some((m) => m.solo)) return
    pushHistory()
    current.value = {
      ...p,
      mix: p.mix.map((m) => ({ ...m, solo: false })),
      updatedAt: Date.now(),
    }
    scheduleSave()
  }

  function setMelodyPart(partId: string): void {
    patchView({ melodyPartId: partId })
  }

  function setCellSize(cellW: number, cellH: number): void {
    const w = Math.max(TAG_ROLL_CELL_W_MIN, Math.min(TAG_ROLL_CELL_W_MAX, cellW))
    const h = Math.max(TAG_ROLL_CELL_H_MIN, Math.min(TAG_ROLL_CELL_H_MAX, cellH))
    patchView({ cellW: w, cellH: h })
    usePreferencesStore().setTagRollCellSize(w, h)
  }

  function setSheetZoom(sheetZoom: number): void {
    const z = Math.max(
      TAG_ROLL_SHEET_ZOOM_MIN,
      Math.min(TAG_ROLL_SHEET_ZOOM_MAX, Math.round(sheetZoom)),
    )
    patchView({ sheetZoom: z })
  }

  function setSheetShowLyrics(on: boolean): void {
    patchView({ sheetShowLyrics: on })
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

  function setSheetScroll(sheetScrollX: number, sheetScrollY: number): void {
    patchView({
      sheetScrollX: Math.max(0, sheetScrollX),
      sheetScrollY: Math.max(0, sheetScrollY),
    })
  }

  function setPlayheadTick(tick: number, opts?: { snap?: boolean }): void {
    const p = current.value
    const max = p?.lengthTicks ?? 0
    let next = Math.max(0, Math.min(max, tick))
    if (opts?.snap !== false && p) {
      const grid = p.snapTicks || TAG_ROLL_DEFAULT_SNAP_TICKS
      next = Math.max(0, Math.min(max, snapTick(next, grid)))
    } else {
      next = Math.round(next)
    }
    patchView({ playheadTick: next })
  }

  function setBpm(bpm: number): void {
    const p = current.value
    if (!p) return
    const next = Math.max(20, Math.min(320, Math.round(bpm)))
    pushHistory()
    const markers = [...p.tempoMarkers]
    const zeroIdx = markers.findIndex((m) => m.tick === 0)
    if (zeroIdx >= 0) {
      markers[zeroIdx] = { ...markers[zeroIdx]!, bpm: next }
    } else {
      markers.unshift({ id: newLocalId('trt'), tick: 0, bpm: next })
    }
    current.value = {
      ...p,
      bpm: next,
      tempoMarkers: markers,
      updatedAt: Date.now(),
    }
    scheduleSave()
  }

  function setSnapTicks(snapTicks: number): void {
    patchProject({ snapTicks: Math.max(1, Math.round(snapTicks)) })
  }

  function setTimeSignature(ts: TagRollTimeSignature): void {
    patchProject({
      timeSignature: {
        numerator: Math.max(1, Math.min(16, Math.round(ts.numerator))),
        denominator: ts.denominator,
      },
    })
  }

  function setTempoAtTick(tick: number, bpm: number): void {
    const p = current.value
    if (!p) return
    pushHistory()
    const snapped = snapTick(tick, p.snapTicks)
    const nextBpm = Math.max(20, Math.min(320, Math.round(bpm)))
    const markers = p.tempoMarkers.filter((m) => m.tick !== snapped)
    markers.push({ id: newLocalId('trt'), tick: snapped, bpm: nextBpm })
    markers.sort((a, b) => a.tick - b.tick)
    current.value = {
      ...p,
      bpm: snapped === 0 ? nextBpm : p.bpm,
      tempoMarkers: markers,
      updatedAt: Date.now(),
    }
    scheduleSave()
  }

  function updateTempoMarker(
    id: string,
    patch: Partial<TagRollTempoMarker>,
    opts?: { history?: boolean },
  ): void {
    const p = current.value
    if (!p) return
    if (opts?.history !== false) pushHistory()
    const tempoMarkers = p.tempoMarkers.map((m) => {
      if (m.id !== id) return m
      return {
        ...m,
        ...patch,
        tick: Math.max(0, Math.round(patch.tick ?? m.tick)),
        bpm: Math.max(20, Math.min(320, Math.round(patch.bpm ?? m.bpm))),
      }
    })
    tempoMarkers.sort((a, b) => a.tick - b.tick)
    const zero = tempoMarkers.find((m) => m.tick === 0)
    current.value = {
      ...p,
      tempoMarkers,
      bpm: zero?.bpm ?? p.bpm,
      updatedAt: Date.now(),
    }
    scheduleSave()
  }

  function updateTempoMarkerLive(id: string, patch: Partial<TagRollTempoMarker>): void {
    updateTempoMarker(id, patch, { history: false })
  }

  function deleteTempoMarker(id: string): void {
    const p = current.value
    if (!p) return
    const target = p.tempoMarkers.find((m) => m.id === id)
    if (!target || target.tick === 0) return
    pushHistory()
    current.value = {
      ...p,
      tempoMarkers: p.tempoMarkers.filter((m) => m.id !== id),
      updatedAt: Date.now(),
    }
    if (selectedExpressionId.value === id) selectedExpressionId.value = null
    scheduleSave()
  }

  function syncMarkersForExpressions(
    markers: TagRollTempoMarker[],
    expressions: TagRollExpression[],
  ): TagRollTempoMarker[] {
    // Drop prior ramp sticky markers, then re-apply from current expressions.
    let next = markers.filter((m) => !m.id.startsWith('trt-ramp-'))
    for (const e of expressions) {
      if (e.kind === 'rit' || e.kind === 'accel') {
        next = upsertRampEndMarker(next, e)
      }
    }
    return next
  }

  function addExpression(expr: TagRollExpression): void {
    const p = current.value
    if (!p) return
    pushHistory()
    const expressions = [...p.expressions, expr]
    const tempoMarkers = syncMarkersForExpressions(p.tempoMarkers, expressions)
    const zero = tempoMarkers.find((m) => m.tick === 0)
    current.value = {
      ...p,
      expressions,
      tempoMarkers,
      bpm: zero?.bpm ?? p.bpm,
      updatedAt: Date.now(),
    }
    selectedExpressionId.value = expr.id
    clearNoteSelection()
    scheduleSave()
  }

  function updateExpression(
    id: string,
    patch: Partial<TagRollExpression>,
    opts?: { history?: boolean },
  ): void {
    const p = current.value
    if (!p) return
    if (opts?.history !== false) pushHistory()
    const expressions = p.expressions.map((e) => {
      if (e.id !== id) return e
      return { ...e, ...patch } as TagRollExpression
    })
    const tempoMarkers = syncMarkersForExpressions(p.tempoMarkers, expressions)
    const zero = tempoMarkers.find((m) => m.tick === 0)
    current.value = {
      ...p,
      expressions,
      tempoMarkers,
      bpm: zero?.bpm ?? p.bpm,
      updatedAt: Date.now(),
    }
    scheduleSave()
  }

  function updateExpressionLive(id: string, patch: Partial<TagRollExpression>): void {
    updateExpression(id, patch, { history: false })
  }

  function deleteExpression(id: string): void {
    const p = current.value
    if (!p) return
    pushHistory()
    const expressions = p.expressions.filter((e) => e.id !== id)
    const tempoMarkers = syncMarkersForExpressions(p.tempoMarkers, expressions)
    const zero = tempoMarkers.find((m) => m.tick === 0)
    current.value = {
      ...p,
      expressions,
      tempoMarkers,
      bpm: zero?.bpm ?? p.bpm,
      updatedAt: Date.now(),
    }
    if (selectedExpressionId.value === id) selectedExpressionId.value = null
    scheduleSave()
  }

  function selectExpression(id: string | null): void {
    selectedExpressionId.value = id
    if (id) clearNoteSelection()
  }

  function setExpressionTool(tool: TagRollExpressionTool): void {
    expressionTool.value = tool
  }

  function setPointerTool(tool: TagRollPointerTool): void {
    pointerTool.value = tool === 'pan' ? 'pan' : 'edit'
  }

  function setSoundEngine(soundEngine: TagRollProject['soundEngine']): void {
    patchProject({ soundEngine })
  }

  function setPitchPipeSoundId(pitchPipeSoundId: string): void {
    const id = pitchPipeSoundId.trim().slice(0, 64) || 'mellow'
    patchProject({ pitchPipeSoundId: id })
  }

  function setBlowPitchEnabled(blowPitchEnabled: boolean): void {
    patchProject({ blowPitchEnabled: !!blowPitchEnabled })
  }

  function setMetronomeEnabled(metronomeEnabled: boolean): void {
    patchProject({ metronomeEnabled: !!metronomeEnabled })
  }

  function setTonality(tonality: number, preferFlats?: boolean): void {
    const pc = ((Math.round(tonality) % 12) + 12) % 12
    const patch: Partial<TagRollProject> = { tonality: pc }
    if (preferFlats != null) patch.preferFlats = preferFlats
    patchProject(patch)
  }

  function setSoundEnvelope(patch: Partial<TagRollProject['soundEnvelope']>): void {
    const p = current.value
    if (!p) return
    patchProject({
      soundEnvelope: normalizeSoundEnvelope({
        attackSec: patch.attackSec ?? p.soundEnvelope.attackSec,
        decaySec: patch.decaySec ?? p.soundEnvelope.decaySec,
        phraseDecaySec: patch.phraseDecaySec ?? p.soundEnvelope.phraseDecaySec,
      }),
    })
  }

  function addNote(partial: {
    midi: number
    startTick: number
    durationTicks?: number
    partId?: string
  }): TagRollNote | null {
    const p = current.value
    if (!p) return null
    const partId = partial.partId ?? p.view.activePartId ?? p.parts[0]?.id
    if (!partId) return null
    pushHistory()
    const snap = p.snapTicks || TAG_ROLL_DEFAULT_SNAP_TICKS
    const startTick = snapTick(partial.startTick, snap)
    const durationTicks = Math.max(
      snap,
      partial.durationTicks ?? addDurationTicks.value,
    )
    const midi = Math.max(TAG_ROLL_MIDI_MIN, Math.min(TAG_ROLL_MIDI_MAX, Math.round(partial.midi)))
    const note: TagRollNote = {
      id: newLocalId('trn'),
      partId,
      midi,
      startTick,
      durationTicks,
    }
    const lengthTicks = ensureLengthForNote(
      p.lengthTicks,
      startTick,
      durationTicks,
      measureTicks(p.timeSignature),
    )
    current.value = {
      ...p,
      notes: [...p.notes, note],
      lengthTicks,
      view: { ...p.view, mode: 'compose' },
      updatedAt: Date.now(),
    }
    selectNote(note.id)
    selectedExpressionId.value = null
    scheduleSave()
    return note
  }

  function updateNote(
    id: string,
    patch: Partial<TagRollNote>,
    opts?: { history?: boolean },
  ): void {
    const p = current.value
    if (!p) return
    if (opts?.history !== false) pushHistory()
    const notes = p.notes.map((n) => {
      if (n.id !== id) return n
      const next = { ...n, ...patch }
      next.midi = Math.max(TAG_ROLL_MIDI_MIN, Math.min(TAG_ROLL_MIDI_MAX, Math.round(next.midi)))
      next.startTick = Math.max(0, Math.round(next.startTick))
      next.durationTicks = Math.max(1, Math.round(next.durationTicks))
      return next
    })
    const hit = notes.find((n) => n.id === id)
    const lengthTicks = hit
      ? ensureLengthForNote(
          p.lengthTicks,
          hit.startTick,
          hit.durationTicks,
          measureTicks(p.timeSignature),
        )
      : p.lengthTicks
    current.value = { ...p, notes, lengthTicks, updatedAt: Date.now() }
    scheduleSave()
  }

  /** Live drag updates — one history entry should already be pushed at gesture start. */
  function updateNoteLive(id: string, patch: Partial<TagRollNote>): void {
    updateNote(id, patch, { history: false })
  }

  /** Apply several note patches in one write (group drag). */
  function updateNotesLive(
    updates: ReadonlyArray<{ id: string; midi?: number; startTick?: number; durationTicks?: number }>,
  ): void {
    const p = current.value
    if (!p || !updates.length) return
    const byId = new Map(updates.map((u) => [u.id, u]))
    let lengthTicks = p.lengthTicks
    const mTicks = measureTicks(p.timeSignature)
    const notes = p.notes.map((n) => {
      const u = byId.get(n.id)
      if (!u) return n
      const next = { ...n }
      if (u.midi != null) {
        next.midi = Math.max(TAG_ROLL_MIDI_MIN, Math.min(TAG_ROLL_MIDI_MAX, Math.round(u.midi)))
      }
      if (u.startTick != null) next.startTick = Math.max(0, Math.round(u.startTick))
      if (u.durationTicks != null) next.durationTicks = Math.max(1, Math.round(u.durationTicks))
      lengthTicks = ensureLengthForNote(lengthTicks, next.startTick, next.durationTicks, mTicks)
      return next
    })
    current.value = { ...p, notes, lengthTicks, updatedAt: Date.now() }
    scheduleSave()
  }

  /** History checkpoint for note or expression lane drags. */
  function pushHistoryCheckpoint(): void {
    pushHistory()
  }

  /** @deprecated Prefer pushHistoryCheckpoint */
  function beginNoteGesture(): void {
    pushHistoryCheckpoint()
  }

  function deleteNote(id: string): void {
    deleteNotes([id])
  }

  function deleteNotes(ids: readonly string[]): void {
    const p = current.value
    if (!p || !ids.length) return
    const remove = new Set(ids)
    pushHistory()
    current.value = {
      ...p,
      notes: p.notes.filter((n) => !remove.has(n.id)),
      updatedAt: Date.now(),
    }
    selectedNoteIds.value = selectedNoteIds.value.filter((id) => !remove.has(id))
    scheduleSave()
  }

  function deleteSelectedNotes(): void {
    if (!selectedNoteIds.value.length) return
    deleteNotes(selectedNoteIds.value)
  }

  function selectNote(
    id: string | null,
    opts?: { additive?: boolean },
  ): void {
    if (id == null) {
      clearNoteSelection()
      return
    }
    if (opts?.additive) {
      if (selectedNoteIds.value.includes(id)) {
        selectedNoteIds.value = selectedNoteIds.value.filter((x) => x !== id)
      } else {
        selectedNoteIds.value = [...selectedNoteIds.value, id]
      }
    } else {
      selectedNoteIds.value = [id]
    }
    selectedExpressionId.value = null
    const p = current.value
    if (!p) return
    if (p.view.mode === 'view') {
      patchView({ mode: 'compose' })
      return
    }
    // Lyrics: clicking a note adopts that part so the lyric strip follows.
    if (p.view.mode === 'lyrics') {
      const note = p.notes.find((n) => n.id === id)
      if (note && note.partId !== p.view.activePartId) {
        patchView({ activePartId: note.partId })
      }
    }
  }

  function selectNotes(ids: readonly string[], opts?: { additive?: boolean }): void {
    const unique = [...new Set(ids)]
    if (opts?.additive && selectedNoteIds.value.length) {
      const set = new Set(selectedNoteIds.value)
      for (const id of unique) set.add(id)
      selectedNoteIds.value = [...set]
    } else {
      selectedNoteIds.value = unique
    }
    if (unique.length) {
      selectedExpressionId.value = null
      if (current.value && current.value.view.mode === 'view') {
        patchView({ mode: 'compose' })
      }
    }
  }

  function copySelectedNotes(): boolean {
    const notes = selectedNotes.value
    if (!notes.length) return false
    noteClipboard.value = notesToClipboard(notes)
    return true
  }

  function pasteNotesAtPlayhead(): boolean {
    const p = current.value
    const clip = noteClipboard.value
    if (!p || !clip?.length) return false
    const partIds = new Set(p.parts.map((x) => x.id))
    const active = p.view.activePartId ?? p.parts[0]?.id
    const mapped = clip.map((c) => ({
      ...c,
      partId: partIds.has(c.partId) ? c.partId : (active ?? c.partId),
    }))
    pushHistory()
    const created = clipboardToNotesAt(mapped, p.view.playheadTick, () => newLocalId('trn'))
    let lengthTicks = p.lengthTicks
    const mTicks = measureTicks(p.timeSignature)
    for (const n of created) {
      lengthTicks = ensureLengthForNote(lengthTicks, n.startTick, n.durationTicks, mTicks)
    }
    current.value = {
      ...p,
      notes: [...p.notes, ...created],
      lengthTicks,
      view: { ...p.view, mode: 'compose' },
      updatedAt: Date.now(),
    }
    selectedNoteIds.value = created.map((n) => n.id)
    selectedExpressionId.value = null
    scheduleSave()
    return true
  }

  /**
   * Upsert harmony notes for every non-melody part in the stack.
   * Places at the melody note under the cursor (same start + duration).
   * Existing notes are moved into the stack; notes spanning the insert are broken.
   */
  function upsertHarmonyNotes(opts: {
    melodyNoteId: string
    pitches: { tenor: number; bari: number; bass: number; lead: number }
  }): void {
    const p = current.value
    if (!p) return
    const melody = p.notes.find((n) => n.id === opts.melodyNoteId)
    if (!melody) return
    pushHistory()
    const notes = applyHarmonyToNotes({
      notes: p.notes,
      parts: p.parts,
      melody,
      pitches: opts.pitches,
    })
    current.value = { ...p, notes, updatedAt: Date.now() }
    scheduleSave()
  }

  function addPart(name: string, color: string, hotkey?: string): void {
    const p = current.value
    if (!p) return
    pushHistory()
    const part: TagRollPart = {
      id: newLocalId('trp'),
      name: name.trim() || 'Part',
      color,
      midiGroup: 'solo',
      ...(hotkey ? { hotkey } : {}),
    }
    current.value = {
      ...p,
      parts: [...p.parts, part],
      mix: syncProjectMix([...p.parts, part], p.mix),
      updatedAt: Date.now(),
    }
    scheduleSave()
  }

  function updatePart(id: string, patch: Partial<TagRollPart>): void {
    const p = current.value
    if (!p) return
    pushHistory()
    current.value = {
      ...p,
      parts: p.parts.map((x) => {
        if (x.id !== id) return x
        const next = { ...x, ...patch }
        if ('hotkey' in patch) {
          const hk = patch.hotkey
          if (hk) next.hotkey = hk
          else delete next.hotkey
        }
        return next
      }),
      updatedAt: Date.now(),
    }
    scheduleSave()
  }

  function removePart(id: string): void {
    const p = current.value
    if (!p || p.parts.length <= 1) return
    pushHistory()
    const parts = p.parts.filter((x) => x.id !== id)
    const notes = p.notes.filter((n) => n.partId !== id)
    const activePartId =
      p.view.activePartId === id ? parts[0]?.id ?? null : p.view.activePartId
    const melodyPartId =
      p.view.melodyPartId === id ? parts[0]?.id ?? null : p.view.melodyPartId
    current.value = {
      ...p,
      parts,
      notes,
      mix: syncProjectMix(parts, p.mix),
      view: { ...p.view, activePartId, melodyPartId },
      updatedAt: Date.now(),
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

  function canShrinkMeasures(): boolean {
    const p = current.value
    if (!p) return false
    return p.lengthTicks > measureTicks(p.timeSignature)
  }


  function undo(): boolean {
    const p = current.value
    const snap = undoStack.value[undoStack.value.length - 1]
    if (!p || !snap) return false
    const currentSnap = captureDocumentSnapshot(p)
    undoStack.value = undoStack.value.slice(0, -1)
    redoStack.value = [...redoStack.value, currentSnap]
    historySuspended = true
    current.value = applyDocumentSnapshot(p, snap)
    historySuspended = false
    clearNoteSelection()
    selectedExpressionId.value = null
    scheduleSave()
    scheduleHistoryPersist()
    return true
  }

  function redo(): boolean {
    const p = current.value
    const snap = redoStack.value[redoStack.value.length - 1]
    if (!p || !snap) return false
    const currentSnap = captureDocumentSnapshot(p)
    redoStack.value = redoStack.value.slice(0, -1)
    undoStack.value = [...undoStack.value, currentSnap]
    historySuspended = true
    current.value = applyDocumentSnapshot(p, snap)
    historySuspended = false
    clearNoteSelection()
    selectedExpressionId.value = null
    scheduleSave()
    scheduleHistoryPersist()
    return true
  }

  /** Cancel the most recent edit (harmonizer apply, etc.). */
  function cancelLastEdit(): boolean {
    return undo()
  }

  async function removeProject(id: string): Promise<void> {
    await deleteTagRollProject(id)
    if (current.value?.id === id) current.value = null
    await refreshList()
  }

  function clearCurrent(): void {
    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = null
    }
    if (historyTimer) {
      clearTimeout(historyTimer)
      historyTimer = null
    }
    current.value = null
    clearNoteSelection()
    selectedExpressionId.value = null
    expressionTool.value = null
    transportPlaying.value = false
    undoStack.value = []
    redoStack.value = []
  }

  function setLocalEntryId(id: string | null): void {
    patchProject({ localEntryId: id })
  }

  return {
    summaries,
    current,
    loaded,
    busy,
    error,
    selectedNoteId,
    selectedNoteIds,
    selectedNote,
    selectedNotes,
    selectedExpressionId,
    expressionTool,
    addDurationTicks,
    transportPlaying,
    noteClipboard,
    notesByPartId,
    canUndo,
    canRedo,
    pointerTool,
    setPointerTool,
    refreshList,
    openProject,
    createProject,
    persistNow,
    patchProject,
    patchView,
    setMode,
    setClefFamily,
    setScoreSurface,
    setActivePart,
    cycleActivePart,
    setFocusActivePart,
    setScaleHighlight,
    patchPartMix,
    clearMixSolos,
    setMelodyPart,
    nudgeCellW,
    nudgeCellH,
    setCellSize,
    setSheetZoom,
    setSheetShowLyrics,
    setLockPiano,
    setScroll,
    setSheetScroll,
    setPlayheadTick,
    setBpm,
    setSnapTicks,
    setTimeSignature,
    setTempoAtTick,
    updateTempoMarker,
    updateTempoMarkerLive,
    deleteTempoMarker,
    addExpression,
    updateExpression,
    updateExpressionLive,
    deleteExpression,
    selectExpression,
    setExpressionTool,
    setSoundEngine,
    setPitchPipeSoundId,
    setBlowPitchEnabled,
    setMetronomeEnabled,
    setTonality,
    setSoundEnvelope,
    addNote,
    updateNote,
    updateNoteLive,
    updateNotesLive,
    beginNoteGesture,
    pushHistoryCheckpoint,
    deleteNote,
    deleteNotes,
    deleteSelectedNotes,
    selectNote,
    selectNotes,
    clearNoteSelection,
    copySelectedNotes,
    pasteNotesAtPlayhead,
    upsertHarmonyNotes,
    addPart,
    updatePart,
    removePart,
    setLyric,
    extendMeasures,
    shrinkMeasures,
    insertMeasure,
    canShrinkMeasures,
    undo,
    redo,
    cancelLastEdit,
    removeProject,
    clearCurrent,
    setLocalEntryId,
    withHistory,
  }
})
