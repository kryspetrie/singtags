<script setup lang="ts">
/**
 * Sketch (harmony map) bottom lane — locked sketch spans (click/drag-to-define, multi-select, resize).
 */
import { computed, nextTick, onMounted, onUnmounted, ref, toRef, watch } from 'vue'
import type { ChordAnalysisMode, ChordAnalysisSegment } from '../../domain/arranging/chordAnalysisBar'
import {
  HARMONY_ENTRY_BROWSE_LIMIT,
  natureToSketchQuality,
  sketchLabel,
  sketchRomanDisplay,
  suggestHarmonyEntries,
  type HarmonyAbsorbNeighbor,
  type HarmonyEntrySuggestion,
  type HarmonySketchQuality,
} from '../../lib/tagRoll/harmonySketch'
import { drawLaneTimeGrid } from '../../lib/tagRoll/laneTimeGrid'
import { stripSegW, stripSegX } from '../../lib/tagRoll/harmonyStripGestures'
import { clampFixedPanelRect, placePopoverNearAnchor } from '../../lib/tagRoll/placePopover'
import { useDeclaredStripGestures } from '../../composables/useDeclaredStripGestures'
import { tagRollTip } from '../../lib/tagRoll/shortcuts'
import type { HarmonyPreviewDraft } from '../../lib/tagRoll/harmonyPreviewDraft'
import { previewDraftDirty } from '../../lib/tagRoll/harmonyPreviewDraft'
import type { TagRollProject } from '../../lib/tagRoll/types'
import { SKETCH_LANE_HOWTO } from '../../lib/tagRoll/harmonyHowTo'
import { usePreferencesStore } from '../../stores/preferences'
import { useTagRollStore } from '../../stores/tagRoll'
import InfoTips from '../InfoTips.vue'
import HarmonyHowToSections from './HarmonyHowToSections.vue'
import TagRollBottomLaneShell from './TagRollBottomLaneShell.vue'

const TRACK_H = 44

const props = defineProps<{
  project: TagRollProject
  segments: readonly ChordAnalysisSegment[]
  /** Detected fills — Realize uses them so Sketch inversions path-match Detected. */
  detectSegments?: readonly ChordAnalysisSegment[]
  mode: ChordAnalysisMode
  leftGutterPx?: number
  readOnly?: boolean
  /** Live preview from dock / Harmonize (not yet Applied). */
  previewDraft?: HarmonyPreviewDraft | null
  /** Span id currently open in the right-hand chord dock. */
  editSegId?: string | null
}>()

const emit = defineEmits<{
  'update:mode': [value: ChordAnalysisMode]
  focusRange: [startTick: number, endTick: number]
  hear: [
    startTick: number,
    endTick: number,
    draft?: { rootPc: number; quality: HarmonySketchQuality },
  ]
  hearStop: []
  remove: [id: string]
  commitAt: [
    payload: {
      raw: string
      startTick: number
      endTick: number
      id?: string
      /** Stay in lane typeahead (e.g. Tab) — do not open the chord dock. */
      keepEditing?: boolean
    },
  ]
  geometry: [payload: { id: string; startTick: number; endTick: number }]
  geometryMany: [payloads: Array<{ id: string; startTick: number; endTick: number }>]
  beginGesture: []
  /** Open / toggle Sketch chord in the right dock. */
  edit: [seg: ChordAnalysisSegment]
  /** Fired after Realize wrote at least one TTBB stack. */
  realized: [payload: { applied: number; spansUsed: number }]
}>()

const prefs = usePreferencesStore()
const store = useTagRollStore()
const collapsed = computed(() => prefs.tagRollChordsLaneCollapsed)
const leftGutterPx = computed(() => Math.max(64, props.leftGutterPx ?? 112))
const selectedIds = computed(() => store.selectedSketchSpanIds)
const readOnlyRef = computed(() => !!props.readOnly)
const canRealize = computed(
  () =>
    !props.readOnly &&
    props.segments.some((s) =>
      selectedIds.value.length ? selectedIds.value.includes(s.id) : true,
    ),
)

function onRealize(): void {
  if (!canRealize.value) return
  const detectSpans = (props.detectSegments ?? [])
    .filter((s) => s.rootPc != null)
    .map((s) => ({
      id: s.id,
      startTick: s.startTick,
      endTick: s.endTick,
      rootPc: s.rootPc!,
      quality: s.quality ?? 'major',
    }))
  const result = store.realizeHarmonySketchStacks({ detectSpans })
  if (result.applied === 0) return
  emit('realized', result)
}

