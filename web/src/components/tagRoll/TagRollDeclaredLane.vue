<script setup lang="ts">
/**
 * Sketch (harmony map) bottom lane — locked sketch spans (click/drag-to-define, multi-select, resize).
 */
import { computed, nextTick, onMounted, onUnmounted, ref, toRef, watch } from 'vue'
import type { ChordAnalysisMode, ChordAnalysisSegment } from '../../domain/arranging/chordAnalysisBar'
import {
  suggestHarmonyEntries,
  type HarmonyEntrySuggestion,
} from '../../lib/tagRoll/harmonySketch'
import { drawLaneTimeGrid } from '../../lib/tagRoll/laneTimeGrid'
import { stripSegW, stripSegX } from '../../lib/tagRoll/harmonyStripGestures'
import { useDeclaredStripGestures } from '../../composables/useDeclaredStripGestures'
import { tagRollTip } from '../../lib/tagRoll/shortcuts'
import type { HarmonyPreviewDraft } from '../../lib/tagRoll/harmonyPreviewDraft'
import { previewDraftDirty } from '../../lib/tagRoll/harmonyPreviewDraft'
import type { HarmonySketchQuality, TagRollProject } from '../../lib/tagRoll/types'
import { sketchLabel, sketchRomanDisplay, isPillarSketchSpan } from '../../lib/tagRoll/harmonySketch'
import { SKETCH_LANE_HOWTO } from '../../lib/tagRoll/harmonyHowTo'
import { usePreferencesStore } from '../../stores/preferences'
import { useTagRollStore } from '../../stores/tagRoll'
import InfoTips from '../InfoTips.vue'
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
  commitAt: [payload: { raw: string; startTick: number; endTick: number; id?: string }]
  geometry: [payload: { id: string; startTick: number; endTick: number }]
  geometryMany: [payloads: Array<{ id: string; startTick: number; endTick: number }>]
  beginGesture: []
  /** Open / toggle Sketch chord in the right dock. */
  edit: [seg: ChordAnalysisSegment]
  /** Toggle structural pillar on a Sketch span (Alt+click / badge). */
  togglePillar: [seg: ChordAnalysisSegment]
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
const inlinePos = ref({ top: '0px', left: '0px', minWidth: '12rem' })
const inlineSuggestListId = 'tag-roll-declared-inline-suggest'

const scrollX = computed(() => props.project.view.scrollX)
const cellW = computed(() => props.project.view.cellW)
const ppq = computed(() => props.project.ppq)
const snapTicks = computed(() => Math.max(1, props.project.snapTicks))
const lengthTicks = computed(() => props.project.lengthTicks)

const editSegId = computed(() => props.editSegId ?? null)

function labelOf(seg: ChordAnalysisSegment): string {
  return props.mode === 'roman' ? seg.displayRoman : seg.displayName
}

function isPillarSeg(seg: ChordAnalysisSegment): boolean {
  const s = (props.project.harmonySketch ?? []).find((x) => x.id === seg.id)
  return s ? isPillarSketchSpan(s) : false
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
    store.selectSketchSpans([seg.id])
    emit('focusRange', seg.startTick, seg.endTick)
    emit('edit', seg)
  },
  onTogglePillar: (seg) => {
    if (props.readOnly) return
    store.selectSketchSpans([seg.id])
    emit('focusRange', seg.startTick, seg.endTick)
    emit('togglePillar', seg)
  },
  onGeometry: (payload) => emit('geometry', payload),
  onGeometryMany: (payloads) => emit('geometryMany', payloads),
  onFocusRange: (a, b) => emit('focusRange', a, b),
})

function onPillarBadge(seg: ChordAnalysisSegment, e: PointerEvent): void {
  e.stopPropagation()
  e.preventDefault()
  if (props.readOnly || seg.rootPc == null) return
  store.selectSketchSpans([seg.id])
  emit('focusRange', seg.startTick, seg.endTick)
  emit('togglePillar', seg)
}

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

