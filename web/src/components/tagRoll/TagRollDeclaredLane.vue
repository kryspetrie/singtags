<script setup lang="ts">
/**
 * My Chords bottom lane — locked harmony map (click/drag-to-define, multi-select, resize).
 */
import { computed, nextTick, onMounted, onUnmounted, ref, toRef, watch } from 'vue'
import type { ChordAnalysisMode, ChordAnalysisSegment } from '../../domain/arranging/chordAnalysisBar'
import {
  suggestHarmonyEntries,
  type HarmonyEntrySuggestion,
} from '../../lib/tagRoll/harmonySketch'
import { drawLaneTimeGrid } from '../../lib/tagRoll/laneTimeGrid'
import { stripSegW, stripSegX } from '../../lib/tagRoll/harmonyStripGestures'
import { useDeclaredStripGestures } from '../../lib/tagRoll/useDeclaredStripGestures'
import { placePopoverNearAnchor } from '../../lib/tagRoll/placePopover'
import { tagRollTip } from '../../lib/tagRoll/shortcuts'
import type { HarmonySketchQuality, TagRollProject } from '../../lib/tagRoll/types'
import { usePreferencesStore } from '../../stores/preferences'
import { useTagRollStore } from '../../stores/tagRoll'
import TagRollBottomLaneShell from './TagRollBottomLaneShell.vue'
import TagRollChordEditPopover, {
  type ChordEditDraft,
} from './TagRollChordEditPopover.vue'

const TRACK_H = 52

const props = defineProps<{
  project: TagRollProject
  segments: readonly ChordAnalysisSegment[]
  /** Detected fills — Realize uses them so My Chords inversions path-match Detected. */
  detectSegments?: readonly ChordAnalysisSegment[]
  mode: ChordAnalysisMode
  leftGutterPx?: number
  readOnly?: boolean
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
  applyDraft: [id: string, draft: ChordEditDraft]
  commitAt: [payload: { raw: string; startTick: number; endTick: number; id?: string }]
  geometry: [payload: { id: string; startTick: number; endTick: number }]
  geometryMany: [payloads: Array<{ id: string; startTick: number; endTick: number }>]
  beginGesture: []
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
  store.realizeHarmonySketchStacks({ detectSpans })
}

const rootEl = ref<HTMLElement | null>(null)
const declaredTrackEl = ref<HTMLElement | null>(null)
const menuEl = ref<HTMLElement | null>(null)
const inlineEl = ref<HTMLElement | null>(null)
const inlineInputEl = ref<HTMLInputElement | null>(null)
const wrapRef = ref<HTMLElement | null>(null)
const gridCanvasRef = ref<HTMLCanvasElement | null>(null)
const cssW = ref(640)

const openMenuTick = ref<number | null>(null)
const inlineDraft = ref('')
const inlineSuggestOpen = ref(false)
const inlineSuggestIdx = ref(0)
type InlineEdit = { id?: string; startTick: number; endTick: number; seed: string }
const inlineEdit = ref<InlineEdit | null>(null)
const menuPos = ref({ top: '0px', left: '0px', minWidth: '12rem' })
const menuMaxHeightPx = ref(320)
const inlinePos = ref({ top: '0px', left: '0px', minWidth: '12rem' })
const inlineSuggestListId = 'tag-roll-declared-inline-suggest'

const scrollX = computed(() => props.project.view.scrollX)
const cellW = computed(() => props.project.view.cellW)
const ppq = computed(() => props.project.ppq)
const snapTicks = computed(() => Math.max(1, props.project.snapTicks))
const lengthTicks = computed(() => props.project.lengthTicks)

const openSeg = computed(() => {
  if (openMenuTick.value == null) return null
  return props.segments.find((s) => s.startTick === openMenuTick.value) ?? null
})

function labelOf(seg: ChordAnalysisSegment): string {
  return props.mode === 'roman' ? seg.displayRoman : seg.displayName
}

function openInlineEditor(opts: {
  id?: string
  startTick: number
  endTick: number
  seed: string
}): void {
  closeMenu()
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
    inlineInputEl.value?.focus()
    inlineInputEl.value?.select()
  })
}