const declaredTrackEl = ref<HTMLElement | null>(null)
const inlineEl = ref<HTMLElement | null>(null)
const inlineInputEl = ref<HTMLInputElement | null>(null)
const wrapRef = ref<HTMLElement | null>(null)
const gridCanvasRef = ref<HTMLCanvasElement | null>(null)
const cssW = ref(640)

const inlineDraft = ref('')
const inlineSuggestOpen = ref(false)
const inlineSuggestIdx = ref(0)
type InlineEdit = { id?: string; startTick: number; endTick: number; seed: string }
const inlineEdit = ref<InlineEdit | null>(null)
const inlinePos = ref({
  top: '0px',
  left: '0px',
  width: '15rem',
  maxHeight: '15rem',
})
/** User drag offset from the auto-placed position (reset when opening). */
const inlineDrag = ref({ x: 0, y: 0 })
let inlineDragSession:
  | { pointerId: number; startX: number; startY: number; origX: number; origY: number }
  | null = null
const inlineSuggestListId = 'tag-roll-declared-inline-suggest'

function leadMidiAtTick(tick: number): number | null {
  const p = props.project
  const melId =
    p.view.melodyPartId ?? p.parts.find((x) => x.name === 'Lead')?.id ?? null
  if (!melId) return null
  const hit = p.notes.find(
    (n) =>
      n.partId === melId && n.startTick <= tick && tick < n.startTick + n.durationTicks,
  )
  return hit?.midi ?? null
}

const inlineLeadMidi = computed((): number | null => {
  const edit = inlineEdit.value
  if (!edit) return null
  return leadMidiAtTick(edit.startTick)
})

const scrollX = computed(() => props.project.view.scrollX)
const cellW = computed(() => props.project.view.cellW)
const ppq = computed(() => props.project.ppq)
const snapTicks = computed(() => Math.max(1, props.project.snapTicks))
const lengthTicks = computed(() => props.project.lengthTicks)

const editSegId = computed(() => props.editSegId ?? null)

function labelOf(seg: ChordAnalysisSegment): string {
  return props.mode === 'roman' ? seg.displayRoman : seg.displayName
}

function previewLabelOf(d: HarmonyPreviewDraft): string {
  if (props.mode === 'roman') {
    const nextRoot =
      (props.project.harmonySketch ?? [])
        .filter((s) => s.locked && s.startTick >= d.endTick)
        .sort((a, b) => a.startTick - b.startTick)[0]?.rootPc ?? null
    return sketchRomanDisplay(
      d,
      props.project.tonality,
      props.project.tonalityMode ?? 'major',
      nextRoot,
    )
  }
  return sketchLabel(
    d,
    props.project.preferFlats,
    props.project.tonality,
    props.project.tonalityMode ?? 'major',
  )
}

function isPreviewingSeg(seg: ChordAnalysisSegment): boolean {
  const p = props.previewDraft
  if (!p || !previewDraftDirty(p)) return false
  if (p.id === seg.id) return true
  return p.startTick < seg.endTick && seg.startTick < p.endTick
}

/** Preview window that does not sit on an existing Sketch cell (Detected / Harmonize). */
const orphanPreviewStyle = computed(() => {
  const p = props.previewDraft
  if (!p) return null
  if (props.segments.some((s) => s.startTick < p.endTick && p.startTick < s.endTick)) {
    // Overlaps a locked cell — only chrome via isPreviewingSeg when dirty.
    return null
  }
  const x = stripSegX(p.startTick, scrollX.value, cellW.value, ppq.value)
  const w = stripSegW(p.startTick, p.endTick, cellW.value, ppq.value)
  return { transform: `translate3d(${x}px, 0, 0)`, width: `${w}px` }
})

function openInlineEditor(opts: {
  id?: string
  startTick: number
  endTick: number
  seed: string
}): void {
  inlineDrag.value = { x: 0, y: 0 }
  store.extendLengthToTick(opts.endTick)
  inlineEdit.value = {
    id: opts.id,
    startTick: opts.startTick,
    endTick: opts.endTick,
    seed: opts.seed,
  }
  inlineDraft.value = opts.seed
  inlineSuggestOpen.value = true
  inlineSuggestIdx.value = 0
  emit('focusRange', opts.startTick, opts.endTick)
  void nextTick(() => {
    placeInline()
    void nextTick(() => placeInline())
    inlineInputEl.value?.focus()
    inlineInputEl.value?.select()
  })
}

