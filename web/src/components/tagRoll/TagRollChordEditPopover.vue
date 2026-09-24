<script setup lang="ts">
/**
 * Draft chord edit popover for My Chords / Detected.
 * One click picks root + quality together; hold a chord (or Hear) to sustain audition.
 * Drag the toolbar to reposition; wide multi-column list reduces vertical scroll.
 * Layout is viewport-clamped (scrollable list) — callers pass maxHeightPx.
 */
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import { midiToNote } from '../../audio/pianoSamples'
import type { ChordAnalysisMode, ChordAnalysisSegment } from '../../domain/arranging/chordAnalysisBar'
import {
  buildHarmonizeChordOptions,
  optionKey,
  type HarmonizeChordOption,
} from '../../lib/tagRoll/harmonizer/chordPickOptions'
import {
  isHarmonySketchQuality,
  sketchLabel,
  sketchRoman,
} from '../../lib/tagRoll/harmonySketch'
import { tagRollTip } from '../../lib/tagRoll/shortcuts'
import type { HarmonySketchQuality, TagRollProject } from '../../lib/tagRoll/types'
import { HARMONY_SKETCH_QUALITIES } from '../../lib/tagRoll/types'

export type ChordEditDraft = {
  rootPc: number
  quality: HarmonySketchQuality
  /** Label currently highlighted (name or roman). */
  pickLabel: string
}

const props = defineProps<{
  seg: ChordAnalysisSegment
  mode: ChordAnalysisMode
  project: TagRollProject
  variant: 'declared' | 'detected'
  /** Viewport-aware max height for the panel (px). */
  maxHeightPx?: number
  /** Melody MIDI at this span — prefers lead-valid chords when known. */
  leadMidi?: number | null
}>()

const emit = defineEmits<{
  cancel: []
  apply: [draft: ChordEditDraft]
  /** Start (or restart) sustained audition while pointer is down. */
  hear: [draft: ChordEditDraft]
  /** Release sustained audition. */
  hearStop: []
  remove: []
}>()

const filter = ref('')
const showMore = ref(false)
const rootEl = ref<HTMLElement | null>(null)
const listEl = ref<HTMLElement | null>(null)
const holding = ref(false)
/** User drag offset from the caller’s initial placement (px). */
const dragOffset = ref({ x: 0, y: 0 })
/** Live max height while dragging (fit remaining viewport below top). */
const liveMaxH = ref<number | null>(null)

const VIEW_PAD = 8

type DragState = {
  pointerId: number
  startX: number
  startY: number
  origX: number
  origY: number
  baseLeft: number
  baseTop: number
  width: number
  height: number
}
let drag: DragState | null = null
const dragging = ref(false)

function seedFromSeg(seg: ChordAnalysisSegment): ChordEditDraft | null {
  if (seg.rootPc == null) return null
  const quality = (seg.quality &&
  (HARMONY_SKETCH_QUALITIES as readonly string[]).includes(seg.quality)
    ? seg.quality
    : 'major') as HarmonySketchQuality
  const pickLabel = props.mode === 'roman' ? seg.displayRoman : seg.displayName
  return { rootPc: seg.rootPc, quality, pickLabel }
}

const draft = ref<ChordEditDraft | null>(seedFromSeg(props.seg))

watch(
  () => props.seg.id,
  () => {
    stopHold()
    draft.value = seedFromSeg(props.seg)
    filter.value = ''
    showMore.value = false
    dragOffset.value = { x: 0, y: 0 }
    liveMaxH.value = null
    drag = null
    dragging.value = false
  },
)

const previewLabel = computed(() => {
  const d = draft.value
  if (!d) return props.mode === 'roman' ? props.seg.displayRoman : props.seg.displayName
  if (props.mode === 'roman') {
    return sketchRoman(d, props.project.tonality, props.project.tonalityMode ?? 'major')
  }
  return sketchLabel(
    d,
    props.project.preferFlats,
    props.project.tonality,
    props.project.tonalityMode ?? 'major',
  )
})

