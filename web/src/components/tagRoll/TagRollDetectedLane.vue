<script setup lang="ts">
/**
 * Detected chords bottom lane — ghost fills in Chords-lane holes; Lock promotes.
 * Chord pick opens the right-hand dock (same surface as Sketch / Harmonize).
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type { ChordAnalysisMode, ChordAnalysisSegment } from '../../domain/arranging/chordAnalysisBar'
import { DEFAULT_CONTEST_PROFILE } from '../../domain/arranging/contestProfile'
import { drawLaneTimeGrid } from '../../lib/tagRoll/laneTimeGrid'
import { stripSegW, stripSegX } from '../../lib/tagRoll/harmonyStripGestures'
import { melodyPartAtTick } from '../../lib/tagRoll/melodyPass'
import { selectionSmoothRange, smoothJumpsInProject } from '../../lib/tagRoll/medianJumpFill'
import {
  loadHeldPartNames,
  loadLockMelody,
  medianJumpOnFill,
  saveHeldPartNames,
  saveLockMelody,
  setMedianJumpOnFill,
} from '../../lib/tagRoll/medianJumpPrefs'
import type { TagRollProject } from '../../lib/tagRoll/types'
import type { DetectedInterestLevel } from '../../lib/tagRoll/detectedInterestPrefs'
import { useArrangementStore } from '../../stores/arrangement'
import { usePreferencesStore } from '../../stores/preferences'
import { useTagRollStore } from '../../stores/tagRoll'
import TagRollBottomLaneShell from './TagRollBottomLaneShell.vue'

const HOLD_NAMES = ['Tenor', 'Lead', 'Bari', 'Bass'] as const

const TRACK_H = 44
/** Hide alt badge when the cell is narrower than this (px). */
const ALT_BADGE_MIN_W = 40

const INTEREST_CYCLE: readonly DetectedInterestLevel[] = ['basic', 'mild', 'bold']
const INTEREST_LABEL: Record<DetectedInterestLevel, string> = {
  basic: 'Basic',
  mild: 'Mild',
  bold: 'Bold',
}

const props = defineProps<{
  project: TagRollProject
  segments: readonly ChordAnalysisSegment[]
  mode: ChordAnalysisMode
  leftGutterPx?: number
  /** Span id currently open in the right-hand chord dock. */
  editSegId?: string | null
  /** Sparse TBB under melody in current scope — enables Fill parts without Detected. */
  canFillFromParts?: boolean
}>()

const emit = defineEmits<{
  'update:mode': [value: ChordAnalysisMode]
  focusRange: [startTick: number, endTick: number]
  lockAll: []
  /** Lock Detected + fill empty TBB from sparse sounding parts. */
  completeFromParts: []
  /** Open / toggle Detected chord in the right dock. */
  edit: [seg: ChordAnalysisSegment]
  /** Cycle ranked Detected picks for this hole (top 5). */
  cycleAlt: [seg: ChordAnalysisSegment]
}>()

const prefs = usePreferencesStore()
const store = useTagRollStore()
const arrangement = useArrangementStore()
const collapsed = computed(() => prefs.tagRollDetectedLaneCollapsed)
const leftGutterPx = computed(() => Math.max(64, props.leftGutterPx ?? 112))
const canLockAll = computed(() => props.segments.length > 0)
const canFill = computed(() => canLockAll.value || !!props.canFillFromParts)
const editSegId = computed(() => props.editSegId ?? null)
const interest = computed(() => prefs.detectedInterest)
const interestHint = computed(() => {
  if (interest.value === 'basic') return 'Diatonic homes.'
  if (interest.value === 'mild') return 'Adds V7, ii7 to V, and held cadences.'
  return 'Adds V7/V and dominant-ninth alternates.'
})

function setInterest(level: DetectedInterestLevel): void {
  prefs.setDetectedInterest(level)
}

const wrapRef = ref<HTMLElement | null>(null)
const gridCanvasRef = ref<HTMLCanvasElement | null>(null)
const cssW = ref(640)

const scrollX = computed(() => props.project.view.scrollX)
const cellW = computed(() => props.project.view.cellW)
const ppq = computed(() => props.project.ppq)
const lengthTicks = computed(() => props.project.lengthTicks)

function labelOf(seg: ChordAnalysisSegment): string {
  return props.mode === 'roman' ? seg.displayRoman : seg.displayName
}

