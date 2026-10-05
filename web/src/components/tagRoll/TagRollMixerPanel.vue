<script setup lang="ts">
/**
 * Per-part mute/solo, volume, and pan — floating / draggable like Harmonize.
 * Sketch, Detected, and (when enabled) Metronome use the same M/S controls.
 * Pan only when a row is expanded (not metronome).
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  syncProjectMix,
  TAG_ROLL_DETECTED_MIX_ID,
  TAG_ROLL_METRONOME_MIX_ID,
  TAG_ROLL_SKETCH_MIX_ID,
} from '../../lib/tagRoll/mix'
import { tagRollTip } from '../../lib/tagRoll/shortcuts'
import {
  TAG_ROLL_METRONOME_VOLUME_MAX,
  usePreferencesStore,
} from '../../stores/preferences'
import { useTagRollStore } from '../../stores/tagRoll'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const store = useTagRollStore()
const prefs = usePreferencesStore()
const project = computed(() => store.current)

type MixRow = {
  id: string
  name: string
  color: string
  mix: { volume: number; pan: number; mute: boolean; solo: boolean }
  /** Metronome has volume + M/S but no pan expand. */
  metronome: boolean
}

const rows = computed((): MixRow[] => {
  const p = project.value
  if (!p) return []
  const mix = syncProjectMix(p.parts, p.mix)
  const out: MixRow[] = p.parts.map((part) => {
    const m = mix.find((x) => x.partId === part.id)!
    return {
      id: part.id,
      name: part.name,
      color: part.color,
      mix: m,
      metronome: false,
    }
  })
  const sketchMix = mix.find((x) => x.partId === TAG_ROLL_SKETCH_MIX_ID)
  if (sketchMix) {
    out.push({
      id: TAG_ROLL_SKETCH_MIX_ID,
      name: 'Sketch',
      color: '#6b7280',
      mix: sketchMix,
      metronome: false,
    })
  }
  const detectMix = mix.find((x) => x.partId === TAG_ROLL_DETECTED_MIX_ID)
  if (detectMix) {
    out.push({
      id: TAG_ROLL_DETECTED_MIX_ID,
      name: 'Detected',
      color: '#9ca3af',
      mix: detectMix,
      metronome: false,
    })
  }
  if (p.metronomeEnabled) {
    const metroMix = mix.find((x) => x.partId === TAG_ROLL_METRONOME_MIX_ID)
    if (metroMix) {
      out.push({
        id: TAG_ROLL_METRONOME_MIX_ID,
        name: 'Metronome',
        color: '#887f72',
        mix: {
          ...metroMix,
          // Volume lives in prefs so it persists across projects.
          volume: prefs.tagRollMetronomeVolume,
        },
        metronome: true,
      })
    }
  }
  return out
})

/** Row ids with pan revealed. */
const expanded = ref<Record<string, boolean>>({})

const panelRef = ref<HTMLElement | null>(null)
const pos = ref({ x: 0, y: 0 })
const positioned = ref(false)
let drag:
  | {
      pointerId: number
      startX: number
      startY: number
      origX: number
      origY: number
    }
  | null = null

const PANEL_W = 300
const PANEL_MARGIN = 12

function clampPos(x: number, y: number): { x: number; y: number } {
  const el = panelRef.value
  const w = el?.offsetWidth || PANEL_W
  const h = el?.offsetHeight || 280
  const maxX = Math.max(PANEL_MARGIN, window.innerWidth - w - PANEL_MARGIN)
  const maxY = Math.max(
    PANEL_MARGIN,
    window.innerHeight - Math.min(h, window.innerHeight - PANEL_MARGIN * 2) - PANEL_MARGIN,
  )
  return {
    x: Math.min(maxX, Math.max(PANEL_MARGIN, x)),
    y: Math.min(maxY, Math.max(PANEL_MARGIN, y)),
  }
}

function placeDefaultRight(): void {
  const el = panelRef.value
  const w = el?.offsetWidth || PANEL_W
  pos.value = clampPos(window.innerWidth - w - PANEL_MARGIN, 72)
  positioned.value = true
}

function onDragPointerDown(e: PointerEvent): void {
  if (e.button !== 0) return
  const t = e.target as HTMLElement | null
  if (t?.closest('button, a, input, select, textarea, label')) return
  drag = {
    pointerId: e.pointerId,
    startX: e.clientX,
    startY: e.clientY,
    origX: pos.value.x,
    origY: pos.value.y,
  }
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  e.preventDefault()
}

function onDragPointerMove(e: PointerEvent): void {
  if (!drag || e.pointerId !== drag.pointerId) return
  pos.value = clampPos(
    drag.origX + (e.clientX - drag.startX),
    drag.origY + (e.clientY - drag.startY),
  )
}

function onDragPointerUp(e: PointerEvent): void {
  if (!drag || e.pointerId !== drag.pointerId) return
  drag = null
  try {
    ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
  } catch {
    /* already released */
  }
}

function onWinResize(): void {
  if (!positioned.value) return
  pos.value = clampPos(pos.value.x, pos.value.y)
}

