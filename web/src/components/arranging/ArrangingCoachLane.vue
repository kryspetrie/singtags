<script setup lang="ts">
/**
 * Compact Coach lane — Ring / VL / Issues toggles + [i] help for the active view.
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { pcName } from '../../domain/arranging/chords/chords'
import { melodyGapsOutsidePillars } from '../../domain/arranging/pillars'
import { buildHarmonicMoments } from '../../domain/arranging/harmonicMoments'
import { partOnsetsFromTagRoll } from '../../lib/arranging/partOnsetsFromTagRoll'
import { pxToTicks, ticksToPx } from '../../lib/tagRoll/normalize'
import { drawLaneTimeGrid } from '../../lib/tagRoll/laneTimeGrid'
import {
  buildCoachLaneMarkers,
  buildCoachLanePillarBands,
  filterMarkersForLens,
  type CoachLaneMarker,
  type CoachLanePillarBand,
} from '../../lib/arranging/coachLaneMetrics'
import {
  COACH_LANE_LENSES,
  COACH_LANE_LENS_INFO,
  subscribeCoachHighlight,
  type CoachHighlight,
  type CoachLaneLens,
} from '../../lib/arranging/coachHighlight'
import type { TagRollProject } from '../../lib/tagRoll/types'
import { ensureHarmonizeCoachSession } from '../../composables/useHarmonizeCoachSession'
import { useArrangementStore } from '../../stores/arrangement'
import { usePreferencesStore } from '../../stores/preferences'
import TagRollBottomLaneShell from '../tagRoll/TagRollBottomLaneShell.vue'

const LANE_H = 64
const BAND_H = 14
const BAR_TOP = 16
const BAR_H = 44

const props = defineProps<{
  project: TagRollProject
  leftGutterPx?: number
}>()

const emit = defineEmits<{
  selectTick: [tick: number]
  focusRange: [startTick: number, endTick: number, select?: 'pillar' | 'column' | 'range' | 'none']
  openPanel: []
}>()

const arrStore = useArrangementStore()
const prefs = usePreferencesStore()

const collapsed = computed(() => prefs.tagRollCoachLaneCollapsed)
const lens = ref<CoachLaneLens>('ring')
const infoOpen = ref(false)
const infoBtnRef = ref<HTMLButtonElement | null>(null)
const infoPopStyle = ref<Record<string, string>>({})
const highlight = ref<CoachHighlight | null>(null)
let unsubHl: (() => void) | null = null

const lensViewOptions = COACH_LANE_LENSES.map((l) => ({ value: l.id, label: l.label }))

function onLensView(v: string): void {
  if (COACH_LANE_LENSES.some((l) => l.id === v)) {
    lens.value = v as CoachLaneLens
    infoOpen.value = false
  }
}

const canvasRef = ref<HTMLCanvasElement | null>(null)
const wrapRef = ref<HTMLElement | null>(null)
const cssW = ref(640)
const hoverLabel = ref('')

const leftGutterPx = computed(() => Math.max(64, props.leftGutterPx ?? 112))

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

const uncoveredMelody = computed(() =>
  melodyGapsOutsidePillars(arrStore.current?.melody ?? [], arrStore.current?.pillars ?? []),
)

const preferFlats = computed(() => !!arrStore.current?.preferFlats)
const selectedTick = computed(() => arrStore.selectedMelody?.startTick ?? null)
const selectedPillarId = computed(() => arrStore.selectedPillarId)
const showProposeCta = computed(
  () => !!arrStore.current?.melody.length && !arrStore.current.pillars.length,
)

const lensInfo = computed(() => COACH_LANE_LENS_INFO[lens.value])
const lensLabel = computed(
  () => COACH_LANE_LENSES.find((l) => l.id === lens.value)?.label ?? 'Coach',
)

/** Keep arrangement + QA live while the lane is open — no Coach sidebar required. */
let laneSyncing = false
async function syncCoachLaneSession(): Promise<boolean> {
  if (laneSyncing) return !!arrStore.current
  laneSyncing = true
  try {
    const ok = await ensureHarmonizeCoachSession()
    if (ok) arrStore.runQa()
    return ok
  } finally {
    laneSyncing = false
  }
}

function projectSyncKey(p: TagRollProject): string {
  let h = p.notes.length
  for (const n of p.notes) {
    h = (Math.imul(h, 33) + n.midi + n.startTick + n.durationTicks) | 0
  }
  const sketch = (p.harmonySketch ?? [])
    .map((s) => `${s.startTick}:${s.endTick}:${s.rootPc}:${s.locked ? 1 : 0}`)
    .join('|')
  return `${p.id}:${p.tonality}:${p.tonalityMode ?? 'major'}:${h}:${sketch}`
}