function openInlineForSeg(seg: ChordAnalysisSegment): void {
  if (props.readOnly || seg.rootPc == null) return
  store.selectSketchSpans([seg.id])
  // Blank / new slots start empty so Enter keeps a placeholder and typing isn’t pre-filled.
  const seed = seg.quality === 'blank' ? '' : labelOf(seg)
  openInlineEditor({
    id: seg.id,
    startTick: seg.startTick,
    endTick: seg.endTick,
    seed,
  })
}

function onCellDblClick(seg: ChordAnalysisSegment, e: MouseEvent): void {
  e.preventDefault()
  e.stopPropagation()
  openInlineForSeg(seg)
}

const {
  gesture,
  hoverEdge,
  previewFor,
  placePreview,
  onPointerDown: onDeclaredPointerDown,
  onPointerMove: onDeclaredPointerMove,
  onPointerUp: onDeclaredPointerUp,
  onPointerCancel: onDeclaredPointerCancel,
  clearHover,
} = useDeclaredStripGestures({
  trackEl: declaredTrackEl,
  declared: toRef(props, 'segments'),
  selectedIds,
  scrollX,
  cellW,
  ppq,
  snapTicks,
  lengthTicks,
  readOnly: readOnlyRef,
  onBeginGesture: () => emit('beginGesture'),
  onSelect: (ids, o) => store.selectSketchSpans(ids, o),
  onClearSelection: () => store.clearSketchSelection(),
  onPlaceRange: (startTick, endTick) => {
    store.extendLengthToTick(endTick)
    openInlineEditor({ startTick, endTick, seed: '' })
  },
  onEdit: (seg) => {
    // Re-click / double-click without drag → type the chord (inline).
    openInlineForSeg(seg)
  },
  onGeometry: (payload) => emit('geometry', payload),
  onGeometryMany: (payloads) => emit('geometryMany', payloads),
  onFocusRange: (a, b) => emit('focusRange', a, b),
  onNeedLength: (tick) => store.extendLengthToTick(tick),
})

function handleHot(segId: string, edge: 'start' | 'end'): boolean {
  return hoverEdge.value?.id === segId && hoverEdge.value.edge === edge
}

function onTrackFocus(): void {
  store.setChordsLaneFocused(true)
}

/** Harmonize/Coach preview for the painted (uncommitted) range — dismiss empty typeahead. */
watch(
  () => props.previewDraft,
  (p) => {
    const edit = inlineEdit.value
    if (!p || !edit || edit.id) return
    if (!previewDraftDirty(p)) return
    const overlaps =
      edit.startTick < p.endTick && p.startTick < edit.endTick
    if (overlaps) closeInline()
  },
)

const inlineSuggestions = computed((): HarmonyEntrySuggestion[] =>
  suggestHarmonyEntries(
    inlineDraft.value,
    {
      tonality: props.project.tonality,
      mode: props.project.tonalityMode ?? 'major',
      preferFlats: props.project.preferFlats,
      entryMode: props.mode === 'roman' ? 'roman' : 'name',
      leadMidi: inlineLeadMidi.value,
    },
    HARMONY_ENTRY_BROWSE_LIMIT,
  ),
)

function segStyle(seg: ChordAnalysisSegment): Record<string, string> {
  const prev = previewFor(seg)
  const start = prev?.startTick ?? seg.startTick
  const end = prev?.endTick ?? seg.endTick
  const x = stripSegX(start, scrollX.value, cellW.value, ppq.value)
  const w = stripSegW(start, end, cellW.value, ppq.value)
  return { transform: `translate3d(${x}px, 0, 0)`, width: `${w}px` }
}

function closeInline(): void {
  inlineEdit.value = null
  inlineDraft.value = ''
  inlineSuggestOpen.value = false
  inlineDrag.value = { x: 0, y: 0 }
  inlineDragSession = null
}

function cellAnchorRect(edit: InlineEdit): DOMRect {
  const x = stripSegX(edit.startTick, scrollX.value, cellW.value, ppq.value)
  const w = stripSegW(edit.startTick, edit.endTick, cellW.value, ppq.value)
  const track = declaredTrackEl.value
  const tr = track?.getBoundingClientRect()
  if (!tr) return new DOMRect(8, 8, 160, 40)
  const left = tr.left + Math.max(0, x)
  const width = Math.max(48, Math.min(w, 220))
  return new DOMRect(left, tr.top, width, tr.height)
}