watch(
  () => props.open,
  async (open) => {
    if (!open) return
    await nextTick()
    if (!positioned.value) placeDefaultRight()
    else pos.value = clampPos(pos.value.x, pos.value.y)
  },
)

onMounted(() => {
  window.addEventListener('resize', onWinResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', onWinResize)
})

function isExpanded(id: string): boolean {
  return !!expanded.value[id]
}

function toggleExpanded(id: string): void {
  expanded.value = { ...expanded.value, [id]: !expanded.value[id] }
  void nextTick(() => {
    if (positioned.value) pos.value = clampPos(pos.value.x, pos.value.y)
  })
}

function onMute(partId: string, mute: boolean): void {
  store.patchPartMix(partId, { mute })
}

function onSolo(partId: string, solo: boolean): void {
  store.patchPartMix(partId, { solo })
}

function onVolume(partId: string, e: Event): void {
  const v = Number((e.target as HTMLInputElement).value)
  if (!Number.isFinite(v)) return
  if (partId === TAG_ROLL_METRONOME_MIX_ID) {
    prefs.setTagRollMetronomeVolume(v)
    return
  }
  store.patchPartMix(partId, { volume: v }, { history: false })
}

function onPan(partId: string, e: Event): void {
  const v = Number((e.target as HTMLInputElement).value)
  if (!Number.isFinite(v)) return
  store.patchPartMix(partId, { pan: v }, { history: false })
}

function panLabel(pan: number): string {
  if (Math.abs(pan) < 0.05) return 'C'
  if (pan < 0) return `L${Math.round(Math.abs(pan) * 100)}`
  return `R${Math.round(pan * 100)}`
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open && project"
      ref="panelRef"
      class="tr-mix"
      role="complementary"
      aria-label="Mixer"
      aria-modal="false"
      :style="{ left: `${pos.x}px`, top: `${pos.y}px` }"
    >
      <header
        class="head"
        title="Drag to move"
        @pointerdown="onDragPointerDown"
        @pointermove="onDragPointerMove"
        @pointerup="onDragPointerUp"
        @pointercancel="onDragPointerUp"
      >
        <h2 class="title">Mixer</h2>
        <div class="head-actions">
          <button
            type="button"
            class="btn ghost sm"
            :title="tagRollTip('Clear all part solos')"
            @click="store.clearMixSolos()"
          >
            Clear solos
          </button>
          <button
            type="button"
            class="btn ghost"
            :aria-label="tagRollTip('Close', 'Esc')"
            :title="tagRollTip('Close', 'Esc')"
            @click="emit('close')"
          >
            ✕
          </button>
        </div>
      </header>

      <p class="hint">
        Expand a row for pan. Mute / solo on parts, Sketch, and Detected; Metronome has mute only.
      </p>

      <ul class="list" role="list">
        <li
          v-for="row in rows"
          :key="row.id"
          class="row"
          :class="{
            expanded: !row.metronome && isExpanded(row.id),
            soloed: row.mix.solo,
            'metro-row': row.metronome,
          }"
        >
          <button
            v-if="!row.metronome"
            type="button"
            class="expand"
            :aria-expanded="isExpanded(row.id)"
            :aria-label="isExpanded(row.id) ? `Collapse ${row.name}` : `Expand ${row.name} for pan`"
            :title="isExpanded(row.id) ? 'Hide pan' : 'Show pan'"
            @click="toggleExpanded(row.id)"
          >
            {{ isExpanded(row.id) ? '▾' : '▸' }}
          </button>
          <span v-else class="expand-spacer" aria-hidden="true" />
          <span
            class="swatch"
            :class="{ 'metro-swatch': row.metronome }"
            :style="row.metronome ? undefined : { background: row.color }"
            aria-hidden="true"
          />
          <span class="name">{{ row.name }}</span>

          <div
            class="ms-tog"
            role="group"
            :aria-label="row.metronome ? `${row.name} mute` : `${row.name} mute and solo`"
          >
            <button
              type="button"
              class="ms-btn mute"
              :class="{ on: row.mix.mute }"
              :aria-pressed="row.mix.mute"
              :title="tagRollTip(`${row.name} mute`)"
              @click="onMute(row.id, !row.mix.mute)"
            >
              M
            </button>
            <button
              v-if="!row.metronome"
              type="button"
              class="ms-btn solo"
              :class="{ on: row.mix.solo }"
              :aria-pressed="row.mix.solo"
              :title="tagRollTip(`${row.name} solo`)"
              @click="onSolo(row.id, !row.mix.solo)"
            >
              S
            </button>
          </div>

          <label class="slider vol" :title="tagRollTip(`${row.name} volume`)">
            <span class="lbl">Vol</span>
            <input
              type="range"
              min="0"
              :max="row.metronome ? TAG_ROLL_METRONOME_VOLUME_MAX : 1.5"
              step="0.01"
              :value="row.mix.volume"
              :aria-label="`${row.name} volume`"
              @input="onVolume(row.id, $event)"
            />
            <span class="val">{{ Math.round(row.mix.volume * 100) }}%</span>
          </label>
          <label
            v-if="!row.metronome && isExpanded(row.id)"
            class="slider pan"
            :title="tagRollTip(`${row.name} pan`)"
          >
            <span class="lbl">Pan</span>
            <input
              type="range"
              min="-1"
              max="1"
              step="0.05"
              :value="row.mix.pan"
              :aria-label="`${row.name} pan`"
              @input="onPan(row.id, $event)"
            />
            <span class="val">{{ panLabel(row.mix.pan) }}</span>
          </label>
        </li>
      </ul>
    </div>
  </Teleport>
</template>

<style scoped>
.tr-mix {
  position: fixed;
  z-index: 220;
  display: grid;
  gap: 0.4rem;
  width: min(18.5rem, calc(100vw - 1.5rem));
  max-height: calc(100dvh - 1.5rem);
  overflow-x: hidden;
  overflow-y: auto;
  padding: 0.55rem 0.65rem 0.65rem;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: color-mix(in srgb, var(--surface) 96%, transparent);
  box-shadow:
    0 12px 40px color-mix(in srgb, #000 18%, transparent),
    0 0 0 1px color-mix(in srgb, var(--border) 80%, transparent);
  color: var(--text);
  pointer-events: auto;
  scrollbar-gutter: auto;
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  cursor: grab;
  user-select: none;
  touch-action: none;
  margin: -0.1rem -0.1rem 0;
  padding: 0.1rem;
  border-radius: 8px;
}
.head:active {
  cursor: grabbing;
}
.head-actions {
  display: flex;
  align-items: center;
  gap: 0.3rem;
}
.title {
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
  pointer-events: none;
}
.hint {
  margin: 0;
  font-size: 0.72rem;
  color: var(--muted);
  line-height: 1.3;
}
.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
.row {
  display: grid;
  grid-template-columns: 1.15rem 0.55rem minmax(0, 1fr) auto;
  grid-template-areas:
    'expand swatch name ms'
    'vol vol vol vol';
  align-items: center;
  gap: 0.25rem 0.35rem;
  padding: 0.3rem 0.3rem;
  border-radius: 8px;
  border: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
  background: var(--surface);
}
.row.expanded {
  grid-template-areas:
    'expand swatch name ms'
    'vol vol vol vol'
    'pan pan pan pan';
}
.row.soloed {
  border-color: color-mix(in srgb, var(--accent) 50%, var(--border));
  background: color-mix(in srgb, var(--accent) 8%, var(--surface));
}
.metro-row {
  margin-top: 0.1rem;
}
.expand {
  grid-area: expand;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.15rem;
  height: 1.15rem;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--muted);
  font: inherit;
  font-size: 0.7rem;
  line-height: 1;
  cursor: pointer;
}
.expand:hover {
  color: var(--text);
  background: color-mix(in srgb, var(--border) 35%, transparent);
}
.expand-spacer {
  grid-area: expand;
  width: 1.15rem;
  height: 1.15rem;
}
.swatch {
  grid-area: swatch;
  width: 0.55rem;
  height: 1.15rem;
  border-radius: 3px;
}
.metro-swatch {
  background: color-mix(in srgb, var(--muted) 55%, var(--accent));
}
.name {
  grid-area: name;
  font-size: 0.8rem;
  font-weight: 650;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}
.ms-tog {
  grid-area: ms;
  display: inline-flex;
  align-items: stretch;
  border: 1px solid var(--border);
  border-radius: 7px;
  overflow: hidden;
  background: color-mix(in srgb, var(--bg, var(--surface)) 70%, transparent);
}
.ms-btn {
  min-width: 1.55rem;
  padding: 0.12rem 0.35rem;
  border: none;
  border-radius: 0;
  background: transparent;
  color: var(--muted);
  font: inherit;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  cursor: pointer;
  line-height: 1.2;
}
.ms-btn + .ms-btn {
  border-left: 1px solid var(--border);
}
.ms-btn.mute.on {
  background: color-mix(in srgb, var(--muted) 28%, var(--surface));
  color: var(--text);
}
.ms-btn.solo.on {
  background: color-mix(in srgb, var(--accent) 28%, var(--surface));
  color: var(--accent);
}
.ms-btn:hover:not(.on) {
  color: var(--text);
  background: color-mix(in srgb, var(--border) 30%, transparent);
}
.slider.vol {
  grid-area: vol;
}
.slider.pan {
  grid-area: pan;
}
.slider {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  min-width: 0;
}
.lbl {
  font-size: 0.62rem;
  color: var(--muted);
  width: 1.4rem;
  flex-shrink: 0;
}
.slider input[type='range'] {
  flex: 1;
  min-width: 0;
}
.val {
  font-size: 0.62rem;
  color: var(--muted);
  width: 2.2rem;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.btn {
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--text);
  border-radius: 6px;
  padding: 0.15rem 0.4rem;
  font: inherit;
  font-size: 0.72rem;
  cursor: pointer;
}
.btn.sm {
  padding: 0.12rem 0.3rem;
}
.btn.ghost {
  background: transparent;
}
</style>
