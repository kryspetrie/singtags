/**
 * Tag Studio projects — list, open, create, save, note CRUD, undo/redo.
 * Persistence / ids / harmony go through composition ports (façade over use-cases).
 */
import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import { type TagRollDocumentSnapshot } from '../lib/tagRoll/history'
import { type TagRollSketchClipboard } from '../lib/tagRoll/sketchClipboard'
import { type TagRollNoteClipboard } from '../lib/tagRoll/selection'
import type {
  HarmonySketchSpan,
  TagRollExpressionTool,
  TagRollNote,
  TagRollPointerTool,
  TagRollProject,
} from '../lib/tagRoll/types'
import { TAG_ROLL_PPQ } from '../lib/tagRoll/types'
import type { TagRollProjectSummary } from '../ports/TagRollRepository'
import { svc, tagRollUnloadFlush } from './tagRoll/runtime'
import { type StoreDeps } from './tagRoll/deps'
import { createTagRollHistoryActions } from './tagRoll/history'
import { createTagRollSheetFormatActions } from './tagRoll/sheetFormat'
import { createTagRollNoteEditActions } from './tagRoll/noteEdits'
import { createTagRollHarmonySketchActions } from './tagRoll/harmonySketch'
import { createTagRollHarmonyApplyActions } from './tagRoll/harmonyApply'
import { createTagRollPlaybackActions } from './tagRoll/playback'
import { createTagRollLifecycleActions } from './tagRoll/lifecycle'
import { createTagRollViewActions } from './tagRoll/view'