function closeInline(): void {
  inlineEdit.value = null
  inlineDraft.value = ''
  inlineSuggestOpen.value = false
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
        <section v-for="sec in SKETCH_LANE_HOWTO" :key="sec.title" class="howto-sec">
          <p><strong>{{ sec.title }}</strong></p>
          <p>{{ sec.body }}</p>
          <ol v-if="sec.steps?.length">
            <li v-for="(step, i) in sec.steps" :key="i">{{ step }}</li>
          </ol>
        </section>
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
          :title="tagRollTip('Drag empty to paint; Alt+click or ◆ marks a pillar; click opens editor')"
          @pointerdown="onDeclaredPointerDown"
          @pointermove="onDeclaredPointerMove"
          @pointerup="onDeclaredPointerUp"
          @pointercancel="onDeclaredPointerCancel"
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
              pillar: isPillarSeg(seg),
              menu: editSegId === seg.id || inlineEdit?.id === seg.id,
              selected: isSelected(seg.id),
              dragging: isDragging(seg.id),
              preview: isPreviewingSeg(seg),
            }"
            :style="segStyle(seg)"
          >
            <span class="handle start" aria-hidden="true" />
            <div
              class="lab"
              :title="
                isPreviewingSeg(seg) && previewDraft
                  ? `Preview: ${previewLabelOf(previewDraft)} (not applied)`
                  : isPillarSeg(seg)
                    ? `Pillar: ${labelOf(seg)} — Alt+click or ◆ to clear`
                    : `Chord: ${labelOf(seg)} — Alt+click or ◆ to mark pillar`
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
            <button
              type="button"
              class="pillar-badge"
              :class="{ on: isPillarSeg(seg) }"
              :title="
                isPillarSeg(seg)
                  ? 'Clear pillar (Alt+click)'
                  : 'Mark as pillar (Alt+click)'
              "
              :aria-label="isPillarSeg(seg) ? 'Clear pillar' : 'Mark as pillar'"
              :aria-pressed="isPillarSeg(seg)"
              :disabled="readOnly || seg.rootPc == null"
              @pointerdown="onPillarBadge(seg, $event)"
            >
              ◆
            </button>
            <span class="handle end" aria-hidden="true" />
          </div>
        </div>
      </div>
    </div>

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
.howto-sec + .howto-sec {
  margin-top: 0.55rem;
  padding-top: 0.45rem;
  border-top: 1px solid var(--border);
}
.howto-sec ol {
  margin: 0.25rem 0 0;
  padding-left: 1.1rem;
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
  cursor: crosshair;
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
.cell.pillar {
  border-color: color-mix(in srgb, #1f7a4d 55%, var(--border));
  background: color-mix(in srgb, #2a8c5a 28%, var(--surface));
  box-shadow: inset 0 0 0 1px color-mix(in srgb, #2a8c5a 35%, transparent);
}
.cell.pillar .handle {
  background: color-mix(in srgb, #2a8c5a 40%, transparent);
}
.pillar-badge {
  position: absolute;
  top: 2px;
  right: 3px;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1rem;
  height: 1rem;
  padding: 0;
  border: none;
  border-radius: 3px;
  background: color-mix(in srgb, var(--surface) 70%, transparent);
  color: var(--muted);
  font: inherit;
  font-size: 0.55rem;
  line-height: 1;
  cursor: pointer;
  opacity: 0.72;
}
.pillar-badge:hover:not(:disabled),
.cell.selected .pillar-badge,
.cell.menu .pillar-badge {
  opacity: 1;
}
.pillar-badge.on {
  color: #1f6b45;
  background: color-mix(in srgb, #2a8c5a 22%, transparent);
  opacity: 1;
}
.pillar-badge:disabled {
  cursor: not-allowed;
  opacity: 0.35;
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
  width: 4px;
  z-index: 0;
  background: color-mix(in srgb, var(--accent) 40%, transparent);
  cursor: ew-resize;
  pointer-events: none;
}
.handle.start {
  left: 0;
  border-radius: 6px 0 0 6px;
}
.handle.end {
  right: 0;
  border-radius: 0 6px 6px 0;
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
