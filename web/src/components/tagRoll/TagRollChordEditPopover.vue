<script setup lang="ts">
/**
 * Draft chord edit for Sketch / Detected — floating or right-docked.
 * Shared TagRollChordPickList; hold to audition; drag toolbar only when floating.
 */
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import { midiToNote } from '../../audio/pianoSamples'
import type { ChordAnalysisMode, ChordAnalysisSegment } from '../../domain/arranging/chordAnalysisBar'
import {
  buildHarmonizeChordOptions,
  optionKey,
  type ChordRankHint,
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
import TagRollChordPickList from './TagRollChordPickList.vue'

export type ChordEditDraft = {
  rootPc: number
  quality: HarmonySketchQuality
  pickLabel: string
}

const props = withDefaults(
  defineProps<{
    seg: ChordAnalysisSegment
    mode: ChordAnalysisMode
    project: TagRollProject
    variant: 'declared' | 'detected'
    maxHeightPx?: number
    leadMidi?: number | null
    /** Detected implied candidates — sorted to the top of the list. */
    rankHints?: readonly ChordRankHint[] | null
    /** Right-column dock: no drag, fills parent, ✓ commits without dismiss. */
    docked?: boolean
  }>(),
  { docked: false },
)

const emit = defineEmits<{
  cancel: []
  apply: [draft: ChordEditDraft]
  /** Draft changed — parent mirrors onto Sketch lane + transport audition. */
  'update:draft': [draft: ChordEditDraft | null]
  hear: [draft: ChordEditDraft]
  hearStop: []
  remove: []
}>()

const rootEl = ref<HTMLElement | null>(null)
const holding = ref(false)
const dragOffset = ref({ x: 0, y: 0 })
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
const baseline = ref<ChordEditDraft | null>(seedFromSeg(props.seg))

watch(
  draft,
  (d) => {
    emit('update:draft', d)
  },
  { immediate: true, deep: true },
)

function reseedsFromSeg(): void {
  stopHold()
  const seeded = seedFromSeg(props.seg)
  draft.value = seeded
  baseline.value = seeded
  dragOffset.value = { x: 0, y: 0 }
  liveMaxH.value = null
  drag = null
  dragging.value = false
}

watch(
  () => [props.seg.id, props.seg.rootPc, props.seg.quality, props.variant] as const,
  (next, prev) => {
    // Reseed when the edit target changes; keep live draft while only ticks move.
    if (!prev || next[0] !== prev[0] || next[3] !== prev[3]) {
      reseedsFromSeg()
      return
    }
    // After Apply, parent updates root/quality to match draft — refresh baseline only.
    const d = draft.value
    if (
      d &&
      next[1] === d.rootPc &&
      next[2] === d.quality &&
      (baseline.value?.rootPc !== d.rootPc || baseline.value?.quality !== d.quality)
    ) {
      baseline.value = { ...d }
    }
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
    chordOnly: false,
  }),
)

const effectiveRankHints = computed((): ChordRankHint[] => {
  if (props.rankHints?.length) return [...props.rankHints]
  // Seed with the strip’s top pick so Detected open keeps that chord first.
  if (props.seg.rootPc != null && props.seg.quality) {
    return [
      {
        rootPc: props.seg.rootPc,
        natureId: props.seg.quality,
        cadence: !!props.seg.cadenceLabel,
        label: props.seg.cadenceLabel,
      },
    ]
  }
  return []
})

function labelOf(o: HarmonizeChordOption): string {
  return props.mode === 'roman' ? o.roman : o.name
}

const selectedKey = computed(() => {
  const d = draft.value
  if (!d) return null
  const tonality = ((props.project.tonality % 12) + 12) % 12
  const rootOffset = (((d.rootPc - tonality) % 12) + 12) % 12
  return optionKey({ rootOffset, chordId: d.quality })
})

const dirty = computed(() => {
  const d = draft.value
  const b = baseline.value
  if (!d) return false
  if (!b) return true
  return d.rootPc !== b.rootPc || d.quality !== b.quality
})

function onReset(): void {
  stopHold()
  draft.value = baseline.value ? { ...baseline.value } : seedFromSeg(props.seg)
}

const panelStyle = computed(() => {
  if (props.docked) return {}
  const maxH = liveMaxH.value ?? props.maxHeightPx
  const style: Record<string, string> = {
    transform: `translate(${dragOffset.value.x}px, ${dragOffset.value.y}px)`,
  }
  if (maxH != null && maxH > 80) {
    style.maxHeight = `${Math.round(maxH)}px`
  }
  return style
})

const canApply = computed(() => !!draft.value && dirty.value)

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
  if (props.docked || e.button !== 0) return
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
  const top = drag.baseTop + next.y
  liveMaxH.value = Math.max(160, Math.floor(window.innerHeight - top - VIEW_PAD))
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
  return next
}

function startHold(draftVal: ChordEditDraft, el?: HTMLElement | null, pointerId?: number): void {
  holding.value = true
  if (el != null && pointerId != null) {
    try {
      el.setPointerCapture(pointerId)
    } catch {
      /* ignore */
    }
  }
  emit('hear', draftVal)
}

function stopHold(): void {
  if (!holding.value) return
  holding.value = false
  emit('hearStop')
}

