<script setup lang="ts">
/**
 * Horizontal scrub rail with loupe preview for virtualized browse lists (year, tag #, …).
 * Emits scrub indices while dragging; syncs idle cursor to scroll `activeIndex`.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  buildLabelAnchors,
  DEFAULT_AXIS_BLEND,
  buildLoupeLabels,
  displayFractionFromIndex,
  contentToTrack,
  DEFAULT_LOUPE,
  indexFromDisplayFraction,
  loupeGeometry,
  pickLandmarkAnchors,
  trackToContent,
  type LoupeOptions,
} from '../lib/scrub'
import { tagIdLoupeTickStep } from '../search/browse'

const props = withDefaults(
  defineProps<{
    length: number
    labelAtIndex: (index: number) => string
    /** Accessible name for the scrub control. */
    ariaLabel?: string
    /**
     * When true (default), left = last index / oldest for a newest-first year list,
     * right = first index / newest.
     */
    reverseAxis?: boolean
    /** Min gap (content fraction) between always-visible landmark years. */
    landmarkGap?: number
    loupe?: Partial<LoupeOptions>
    /**
     * Browse-list index currently in view (from scroll).
     * Updates the idle cursor when the user is not actively scrubbing.
     */
    activeIndex?: number | null
    /**
     * Axis blend for bucket widths: 0 = tag-mass density, 1 = equal (linear) bins.
     * Year scrub uses the default soft blend; Tag # scrub uses 1.
     */
    axisBlend?: number
    /** Accessible / tooltip label for the ↑ jump-to-start control. */
    jumpTopLabel?: string
    /** When true, ↑ is inert (already at document/search top). */
    jumpTopDisabled?: boolean
    /**
     * When set with `valueAtIndex`, the loupe can show denser ticks (50s / 25s)
     * on wider tracks while the idle rail keeps coarser labels from `labelAtIndex`.
     */
    denseLoupeTicks?: boolean
    /** Numeric value at list index (e.g. tag id) for dense loupe ticks. */
    valueAtIndex?: (index: number) => number
    /**
     * Place idle ticks at the start of each bucket (ruler). Use for Tag #
     * so the loupe sits on 0 at the left extreme, not left of it.
     */
    tickAtStart?: boolean
  }>(),
  {
    ariaLabel: 'Scrub through results',
    reverseAxis: true,
    landmarkGap: 0.1,
    activeIndex: null,
    axisBlend: DEFAULT_AXIS_BLEND,
    jumpTopLabel: 'Jump to newest',
    jumpTopDisabled: false,
    denseLoupeTicks: false,
    valueAtIndex: undefined,
    tickAtStart: false,
  },
)

const emit = defineEmits<{
  scrub: [index: number]
  scrubEnd: []
  /** ↑ control — parent owns two-step scroll (first group → search). */
  jumpTop: []
}>()

const trackEl = ref<HTMLElement | null>(null)
/** Committed content-axis position — drives the idle cursor and aria value. */
const committed = ref(0.5)
/** Pointer preview while hovering/dragging — drives the loupe only. */
const preview = ref(0.5)
const dragging = ref(false)
const hovering = ref(false)
/** Track width in CSS px — drives pixel-based loupe label spacing on narrow screens. */
const trackWidthPx = ref(0)


/** Loupe only while hovering or actively scrubbing. */
const loupeActive = computed(() => dragging.value || hovering.value)

/** Where the loupe looks; falls back to committed when idle. */
const loupeFocus = computed(() => (loupeActive.value ? preview.value : committed.value))

const loupeTickStep = computed(() => {
  if (!props.denseLoupeTicks || !props.valueAtIndex) return 100
  const w =
    trackWidthPx.value > 0
      ? trackWidthPx.value
      : typeof window !== 'undefined'
        ? window.innerWidth
        : 800
  return tagIdLoupeTickStep(w)
})

