<script setup lang="ts">
/**
 * Coach lane: lens presets + pillar bands + moment markers + highlight pulse.
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { pcName } from '../../domain/arranging/chords/chords'
import { buildHarmonicMoments } from '../../domain/arranging/harmonicMoments'
import { partOnsetsFromTagRoll } from '../../lib/arranging/partOnsetsFromTagRoll'
import { pxToTicks, ticksToPx } from '../../lib/tagRoll/normalize'
import {
  buildCoachLaneMarkers,
  buildCoachLanePillarBands,
  filterMarkersForLens,
  type CoachLaneMarker,
  type CoachLanePillarBand,
} from '../../lib/arranging/coachLaneMetrics'
import {
  COACH_LANE_LENSES,
  subscribeCoachHighlight,
  type CoachHighlight,
  type CoachLaneLens,
} from '../../lib/arranging/coachHighlight'
import type { TagRollProject } from '../../lib/tagRoll/types'
import { useArrangementStore } from '../../stores/arrangement'
import { usePreferencesStore } from '../../stores/preferences'
import { useTagRollStore } from '../../stores/tagRoll'

const LANE_H = 112
const BAND_H = 22
const BAR_TOP = 28
const BAR_H = 72

const props = defineProps<{
  project: TagRollProject
  leftGutterPx?: number
}>()

const emit = defineEmits<{
  selectTick: [tick: number]
  focusRange: [startTick: number, endTick: number]
  /** Open the arranging Coach dock panel. */
  openPanel: []
}>()

const arrStore = useArrangementStore()
const tagStore = useTagRollStore()
const prefs = usePreferencesStore()

const collapsed = computed(() => prefs.tagRollCoachLaneCollapsed)
const lens = ref<CoachLaneLens>('overview')
const highlight = ref<CoachHighlight | null>(null)
let unsubHl: (() => void) | null = null

function toggleCollapsed(): void {
  if (collapsed.value) prefs.openTagRollBottomLane('coach')
  else prefs.openTagRollBottomLane(null)
}

function onSuggest(): void {
  arrStore.inferPillars()
  arrStore.runQa()
  const first =
    arrStore.current?.pillars.find((p) => !p.confirmed) ?? arrStore.current?.pillars[0]
  if (first) {
    arrStore.selectPillar(first.id)
    emit('focusRange', first.startTick, first.endTick)
  }
}

function selectPillarBand(pil: CoachLanePillarBand): void {
  arrStore.selectPillar(pil.pillarId)
  emit('focusRange', pil.startTick, pil.endTick)
}

const canvasRef = ref<HTMLCanvasElement | null>(null)
const wrapRef = ref<HTMLElement | null>(null)
const cssW = ref(640)
const hoverLabel = ref('')

const leftGutterStyle = computed(() => {
  const g = Math.max(52, props.leftGutterPx ?? 72)
  return { '--lane-gutter': `${g}px` } as Record<string, string>
})

const moments = computed(() => {
  const p = arrStore.current
  if (!p?.melody.length) return []
  return buildHarmonicMoments(p.melody, partOnsetsFromTagRoll(props.project))
})

const allMarkers = computed(() => {
  const p = arrStore.current
  if (!p) return [] as CoachLaneMarker[]
  return buildCoachLaneMarkers(p, arrStore.lints, moments.value)
})

const markers = computed(() => filterMarkersForLens(allMarkers.value, lens.value))

const bands = computed(() => buildCoachLanePillarBands(arrStore.current?.pillars ?? []))

const preferFlats = computed(() => !!arrStore.current?.preferFlats)
const selectedTick = computed(() => arrStore.selectedMelody?.startTick ?? null)
const selectedPillarId = computed(() => arrStore.selectedPillarId)
const showSuggestCta = computed(
  () => !!arrStore.current?.melody.length && !arrStore.current.pillars.length,
)