function placeInline(): void {
  const edit = inlineEdit.value
  if (!edit) return
  const el = inlineEl.value
  const measuredH = el?.offsetHeight ?? 0
  const measuredW = el?.offsetWidth ?? 240
  const anchor = cellAnchorRect(edit)
  const placement = placePopoverNearAnchor(anchor, {
    minWidth: 220,
    preferredWidth: 240,
    preferBelow: true,
    panelHeightPx: measuredH || 240,
  })
  const baseLeft = Number.parseFloat(placement.left) || 8
  const baseTop = Number.parseFloat(placement.top) || 8
  const clamped = clampFixedPanelRect({
    left: baseLeft + inlineDrag.value.x,
    top: baseTop + inlineDrag.value.y,
    width: measuredW || 240,
    height: measuredH || Math.min(placement.maxHeightPx, 280),
  })
  // Fold clamp back into drag so the box never sits partially off-screen.
  inlineDrag.value = {
    x: clamped.left - baseLeft,
    y: clamped.top - baseTop,
  }
  inlinePos.value = {
    top: `${clamped.top}px`,
    left: `${clamped.left}px`,
    width: `${Math.max(220, Math.min(260, measuredW || 240))}px`,
    maxHeight: `${placement.maxHeightPx}px`,
  }
}

function onInlineDragDown(e: PointerEvent): void {
  if (e.button !== 0) return
  const el = inlineEl.value
  if (!el) return
  e.preventDefault()
  e.stopPropagation()
  const left = Number.parseFloat(inlinePos.value.left) || 0
  const top = Number.parseFloat(inlinePos.value.top) || 0
  inlineDragSession = {
    pointerId: e.pointerId,
    startX: e.clientX,
    startY: e.clientY,
    origX: left,
    origY: top,
  }
  try {
    el.setPointerCapture(e.pointerId)
  } catch {
    /* ignore */
  }
}

function onInlineDragMove(e: PointerEvent): void {
  const s = inlineDragSession
  if (!s || e.pointerId !== s.pointerId) return
  const el = inlineEl.value
  const next = clampFixedPanelRect({
    left: s.origX + (e.clientX - s.startX),
    top: s.origY + (e.clientY - s.startY),
    width: el?.offsetWidth ?? 240,
    height: el?.offsetHeight ?? 200,
  })
  inlinePos.value = {
    ...inlinePos.value,
    left: `${next.left}px`,
    top: `${next.top}px`,
  }
}

function onInlineDragUp(e: PointerEvent): void {
  const s = inlineDragSession
  if (!s || e.pointerId !== s.pointerId) return
  const el = inlineEl.value
  const base = inlineEdit.value ? cellAnchorRect(inlineEdit.value) : null
  if (base) {
    const placement = placePopoverNearAnchor(base, {
      minWidth: 220,
      preferredWidth: 240,
      preferBelow: true,
      panelHeightPx: el?.offsetHeight ?? 240,
    })
    const baseLeft = Number.parseFloat(placement.left) || 8
    const baseTop = Number.parseFloat(placement.top) || 8
    const left = Number.parseFloat(inlinePos.value.left) || baseLeft
    const top = Number.parseFloat(inlinePos.value.top) || baseTop
    inlineDrag.value = { x: left - baseLeft, y: top - baseTop }
  }
  inlineDragSession = null
  try {
    el?.releasePointerCapture(e.pointerId)
  } catch {
    /* ignore */
  }
}

function toAbsorbNeighbor(seg: ChordAnalysisSegment): HarmonyAbsorbNeighbor | null {
  if (seg.rootPc == null) return null
  return {
    id: seg.id,
    startTick: seg.startTick,
    endTick: seg.endTick,
    rootPc: seg.rootPc,
    quality: natureToSketchQuality(seg.quality ?? 'major'),
  }
}

/** Delete key removes the whole chord (even while the typeahead is focused). */
function deleteInlineChord(): void {
  const edit = inlineEdit.value
  if (!edit) return
  const id = edit.id
  const startTick = edit.startTick
  const endTick = edit.endTick
  closeInline()
  if (!id) return
  store.selectSketchSpans([id])
  const removals: Array<{
    id: string
    startTick: number
    endTick: number
    left?: HarmonyAbsorbNeighbor | null
    right?: HarmonyAbsorbNeighbor | null
  }> = []
  for (const list of [props.segments, props.detectSegments ?? []]) {
    for (let i = 0; i < list.length; i++) {
      const cur = list[i]!
      if (cur.id !== id) continue
      removals.push({
        id: cur.id,
        startTick: cur.startTick,
        endTick: cur.endTick,
        left: i > 0 ? toAbsorbNeighbor(list[i - 1]!) : null,
        right: i < list.length - 1 ? toAbsorbNeighbor(list[i + 1]!) : null,
      })
    }
  }
  if (!removals.length) {
    removals.push({ id, startTick, endTick })
  }
  store.deleteSelectedSketchSpans({ removals })
  emit('remove', id)
}
function setMode(m: ChordAnalysisMode): void {
  emit('update:mode', m)
  closeInline()
}