const loupeOpts = computed<LoupeOptions>(() => {
  const step = loupeTickStep.value
  const maxLabels = step <= 25 ? 7 : step <= 50 ? 5 : 3
  return {
    ...DEFAULT_LOUPE,
    maxLabels,
    ...props.loupe,
  }
})

/** Left/right empty margin on the track (larger than glass radius). */
/** ~5px side pad so the loupe glass never kisses the track edge. */
const EDGE_PAD_PX = 5

const edgeGutter = computed(() => {
  const r = loupeOpts.value.radius
  const override = loupeOpts.value.edgeGutter
  if (override != null) return override
  const w = trackWidthPx.value
  if (w <= 0) return r
  // content 0 maps to gutter; loupe left = gutter - radius ≈ EDGE_PAD_PX
  return Math.min(0.35, r + EDGE_PAD_PX / w)
})

/** Loupe glass width in CSS pixels (track × 2×radius). */
const loupeWidthPx = computed(() => {
  const w = trackWidthPx.value
  if (w <= 0) return undefined
  return w * 2 * loupeOpts.value.radius
})

const anchors = computed(() =>
  buildLabelAnchors(
    props.length,
    props.labelAtIndex,
    props.reverseAxis,
    props.axisBlend,
    props.tickAtStart ? 'start' : 'center',
  ),
)

/** Finer loupe-only anchors (50s / 25s) when Tag # dense ticks are enabled. */
const loupeAnchors = computed(() => {
  const step = loupeTickStep.value
  const valueAt = props.valueAtIndex
  if (!props.denseLoupeTicks || !valueAt || step >= 100) return anchors.value
  return buildLabelAnchors(
    props.length,
    (i) => String(Math.floor(valueAt(i) / step) * step),
    props.reverseAxis,
    props.axisBlend,
    props.tickAtStart ? 'start' : 'center',
  )
})

/** Keep the idle cursor aligned with the browse list scroll position. */
watch(
  () => props.activeIndex,
  (idx) => {
    if (idx == null || props.length <= 0) return
    if (dragging.value) return
    const i = Math.min(props.length - 1, Math.max(0, Math.round(idx)))
    const next = displayFractionFromIndex(i, anchors.value, props.reverseAxis)
    committed.value = next
    if (!hovering.value) preview.value = next
  },
)

const landmarks = computed(() => pickLandmarkAnchors(anchors.value, props.landmarkGap))

const landmarkOpacity = computed(() => {
  if (!loupeActive.value) return landmarks.value.map(() => 1)
  // Dim landmarks under the glass so the magnified view reads clearly
  const g = edgeGutter.value
  const r = loupeOpts.value.radius
  return landmarks.value.map((m) => {
    const trackX = contentToTrack(m.center, g)
    const loupeCenter = contentToTrack(loupeFocus.value, g)
    const d = Math.abs(trackX - loupeCenter)
    if (d >= r) return 1
    return Math.max(0.15, d / r)
  })
})

const loupeLabels = computed(() => {
  if (!loupeActive.value) return []
  return buildLoupeLabels(
    loupeAnchors.value,
    loupeFocus.value,
    loupeOpts.value,
    loupeWidthPx.value,
  ).map((lab) => ({
    ...lab,
    style: {
      left: `${lab.x * 100}%`,
      fontWeight: lab.active ? 750 : 600,
      opacity: Math.max(0.55, lab.opacity),
    },
  }))
})

const loupeStyle = computed(() => {
  const g = loupeGeometry(loupeFocus.value, loupeOpts.value.radius, edgeGutter.value)
  return {
    left: `${g.center * 100}%`,
    width: `${g.width * 100}%`,
  }
})

const landmarkStyles = computed(() => {
  const g = edgeGutter.value
  return landmarks.value.map((m, i) => ({
    left: `${contentToTrack(m.center, g) * 100}%`,
    opacity: landmarkOpacity.value[i]!,
  }))
})

const cursorStyle = computed(() => ({
  left: `${contentToTrack(committed.value, edgeGutter.value) * 100}%`,
}))