function colorFilled(m: CoachLaneMarker): string {
  if (m.severity === 'error') return 'rgba(192, 57, 43, 0.92)'
  if (m.severity === 'warn') return 'rgba(196, 122, 18, 0.9)'
  if (m.severity === 'info') return 'rgba(70, 130, 180, 0.85)'
  const h = m.harmonicity ?? 0.5
  const g = Math.round(90 + h * 100)
  return `rgba(40, ${g}, 70, 0.88)`
}

function draw(): void {
  const canvas = canvasRef.value
  if (!canvas) return
  const dpr = window.devicePixelRatio || 1
  const w = cssW.value
  const h = LANE_H
  canvas.width = Math.max(1, Math.floor(w * dpr))
  canvas.height = Math.max(1, Math.floor(h * dpr))
  canvas.style.width = `${w}px`
  canvas.style.height = `${h}px`
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)

  const cellW = props.project.view.cellW
  const scrollX = props.project.view.scrollX
  const sel = selectedTick.value
  const selPil = selectedPillarId.value
  const showPillars = lens.value === 'overview' || lens.value === 'gaps'
  const showVl = lens.value === 'overview' || lens.value === 'voiceLead'
  const showRing = lens.value === 'overview' || lens.value === 'ring' || lens.value === 'gaps' || lens.value === 'issues'

  if (showPillars) {
    for (const b of bands.value) {
      const x = ticksToPx(b.startTick, cellW) - scrollX
      const bw = Math.max(4, ticksToPx(b.endTick - b.startTick, cellW) - 1)
      if (x + bw < 0 || x > w) continue
      ctx.fillStyle = b.confirmed ? 'rgba(42, 140, 90, 0.35)' : 'rgba(120,120,120,0.22)'
      ctx.fillRect(x, 2, bw, BAND_H - 2)
      if (selPil === b.pillarId) {
        ctx.strokeStyle = 'rgba(42, 140, 90, 0.95)'
        ctx.lineWidth = 2
        ctx.strokeRect(x + 0.5, 2.5, bw - 1, BAND_H - 3)
      }
      ctx.fillStyle = b.confirmed ? 'rgba(20,80,50,0.95)' : 'rgba(60,60,60,0.85)'
      ctx.font = '600 10px system-ui, sans-serif'
      ctx.fillText(pcName(b.rootPc, preferFlats.value), x + 4, 13)
    }
  }

  ctx.strokeStyle = 'rgba(128,128,128,0.25)'
  ctx.beginPath()
  ctx.moveTo(0, BAR_TOP + BAR_H)
  ctx.lineTo(w, BAR_TOP + BAR_H)
  ctx.stroke()

  for (const m of markers.value) {
    const x = ticksToPx(m.startTick, cellW) - scrollX
    const bw = Math.max(3, ticksToPx(m.durationTicks, cellW) - 1)
    if (x + bw < 0 || x > w) continue

    if (m.severity === 'empty') {
      ctx.strokeStyle = 'rgba(120,120,120,0.65)'
      ctx.setLineDash([3, 2])
      ctx.strokeRect(x + 0.5, BAR_TOP + 2, bw - 1, BAR_H - 4)
      ctx.setLineDash([])
    } else if (showRing) {
      const score =
        lens.value === 'voiceLead'
          ? (m.voiceLead ?? 0.5)
          : (m.harmonicity ?? 0.5)
      const barH = Math.max(3, Math.round(BAR_H * score))
      const y = BAR_TOP + BAR_H - barH
      ctx.fillStyle = colorFilled(m)
      ctx.fillRect(x, y, bw, barH)
    }

    if (m.heldLead) {
      ctx.fillStyle = 'rgba(91, 61, 143, 0.55)'
      ctx.fillRect(x, BAR_TOP + BAR_H - 4, bw, 4)
    }

    if (m.lintCount > 0 && (lens.value === 'overview' || lens.value === 'issues')) {
      ctx.fillStyle = m.severity === 'error' ? '#c0392b' : '#c47a12'
      ctx.beginPath()
      ctx.arc(x + bw / 2, BAR_TOP - 2, 3.2, 0, Math.PI * 2)
      ctx.fill()
    }

    if (sel != null && m.startTick === sel) {
      ctx.strokeStyle = 'rgba(42, 140, 90, 0.9)'
      ctx.lineWidth = 2
      ctx.strokeRect(x - 0.5, BAR_TOP - 2, bw + 1, BAR_H + 4)
    }

    const hl = highlight.value
    if (hl && hl.tick === m.startTick) {
      ctx.strokeStyle = 'rgba(200, 80, 40, 0.95)'
      ctx.lineWidth = 2.5
      ctx.strokeRect(x - 1, BAR_TOP - 3, bw + 2, BAR_H + 6)
    }
  }

  if (showVl) {
    ctx.lineWidth = 1.5
    ctx.strokeStyle = 'rgba(80, 100, 160, 0.65)'
    ctx.beginPath()
    let started = false
    for (const m of markers.value) {
      if (m.voiceLead == null) continue
      const x =
        ticksToPx(m.startTick, cellW) - scrollX + ticksToPx(m.durationTicks, cellW) / 2
      const y = BAR_TOP + BAR_H - Math.round(BAR_H * m.voiceLead)
      if (!started) {
        ctx.moveTo(x, y)
        started = true
      } else ctx.lineTo(x, y)
    }
    if (started) ctx.stroke()
  }
}