function placeGhostStyle(): Record<string, string> | null {
  const prev = placePreview()
  if (!prev) return null
  const x = stripSegX(prev.startTick, scrollX.value, cellW.value, ppq.value)
  const w = stripSegW(prev.startTick, prev.endTick, cellW.value, ppq.value)
  return { transform: `translate3d(${x}px, 0, 0)`, width: `${w}px` }
}

function isSelected(id: string): boolean {
  return selectedIds.value.includes(id) || editSegId.value === id
}

function isDragging(id: string): boolean {
  const g = gesture.value
  if (!g) return false
  if (g.kind === 'resize') return g.id === id
  if (g.kind === 'move') return g.ids.includes(id)
  return false
}
function resolveInlineSubmitText(raw?: string): string {
  if (raw != null) return raw.trim()
  if (inlineSuggestions.value.length && inlineSuggestOpen.value) {
    const hit = inlineSuggestions.value[inlineSuggestIdx.value]
    if (hit) return hit.insert.trim()
  }
  const draft = inlineDraft.value.trim()
  if (draft) return draft
  return (inlineEdit.value?.seed ?? '').trim()
}

/** Empty field → blank placeholder (timing only). */
function submitBlankInline(opts?: { keepEditing?: boolean }): void {
  const edit = inlineEdit.value
  if (!edit) return
  emit('commitAt', {
    raw: '',
    startTick: edit.startTick,
    endTick: edit.endTick,
    id: edit.id,
    keepEditing: opts?.keepEditing,
  })
  closeInline()
}

function submitInline(raw?: string, opts?: { keepEditing?: boolean }): void {
  const edit = inlineEdit.value
  if (!edit) return
  // Explicit empty / no arg with empty draft → blank (do not auto-pick a suggestion).
  if (raw === '' || (raw == null && !inlineDraft.value.trim())) {
    submitBlankInline(opts)
    return
  }
  const text = resolveInlineSubmitText(raw)
  if (!text) {
    submitBlankInline(opts)
    return
  }
  emit('commitAt', {
    raw: text,
    startTick: edit.startTick,
    endTick: edit.endTick,
    id: edit.id,
    keepEditing: opts?.keepEditing,
  })
  closeInline()
}

async function submitInlineAndAdvance(dir: 1 | -1): Promise<void> {
  const edit = inlineEdit.value
  if (!edit) return
  const fromId = edit.id
  const fromStart = edit.startTick
  const draft = inlineDraft.value.trim()
  if (!draft) {
    // Tab on empty paints a blank slot, then moves to the next chord.
    emit('commitAt', {
      raw: '',
      startTick: edit.startTick,
      endTick: edit.endTick,
      id: edit.id,
      keepEditing: true,
    })
  } else {
    const text = resolveInlineSubmitText()
    if (text) {
      emit('commitAt', {
        raw: text,
        startTick: edit.startTick,
        endTick: edit.endTick,
        id: edit.id,
        keepEditing: true,
      })
    }
  }
  closeInline()
  await nextTick()
  await nextTick()
  const list = [...props.segments].sort(
    (a, b) => a.startTick - b.startTick || a.endTick - b.endTick,
  )
  let idx = fromId ? list.findIndex((s) => s.id === fromId) : -1
  if (idx < 0) idx = list.findIndex((s) => s.startTick === fromStart)
  if (idx < 0) return
  const next = list[idx + dir]
  if (!next) return
  openInlineForSeg(next)
}

function onInlineKeydown(e: KeyboardEvent): void {
  if (e.key === 'Tab') {
    e.preventDefault()
    e.stopPropagation()
    void submitInlineAndAdvance(e.shiftKey ? -1 : 1)
    return
  }
  // Delete removes the whole chord; Backspace only edits the field text.
  if (e.key === 'Delete') {
    e.preventDefault()
    e.stopPropagation()
    deleteInlineChord()
    return
  }
  if (!inlineSuggestOpen.value && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
    inlineSuggestOpen.value = true
  }
  if (e.key === 'Escape') {
    e.preventDefault()
    closeInline()
    return
  }
  if (e.key === 'Enter') {
    e.preventDefault()
    // Empty text → blank placeholder (layout chords first, fill via Tab later).
    if (!inlineDraft.value.trim()) {
      submitBlankInline()
      return
    }
    const hit = inlineSuggestions.value[inlineSuggestIdx.value]
    if (hit && inlineSuggestOpen.value) submitInline(hit.insert)
    else submitInline()
    return
  }
  if (!inlineSuggestions.value.length) return
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    inlineSuggestIdx.value = (inlineSuggestIdx.value + 1) % inlineSuggestions.value.length
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    inlineSuggestIdx.value =
      (inlineSuggestIdx.value - 1 + inlineSuggestions.value.length) % inlineSuggestions.value.length
  }
}