function placeInfoPop(): void {
  const btn = infoBtnRef.value
  if (!btn) return
  const r = btn.getBoundingClientRect()
  const maxW = Math.min(288, window.innerWidth - 16)
  let left = r.left
  if (left + maxW > window.innerWidth - 8) left = Math.max(8, window.innerWidth - 8 - maxW)
  infoPopStyle.value = {
    left: `${left}px`,
    bottom: `${Math.max(8, window.innerHeight - r.top + 8)}px`,
    width: `${maxW}px`,
  }
}

async function toggleInfo(): Promise<void> {
  infoOpen.value = !infoOpen.value
  if (infoOpen.value) {
    await nextTick()
    placeInfoPop()
  }
}

async function onPropose(): Promise<void> {
  await syncCoachLaneSession()
  const cursor = props.project.view.playheadTick ?? 0
  const ok = arrStore.proposeNextHomeRoot(cursor)
  arrStore.runQa()
  prefs.setTagRollLaneCollapsed('coach', false)
  if (ok && arrStore.selectedPillarId) {
    const pil = arrStore.current?.pillars.find((p) => p.id === arrStore.selectedPillarId)
    if (pil) emit('focusRange', pil.startTick, pil.endTick, 'none')
  }
}

function selectPillarBand(pil: CoachLanePillarBand): void {
  arrStore.selectPillar(pil.pillarId)
  emit('focusRange', pil.startTick, pil.endTick, 'none')
}

function colorFilled(m: CoachLaneMarker): string {
  if (m.severity === 'error') return 'rgba(192, 57, 43, 0.92)'
  if (m.severity === 'warn') return 'rgba(196, 122, 18, 0.9)'
  if (m.severity === 'info') return 'rgba(70, 130, 180, 0.85)'
  const h = m.harmonicity ?? 0.5
  const g = Math.round(90 + h * 100)
  return `rgba(40, ${g}, 70, 0.88)`
}