function hitPillar(x: number, y: number): CoachLanePillarBand | null {
  if (y > BAND_H + 2) return null
  const cellW = props.project.view.cellW
  const scrollX = props.project.view.scrollX
  for (const b of bands.value) {
    const bx = ticksToPx(b.startTick, cellW) - scrollX
    const bw = ticksToPx(b.endTick - b.startTick, cellW)
    if (x >= bx && x <= bx + bw) return b
  }
  return null
}

function hitMarker(x: number): CoachLaneMarker | null {
  const cellW = props.project.view.cellW
  const scrollX = props.project.view.scrollX
  let best: CoachLaneMarker | null = null
  let bestDist = Infinity
  for (const m of markers.value) {
    const mx = ticksToPx(m.startTick, cellW) - scrollX
    const mw = ticksToPx(m.durationTicks, cellW)
    if (x >= mx && x <= mx + mw) return m
    const d = Math.abs(mx + mw / 2 - x)
    if (d < bestDist) {
      bestDist = d
      best = m
    }
  }
  return best
}

function onPointer(e: PointerEvent): void {
  emit('openPanel')
  const rect = canvasRef.value?.getBoundingClientRect()
  if (!rect) return
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top
  const pil = hitPillar(x, y)
  if (pil) {
    selectPillarBand(pil)
    return
  }
  const m = hitMarker(x)
  if (!m) {
    const tick = pxToTicks(x + props.project.view.scrollX, props.project.view.cellW)
    const near = markers.value.reduce(
      (acc, cur) =>
        Math.abs(cur.startTick - tick) < Math.abs((acc?.startTick ?? 1e12) - tick) ? cur : acc,
      null as CoachLaneMarker | null,
    )
    if (!near) return
    arrStore.selectMelody(near.melodyId)
    tagStore.setPlayheadTick(near.startTick, { snap: false })
    emit('selectTick', near.startTick)
    return
  }
  arrStore.selectMelody(m.melodyId)
  tagStore.setPlayheadTick(m.startTick, { snap: false })
  emit('selectTick', m.startTick)
}

function onMove(e: PointerEvent): void {
  const rect = canvasRef.value?.getBoundingClientRect()
  if (!rect) return
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top
  const pil = hitPillar(x, y)
  if (pil) {
    const root = pcName(pil.rootPc, preferFlats.value)
    hoverLabel.value = pil.confirmed
      ? `Pillar ${root} (locked)`
      : `Pillar ${root} (draft${pil.reason ? ` · ${pil.reason}` : ''})`
    return
  }
  const m = hitMarker(x)
  hoverLabel.value = m?.label ?? ''
}

