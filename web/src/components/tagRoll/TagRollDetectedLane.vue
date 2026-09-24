<script setup lang="ts">
/**
 * Detected chords bottom lane — ghost fills in Chords-lane holes; Lock promotes.
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import type { ChordAnalysisMode, ChordAnalysisSegment } from '../../domain/arranging/chordAnalysisBar'
import { drawLaneTimeGrid } from '../../lib/tagRoll/laneTimeGrid'
import { stripSegW, stripSegX } from '../../lib/tagRoll/harmonyStripGestures'
import { placePopoverNearAnchor } from '../../lib/tagRoll/placePopover'
import type { TagRollProject } from '../../lib/tagRoll/types'
import { usePreferencesStore } from '../../stores/preferences'
import TagRollBottomLaneShell from './TagRollBottomLaneShell.vue'
import TagRollChordEditPopover, {
  type ChordEditDraft,
} from './TagRollChordEditPopover.vue'

const TRACK_H = 52

const props = defineProps<{
  project: TagRollProject
  segments: readonly ChordAnalysisSegment[]
  mode: ChordAnalysisMode
  leftGutterPx?: number
}>()

const emit = defineEmits<{
  'update:mode': [value: ChordAnalysisMode]
  focusRange: [startTick: number, endTick: number]
  hear: [
    startTick: number,
    endTick: number,
    draft?: { rootPc: number; quality: import('../../lib/tagRoll/types').HarmonySketchQuality },
  ]
  hearStop: []
  applyDraft: [id: string, draft: ChordEditDraft]
  lockAll: []
}>()

const prefs = usePreferencesStore()
const collapsed = computed(() => prefs.tagRollDetectedLaneCollapsed)
const leftGutterPx = computed(() => Math.max(64, props.leftGutterPx ?? 112))
const canLockAll = computed(() => props.segments.length > 0)

const rootEl = ref<HTMLElement | null>(null)
const menuEl = ref<HTMLElement | null>(null)
const wrapRef = ref<HTMLElement | null>(null)
const gridCanvasRef = ref<HTMLCanvasElement | null>(null)
const cssW = ref(640)

const openMenuTick = ref<number | null>(null)
const menuPos = ref({ top: '0px', left: '0px', minWidth: '12rem' })
const menuMaxHeightPx = ref(320)

const scrollX = computed(() => props.project.view.scrollX)
const cellW = computed(() => props.project.view.cellW)
const ppq = computed(() => props.project.ppq)
const lengthTicks = computed(() => props.project.lengthTicks)

const openSeg = computed(() => {
  if (openMenuTick.value == null) return null
  return props.segments.find((s) => s.startTick === openMenuTick.value) ?? null
})

function labelOf(seg: ChordAnalysisSegment): string {
  return props.mode === 'roman' ? seg.displayRoman : seg.displayName
}

function segStyle(seg: ChordAnalysisSegment): Record<string, string> {
  const x = stripSegX(seg.startTick, scrollX.value, cellW.value, ppq.value)
  const w = stripSegW(seg.startTick, seg.endTick, cellW.value, ppq.value)
  return { transform: `translate3d(${x}px, 0, 0)`, width: `${w}px` }
}

function closeMenu(): void {
  emit('hearStop')
  openMenuTick.value = null
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
function setMode(m: ChordAnalysisMode): void {
  emit('update:mode', m)
  closeMenu()
}
function onDetectClick(seg: ChordAnalysisSegment): void {
  emit('focusRange', seg.startTick, seg.endTick)
  openMenuTick.value = openMenuTick.value === seg.startTick ? null : seg.startTick
  void nextTick(() => placeMenu())
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
</script>

<template>
  <TagRollBottomLaneShell
    v-if="!collapsed"
    label="Detected"
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
        title="Lock all detections into My Chords"
        @click="emit('lockAll')"
      >
        Lock
      </button>
    </template>
    <div ref="rootEl" class="track-wrap">
      <div ref="wrapRef" class="grid-wrap">
        <canvas ref="gridCanvasRef" class="grid-canvas" aria-hidden="true" />
        <div class="track">
          <p v-if="!segments.length" class="empty muted">No detections in holes</p>
          <div
            v-for="seg in segments"
            :key="`t-${seg.id}`"
            class="cell implied"
            :class="{ menu: openMenuTick === seg.startTick }"
            :style="segStyle(seg)"
          >
            <button
              type="button"
              class="lab"
              :title="
                seg.cadenceLabel
                  ? `Detected: ${labelOf(seg)} · Cadence: ${seg.cadenceLabel} — adjust then Apply into My Chords`
                  : `Detected: ${labelOf(seg)} — adjust then Apply into My Chords`
              "
              @click="onDetectClick(seg)"
            >
              <span class="txt">{{ labelOf(seg) }}</span>
              <span class="caret" aria-hidden="true">▾</span>
            </button>
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
          variant="detected"
          :max-height-px="menuMaxHeightPx"
          :lead-midi="leadMidiAt(openSeg.startTick)"
          @cancel="closeMenu"
          @apply="onDraftApply"
          @hear="onDraftHear"
          @hear-stop="onDraftHearStop"
        />
      </div>
    </Teleport>
  </TagRollBottomLaneShell>
</template>

<style scoped>
.lock-btn {
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
  left: 0;
  border-radius: 7px;
  border: 1px dashed color-mix(in srgb, var(--muted) 55%, var(--border));
  background: color-mix(in srgb, var(--muted) 10%, var(--surface));
  overflow: hidden;
  z-index: 1;
}
.lab {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  width: 100%;
  height: 100%;
  padding: 0 0.4rem;
  border: none;
  background: transparent;
  color: var(--muted);
  font: inherit;
  font-size: 1rem;
  font-weight: 700;
  font-style: italic;
  cursor: pointer;
  text-align: left;
}
.txt {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.caret {
  flex: none;
  font-size: 0.75rem;
  opacity: 0.7;
}
</style>

<style>
.pop-anchor {
  position: fixed;
  z-index: 80;
}
</style>
