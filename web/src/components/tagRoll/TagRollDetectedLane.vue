<script setup lang="ts">
/**
 * Detected chords bottom lane — ghost fills in Chords-lane holes; Lock promotes.
 * Chord pick opens the right-hand dock (same surface as Sketch / Harmonize).
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type { ChordAnalysisMode, ChordAnalysisSegment } from '../../domain/arranging/chordAnalysisBar'
import { drawLaneTimeGrid } from '../../lib/tagRoll/laneTimeGrid'
import { stripSegW, stripSegX } from '../../lib/tagRoll/harmonyStripGestures'
import type { TagRollProject } from '../../lib/tagRoll/types'
import { usePreferencesStore } from '../../stores/preferences'
import TagRollBottomLaneShell from './TagRollBottomLaneShell.vue'

const TRACK_H = 44

const props = defineProps<{
  project: TagRollProject
  segments: readonly ChordAnalysisSegment[]
  mode: ChordAnalysisMode
  leftGutterPx?: number
  /** Span id currently open in the right-hand chord dock. */
  editSegId?: string | null
}>()

const emit = defineEmits<{
  'update:mode': [value: ChordAnalysisMode]
  focusRange: [startTick: number, endTick: number]
  lockAll: []
  /** Open / toggle Detected chord in the right dock. */
  edit: [seg: ChordAnalysisSegment]
  /** Lock this detection into Sketch as a structural pillar. */
  togglePillar: [seg: ChordAnalysisSegment]
}>()

const prefs = usePreferencesStore()
const collapsed = computed(() => prefs.tagRollDetectedLaneCollapsed)
const leftGutterPx = computed(() => Math.max(64, props.leftGutterPx ?? 112))
const canLockAll = computed(() => props.segments.length > 0)
const editSegId = computed(() => props.editSegId ?? null)

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

function segStyle(seg: ChordAnalysisSegment): Record<string, string> {
  const x = stripSegX(seg.startTick, scrollX.value, cellW.value, ppq.value)
  const w = stripSegW(seg.startTick, seg.endTick, cellW.value, ppq.value)
  return { transform: `translate3d(${x}px, 0, 0)`, width: `${w}px` }
}

function setMode(m: ChordAnalysisMode): void {
  emit('update:mode', m)
}

function onDetectClick(seg: ChordAnalysisSegment, e?: MouseEvent): void {
  if (e?.altKey) {
    onPillarBadge(seg, e)
    return
  }
  emit('focusRange', seg.startTick, seg.endTick)
  emit('edit', seg)
}

function onPillarBadge(seg: ChordAnalysisSegment, e: Event): void {
  e.stopPropagation()
  e.preventDefault()
  if (seg.rootPc == null) return
  emit('focusRange', seg.startTick, seg.endTick)
  emit('togglePillar', seg)
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
        title="Lock — declare all detections into Sketch"
        @click="emit('lockAll')"
      >
        Lock
      </button>
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
              :title="
                seg.cadenceLabel
                  ? `Detected: ${labelOf(seg)} · Cadence: ${seg.cadenceLabel} — click to edit; ◆ / Alt+click = pillar`
                  : `Detected: ${labelOf(seg)} — click to edit; ◆ / Alt+click = pillar`
              "
              @click="onDetectClick(seg, $event)"
            >
              <span class="txt">{{ labelOf(seg) }}</span>
            </button>
            <button
              type="button"
              class="pillar-badge"
              title="Lock as pillar into Sketch (Alt+click)"
              aria-label="Lock as pillar"
              :disabled="seg.rootPc == null"
              @click="onPillarBadge(seg, $event)"
            >
              ◆
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
  display: flex;
  align-items: stretch;
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
  flex: 1;
  display: flex;
  align-items: center;
  min-width: 0;
  padding: 0 0.35rem;
  border: 0;
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;
  text-align: left;
}
.txt {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pillar-badge {
  flex: 0 0 auto;
  align-self: flex-start;
  margin: 2px 3px 0 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1rem;
  height: 1rem;
  padding: 0;
  border: none;
  border-radius: 3px;
  background: color-mix(in srgb, var(--surface) 70%, transparent);
  color: #1f6b45;
  font: inherit;
  font-size: 0.55rem;
  line-height: 1;
  cursor: pointer;
  opacity: 0.85;
}
.pillar-badge:hover:not(:disabled),
.cell.menu .pillar-badge {
  opacity: 1;
  background: color-mix(in srgb, #2a8c5a 22%, transparent);
}
.pillar-badge:disabled {
  cursor: not-allowed;
  opacity: 0.35;
}
</style>