function hoverForMarker(m: CoachLaneMarker): string {
  if (lens.value === 'ring' && m.harmonicity != null) {
    return `Ring ${Math.round(m.harmonicity * 100)}`
  }
  if (lens.value === 'voiceLead' && m.voiceLead != null) {
    return `VL ${Math.round(m.voiceLead * 100)}`
  }
  if (lens.value === 'issues' && m.lintCount > 0) return m.label
  return m.label
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

  const styles = getComputedStyle(canvas)
  const text = styles.getPropertyValue('--text').trim() || '#222'
  const muted = styles.getPropertyValue('--muted').trim() || '#888'
  const surface = styles.getPropertyValue('--surface').trim() || '#f5f5f5'
  ctx.fillStyle = surface
  ctx.fillRect(0, 0, w, h)
  drawLaneTimeGrid(ctx, {
    scrollX: props.project.view.scrollX,
    cellW: props.project.view.cellW,
    lengthTicks: props.project.lengthTicks,
    timeSignature: props.project.timeSignature,
    height: h,
    width: w,
    measureColor: text,
    beatColor: muted,
    measureAlpha: 0.35,
    beatAlpha: 0.16,
  })

  const cellW = props.project.view.cellW
  const scrollX = props.project.view.scrollX
  const sel = selectedTick.value
  const selPil = selectedPillarId.value
  const showVl = lens.value === 'voiceLead'
  const scoreIsVl = lens.value === 'voiceLead'

  for (const g of uncoveredMelody.value) {
    const x = ticksToPx(g.startTick, cellW) - scrollX
    const bw = Math.max(3, ticksToPx(Math.max(1, g.durationTicks), cellW) - 1)
    if (x + bw < 0 || x > w) continue
    ctx.fillStyle = 'rgba(200, 120, 40, 0.2)'
    ctx.fillRect(x, 1, bw, BAND_H - 1)
  }

  for (const b of bands.value) {
    const x = ticksToPx(b.startTick, cellW) - scrollX
    const bw = Math.max(4, ticksToPx(b.endTick - b.startTick, cellW) - 1)
    if (x + bw < 0 || x > w) continue
    ctx.fillStyle = b.confirmed ? 'rgba(42, 140, 90, 0.38)' : 'rgba(120,120,120,0.22)'
    ctx.fillRect(x, 1, bw, BAND_H - 1)
    if (selPil === b.pillarId) {
      ctx.strokeStyle = 'rgba(42, 140, 90, 0.95)'
      ctx.lineWidth = 1.5
      ctx.strokeRect(x + 0.5, 1.5, bw - 1, BAND_H - 2)
    }
    ctx.fillStyle = b.confirmed ? 'rgba(20,80,50,0.95)' : 'rgba(60,60,60,0.85)'
    ctx.font = '600 9px system-ui, sans-serif'
    ctx.fillText(pcName(b.rootPc, preferFlats.value), x + 3, 10)
  }

  // Cadence / replace-range preview — green = proposed good path (not warn orange).
  const hlBand = highlight.value
  if (hlBand?.endTick != null && hlBand.endTick > hlBand.tick) {
    const hx = ticksToPx(hlBand.tick, cellW) - scrollX
    const hw = Math.max(4, ticksToPx(hlBand.endTick - hlBand.tick, cellW) - 1)
    if (hx + hw >= 0 && hx <= w) {
      ctx.fillStyle = 'rgba(42, 140, 90, 0.16)'
      ctx.fillRect(hx, BAR_TOP, hw, BAR_H)
      ctx.strokeStyle = 'rgba(42, 140, 90, 0.9)'
      ctx.lineWidth = 1.5
      ctx.strokeRect(hx + 0.5, BAR_TOP + 0.5, hw - 1, BAR_H - 1)
    }
  }

  for (const m of markers.value) {
    const x = ticksToPx(m.startTick, cellW) - scrollX
    const bw = Math.max(3, ticksToPx(m.durationTicks, cellW) - 1)
    if (x + bw < 0 || x > w) continue

    if (m.severity === 'empty') {
      ctx.strokeStyle = 'rgba(120,120,120,0.65)'
      ctx.setLineDash([3, 2])
      ctx.strokeRect(x + 0.5, BAR_TOP + 2, bw - 1, BAR_H - 4)
      ctx.setLineDash([])
    } else {
      const score = scoreIsVl ? (m.voiceLead ?? 0.5) : (m.harmonicity ?? 0.5)
      const barH = Math.max(3, Math.round(BAR_H * score))
      const y = BAR_TOP + BAR_H - barH
      ctx.fillStyle = colorFilled(m)
      ctx.fillRect(x, y, bw, barH)
    }

    if (m.heldLead) {
      ctx.fillStyle = 'rgba(91, 61, 143, 0.55)'
      ctx.fillRect(x, BAR_TOP + BAR_H - 3, bw, 3)
    }

    if (m.lintCount > 0 && lens.value === 'issues') {
      ctx.fillStyle = m.severity === 'error' ? '#c0392b' : '#c47a12'
      ctx.beginPath()
      ctx.arc(x + Math.min(bw, 8) / 2 + 2, BAR_TOP + 4, 2.4, 0, Math.PI * 2)
      ctx.fill()
    }

    if (sel != null && m.startTick === sel) {
      ctx.strokeStyle = 'rgba(42, 140, 90, 0.9)'
      ctx.lineWidth = 1.75
      ctx.strokeRect(x - 0.5, BAR_TOP + 1, bw + 1, BAR_H - 2)
    }

    const hl = highlight.value
    if (hl && hl.tick === m.startTick && hl.endTick == null) {
      ctx.strokeStyle = 'rgba(42, 140, 90, 0.95)'
      ctx.lineWidth = 2
      ctx.strokeRect(x - 1, BAR_TOP, bw + 2, BAR_H)
    }
  }

  if (showVl) {
    ctx.lineWidth = 1.35
    ctx.strokeStyle = 'rgba(80, 100, 160, 0.7)'
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
  for (const m of markers.value) {
    const mx = ticksToPx(m.startTick, cellW) - scrollX
    const mw = ticksToPx(m.durationTicks, cellW)
    if (x >= mx && x <= mx + mw) return m
  }
  return null
}

function selectMomentMarker(m: CoachLaneMarker): void {
  arrStore.selectMelody(m.melodyId)
  emit('focusRange', m.startTick, m.startTick + Math.max(1, m.durationTicks), 'none')
}

function onPointer(e: PointerEvent): void {
  emit('openPanel')
  infoOpen.value = false
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
  if (m) {
    selectMomentMarker(m)
    return
  }
  const tick = pxToTicks(x + props.project.view.scrollX, props.project.view.cellW)
  const near = markers.value.reduce(
    (acc, cur) =>
      Math.abs(cur.startTick - tick) < Math.abs((acc?.startTick ?? 1e12) - tick) ? cur : acc,
    null as CoachLaneMarker | null,
  )
  if (near) selectMomentMarker(near)
}

function onMove(e: PointerEvent): void {
  const rect = canvasRef.value?.getBoundingClientRect()
  if (!rect) return
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top
  const pil = hitPillar(x, y)
  if (pil) {
    const root = pcName(pil.rootPc, preferFlats.value)
    hoverLabel.value = pil.confirmed ? `Home ${root}` : `Draft home ${root}`
    return
  }
  const m = hitMarker(x)
  hoverLabel.value = m ? hoverForMarker(m) : ''
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
  window.addEventListener('resize', onWinResize)
  void syncCoachLaneSession().then(() => draw())
  draw()
})
onUnmounted(() => {
  ro?.disconnect()
  unsubHl?.()
  window.removeEventListener('resize', onWinResize)
})