export const useTagRollStore = defineStore('tagRoll', () => {

  const summaries = ref<TagRollProjectSummary[]>([])
  const current = shallowRef<TagRollProject | null>(null)
  const loaded = ref(false)
  const busy = ref(false)
  const error = ref<string | null>(null)
  const selectedNoteIds = ref<string[]>([])
  const selectedSketchSpanIds = ref<string[]>([])
  const selectedExpressionId = ref<string | null>(null)
  const selectedTupletId = ref<string | null>(null)
  /** When set, empty-drag on the roll creates a tuplet span (default 3:2). */
  const tupletTool = ref<boolean>(false)
  const expressionTool = ref<TagRollExpressionTool>(null)
  const pointerTool = ref<TagRollPointerTool>('edit')
  const addDurationTicks = ref(TAG_ROLL_PPQ)
  const transportPlaying = ref(false)
  /** Piano-roll Assign Note Roles overlay (Strong / Passing / Melody). */
  const assignNoteRolesActive = ref(false)
  const noteClipboard = shallowRef<TagRollNoteClipboard | null>(null)
  const sketchClipboard = shallowRef<TagRollSketchClipboard | null>(null)
  /** When true, C/X/V/Del target Chords-lane spans instead of notes. */
  const chordsLaneFocused = ref(false)
  const undoStack = ref<TagRollDocumentSnapshot[]>([])
  const redoStack = ref<TagRollDocumentSnapshot[]>([])
  const canUndo = computed(() => undoStack.value.length > 0)
  const canRedo = computed(() => redoStack.value.length > 0)

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

  const selectedSketchSpans = computed(() => {
    const p = current.value
    if (!p || !selectedSketchSpanIds.value.length) return [] as HarmonySketchSpan[]
    const set = new Set(selectedSketchSpanIds.value)
    return (p.harmonySketch ?? []).filter((s) => set.has(s.id) && s.locked)
  })
  const slots = {
    historyTimer: null as (ReturnType<typeof setTimeout> | null),
  }
  const deps: StoreDeps = {
    summaries,
    current,
    loaded,
    busy,
    error,
    selectedNoteIds,
    selectedSketchSpanIds,
    selectedExpressionId,
    selectedTupletId,
    tupletTool,
    expressionTool,
    pointerTool,
    addDurationTicks,
    transportPlaying,
    assignNoteRolesActive,
    noteClipboard,
    sketchClipboard,
    chordsLaneFocused,
    undoStack,
    redoStack,
    canUndo,
    canRedo,
    notesByPartId,
    selectedNoteId,
    selectedNote,
    selectedNotes,
    selectedSketchSpans,
    slots,
  }
  const historyActions = createTagRollHistoryActions(deps)
  const sheetFormatActions = createTagRollSheetFormatActions(deps)
  const noteEditActions = createTagRollNoteEditActions(deps)
  const harmonySketchActions = createTagRollHarmonySketchActions(deps)
  const harmonyApplyActions = createTagRollHarmonyApplyActions(deps)
  const playbackActions = createTagRollPlaybackActions(deps)
  const lifecycleActions = createTagRollLifecycleActions(deps)
  const viewActions = createTagRollViewActions(deps)
  historyActions.bindWatches()
  sheetFormatActions.bindWatches()
  noteEditActions.bindWatches()
  harmonySketchActions.bindWatches()
  harmonyApplyActions.bindWatches()
  playbackActions.bindWatches()
  lifecycleActions.bindWatches()
  viewActions.bindWatches()
  const {
    withHistory,
    pushHistoryCheckpoint,
    beginNoteGesture,
    undo,
    redo,
    cancelLastEdit,
    setSheetZoom,
    setSheetPageViewZoom,
    nudgeSheetPageViewZoom,
    setSheetShowLyrics,
    setSheetLayout,
    setSheetMeasureSizing,
    setSheetNoteColors,
    setSheetStaveGap,
    setSheetMeasureScale,
    setSheetNoteSpacing,
    setSheetBeatStretch,
    setSheetStaveGapFine,
    setSheetSystemGap,
    setSheetTopMargin,
    setSheetLyricSize,
    setSheetLyricOffset,
    resetSheetLyricOffsets,
    setSheetPlaybackHighlight,
    setSheetShowSketchChords,
    setSheetShowDetectedChords,
    setSheetChordMarkStyle,
    setSheetChordLabelMode,
    setSheetShowEngravedHeader,
    resetSheetFormat,
    saveSheetFormatAsDefault,
    clearSheetFormatDefault,
    hasCustomSheetFormatDefault,
    resetSheetFormatToSystem,
    setSheetShowEngravedFooter,
    setSheetPadding,
    setSheetMinBarWidth,
    setSheetClefGutter,
    setSheetTimeFactor,
    setSheetBottomMargin,
    setSheetMarginLeftIn,
    setSheetMarginRightIn,
    setSheetMarginTopIn,
    setSheetMarginBottomIn,
    setSheetMarginsUniformIn,
    setSheetEngravingScale,
    setSheetScoreScale,
    setSheetMusicFont,
    setSheetTextFont,
    setSheetStaffLineWeight,
    setSheetStemLength,
    setSheetPartNames,
    setSheetPageWidthIn,
    setSheetPageHeightIn,
    setSheetPageDpi,
    setSheetPagePreset,
    clearNoteSelection,
    addNote,
    updateNote,
    updateNoteLive,
    updateNotesLive,
    deleteNote,
    deleteNotes,
    tieNotes,
    untieNotes,
    tieSelectedNotes,
    untieSelectedNotes,
    toggleTieSelectedNotes,
    deleteSelectedNotes,
    selectNote,
    selectNotes,
    copySelectedNotes,
    cutSelectedNotes,
    pasteNotesAtPlayhead,
    setHarmonySketch,
    declareHarmonySpan,
    upsertHarmonySketchSpan,
    removeHarmonySketchSpan,
    absorbHarmonySpan,
    clearSketchSelection,
    setChordsLaneFocused,
    selectSketchSpans,
    copySelectedSketchSpans,
    cutSelectedSketchSpans,
    pasteSketchSpansAtPlayhead,
    deleteSelectedSketchSpans,
    splitSelectedSketchAtPlayhead,
    moveSketchSpansGeometry,
    lockHarmonySketchSpan,
    lockDetectedAsMyChords,
    toggleSketchPillar,
    upsertHarmonyNotes,
    upsertHarmonyNotesMany,
    carvePassingSketchSpans,
    applyPassingSketchAndStacks,
    commitHarmonizeAtMelody,
    realizeHarmonySketchStacks,
    completeFromParts,
    replaceNotesFromExternal,
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
    setTupletTool,
    selectTuplet,
    addTuplet,
    patchTuplet,
    patchTupletLive,
    removeTuplet,
    deleteSelectedTuplet,
    applyTupletEditorDraft,
    setSoundEngine,
    setPitchPipeSoundId,
    setSoundfontId,
    setSoundfontPatch,
    setBlowPitchEnabled,
    setMetronomeEnabled,
    setMetronomeSwing,
    setSwing,
    setMidiBakeSwing,
    setTonality,
    setKeyAtTick,
    updateKeyMarker,
    updateKeyMarkerLive,
    deleteKeyMarker,
    setSoundEnvelope,
    refreshList,
    openProject,
    createProject,
    importProject,
    persistNow,
    patchProject,
    patchView,
    removeProject,
    resyncPolecatPitchSeeds,
    duplicateProject,
    clearCurrent,
    setLocalEntryId,
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
  } = {
    ...historyActions.actions,
    ...sheetFormatActions.actions,
    ...noteEditActions.actions,
    ...harmonySketchActions.actions,
    ...harmonyApplyActions.actions,
    ...playbackActions.actions,
    ...lifecycleActions.actions,
    ...viewActions.actions,
  }

  /** Flush pending document (incl. mixer) when the tab hides or unloads. */
  if (
    !tagRollUnloadFlush.bound &&
    typeof window !== 'undefined' &&
    typeof document !== 'undefined'
  ) {
    tagRollUnloadFlush.bound = true
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') void persistNow()
    })
    window.addEventListener('pagehide', () => {
      void persistNow()
    })
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
    selectedSketchSpanIds,
    selectedSketchSpans,
    sketchClipboard,
    chordsLaneFocused,
    selectedExpressionId,
    selectedTupletId,
    tupletTool,
    expressionTool,
    addDurationTicks,
    transportPlaying,
    assignNoteRolesActive,
    noteClipboard,
    notesByPartId,
    canUndo,
    canRedo,
    pointerTool,
    setPointerTool,
    refreshList,
    resyncPolecatPitchSeeds,
    openProject,
    createProject,
    importProject,
    duplicateProject,
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
    setShowNoteNames,
    setShowNoteLyrics,
    patchPartMix,
    clearMixSolos,
    setMelodyPart,
    toggleMelodyHandoffAtNote,
    setRoleDisplay,
    setNoteRole,
    importMelodyRolesFromArrangement,
    nudgeCellW,
    nudgeCellH,
    setCellSize,
    setSheetZoom,
    setSheetPageViewZoom,
    nudgeSheetPageViewZoom,
    setSheetShowLyrics,
    setSheetLayout,
    setSheetMeasureSizing,
    setSheetNoteColors,
    setSheetStaveGap,
    setSheetMeasureScale,
    setSheetNoteSpacing,
    setSheetBeatStretch,
    setSheetStaveGapFine,
    setSheetSystemGap,
    setSheetTopMargin,
    setSheetLyricSize,
    setSheetLyricOffset,
    resetSheetLyricOffsets,
    setSheetPlaybackHighlight,
    setSheetShowSketchChords,
    setSheetShowDetectedChords,
    setSheetChordMarkStyle,
    setSheetChordLabelMode,
    setSheetShowEngravedHeader,
    setSheetShowEngravedFooter,
    setSheetPadding,
    setSheetMinBarWidth,
    setSheetClefGutter,
    setSheetTimeFactor,
    setSheetBottomMargin,
    setSheetMarginLeftIn,
    setSheetMarginRightIn,
    setSheetMarginTopIn,
    setSheetMarginBottomIn,
    setSheetMarginsUniformIn,
    setSheetEngravingScale,
    setSheetScoreScale,
    setSheetMusicFont,
    setSheetTextFont,
    setSheetStaffLineWeight,
    setSheetStemLength,
    setSheetPartNames,
    setSheetPageWidthIn,
    setSheetPageHeightIn,
    setSheetPageDpi,
    setSheetPagePreset,
    resetSheetFormat,
    saveSheetFormatAsDefault,
    clearSheetFormatDefault,
    hasCustomSheetFormatDefault,
    resetSheetFormatToSystem,
    setLockPiano,
    setScroll,
    extendLengthToTick,
    setSheetScroll,
    setPlayheadTick,
    setBpm,
    setSnapTicks,
    setTimeSignature,
    setTempoAtTick,
    updateTempoMarker,
    updateTempoMarkerLive,
    deleteTempoMarker,
    setKeyAtTick,
    updateKeyMarker,
    updateKeyMarkerLive,
    deleteKeyMarker,
    addExpression,
    updateExpression,
    updateExpressionLive,
    deleteExpression,
    selectExpression,
    setExpressionTool,
    setTupletTool,
    selectTuplet,
    addTuplet,
    patchTuplet,
    patchTupletLive,
    removeTuplet,
    deleteSelectedTuplet,
    applyTupletEditorDraft,
    setSoundEngine,
    setPitchPipeSoundId,
    setSoundfontId,
    setSoundfontPatch,
    setBlowPitchEnabled,
    setMetronomeEnabled,
    setMetronomeSwing,
    setSwing,
    setMidiBakeSwing,
    setTonality,
    setHarmonySketch,
    upsertHarmonySketchSpan,
    declareHarmonySpan,
    removeHarmonySketchSpan,
    absorbHarmonySpan,
    lockHarmonySketchSpan,
    lockDetectedAsMyChords,
    toggleSketchPillar,
    clearSketchSelection,
    setChordsLaneFocused,
    selectSketchSpans,
    copySelectedSketchSpans,
    cutSelectedSketchSpans,
    pasteSketchSpansAtPlayhead,
    deleteSelectedSketchSpans,
    splitSelectedSketchAtPlayhead,
    moveSketchSpansGeometry,
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
    tieNotes,
    untieNotes,
    tieSelectedNotes,
    untieSelectedNotes,
    toggleTieSelectedNotes,
    nextNoteId: () => svc().idGen.next('trn'),
    selectNote,
    selectNotes,
    clearNoteSelection,
    copySelectedNotes,
    cutSelectedNotes,
    pasteNotesAtPlayhead,
    upsertHarmonyNotes,
    upsertHarmonyNotesMany,
    carvePassingSketchSpans,
    applyPassingSketchAndStacks,
    commitHarmonizeAtMelody,
    realizeHarmonySketchStacks,
    completeFromParts,
    replaceNotesFromExternal,
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
    undo,
    redo,
    cancelLastEdit,
    removeProject,
    clearCurrent,
    setLocalEntryId,
    withHistory,
  }
})
