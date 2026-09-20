<script setup lang="ts">
/**
 * Per-part mute/solo, volume, and pan — floating / draggable like Harmonize.
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { syncProjectMix } from '../../lib/tagRoll/mix'
import { tagRollTip } from '../../lib/tagRoll/shortcuts'
import { useTagRollStore } from '../../stores/tagRoll'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const store = useTagRollStore()
const project = computed(() => store.current)
const rows = computed(() => {
  const p = project.value
  if (!p) return []
  const mix = syncProjectMix(p.parts, p.mix)
  return p.parts.map((part) => {
    const m = mix.find((x) => x.partId === part.id)!
    return { part, mix: m }
  })
})

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

const PANEL_W = 340
const PANEL_MARGIN = 12

function clampPos(x: number, y: number): { x: number; y: number } {
  const el = panelRef.value
  const w = el?.offsetWidth || PANEL_W
  const h = el?.offsetHeight || 360
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

function onMute(partId: string, mute: boolean): void {
  store.patchPartMix(partId, { mute })
}

function onSolo(partId: string, solo: boolean): void {
  store.patchPartMix(partId, { solo })
}

function onVolume(partId: string, e: Event): void {
  const v = Number((e.target as HTMLInputElement).value)
  if (!Number.isFinite(v)) return
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
        Solo any combination of parts. Muted parts stay silent. Pan and volume apply to playback and
        Hear stack.
      </p>

      <ul class="list" role="list">
        <li v-for="{ part, mix } in rows" :key="part.id" class="row">
          <span class="swatch" :style="{ background: part.color }" aria-hidden="true" />
          <span class="name">{{ part.name }}</span>
          <button
            type="button"
            class="btn sm ms-mute"
            :class="{ on: mix.mute }"
            :aria-pressed="mix.mute"
            :title="tagRollTip(`${part.name} mute`)"
            @click="onMute(part.id, !mix.mute)"
          >
            M
          </button>
          <button
            type="button"
            class="btn sm ms-solo"
            :class="{ on: mix.solo }"
            :aria-pressed="mix.solo"
            :title="tagRollTip(`${part.name} solo`)"
            @click="onSolo(part.id, !mix.solo)"
          >
            S
          </button>
          <label class="slider vol" :title="tagRollTip(`${part.name} volume`)">
            <span class="lbl">Vol</span>
            <input
              type="range"
              min="0"
              max="1.5"
              step="0.01"
              :value="mix.volume"
              :aria-label="`${part.name} volume`"
              @input="onVolume(part.id, $event)"
            />
            <span class="val">{{ Math.round(mix.volume * 100) }}%</span>
          </label>
          <label class="slider pan" :title="tagRollTip(`${part.name} pan`)">
            <span class="lbl">Pan</span>
            <input
              type="range"
              min="-1"
              max="1"
              step="0.05"
              :value="mix.pan"
              :aria-label="`${part.name} pan`"
              @input="onPan(part.id, $event)"
            />
            <span class="val">{{ panLabel(mix.pan) }}</span>
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
  gap: 0.55rem;
  width: min(21.5rem, calc(100vw - 1.5rem));
  max-height: min(72vh, calc(100dvh - 1.5rem));
  overflow: auto;
  padding: 0.65rem 0.75rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: color-mix(in srgb, var(--surface) 96%, transparent);
  box-shadow:
    0 12px 40px color-mix(in srgb, #000 18%, transparent),
    0 0 0 1px color-mix(in srgb, var(--border) 80%, transparent);
  color: var(--text);
  pointer-events: auto;
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  cursor: grab;
  user-select: none;
  touch-action: none;
  margin: -0.15rem -0.15rem 0;
  padding: 0.15rem;
  border-radius: 8px;
}
.head:active {
  cursor: grabbing;
}
.head-actions {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}
.title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 700;
  pointer-events: none;
}
.hint {
  margin: 0;
  font-size: 0.8rem;
  color: var(--muted);
  line-height: 1.35;
}
.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}
.row {
  display: grid;
  grid-template-columns: 0.7rem minmax(3.5rem, 1fr) auto auto;
  grid-template-areas:
    'swatch name mute solo'
    'vol vol vol vol'
    'pan pan pan pan';
  align-items: center;
  gap: 0.35rem 0.45rem;
  padding: 0.45rem 0.35rem;
  border-radius: 8px;
  border: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
}
.swatch {
  grid-area: swatch;
  width: 0.7rem;
  height: 1.4rem;
  border-radius: 3px;
}
.name {
  grid-area: name;
  font-size: 0.85rem;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.row > .ms-mute {
  grid-area: mute;
}
.row > .ms-solo {
  grid-area: solo;
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
  gap: 0.3rem;
  min-width: 0;
}
.lbl {
  font-size: 0.68rem;
  color: var(--muted);
  width: 1.6rem;
  flex-shrink: 0;
}
.slider input[type='range'] {
  flex: 1;
  min-width: 0;
}
.val {
  font-size: 0.68rem;
  color: var(--muted);
  width: 2.4rem;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.btn {
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--text);
  border-radius: 6px;
  padding: 0.2rem 0.45rem;
  font: inherit;
  font-size: 0.75rem;
  cursor: pointer;
}
.btn.sm {
  min-width: 1.7rem;
  padding: 0.15rem 0.35rem;
}
.btn.ghost {
  background: transparent;
}
.btn.on {
  border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
  background: color-mix(in srgb, var(--accent) 18%, var(--surface));
  color: var(--accent);
  font-weight: 700;
}
</style>