const {
  gesture,
  previewFor,
  placePreview,
  onPointerDown: onDeclaredPointerDown,
  onPointerMove: onDeclaredPointerMove,
  onPointerUp: onDeclaredPointerUp,
  onPointerCancel: onDeclaredPointerCancel,
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
    openInlineEditor({ startTick, endTick, seed: '' })
  },
  onEdit: (seg) => {
    openInlineEditor({
      id: seg.id,
      startTick: seg.startTick,
      endTick: seg.endTick,
      seed: labelOf(seg),
    })
  },
  onGeometry: (payload) => emit('geometry', payload),
  onGeometryMany: (payloads) => emit('geometryMany', payloads),
  onFocusRange: (a, b) => emit('focusRange', a, b),
})

function onTrackFocus(): void {
  store.setChordsLaneFocused(true)
}

const inlineSuggestions = computed((): HarmonyEntrySuggestion[] =>
  suggestHarmonyEntries(inlineDraft.value, {
    tonality: props.project.tonality,
    mode: props.project.tonalityMode ?? 'major',
    preferFlats: props.project.preferFlats,
    entryMode: props.mode === 'roman' ? 'roman' : 'name',
  }),
)

function segStyle(seg: ChordAnalysisSegment): Record<string, string> {
  const prev = previewFor(seg)
  const start = prev?.startTick ?? seg.startTick
  const end = prev?.endTick ?? seg.endTick
  const x = stripSegX(start, scrollX.value, cellW.value, ppq.value)
  const w = stripSegW(start, end, cellW.value, ppq.value)
  return { transform: `translate3d(${x}px, 0, 0)`, width: `${w}px` }
}

function closeMenu(): void {
  emit('hearStop')
  openMenuTick.value = null
}
function closeInline(): void {
  inlineEdit.value = null
  inlineDraft.value = ''
  inlineSuggestOpen.value = false
}
function placeMenu(): void {
  const anchor = rootEl.value?.querySelector('.cell.menu .lab') as HTMLElement | null
  if (!anchor) return
  const placed = placePopoverNearAnchor(anchor.getBoundingClientRect(), {
    minWidth: 280,
    preferredWidth: 512,
  })
  menuPos.value = {
    top: placed.top,
    left: placed.left,
    minWidth: placed.minWidth,
  }
  menuMaxHeightPx.value = placed.maxHeightPx
}

function leadMidiAt(tick: number): number | null {
  const melId =
    props.project.view.melodyPartId ??
    props.project.parts.find((p) => p.name === 'Lead')?.id ??
    null
  if (!melId) return null
  const hit = props.project.notes.find(
    (n) =>
      n.partId === melId &&
      n.startTick <= tick &&
      tick < n.startTick + n.durationTicks,
  )
  return hit?.midi ?? null
}
function placeInline(): void {
  const edit = inlineEdit.value
  if (!edit) return
  const x = stripSegX(edit.startTick, scrollX.value, cellW.value, ppq.value)
  const track = declaredTrackEl.value
  if (!track) return
  const tr = track.getBoundingClientRect()
  inlinePos.value = {
    top: `${Math.round(tr.bottom + 2)}px`,
    left: `${Math.round(tr.left + Math.max(0, x))}px`,
    minWidth: '14rem',
  }
}
function setMode(m: ChordAnalysisMode): void {
  emit('update:mode', m)
  closeMenu()
  closeInline()
}
function onMenuButton(seg: ChordAnalysisSegment, e: MouseEvent): void {
  e.stopPropagation()
  e.preventDefault()
  store.selectSketchSpans([seg.id])
  emit('focusRange', seg.startTick, seg.endTick)
  openMenuTick.value = openMenuTick.value === seg.startTick ? null : seg.startTick
  void nextTick(() => placeMenu())
}

function placeGhostStyle(): Record<string, string> | null {
  const prev = placePreview()
  if (!prev) return null
  const x = stripSegX(prev.startTick, scrollX.value, cellW.value, ppq.value)
  const w = stripSegW(prev.startTick, prev.endTick, cellW.value, ppq.value)
  return { transform: `translate3d(${x}px, 0, 0)`, width: `${w}px` }
}

function isSelected(id: string): boolean {
  return selectedIds.value.includes(id)
}