function detectTitle(seg: ChordAnalysisSegment): string {
  const cadence = seg.cadenceLabel ? ` · Cadence: ${seg.cadenceLabel}` : ''
  const teach = props.mode === 'roman' && seg.labelTeach ? ` — ${seg.labelTeach}` : ''
  return `Detected: ${labelOf(seg)}${cadence}${teach} — click to edit`
}

function segWidthPx(seg: ChordAnalysisSegment): number {
  return stripSegW(seg.startTick, seg.endTick, cellW.value, ppq.value)
}

function showAltBadge(seg: ChordAnalysisSegment): boolean {
  return (seg.altCount ?? 0) > 1 && segWidthPx(seg) >= ALT_BADGE_MIN_W
}

function segStyle(seg: ChordAnalysisSegment): Record<string, string> {
  const x = stripSegX(seg.startTick, scrollX.value, cellW.value, ppq.value)
  const w = segWidthPx(seg)
  return { transform: `translate3d(${x}px, 0, 0)`, width: `${w}px` }
}

function setMode(m: ChordAnalysisMode): void {
  emit('update:mode', m)
}

function onDetectClick(seg: ChordAnalysisSegment): void {
  emit('focusRange', seg.startTick, seg.endTick)
  emit('edit', seg)
}

function onAltBadge(seg: ChordAnalysisSegment, e: Event): void {
  e.stopPropagation()
  e.preventDefault()
  if ((seg.altCount ?? 0) < 2) return
  emit('cycleAlt', seg)
}

function altLabel(seg: ChordAnalysisSegment): string {
  const idx = seg.altIndex ?? 0
  return idx > 0 ? `alt ${idx + 1}` : 'alt'
}