watch(
  () => projectSyncKey(props.project),
  () => {
    void syncCoachLaneSession().then(() => draw())
  },
)

watch(
  () => [
    markers.value,
    bands.value,
    uncoveredMelody.value.map((g) => g.id).join('|'),
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

watch(lens, () => {
  if (infoOpen.value) void nextTick(() => placeInfoPop())
})

function onWinResize(): void {
  if (infoOpen.value) placeInfoPop()
}
</script>

<template>
  <TagRollBottomLaneShell
    v-if="!collapsed"
    label="Coach"
    density="compact"
    :left-gutter-px="leftGutterPx"
    :view-options="lensViewOptions"
    :view-value="lens"
    view-aria-label="Coach lane view"
    @update:view="onLensView"
  >
    <template #gutter>
      <button
        v-if="showProposeCta"
        type="button"
        class="gutter-cta"
        title="Propose one draft home root at the playhead"
        @click="onPropose"
      >
        Propose
      </button>
      <div class="gutter-tools">
        <button
          ref="infoBtnRef"
          type="button"
          class="info-btn"
          :class="{ on: infoOpen }"
          :aria-pressed="infoOpen"
          :aria-label="`About ${lensLabel} view`"
          :title="`About ${lensLabel} view`"
          @click.stop="toggleInfo"
        >
          i
        </button>
        <span class="gutter-legend" :title="hoverLabel || lensLabel">
          {{ hoverLabel || lensLabel }}
        </span>
      </div>
      <Teleport to="body">
        <aside
          v-if="infoOpen"
          class="coach-lane-info-pop"
          role="status"
          :style="infoPopStyle"
          @pointerdown.stop
        >
          <strong>{{ lensLabel }}</strong>
          <p>{{ lensInfo }}</p>
          <button type="button" class="info-close" @click.stop="infoOpen = false">Close</button>
        </aside>
      </Teleport>
    </template>
    <div ref="wrapRef" class="lane-wrap" @pointerdown="emit('openPanel')">
      <canvas
        ref="canvasRef"
        class="lane-canvas"
        role="img"
        :aria-label="`Coach lane: ${lensLabel}`"
        @pointerdown="onPointer"
        @pointermove="onMove"
        @pointerleave="hoverLabel = ''"
      />
    </div>
  </TagRollBottomLaneShell>
</template>

<style scoped>
.gutter-cta {
  width: 100%;
  min-height: 1.35rem;
  padding: 0.1rem 0.2rem;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: color-mix(in srgb, var(--accent) 14%, var(--surface));
  color: var(--text);
  font: inherit;
  font-size: 0.65rem;
  font-weight: 700;
  cursor: pointer;
}
.gutter-tools {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.2rem;
  align-items: center;
  min-width: 0;
}
.info-btn {
  width: 1.3rem;
  height: 1.3rem;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface);
  color: var(--muted);
  font: inherit;
  font-size: 0.72rem;
  font-weight: 750;
  font-style: italic;
  line-height: 1;
  cursor: pointer;
}
.info-btn.on {
  color: var(--text);
  border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
  background: color-mix(in srgb, var(--accent) 14%, var(--surface));
}
.gutter-legend {
  font-size: 0.6rem;
  font-weight: 650;
  color: var(--muted);
  text-align: left;
  line-height: 1.15;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lane-wrap {
  position: relative;
  height: 64px;
  overflow: hidden;
  touch-action: none;
  margin: 0 0.15rem 0.15rem 0;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: color-mix(in srgb, var(--surface) 88%, var(--bg));
}
.lane-canvas {
  display: block;
  width: 100%;
  height: 64px;
  cursor: pointer;
}
</style>

<style>
.coach-lane-info-pop {
  position: fixed;
  z-index: 80;
  display: grid;
  gap: 0.25rem;
  padding: 0.4rem 0.5rem 0.45rem;
  border: 1px solid color-mix(in srgb, var(--accent) 40%, var(--border));
  border-radius: 8px;
  background: color-mix(in srgb, var(--surface) 96%, var(--bg));
  box-shadow: 0 6px 18px color-mix(in srgb, #000 16%, transparent);
  color: var(--text);
}
.coach-lane-info-pop strong {
  font-size: 0.75rem;
  font-weight: 750;
}
.coach-lane-info-pop p {
  margin: 0;
  font-size: 0.72rem;
  line-height: 1.35;
  color: var(--muted);
}
.coach-lane-info-pop .info-close {
  justify-self: start;
  border: none;
  background: none;
  padding: 0;
  color: var(--accent, #0f6b5c);
  font: inherit;
  font-size: 0.68rem;
  font-weight: 650;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
}
</style>