const leadLabel = computed(() =>
  props.leadMidi != null ? midiToNote(props.leadMidi) : null,
)

const chordLists = computed(() =>
  buildHarmonizeChordOptions({
    tonality: props.project.tonality,
    mode: props.project.tonalityMode ?? 'major',
    preferFlats: props.project.preferFlats,
    leadMidi: props.leadMidi ?? null,
    // Always keep lead-valid marking when melody is known (never flatten to chordOnly).
    chordOnly: false,
  }),
)

function labelOf(o: HarmonizeChordOption): string {
  return props.mode === 'roman' ? o.roman : o.name
}

function matchesFilter(o: HarmonizeChordOption): boolean {
  const q = filter.value.trim().toLowerCase()
  if (!q) return true
  return (
    o.name.toLowerCase().includes(q) ||
    o.roman.toLowerCase().includes(q) ||
    o.chordId.toLowerCase().includes(q)
  )
}

/** Chords that contain the Lead tone (or all primary when no Lead). */
const melodyOpts = computed(() => {
  const all = [...chordLists.value.primary, ...chordLists.value.more].filter(matchesFilter)
  if (props.leadMidi == null) {
    return chordLists.value.primary.filter(matchesFilter)
  }
  return all.filter((o) => o.validForLead)
})

/** Other diatonic (etc.) chords that do not contain the Lead. */
const otherOpts = computed(() => {
  if (props.leadMidi == null) return chordLists.value.more.filter(matchesFilter)
  const all = [...chordLists.value.primary, ...chordLists.value.more].filter(matchesFilter)
  return all.filter((o) => !o.validForLead)
})

const selectedKey = computed(() => {
  const d = draft.value
  if (!d) return null
  const tonality = ((props.project.tonality % 12) + 12) % 12
  const rootOffset = (((d.rootPc - tonality) % 12) + 12) % 12
  return optionKey({ rootOffset, chordId: d.quality })
})

const dirty = computed(() => {
  const d = draft.value
  if (!d || props.seg.rootPc == null) return false
  const q0 = props.seg.quality ?? 'major'
  return d.rootPc !== props.seg.rootPc || d.quality !== q0
})

const panelStyle = computed(() => {
  const maxH = liveMaxH.value ?? props.maxHeightPx
  const style: Record<string, string> = {
    transform: `translate(${dragOffset.value.x}px, ${dragOffset.value.y}px)`,
  }
  if (maxH != null && maxH > 80) {
    style.maxHeight = `${Math.round(maxH)}px`
  }
  return style
})

function clampOffset(ox: number, oy: number, box: DragState): { x: number; y: number } {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const maxX = Math.max(VIEW_PAD - box.baseLeft, vw - VIEW_PAD - box.width - box.baseLeft)
  const maxY = Math.max(VIEW_PAD - box.baseTop, vh - VIEW_PAD - box.height - box.baseTop)
  return {
    x: Math.min(maxX, Math.max(VIEW_PAD - box.baseLeft, ox)),
    y: Math.min(maxY, Math.max(VIEW_PAD - box.baseTop, oy)),
  }
}

function syncLiveMaxH(): void {
  const el = rootEl.value
  if (!el) return
  const top = el.getBoundingClientRect().top
  liveMaxH.value = Math.max(160, Math.floor(window.innerHeight - top - VIEW_PAD))
}

function onToolbarPointerDown(e: PointerEvent): void {
  if (e.button !== 0) return
  const t = e.target as HTMLElement | null
  if (t?.closest('button, a, input, select, textarea, label')) return
  const el = rootEl.value
  if (!el) return
  const r = el.getBoundingClientRect()
  drag = {
    pointerId: e.pointerId,
    startX: e.clientX,
    startY: e.clientY,
    origX: dragOffset.value.x,
    origY: dragOffset.value.y,
    baseLeft: r.left - dragOffset.value.x,
    baseTop: r.top - dragOffset.value.y,
    width: r.width,
    height: r.height,
  }
  dragging.value = true
  try {
    el.setPointerCapture(e.pointerId)
  } catch {
    /* ignore */
  }
  e.preventDefault()
}