let ro: ResizeObserver | null = null
onMounted(() => {
  const el = wrapRef.value
  if (el) {
    ro = new ResizeObserver(() => {
      cssW.value = el.clientWidth
      draw()
    })
    ro.observe(el)
    cssW.value = el.clientWidth
  }
  unsubHl = subscribeCoachHighlight((h) => {
    highlight.value = h
    draw()
  })
  draw()
})
onUnmounted(() => {
  ro?.disconnect()
  unsubHl?.()
})

watch(
  () => [
    markers.value,
    bands.value,
    props.project.view.scrollX,
    props.project.view.cellW,
    selectedTick.value,
    selectedPillarId.value,
    cssW.value,
    lens.value,
    highlight.value?.pulseId,
  ],
  () => draw(),
  { deep: true },
)
</script>

<template>
  <div v-if="!collapsed" class="coach-lane" :style="leftGutterStyle">
    <button
      type="button"
      class="lane-toggle on"
      title="Collapse Coach lane"
      aria-label="Collapse Coach lane"
      aria-expanded="true"
      @click="toggleCollapsed"
    >
      Coach
    </button>
    <div class="lane-main" @pointerdown="emit('openPanel')">
      <div v-if="!collapsed" class="lane-head">
        <div class="lens-row" role="tablist" aria-label="Lane lens">
          <button
            v-for="l in COACH_LANE_LENSES"
            :key="l.id"
            type="button"
            :class="{ on: lens === l.id }"
            @click="lens = l.id"
          >
            {{ l.label }}
          </button>
        </div>
        <span class="legend">{{ hoverLabel || 'Pillars · ring · VL · issues' }}</span>
        <button
          v-if="showSuggestCta"
          type="button"
          class="cta"
          @click="onSuggest"
        >
          Suggest pillars
        </button>
      </div>
      <div v-show="!collapsed" ref="wrapRef" class="lane-wrap">
        <canvas
          ref="canvasRef"
          class="lane-canvas"
          role="img"
          aria-label="Arranging coach analysis lane"
          @pointerdown="onPointer"
          @pointermove="onMove"
          @pointerleave="hoverLabel = ''"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.coach-lane {
  display: grid;
  grid-template-columns: var(--lane-gutter, 72px) minmax(0, 1fr);
  gap: 0;
  align-items: stretch;
  margin: 0 0.15rem 0.15rem 0;
}
.lane-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  align-self: stretch;
  margin: 0.25rem 0.2rem;
  padding: 0.35rem 0.25rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  color: var(--muted);
  font: inherit;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  cursor: pointer;
  min-height: 100%;
  writing-mode: horizontal-tb;
  transform: none;
}
.lane-toggle:hover {
  color: var(--text);
  background: color-mix(in srgb, var(--accent) 10%, var(--surface));
}
.lane-toggle.on {
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  color: var(--text);
}
.lane-main {
  display: grid;
  gap: 0.2rem;
  min-width: 0;
}
.lane-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.4rem;
  padding: 0 0.15rem 0 0.1rem;
}
.lens-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.2rem;
}
.lens-row button {
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  font: inherit;
  font-size: 0.68rem;
  font-weight: 650;
  cursor: pointer;
  min-height: 1.45rem;
  padding: 0.1rem 0.35rem;
}
.lens-row button.on {
  border-color: color-mix(in srgb, var(--accent) 50%, var(--border));
  background: color-mix(in srgb, var(--accent) 12%, transparent);
}
.legend {
  flex: 1;
  font-size: 0.72rem;
  color: var(--muted);
  min-height: 1em;
}
.cta {
  border: 1px solid var(--border);
  border-radius: 6px;
  background: color-mix(in srgb, var(--accent) 14%, var(--surface));
  font: inherit;
  font-size: 0.75rem;
  font-weight: 650;
  cursor: pointer;
  min-height: 1.6rem;
  padding: 0.15rem 0.45rem;
}
.lane-wrap {
  height: 112px;
  overflow: hidden;
  touch-action: none;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: color-mix(in srgb, var(--surface) 88%, var(--bg));
}
.lane-canvas {
  display: block;
  width: 100%;
  height: 112px;
  cursor: pointer;
}
</style>