const committedLabel = computed(() => {
  if (props.length <= 0) return ''
  const i = indexFromDisplayFraction(committed.value, anchors.value, props.reverseAxis)
  return props.labelAtIndex(i)
})

const committedIndex = computed(() =>
  props.length <= 0
    ? 0
    : indexFromDisplayFraction(committed.value, anchors.value, props.reverseAxis),
)

function fractionFromClientX(clientX: number): number {
  const el = trackEl.value
  if (!el) return committed.value
  const rect = el.getBoundingClientRect()
  if (rect.width <= 0) return 0
  const x = (clientX - rect.left) / rect.width
  return trackToContent(x, edgeGutter.value)
}

/** Last list index emitted during a gesture — skip redundant live updates. */
let lastEmittedIndex = Number.NaN
let scrubRaf = 0
let pendingScrubT: number | null = null

/** Update rail position and scroll the list (live drag / click / keyboard). */
function emitScrub(t: number): void {
  committed.value = t
  preview.value = t
  if (props.length <= 0) return
  const i = indexFromDisplayFraction(t, anchors.value, props.reverseAxis)
  if (i === lastEmittedIndex) return
  lastEmittedIndex = i
  emit('scrub', i)
}

/** Coalesce high-frequency pointer moves onto one scrub per frame. */
function scheduleLiveScrub(t: number): void {
  pendingScrubT = t
  if (scrubRaf) return
  scrubRaf = requestAnimationFrame(() => {
    scrubRaf = 0
    const next = pendingScrubT
    pendingScrubT = null
    if (next != null) emitScrub(next)
  })
}

function flushLiveScrub(): void {
  if (scrubRaf) {
    cancelAnimationFrame(scrubRaf)
    scrubRaf = 0
  }
  const next = pendingScrubT
  pendingScrubT = null
  if (next != null) emitScrub(next)
}

/** Final commit: scrub + scrubEnd (pointer-up / keyboard / jump). */
function commit(t: number): void {
  flushLiveScrub()
  emitScrub(t)
  emit('scrubEnd')
  lastEmittedIndex = Number.NaN
}

function measureTrack(): void {
  const el = trackEl.value
  if (!el) return
  trackWidthPx.value = el.getBoundingClientRect().width
}

let trackRo: ResizeObserver | null = null

function onPointerEnter(e: PointerEvent): void {
  if (props.length <= 0) return
  hovering.value = true
  preview.value = fractionFromClientX(e.clientX)
}

function onPointerLeave(): void {
  if (dragging.value) return
  hovering.value = false
  preview.value = committed.value
}

function onPointerDown(e: PointerEvent): void {
  if (props.length <= 0) return
  dragging.value = true
  hovering.value = true
  lastEmittedIndex = Number.NaN
  trackEl.value?.setPointerCapture(e.pointerId)
  const t = fractionFromClientX(e.clientX)
  preview.value = t
  // Live scrub starts immediately so a click (down+up) and a drag both scroll.
  emitScrub(t)
}

function onPointerMove(e: PointerEvent): void {
  if (props.length <= 0) return
  if (!dragging.value && !hovering.value) return
  const t = fractionFromClientX(e.clientX)
  preview.value = t
  // Hover-only: loupe preview. Dragging: keep the list locked to the loupe.
  if (dragging.value) scheduleLiveScrub(t)
}

function onPointerUp(e: PointerEvent): void {
  if (!dragging.value) return
  dragging.value = false
  try {
    trackEl.value?.releasePointerCapture(e.pointerId)
  } catch {
    /* already released */
  }
  const t = fractionFromClientX(e.clientX)
  commit(t)
  const el = trackEl.value
  if (el) {
    const rect = el.getBoundingClientRect()
    hovering.value =
      e.clientX >= rect.left &&
      e.clientX <= rect.right &&
      e.clientY >= rect.top &&
      e.clientY <= rect.bottom
  } else {
    hovering.value = false
  }
  if (!hovering.value) preview.value = committed.value
}