function altTitle(seg: ChordAnalysisSegment): string {
  const n = seg.altCount ?? 0
  const idx = (seg.altIndex ?? 0) + 1
  return `Cycle Detected pick (${idx}/${n}) — top 5 ranked`
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

const savedHold = loadHeldPartNames()
const heldNames = ref<string[]>(savedHold ?? [])
const lockMelody = ref(loadLockMelody())
const smoothOnFill = ref(medianJumpOnFill())
const smoothScope = ref<'song' | 'selection'>('song')
const smoothStatus = ref('')

const hasSelection = computed(
  () => store.selectedNoteIds.length > 0 || store.selectedSketchSpanIds.length > 0,
)

const smoothActionLabel = computed(() =>
  smoothScope.value === 'selection' ? 'Smooth selection' : 'Smooth song',
)

function held(name: string): boolean {
  return heldNames.value.includes(name)
}

function toggleHold(name: string): void {
  const set = new Set(heldNames.value)
  if (set.has(name)) set.delete(name)
  else set.add(name)
  heldNames.value = HOLD_NAMES.filter((part) => set.has(part))
  saveHeldPartNames(heldNames.value)
}

function onToggleMelody(event: Event): void {
  const on = (event.target as HTMLInputElement).checked
  lockMelody.value = on
  saveLockMelody(on)
}

function onToggleFill(event: Event): void {
  const on = (event.target as HTMLInputElement).checked
  smoothOnFill.value = on
  setMedianJumpOnFill(on)
}

function onSmoothJumps(): void {
  const project = props.project
  const selection = selectionSmoothRange(
    project.notes,
    store.selectedNoteIds,
    project.harmonySketch ?? [],
    store.selectedSketchSpanIds,
  )
  if (smoothScope.value === 'selection' && !selection) {
    smoothStatus.value = 'Select notes or Sketch chords to smooth a range.'
    return
  }
  const range = smoothScope.value === 'selection' ? selection : null
  const hold = new Set(
    project.parts.filter((part) => heldNames.value.includes(part.name)).map((part) => part.id),
  )
  const result = smoothJumpsInProject({
    notes: project.notes,
    parts: project.parts,
    sketch: project.harmonySketch ?? [],
    melodyAt: (tick) => melodyPartAtTick(project, tick),
    range,
    holdPartIds: hold,
    lockMelody: lockMelody.value,
    profile: arrangement.current?.contestProfile ?? DEFAULT_CONTEST_PROFILE,
    tonality: project.tonality,
    mode: project.tonalityMode,
  })
  if (result.reverted) {
    smoothStatus.value = 'Left as-is — smoothing would enlarge a leap.'
    return
  }
  if (!result.changed) {
    smoothStatus.value = range ? 'No jumps to smooth in the selection.' : 'No jumps to smooth in the song.'
    return
  }
  store.replaceNotesFromExternal(result.notes)
  const noun = result.changed === 1 ? 'note' : 'notes'
  smoothStatus.value = range
    ? `Smoothed ${result.changed} ${noun} in the selection.`
    : `Smoothed ${result.changed} ${noun} in the song.`
}
</script>

<template>
  <TagRollBottomLaneShell
    v-if="!collapsed"
    label="Detect"
    density="compact"
    :left-gutter-px="leftGutterPx"
    :view-options="[
      { value: 'name', label: 'Chord' },
      { value: 'roman', label: 'Number' },
    ]"
    :view-value="mode"
    view-aria-label="Detected label view"
    @update:view="setMode(($event as 'name' | 'roman'))"
  >
    <template #gutter>
      <button
        type="button"
        class="lock-btn"
        :disabled="!canLockAll"
        title="Lock — declare detections into Sketch (inspect/selection range when set)"
        @click="emit('lockAll')"
      >
        Lock
      </button>
      <button
        type="button"
        class="complete-btn"
        :disabled="!canFill"
        title="Fill parts — with sparse harmony: lock Sketch and fill empty parts (preserves sung notes). Detected-only: lock Sketch without inventing stacks. Skips unrecognized."
        @click="emit('completeFromParts')"
      >
        Fill parts
      </button>
    </template>
    <template #options>
      <section class="opt-sec">
        <h3 class="opt-h">Interest</h3>
        <p class="opt-hint">{{ interestHint }}</p>
        <div class="opt-seg" role="group" aria-label="Detected interest">
          <button
            v-for="level in INTEREST_CYCLE"
            :key="level"
            type="button"
            class="opt-seg-btn"
            :class="{ on: interest === level }"
            :aria-pressed="interest === level"
            @click="setInterest(level)"
          >
            {{ INTEREST_LABEL[level] }}
          </button>
        </div>
      </section>
      <section class="opt-sec">
        <h3 class="opt-h">Smooth jumps</h3>
        <p class="opt-hint">
          Revoice this arrangement around the current chords. Locked notes stay. Tenor, bari, and bass can move to another inversion. Lead keeps its pitch.
        </p>
        <div class="scope-row" role="radiogroup" aria-label="Where to smooth">
          <label class="smooth-check">
            <input v-model="smoothScope" type="radio" value="song" />
            Whole song
          </label>
          <label class="smooth-check" :class="{ off: !hasSelection && smoothScope !== 'selection' }">
            <input v-model="smoothScope" type="radio" value="selection" :disabled="!hasSelection" />
            Selection
          </label>
        </div>
        <label class="smooth-check">
          <input
            type="checkbox"
            :checked="lockMelody"
            aria-label="Lock melody"
            @change="onToggleMelody"
          />
          Lock melody, including handoffs
        </label>
        <p class="opt-hint">Also lock a whole part:</p>
        <div class="hold-row" role="group" aria-label="Parts locked for the whole song">
          <button
            v-for="name in HOLD_NAMES"
            :key="name"
            type="button"
            class="hold-btn"
            :class="{ on: held(name) }"
            :aria-pressed="held(name)"
            :title="`Lock ${name} for the whole song`"
            @click="toggleHold(name)"
          >
            {{ name }}
          </button>
        </div>
        <label class="smooth-check">
          <input
            type="checkbox"
            :checked="smoothOnFill"
            aria-label="Smooth jumps when filling parts"
            @change="onToggleFill"
          />
          Also when filling parts
        </label>
        <button
          type="button"
          class="opt-action"
          :aria-label="smoothActionLabel"
          :disabled="smoothScope === 'selection' && !hasSelection"
          @click="onSmoothJumps"
        >
          {{ smoothActionLabel }}
        </button>
        <p v-if="smoothStatus" class="smooth-status">{{ smoothStatus }}</p>
      </section>
    </template>
    <div class="track-wrap">
      <div ref="wrapRef" class="grid-wrap">
        <canvas ref="gridCanvasRef" class="grid-canvas" aria-hidden="true" />
        <div class="track">
          <p v-if="!segments.length" class="empty muted">No detections in holes</p>
          <div
            v-for="seg in segments"
            :key="`t-${seg.id}`"
            class="cell implied"
            :class="{ menu: editSegId === seg.id }"
            :style="segStyle(seg)"
          >
            <button
              type="button"
              class="lab"
              :aria-label="`Detected: ${labelOf(seg)}`"
              :title="detectTitle(seg)"
              @click="onDetectClick(seg)"
            />
            <span class="txt" aria-hidden="true">{{ labelOf(seg) }}</span>
            <button
              v-if="showAltBadge(seg)"
              type="button"
              class="alt-badge"
              :class="{ active: (seg.altIndex ?? 0) > 0 }"
              :title="altTitle(seg)"
              :aria-label="altTitle(seg)"
              @click="onAltBadge(seg, $event)"
            >
              {{ altLabel(seg) }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </TagRollBottomLaneShell>
</template>

<style scoped>
.lock-btn {
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
.lock-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.lock-btn:not(:disabled):hover {
  background: color-mix(in srgb, var(--accent) 22%, var(--surface));
}
.complete-btn {
  width: 100%;
  max-width: 100%;
  padding: 0.1rem 0.2rem;
  min-height: 1.35rem;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: color-mix(in srgb, var(--accent) 6%, var(--surface));
  color: var(--text);
  font: inherit;
  font-size: 0.58rem;
  font-weight: 700;
  letter-spacing: 0.01em;
  cursor: pointer;
}
.complete-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.complete-btn:not(:disabled):hover {
  background: color-mix(in srgb, var(--accent) 18%, var(--surface));
}
.opt-sec + .opt-sec {
  margin-top: 0.75rem;
  padding-top: 0.7rem;
  border-top: 1px solid var(--border);
}
.opt-h {
  margin: 0 0 0.2rem;
  font-size: 0.72rem;
  font-weight: 750;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--muted);
}
.opt-hint {
  margin: 0 0 0.4rem;
  font-size: 0.75rem;
  line-height: 1.35;
  color: var(--muted);
}
.opt-seg,
.hold-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}
.opt-seg-btn,
.hold-btn,
.opt-action {
  min-height: 1.7rem;
  padding: 0.15rem 0.55rem;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;
}
.opt-seg-btn.on,
.hold-btn.on {
  border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
  background: color-mix(in srgb, var(--accent) 16%, var(--surface));
}
.scope-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem 0.8rem;
  margin-bottom: 0.35rem;
}
.scope-row .smooth-check.off {
  opacity: 0.45;
}
.opt-action {
  margin-top: 0.15rem;
  background: color-mix(in srgb, var(--accent) 10%, var(--surface));
}
.opt-action:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.smooth-check {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin: 0 0 0.45rem;
  font-size: 0.82rem;
  font-weight: 650;
  color: var(--text);
  cursor: pointer;
}
.smooth-check input {
  margin: 0;
}
.smooth-status {
  margin: 0.4rem 0 0;
  font-size: 0.75rem;
  line-height: 1.35;
  color: var(--muted);
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
  z-index: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
.track {
  position: absolute;
  inset: 0;
  z-index: 1;
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
.cell {
  position: absolute;
  top: 4px;
  bottom: 4px;
  border-radius: 6px;
  border: 1px dashed color-mix(in srgb, var(--accent) 45%, var(--border));
  background: color-mix(in srgb, var(--accent) 8%, var(--surface));
  overflow: hidden;
}
.cell.menu {
  border-style: solid;
  border-color: color-mix(in srgb, var(--accent) 70%, var(--border));
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 28%, transparent);
}
.lab {
  position: absolute;
  inset: 0;
  z-index: 0;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
}
.txt {
  position: absolute;
  left: 0.28rem;
  right: 0.28rem;
  bottom: 0.1rem;
  z-index: 3;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text);
  font: inherit;
  font-size: 0.78rem;
  font-weight: 700;
  line-height: 1.15;
  pointer-events: none;
  text-shadow:
    0 0 2px color-mix(in srgb, var(--surface) 90%, transparent),
    0 0 4px color-mix(in srgb, var(--surface) 80%, transparent);
}
.alt-badge {
  position: absolute;
  top: 2px;
  right: 1.15rem;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.35rem;
  height: 1rem;
  padding: 0 0.22rem;
  border: none;
  border-radius: 3px;
  background: color-mix(in srgb, var(--surface) 70%, transparent);
  color: var(--muted);
  font: inherit;
  font-size: 0.52rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  line-height: 1;
  text-transform: lowercase;
  cursor: pointer;
  opacity: 0.85;
}
.alt-badge:hover,
.alt-badge.active,
.cell.menu .alt-badge {
  opacity: 1;
  color: var(--text);
  background: color-mix(in srgb, var(--accent) 18%, transparent);
}
</style>