function isDragging(id: string): boolean {
  const g = gesture.value
  if (!g) return false
  if (g.kind === 'resize') return g.id === id
  if (g.kind === 'move') return g.ids.includes(id)
  return false
}
function onDraftHear(draft: ChordEditDraft): void {
  const seg = openSeg.value
  if (!seg) return
  emit('hear', seg.startTick, seg.endTick, {
    rootPc: draft.rootPc,
    quality: draft.quality,
  })
}
function onDraftHearStop(): void {
  emit('hearStop')
}
function onDraftApply(draft: ChordEditDraft): void {
  const seg = openSeg.value
  if (!seg) return
  emit('applyDraft', seg.id, draft)
  closeMenu()
}
function submitInline(raw?: string): void {
  const edit = inlineEdit.value
  if (!edit) return
  const text = (raw ?? inlineDraft.value).trim()
  if (!text) return
  emit('commitAt', {
    raw: text,
    startTick: edit.startTick,
    endTick: edit.endTick,
    id: edit.id,
  })
  closeInline()
}
function onInlineKeydown(e: KeyboardEvent): void {
  if (!inlineSuggestOpen.value && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
    inlineSuggestOpen.value = true
  }
  if (e.key === 'Escape') {
    e.preventDefault()
    closeInline()
    return
  }
  if (!inlineSuggestions.value.length) {
    if (e.key === 'Enter') {
      e.preventDefault()
      submitInline()
    }
    return
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    inlineSuggestIdx.value = (inlineSuggestIdx.value + 1) % inlineSuggestions.value.length
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    inlineSuggestIdx.value =
      (inlineSuggestIdx.value - 1 + inlineSuggestions.value.length) % inlineSuggestions.value.length
  } else if (e.key === 'Enter') {
    e.preventDefault()
    const hit = inlineSuggestions.value[inlineSuggestIdx.value]
    if (hit && inlineSuggestOpen.value) submitInline(hit.insert)
    else submitInline()
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
  if (openMenuTick.value != null) placeMenu()
  if (inlineEdit.value) placeInline()
})
watch(inlineDraft, () => {
  inlineSuggestIdx.value = 0
  inlineSuggestOpen.value = true
})
watch(openMenuTick, (tick, _p, onCleanup) => {
  if (tick == null) return
  void nextTick(() => placeMenu())
  const onPointerDownDoc = (e: PointerEvent) => {
    const t = e.target
    if (!(t instanceof Node)) {
      closeMenu()
      return
    }
    const openCell = rootEl.value?.querySelector('.cell.menu')
    if (openCell?.contains(t) || menuEl.value?.contains(t)) return
    closeMenu()
  }
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      closeMenu()
    }
  }
  const raf = requestAnimationFrame(() => {
    document.addEventListener('pointerdown', onPointerDownDoc, true)
    document.addEventListener('keydown', onKeyDown, true)
  })
  onCleanup(() => {
    cancelAnimationFrame(raf)
    document.removeEventListener('pointerdown', onPointerDownDoc, true)
    document.removeEventListener('keydown', onKeyDown, true)
  })
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
    label="My Chords"
    :left-gutter-px="leftGutterPx"
    :view-options="[
      { value: 'name', label: 'Chord' },
      { value: 'roman', label: 'Number' },
    ]"
    :view-value="mode"
    view-aria-label="My Chords label view"
    @update:view="setMode(($event as 'name' | 'roman'))"
  >
    <template #gutter>
      <button
        type="button"
        class="realize-btn"
        :disabled="!canRealize"
        :title="tagRollTip(selectedIds.length
          ? 'Realize selected chords as TTBB stacks under Lead notes'
          : 'Realize locked chords as TTBB stacks under Lead notes')"
        @click="onRealize"
      >
        Realize
      </button>
    </template>
    <div ref="rootEl" class="track-wrap" @pointerdown="onTrackFocus">
      <div ref="wrapRef" class="grid-wrap">
        <canvas ref="gridCanvasRef" class="grid-canvas" aria-hidden="true" />
        <div
          ref="declaredTrackEl"
          class="track"
          :title="tagRollTip('Drag empty to paint a chord; drag across chords to select; Delete removes; click again to edit')"
          @pointerdown="onDeclaredPointerDown"
          @pointermove="onDeclaredPointerMove"
          @pointerup="onDeclaredPointerUp"
          @pointercancel="onDeclaredPointerCancel"
        >
          <p v-if="!segments.length && !placePreview()" class="empty">
            Drag empty to paint · drag across chords to select · Delete to remove…
          </p>
          <div
            v-if="placeGhostStyle()"
            class="cell ghost"
            :style="placeGhostStyle()!"
            aria-hidden="true"
          />
          <div
            v-for="seg in segments"
            :key="`d-${seg.id}`"
            class="cell locked"
            :class="{
              menu: openMenuTick === seg.startTick || inlineEdit?.id === seg.id,
              selected: isSelected(seg.id),
              dragging: isDragging(seg.id),
            }"
            :style="segStyle(seg)"
          >
            <span class="handle start" aria-hidden="true" />
            <div class="lab" :title="`Chord: ${labelOf(seg)}`">
              <span class="txt">{{ labelOf(seg) }}</span>
              <button
                type="button"
                class="caret"
                :title="tagRollTip('Chord menu')"
                @pointerdown.stop="onMenuButton(seg, $event)"
              >
                ▾
              </button>
            </div>
            <span class="handle end" aria-hidden="true" />
          </div>
        </div>
      </div>
    </div>

    <Teleport to="body">
      <div
        v-if="openSeg"
        ref="menuEl"
        class="pop-anchor"
        :style="menuPos"
      >
        <TagRollChordEditPopover
          :seg="openSeg"
          :mode="mode"
          :project="project"
          variant="declared"
          :max-height-px="menuMaxHeightPx"
          :lead-midi="leadMidiAt(openSeg.startTick)"
          @cancel="closeMenu"
          @apply="onDraftApply"
          @hear="onDraftHear"
          @hear-stop="onDraftHearStop"
          @remove="emit('remove', openSeg.id); closeMenu()"
        />
      </div>
    </Teleport>

    <Teleport to="body">
      <div
        v-if="inlineEdit"
        ref="inlineEl"
        class="inline-pop"
        :style="inlinePos"
      >
        <form class="inline-form" @submit.prevent="submitInline()">
          <input
            ref="inlineInputEl"
            v-model="inlineDraft"
            type="text"
            :placeholder="mode === 'roman' ? 'V7, iiø…' : 'G7, Dm…'"
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
  margin-top: 0.15rem;
  padding: 0.2rem 0.25rem;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: color-mix(in srgb, var(--accent) 12%, var(--surface));
  color: var(--text);
  font: inherit;
  font-size: 0.68rem;
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
.track-wrap {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  min-height: 52px;
  height: 100%;
  margin: 0.3rem 0.15rem 0.3rem 0;
}
.grid-wrap {
  position: relative;
  flex: 1 1 auto;
  min-height: 52px;
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
  cursor: crosshair;
}
.empty {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  padding: 0 0.65rem;
  margin: 0;
  font-size: 0.92rem;
  color: var(--muted);
  pointer-events: none;
}
.hint {
  font-size: 0.72rem;
  color: var(--muted);
  font-weight: 600;
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
  display: flex;
  align-items: stretch;
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
.cell.dragging {
  opacity: 0.85;
  z-index: 3;
}
.handle {
  flex: none;
  width: 8px;
  background: color-mix(in srgb, var(--accent) 35%, transparent);
  cursor: ew-resize;
}
.handle.start {
  border-radius: 6px 0 0 6px;
}
.handle.end {
  border-radius: 0 6px 6px 0;
}
.lab {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  flex: 1;
  min-width: 0;
  padding: 0 0.35rem;
  color: var(--text);
  font: inherit;
  font-size: 1rem;
  font-weight: 750;
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
.caret {
  flex: none;
  font-size: 0.75rem;
  opacity: 0.7;
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  padding: 0 0.15rem;
  min-height: 100%;
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
  gap: 0.15rem;
  padding: 0.35rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  box-shadow: 0 8px 24px color-mix(in srgb, #000 18%, transparent);
}
.inline-form input {
  width: 100%;
  min-height: 2rem;
  padding: 0.25rem 0.45rem;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg, var(--surface));
  color: var(--text);
  font: inherit;
}
.suggest {
  list-style: none;
  margin: 0.2rem 0 0;
  padding: 0;
  max-height: 10rem;
  overflow: auto;
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