function onPick(o: HarmonizeChordOption): void {
  applyOption(o)
}

function onHoldStart(o: HarmonizeChordOption, e: PointerEvent): void {
  const next = applyOption(o)
  if (!next) return
  startHold(next, e.currentTarget as HTMLElement | null, e.pointerId)
}

function onHearPointerDown(e: PointerEvent): void {
  if (e.button !== 0 || !draft.value) return
  e.preventDefault()
  startHold(draft.value, e.currentTarget as HTMLElement, e.pointerId)
}

function onApply(): void {
  stopHold()
  const d = draft.value
  if (!d || !dirty.value) return
  emit('apply', d)
  baseline.value = { ...d }
}
function onCancel(): void {
  stopHold()
  emit('update:draft', null)
  emit('cancel')
}

onUnmounted(() => {
  stopHold()
  emit('update:draft', null)
})
</script>

<template>
  <div
    ref="rootEl"
    class="chord-edit-pop"
    role="dialog"
    :aria-label="variant === 'detected' ? 'Edit detection' : 'Edit chord'"
    :class="{ dragging, docked }"
    :style="panelStyle"
    @pointermove="onRootPointerMove"
    @pointerup="onRootPointerUp"
    @pointercancel="onRootPointerUp"
  >
    <div
      class="toolbar"
      :title="docked ? undefined : 'Drag to move'"
      @pointerdown="onToolbarPointerDown"
    >
      <span v-if="!docked" class="drag-grip" aria-hidden="true">⠿</span>
      <span class="preview" :class="{ dirty }" :title="previewLabel">
        {{ previewLabel }}
        <span v-if="dirty" class="preview-tag">preview</span>
      </span>
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
          class="icon reset"
          :disabled="!dirty"
          :title="tagRollTip('Reset — restore the original chord')"
          aria-label="Reset"
          @click="onReset"
        >
          ↺
        </button>
        <button
          v-if="!docked"
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
          :disabled="!canApply"
          :title="
            tagRollTip(
              !canApply
                ? 'Select a different chord to enable Apply'
                : variant === 'detected'
                  ? 'Apply — declare into Sketch'
                  : 'Apply — declare this chord',
            )
          "
          aria-label="Apply"
          @click="onApply"
        >
          ✓
        </button>
        <button
          v-if="variant === 'declared'"
          type="button"
          class="icon danger"
          :title="tagRollTip('Delete chord from Sketch')"
          aria-label="Delete"
          @click="emit('remove')"
        >
          ⌫
        </button>
      </div>
    </div>

    <p v-if="leadLabel" class="lead-hint">
      ♪ = contains Lead <strong>{{ leadLabel }}</strong> · hold to hear · ✓ Apply to commit
    </p>
    <p v-else class="lead-hint muted">No Lead under this span · hold to hear · ✓ Apply to commit</p>

      <TagRollChordPickList
      :primary="chordLists.primary"
      :more="chordLists.more"
      :selected-key="selectedKey"
      :label-mode="mode === 'roman' ? 'roman' : 'name'"
      :lead-label="leadLabel"
      :rank-hints="effectiveRankHints"
      :tonality="project.tonality"
      interaction="hold"
      section-by-lead
      empty-primary-text="No matches"
      @pick="onPick"
      @hold-start="onHoldStart"
      @hold-stop="stopHold"
    />
  </div>
</template>

<style scoped>
.chord-edit-pop {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  width: min(28rem, calc(100vw - 1rem));
  min-width: 16rem;
  padding: 0.4rem;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
  box-shadow: 0 10px 28px color-mix(in srgb, #000 20%, transparent);
  overflow: hidden;
}
.chord-edit-pop.docked {
  width: 100%;
  min-width: 0;
  flex: 1 1 auto;
  min-height: 0;
  padding: 0;
  border: 0;
  border-radius: 0;
  box-shadow: none;
  background: transparent;
}
.chord-edit-pop.docked :deep(.chord-pick-list) {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.chord-edit-pop.docked :deep(.chord-scroll) {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
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
.chord-edit-pop.docked .toolbar {
  cursor: default;
  touch-action: auto;
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
  display: inline-flex;
  align-items: baseline;
  gap: 0.35rem;
}
.preview.dirty {
  color: color-mix(in srgb, var(--accent) 70%, var(--text));
}
.preview-tag {
  flex: none;
  font-size: 0.58rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--accent);
  border: 1px solid color-mix(in srgb, var(--accent) 45%, var(--border));
  border-radius: 4px;
  padding: 0.05rem 0.28rem;
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
.icon:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.icon:hover:not(:disabled) {
  background: color-mix(in srgb, var(--accent) 10%, var(--surface));
}
.icon.danger {
  border-color: color-mix(in srgb, #c44 40%, var(--border));
  background: color-mix(in srgb, #c44 8%, var(--surface));
  color: #a33;
  font-size: 0.85rem;
}
.icon.danger:hover:not(:disabled) {
  background: color-mix(in srgb, #c44 16%, var(--surface));
}
.lead-hint {
  margin: 0;
  font-size: 0.68rem;
  color: var(--text);
  line-height: 1.35;
}
.lead-hint.muted {
  color: var(--muted);
}
.lead-hint strong {
  font-weight: 750;
}
</style>