function onJumpTopClick(): void {
  if (props.jumpTopDisabled) return
  emit('jumpTop')
}

function onKeyDown(e: KeyboardEvent): void {
  if (props.length <= 0) return
  const step = Math.max(1 / Math.max(1, props.length - 1), 1 / 40)
  let t = committed.value
  if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
    e.preventDefault()
    t = Math.max(0, t - step)
  } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
    e.preventDefault()
    t = Math.min(1, t + step)
  } else if (e.key === 'Home') {
    e.preventDefault()
    t = 0
  } else if (e.key === 'End') {
    e.preventDefault()
    t = 1
  } else {
    return
  }
  commit(t)
}

onMounted(() => {
  const start = props.reverseAxis ? 1 : 0
  committed.value = start
  preview.value = start
  measureTrack()
  if (typeof ResizeObserver !== 'undefined' && trackEl.value) {
    trackRo = new ResizeObserver(() => measureTrack())
    trackRo.observe(trackEl.value)
  }
})

onBeforeUnmount(() => {
  if (scrubRaf) cancelAnimationFrame(scrubRaf)
  scrubRaf = 0
  pendingScrubT = null
  trackRo?.disconnect()
  trackRo = null
})
</script>

<template>
  <div
    class="scrub"
    :class="{ dragging, loupe: loupeActive }"
    role="slider"
    :aria-label="ariaLabel"
    :aria-valuemin="0"
    :aria-valuemax="Math.max(0, length - 1)"
    :aria-valuenow="committedIndex"
    :aria-valuetext="committedLabel"
    tabindex="0"
    @keydown="onKeyDown"
  >
    <button
      type="button"
      class="scrub-top"
      :disabled="jumpTopDisabled"
      :title="jumpTopLabel"
      :aria-label="jumpTopLabel"
      @click="onJumpTopClick"
    >
      ↑
    </button>
    <div
      ref="trackEl"
      class="scrub-track"
      @pointerenter="onPointerEnter"
      @pointerleave="onPointerLeave"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
    >
      <div class="scrub-landmarks" aria-hidden="true">
        <span
          v-for="(m, i) in landmarks"
          :key="`lm-${m.label}-${m.startIndex}`"
          class="scrub-landmark"
          :style="landmarkStyles[i]"
        >
          <i class="scrub-tick" />
          {{ m.label }}
        </span>
      </div>

      <div
        v-show="!loupeActive"
        class="scrub-cursor"
        :style="cursorStyle"
        aria-hidden="true"
      >
        <span class="scrub-cursor-line" />
        <span v-if="committedLabel" class="scrub-cursor-label">{{ committedLabel }}</span>
      </div>

      <div
        v-show="loupeActive"
        class="scrub-loupe"
        :style="loupeStyle"
        aria-hidden="true"
      >
        <div class="scrub-loupe-glass">
          <span class="scrub-loupe-hairline" />
          <span
            v-for="lab in loupeLabels"
            :key="`lp-${lab.label}-${lab.startIndex}`"
            class="scrub-loupe-label"
            :class="{ active: lab.active }"
            :style="lab.style"
          >
            <i class="scrub-loupe-tick" />
            {{ lab.label }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.scrub {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.55rem;
  align-items: stretch;
  min-height: 4rem;
  padding: 0.35rem 0;
  touch-action: none;
  user-select: none;
}
.scrub-top {
  box-sizing: border-box;
  width: 2.75rem;
  min-width: 2.75rem;
  max-width: 2.75rem;
  flex: 0 0 2.75rem;
  min-height: 44px;
  padding: 0.35rem 0.55rem;
  border-radius: 8px;
  border: 1px solid var(--accent);
  background: var(--accent);
  font-size: 1.35rem;
  font-weight: 800;
  line-height: 1;
  color: #fff;
  box-shadow: 0 1px 0 color-mix(in srgb, var(--accent) 55%, #000);
  align-self: center;
  cursor: pointer;
}
.scrub-top:hover:not(:disabled),
.scrub-top:focus-visible:not(:disabled) {
  filter: brightness(1.08);
  outline: none;
}
.scrub-top:disabled {
  opacity: 0.45;
  cursor: default;
  filter: none;
  box-shadow: none;
}
.scrub-track {
  position: relative;
  min-height: 4rem;
  border-radius: 12px;
  border: 1px solid var(--border);
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--surface) 88%, transparent),
      color-mix(in srgb, var(--bg) 70%, var(--surface))
    );
  cursor: ew-resize;
  overflow: hidden;
}
.scrub-landmarks {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 2;
}
.scrub-landmark {
  position: absolute;
  top: 0.45rem;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.1rem;
  font-variant-numeric: tabular-nums;
  font-size: 0.68rem;
  font-weight: 600;
  color: var(--muted, #666);
  white-space: nowrap;
  transition: opacity 0.12s ease;
}
.scrub-tick {
  display: block;
  width: 1px;
  height: 0.45rem;
  background: color-mix(in srgb, var(--border) 70%, var(--muted, #666));
}
.scrub-cursor {
  position: absolute;
  top: 0.4rem;
  bottom: 0.4rem;
  z-index: 3;
  transform: translateX(-50%);
  pointer-events: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  gap: 0.15rem;
}
.scrub-cursor-line {
  flex: 1;
  width: 2px;
  border-radius: 1px;
  background: var(--accent);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--bg) 55%, transparent);
}
.scrub-cursor-label {
  font-variant-numeric: tabular-nums;
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--text);
  line-height: 1;
  padding: 0.1rem 0.25rem;
  border-radius: 4px;
  background: color-mix(in srgb, var(--surface) 88%, var(--bg));
  border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--border));
}
.scrub-loupe {
  position: absolute;
  top: 0.4rem;
  bottom: 0.4rem;
  z-index: 3;
  pointer-events: none;
  transform: translateX(-50%);
  display: flex;
  align-items: stretch;
  justify-content: center;
}
.scrub-loupe-glass {
  position: relative;
  flex: 1;
  border-radius: 12px;
  border: 1.5px solid color-mix(in srgb, var(--accent) 70%, var(--border));
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--surface) 94%, white),
      color-mix(in srgb, var(--bg) 72%, var(--surface))
    );
  box-shadow:
    0 1px 3px color-mix(in srgb, var(--text) 14%, transparent),
    inset 0 1px 0 color-mix(in srgb, white 40%, transparent);
  overflow: hidden;
}
.scrub-loupe-hairline {
  position: absolute;
  top: 0.35rem;
  bottom: 0.35rem;
  left: 50%;
  width: 1px;
  transform: translateX(-50%);
  background: color-mix(in srgb, var(--accent) 55%, transparent);
  pointer-events: none;
  z-index: 1;
}
.scrub-loupe-label {
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.12rem;
  text-align: center;
  font-variant-numeric: tabular-nums;
  font-size: 0.78rem;
  color: color-mix(in srgb, var(--text) 78%, var(--muted, #666));
  white-space: nowrap;
  line-height: 1.05;
  pointer-events: none;
  will-change: left, opacity;
  z-index: 2;
}
.scrub-loupe-tick {
  display: block;
  width: 1px;
  height: 0.55rem;
  background: color-mix(in srgb, var(--text) 45%, var(--border));
}
.scrub-loupe-label.active {
  color: var(--text);
}
.scrub-loupe-label.active .scrub-loupe-tick {
  width: 2px;
  background: var(--accent);
}
.scrub.dragging .scrub-track,
.scrub.loupe .scrub-track {
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
}
.scrub.dragging .scrub-loupe-glass {
  border-color: var(--accent);
}
@media (prefers-reduced-motion: reduce) {
  .scrub-landmark {
    transition: none;
  }
  .scrub-loupe-label {
    will-change: auto;
  }
}
</style>