function drawGrid(): void {
  const canvas = gridCanvasRef.value
  const wrap = wrapRef.value
  if (!canvas || !wrap) return
  const dpr = window.devicePixelRatio || 1
  const w = cssW.value
  const h = Math.max(TRACK_H, wrap.clientHeight || TRACK_H)
  canvas.width = Math.max(1, Math.floor(w * dpr))
  canvas.height = Math.max(1, Math.floor(h * dpr))
  canvas.style.width = `${w}px`
  canvas.style.height = `${h}px`
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  const styles = getComputedStyle(canvas)
  const surface = styles.getPropertyValue('--surface').trim() || '#f5f5f5'
  const text = styles.getPropertyValue('--text').trim() || '#222'
  const muted = styles.getPropertyValue('--muted').trim() || '#888'
  ctx.fillStyle = surface
  ctx.fillRect(0, 0, w, h)
  drawLaneTimeGrid(ctx, {
    scrollX: scrollX.value,
    cellW: cellW.value,
    lengthTicks: lengthTicks.value,
    timeSignature: props.project.timeSignature,
    height: h,
    width: w,
    measureColor: text,
    beatColor: muted,
  })
}

let ro: ResizeObserver | null = null
onMounted(() => {
  const el = wrapRef.value
  if (el) {
    ro = new ResizeObserver(() => {
      cssW.value = el.clientWidth
      drawGrid()
    })
    ro.observe(el)
    cssW.value = el.clientWidth
    drawGrid()
  }
})
onUnmounted(() => ro?.disconnect())

watch([scrollX, cellW, lengthTicks, () => props.project.timeSignature], () => drawGrid())
watch([scrollX, cellW], () => {
  if (inlineEdit.value) placeInline()
})
watch(inlineDraft, () => {
  inlineSuggestIdx.value = 0
  inlineSuggestOpen.value = true
})
watch(inlineEdit, (edit, _p, onCleanup) => {
  if (!edit) return
  void nextTick(() => placeInline())
  const onPointerDownDoc = (e: PointerEvent) => {
    const t = e.target
    if (!(t instanceof Node)) {
      closeInline()
      return
    }
    if (inlineEl.value?.contains(t)) return
    closeInline()
  }
  const raf = requestAnimationFrame(() => {
    document.addEventListener('pointerdown', onPointerDownDoc, true)
  })
  onCleanup(() => {
    cancelAnimationFrame(raf)
    document.removeEventListener('pointerdown', onPointerDownDoc, true)
  })
})
</script>