function onRootPointerMove(e: PointerEvent): void {
  if (!drag || e.pointerId !== drag.pointerId) return
  const next = clampOffset(
    drag.origX + (e.clientX - drag.startX),
    drag.origY + (e.clientY - drag.startY),
    drag,
  )
  dragOffset.value = next
  // Grow/shrink scroll area to remaining viewport under the dragged top edge.
  const top = drag.baseTop + next.y
  liveMaxH.value = Math.max(160, Math.floor(window.innerHeight - top - VIEW_PAD))
  // Height may change after maxHeight update — refresh clamp box size next frame.
  void nextTick(() => {
    if (!drag || !rootEl.value) return
    const r = rootEl.value.getBoundingClientRect()
    drag.height = r.height
    drag.width = r.width
  })
}

function onRootPointerUp(e: PointerEvent): void {
  if (!drag || e.pointerId !== drag.pointerId) return
  drag = null
  dragging.value = false
  syncLiveMaxH()
  try {
    rootEl.value?.releasePointerCapture(e.pointerId)
  } catch {
    /* already released */
  }
}

function applyOption(o: HarmonizeChordOption): ChordEditDraft | null {
  if (!isHarmonySketchQuality(o.chordId)) return null
  const next: ChordEditDraft = {
    rootPc: o.rootPc,
    quality: o.chordId,
    pickLabel: labelOf(o),
  }
  draft.value = next
  void nextTick(() => {
    listEl.value
      ?.querySelector<HTMLElement>('.chord.on')
      ?.scrollIntoView({ block: 'nearest' })
  })
  return next
}

function startHold(draftVal: ChordEditDraft, el?: HTMLElement | null, pointerId?: number): void {
  holding.value = true
  if (el != null && pointerId != null) {
    try {
      el.setPointerCapture(pointerId)
    } catch {
      /* ignore — already captured / unsupported */
    }
  }
  emit('hear', draftVal)
}

function stopHold(): void {
  if (!holding.value) return
  holding.value = false
  emit('hearStop')
}

function onChordPointerDown(o: HarmonizeChordOption, e: PointerEvent): void {
  if (e.button !== 0) return
  const next = applyOption(o)
  if (!next) return
  e.preventDefault()
  startHold(next, e.currentTarget as HTMLElement, e.pointerId)
}

function onHearPointerDown(e: PointerEvent): void {
  if (e.button !== 0 || !draft.value) return
  e.preventDefault()
  startHold(draft.value, e.currentTarget as HTMLElement, e.pointerId)
}

function onApply(): void {
  stopHold()
  if (draft.value) emit('apply', draft.value)
}
function onCancel(): void {
  stopHold()
  emit('cancel')
}

onUnmounted(() => stopHold())
</script>