<template>
  <TagRollBottomLaneShell
    v-if="!collapsed"
    label="Sketch"
    density="compact"
    :left-gutter-px="leftGutterPx"
    :view-options="[
      { value: 'name', label: 'Chord' },
      { value: 'roman', label: 'Number' },
    ]"
    :view-value="mode"
    view-aria-label="Sketch label view"
    @update:view="setMode(($event as 'name' | 'roman'))"
  >
    <template #gutter>
      <InfoTips
        v-if="!segments.length"
        class="sketch-howto"
        label="How to use Sketch"
        title="How to use Sketch"
      >
        <HarmonyHowToSections :sections="SKETCH_LANE_HOWTO" />
      </InfoTips>
      <button
        v-else
        type="button"
        class="realize-btn"
        :disabled="!canRealize"
        :title="tagRollTip(selectedIds.length
          ? 'Realize — write TTBB stacks from selected Sketch chords under Lead'
          : 'Realize — write TTBB stacks from locked Sketch chords under Lead')"
        @click="onRealize"
      >
        Realize
      </button>
    </template>
    <div class="track-wrap" @pointerdown="onTrackFocus">
      <div ref="wrapRef" class="grid-wrap">
        <canvas ref="gridCanvasRef" class="grid-canvas" aria-hidden="true" />
        <div
          ref="declaredTrackEl"
          class="track"
          :title="tagRollTip('Drag empty to paint; double-click to type; click opens editor')"
          @pointerdown="onDeclaredPointerDown"
          @pointermove="onDeclaredPointerMove"
          @pointerup="onDeclaredPointerUp"
          @pointercancel="onDeclaredPointerCancel"
          @pointerleave="clearHover"
        >
          <div
            v-if="placeGhostStyle()"
            class="cell ghost"
            :style="placeGhostStyle()!"
            aria-hidden="true"
          />
          <div
            v-if="orphanPreviewStyle"
            class="cell preview-ghost"
            :style="orphanPreviewStyle"
            :title="previewDraft ? `Preview: ${previewLabelOf(previewDraft)}` : 'Preview'"
            aria-hidden="true"
          >
            <div class="lab">
              <span class="txt">{{ previewDraft ? previewLabelOf(previewDraft) : '' }}</span>
            </div>
          </div>
          <div
            v-for="seg in segments"
            :key="`d-${seg.id}`"
            class="cell locked"
            :class="{
              blank: seg.quality === 'blank',
              menu: editSegId === seg.id || inlineEdit?.id === seg.id,
              selected: isSelected(seg.id),
              dragging: isDragging(seg.id),
              preview: isPreviewingSeg(seg),
            }"
            :style="segStyle(seg)"
            @dblclick="onCellDblClick(seg, $event)"
          >
            <span
              class="handle start"
              :class="{ hot: handleHot(seg.id, 'start') }"
              aria-hidden="true"
            />
            <div
              class="lab"
              :title="
                isPreviewingSeg(seg) && previewDraft
                  ? `Preview: ${previewLabelOf(previewDraft)} (not applied)`
                  : `Chord: ${labelOf(seg)} — double-click to type`
              "
            >
              <span class="txt">
                {{
                  isPreviewingSeg(seg) && previewDraft
                    ? previewLabelOf(previewDraft)
                    : labelOf(seg)
                }}
              </span>
            </div>
            <span
              class="handle end"
              :class="{ hot: handleHot(seg.id, 'end') }"
              aria-hidden="true"
            />
          </div>
        </div>
      </div>
    </div>

    <Teleport to="body">
      <div
        v-if="inlineEdit"
        ref="inlineEl"
        class="inline-pop"
        :style="{
          top: inlinePos.top,
          left: inlinePos.left,
          width: inlinePos.width,
          maxHeight: inlinePos.maxHeight,
        }"
        @pointermove="onInlineDragMove"
        @pointerup="onInlineDragUp"
        @pointercancel="onInlineDragUp"
      >
        <div
          class="inline-drag"
          title="Drag to move"
          @pointerdown="onInlineDragDown"
        >
          <span class="inline-drag-grip" aria-hidden="true" />
          <span class="inline-drag-label">Chord</span>
        </div>
        <form class="inline-form" @submit.prevent="submitInline()">
          <input
            ref="inlineInputEl"
            v-model="inlineDraft"
            type="text"
            :placeholder="
              inlineLeadMidi != null
                ? 'Chord, or Enter for blank…'
                : 'Chord, or Enter for blank…'
            "
            :aria-controls="inlineSuggestListId"
            :aria-expanded="inlineSuggestOpen && inlineSuggestions.length > 0"
            aria-autocomplete="list"
            autocomplete="off"
            @keydown="onInlineKeydown"
          />
        </form>
        <ul
          v-if="inlineSuggestOpen && inlineSuggestions.length"
          :id="inlineSuggestListId"
          class="suggest"
          role="listbox"
        >
          <li
            v-for="(s, i) in inlineSuggestions"
            :key="s.insert"
            role="option"
            :aria-selected="i === inlineSuggestIdx"
            :class="{ on: i === inlineSuggestIdx }"
            @mousedown.prevent="submitInline(s.insert)"
          >
            {{ s.label }}
          </li>
        </ul>
      </div>
    </Teleport>
  </TagRollBottomLaneShell>
</template>

<style scoped>
.realize-btn {
  width: 100%;
  max-width: 100%;
  padding: 0.1rem 0.2rem;
  min-height: 1.35rem;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: color-mix(in srgb, var(--accent) 12%, var(--surface));
  color: var(--text);
  font: inherit;
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.01em;
  cursor: pointer;
}
.realize-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.realize-btn:not(:disabled):hover {
  background: color-mix(in srgb, var(--accent) 22%, var(--surface));
}
.sketch-howto {
  display: flex;
  justify-content: center;
  width: 100%;
}
.sketch-howto :deep(.info-tips-btn) {
  width: 1.35rem;
  height: 1.35rem;
  min-width: 1.35rem;
  padding: 0;
  font-size: 0.72rem;
}

.track-wrap {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  min-height: 44px;
  height: 100%;
  margin: 0.12rem 0.12rem 0.12rem 0;
}
.grid-wrap {
  position: relative;
  flex: 1 1 auto;
  min-height: 44px;
  overflow: hidden;
  border-radius: 8px;
  border: 1px solid var(--border);
}
.grid-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
.track {
  position: absolute;
  inset: 0;
  touch-action: none;
  cursor: pointer;
}
.cell {
  position: absolute;
  top: 4px;
  bottom: 4px;
  left: 0;
  border-radius: 7px;
  border: 1px solid color-mix(in srgb, var(--accent) 45%, var(--border));
  background: color-mix(in srgb, var(--accent) 18%, var(--surface));
  overflow: hidden;
  z-index: 1;
}
.cell.blank {
  border-style: dashed;
  background: color-mix(in srgb, var(--muted) 10%, var(--surface));
  color: var(--muted);
}
.cell.blank .txt {
  font-weight: 600;
  letter-spacing: 0.06em;
}
.cell.selected {
  outline: 2px solid var(--accent);
  outline-offset: 0;
  z-index: 2;
}
.cell.ghost {
  border-style: dashed;
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  pointer-events: none;
  z-index: 0;
}
.cell.preview,
.cell.preview-ghost {
  border-style: dashed;
  border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
  background: color-mix(in srgb, var(--accent) 18%, var(--surface));
  outline: 2px dashed color-mix(in srgb, var(--accent) 65%, transparent);
  outline-offset: 1px;
  z-index: 3;
}
.cell.preview-ghost {
  pointer-events: none;
}
.cell.preview .txt,
.cell.preview-ghost .txt {
  font-style: italic;
  font-weight: 800;
}
.cell.dragging {
  opacity: 0.85;
  z-index: 3;
}
.handle {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 6px;
  z-index: 0;
  background: color-mix(in srgb, var(--accent) 35%, transparent);
  cursor: pointer;
  pointer-events: none;
  transition: background 0.12s ease, width 0.12s ease, box-shadow 0.12s ease;
}
.handle.start {
  left: 0;
  border-radius: 6px 0 0 6px;
}
.handle.end {
  right: 0;
  border-radius: 0 6px 6px 0;
}
.handle.hot {
  width: 9px;
  background: color-mix(in srgb, var(--accent) 85%, transparent);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 55%, transparent);
  z-index: 4;
}
.cell:hover .handle:not(.hot) {
  background: color-mix(in srgb, var(--accent) 55%, transparent);
}
.lab {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  box-sizing: border-box;
  height: 100%;
  width: 100%;
  min-width: 0;
  padding: 0 0.35rem;
  color: var(--text);
  font: inherit;
  font-size: 0.78rem;
  font-weight: 700;
  cursor: grab;
  text-align: left;
}
.txt {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}
</style>

<style>
.pop-anchor,
.inline-pop {
  position: fixed;
  z-index: 80;
}
.inline-pop {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  box-sizing: border-box;
  width: 15rem;
  min-width: 13.5rem;
  max-width: min(16rem, calc(100vw - 16px));
  padding: 0.4rem;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--surface);
  box-shadow: 0 8px 24px color-mix(in srgb, #000 18%, transparent);
  overflow: hidden;
  /* Keep room for a scrollable suggestion list under the input. */
  min-height: 0;
}
.inline-drag {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex: none;
  min-height: 1.35rem;
  margin: -0.1rem -0.1rem 0;
  padding: 0.15rem 0.25rem;
  border-radius: 3px;
  color: var(--muted);
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  cursor: grab;
  user-select: none;
  touch-action: none;
}
.inline-drag:active {
  cursor: grabbing;
}
.inline-drag-grip {
  width: 0.7rem;
  height: 0.7rem;
  border-radius: 2px;
  background:
    repeating-linear-gradient(
      90deg,
      color-mix(in srgb, var(--muted) 55%, transparent) 0 2px,
      transparent 2px 4px
    );
  opacity: 0.85;
}
.inline-drag-label {
  line-height: 1;
}
.inline-form {
  flex: none;
}
.inline-form input {
  width: 100%;
  min-height: 2rem;
  padding: 0.25rem 0.45rem;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg, var(--surface));
  color: var(--text);
  font: inherit;
}
.suggest {
  list-style: none;
  margin: 0;
  padding: 0;
  flex: 1 1 auto;
  min-height: 4.5rem;
  max-height: min(40vh, 16rem);
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
}
.suggest li {
  padding: 0.25rem 0.45rem;
  border-radius: 5px;
  cursor: pointer;
  font-size: 0.82rem;
}
.suggest li.on,
.suggest li:hover {
  background: color-mix(in srgb, var(--accent) 14%, transparent);
}
</style>