<template>
  <div
    ref="rootEl"
    class="chord-edit-pop"
    role="dialog"
    :aria-label="variant === 'detected' ? 'Edit detection' : 'Edit chord'"
    :class="{ dragging }"
    :style="panelStyle"
    @pointermove="onRootPointerMove"
    @pointerup="onRootPointerUp"
    @pointercancel="onRootPointerUp"
  >
    <div
      class="toolbar"
      title="Drag to move"
      @pointerdown="onToolbarPointerDown"
    >
      <span class="drag-grip" aria-hidden="true">⠿</span>
      <span class="preview" :title="previewLabel">{{ previewLabel }}</span>
      <div class="actions">
        <button
          type="button"
          class="hear"
          :class="{ holding }"
          :title="tagRollTip('Hold to hear this selection')"
          @pointerdown="onHearPointerDown"
          @pointerup="stopHold"
          @pointercancel="stopHold"
          @lostpointercapture="stopHold"
        >
          Hear
        </button>
        <button
          type="button"
          class="icon cancel"
          :title="tagRollTip('Cancel')"
          aria-label="Cancel"
          @click="onCancel"
        >
          ✕
        </button>
        <button
          type="button"
          class="icon apply"
          :class="{ dirty }"
          :title="tagRollTip(variant === 'detected' ? 'Apply into My Chords' : 'Apply')"
          aria-label="Apply"
          @click="onApply"
        >
          ✓
        </button>
      </div>
    </div>

    <p v-if="leadLabel" class="lead-hint">
      ♪ = contains Lead <strong>{{ leadLabel }}</strong> · hold a chord to hear
    </p>
    <p v-else class="lead-hint muted">No Lead under this span · hold a chord to hear</p>

    <input
      v-model="filter"
      type="search"
      class="filter"
      :placeholder="mode === 'roman' ? 'Filter: V7, ii…' : 'Filter: G7, Dm…'"
      autocomplete="off"
      aria-label="Filter chords"
    />

    <div ref="listEl" class="chord-scroll" role="listbox" :aria-label="'Chord choices'">
      <p v-if="leadLabel && melodyOpts.length" class="sec-label">Contains melody</p>
      <button
        v-for="o in melodyOpts"
        :key="optionKey(o)"
        type="button"
        class="chord"
        role="option"
        :class="{ on: selectedKey === optionKey(o), lead: o.validForLead && leadLabel }"
        :aria-selected="selectedKey === optionKey(o)"
        :title="
          o.validForLead && leadLabel
            ? `${o.name} (${o.roman}) — contains Lead ${leadLabel}. Hold to hear.`
            : `${o.name} (${o.roman}). Hold to hear.`
        "
        @pointerdown="onChordPointerDown(o, $event)"
        @pointerup="stopHold"
        @pointercancel="stopHold"
        @lostpointercapture="stopHold"
      >
        <span v-if="o.validForLead && leadLabel" class="lead-mark" aria-hidden="true">♪</span>
        <span class="cn">{{ o.name }}</span>
        <span class="cr">{{ o.roman }}</span>
      </button>

      <p v-if="!melodyOpts.length && !otherOpts.length" class="empty">No matches</p>

      <button
        v-if="otherOpts.length"
        type="button"
        class="more-tog"
        @click="showMore = !showMore"
      >
        {{ showMore ? 'Hide other…' : `Other (${otherOpts.length})…` }}
      </button>
      <template v-if="showMore && otherOpts.length">
        <p class="sec-label muted">
          {{ leadLabel ? 'Does not contain melody' : 'More qualities' }}
        </p>
        <button
          v-for="o in otherOpts"
          :key="`m-${optionKey(o)}`"
          type="button"
          class="chord muted"
          role="option"
          :class="{ on: selectedKey === optionKey(o) }"
          :aria-selected="selectedKey === optionKey(o)"
          :title="`${o.name} (${o.roman}) — Lead not in this chord. Hold to hear.`"
          @pointerdown="onChordPointerDown(o, $event)"
          @pointerup="stopHold"
          @pointercancel="stopHold"
          @lostpointercapture="stopHold"
        >
          <span class="cn">{{ o.name }}</span>
          <span class="cr">{{ o.roman }}</span>
        </button>
      </template>
    </div>

    <button
      v-if="variant === 'declared'"
      type="button"
      class="danger"
      @click="emit('remove')"
    >
      Delete
    </button>
  </div>
</template>

<style scoped>
.chord-edit-pop {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  width: min(32rem, calc(100vw - 1rem));
  min-width: 16rem;
  padding: 0.4rem;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
  box-shadow: 0 10px 28px color-mix(in srgb, #000 20%, transparent);
  overflow: hidden;
}
.chord-edit-pop.dragging {
  cursor: grabbing;
  user-select: none;
}
.toolbar {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex: none;
  cursor: grab;
  min-height: 1.7rem;
  touch-action: none;
}
.chord-edit-pop.dragging .toolbar {
  cursor: grabbing;
}
.drag-grip {
  flex: none;
  color: var(--muted);
  font-size: 0.85rem;
  line-height: 1;
  letter-spacing: -0.05em;
  opacity: 0.75;
  user-select: none;
}
.preview {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 1rem;
  font-weight: 750;
  color: var(--text);
}
.actions {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  flex: none;
}
.hear {
  min-height: 1.7rem;
  padding: 0.15rem 0.4rem;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 0.72rem;
  font-weight: 700;
  cursor: pointer;
  touch-action: none;
  user-select: none;
}
.hear:hover,
.hear.holding {
  background: color-mix(in srgb, var(--accent) 12%, var(--surface));
}
.icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.7rem;
  height: 1.7rem;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 0.95rem;
  line-height: 1;
  cursor: pointer;
}
.icon.apply.dirty {
  border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
  background: color-mix(in srgb, var(--accent) 18%, var(--surface));
  color: var(--accent);
  font-weight: 800;
}
.icon:hover {
  background: color-mix(in srgb, var(--accent) 10%, var(--surface));
}
.lead-hint {
  margin: 0;
  font-size: 0.68rem;
  color: var(--text);
  line-height: 1.35;
}
.lead-hint.muted,
.sec-label.muted {
  color: var(--muted);
}
.lead-hint strong {
  font-weight: 750;
}
.filter {
  width: 100%;
  min-height: 1.7rem;
  padding: 0.2rem 0.4rem;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg, var(--surface));
  color: var(--text);
  font: inherit;
  font-size: 0.78rem;
  box-sizing: border-box;
}
.chord-scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(6.25rem, 1fr));
  gap: 0.25rem;
  align-content: start;
  padding: 0.05rem;
}
.sec-label {
  grid-column: 1 / -1;
  margin: 0.15rem 0 0;
  font-size: 0.65rem;
  font-weight: 750;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--muted);
}
.chord {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.25rem;
  min-height: 1.85rem;
  padding: 0.2rem 0.35rem;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 0.78rem;
  cursor: pointer;
  text-align: left;
  touch-action: none;
  user-select: none;
}
.chord.lead {
  border-color: color-mix(in srgb, var(--accent) 40%, var(--border));
}
.chord.muted {
  opacity: 0.78;
}
.chord.on {
  border-color: color-mix(in srgb, var(--accent) 60%, var(--border));
  background: color-mix(in srgb, var(--accent) 16%, var(--surface));
  font-weight: 700;
}
.chord:hover {
  background: color-mix(in srgb, var(--accent) 10%, var(--surface));
}
.lead-mark {
  flex: none;
  font-size: 0.72rem;
  color: var(--accent, #3a6ea5);
  font-weight: 800;
}
.cn {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 650;
}
.cr {
  flex: none;
  font-size: 0.68rem;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}
.more-tog {
  grid-column: 1 / -1;
  min-height: 1.6rem;
  border: none;
  background: transparent;
  color: var(--accent);
  font: inherit;
  font-size: 0.72rem;
  font-weight: 700;
  cursor: pointer;
  text-align: left;
  padding: 0.15rem 0.1rem;
}
.empty {
  grid-column: 1 / -1;
  margin: 0.35rem 0;
  font-size: 0.75rem;
  color: var(--muted);
}
.danger {
  flex: none;
  min-height: 1.7rem;
  border: 1px solid color-mix(in srgb, #c44 40%, var(--border));
  border-radius: 6px;
  background: color-mix(in srgb, #c44 8%, var(--surface));
  color: #a33;
  font: inherit;
  font-size: 0.75rem;
  font-weight: 700;
  cursor: pointer;
}
</style>
