<script setup lang="ts">
/**
 * Modal reel: slot-style pick from the current batch.
 */
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import FilterSheet from './FilterSheet.vue'
import { pickWheelWinner } from '../lib/rouletteDraw'
import type { RouletteBatchItem } from '../stores/roulette'

const props = defineProps<{
  open: boolean
  items: RouletteBatchItem[]
  wheelUsedIds: number[]
  openAutomatically: boolean
}>()

const emit = defineEmits<{
  close: []
  landed: [id: number]
  openTag: [id: number]
  'update:openAutomatically': [value: boolean]
}>()

const SPIN_MS = 2200
const ROW_H = 52
const VISIBLE = 5
const CENTER = Math.floor(VISIBLE / 2)

const spinning = ref(false)
const landedId = ref<number | null>(null)
const stripLabels = ref<string[]>([])
const stripOffset = ref(0)
const announce = ref('')
let spinTimer: ReturnType<typeof setTimeout> | null = null
let animFrame = 0

const eligible = computed(() =>
  props.items.filter((it) => !props.wheelUsedIds.includes(it.id)),
)

const landedItem = computed(() =>
  landedId.value == null ? null : props.items.find((it) => it.id === landedId.value) ?? null,
)

const reducedMotion = computed(() => {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
})

function clearSpinTimer(): void {
  if (spinTimer != null) {
    clearTimeout(spinTimer)
    spinTimer = null
  }
  if (animFrame) {
    cancelAnimationFrame(animFrame)
    animFrame = 0
  }
}

function labelFor(id: number): string {
  return props.items.find((it) => it.id === id)?.title ?? `Tag #${id}`
}

function buildStrip(winnerId: number): { labels: string[]; finalIndex: number } {
  const pool = eligible.value.length ? eligible.value : props.items
  const decoys = pool.map((it) => it.title)
  if (!decoys.length) decoys.push(labelFor(winnerId))
  const labels: string[] = []
  const cycles = 6
  for (let c = 0; c < cycles; c++) {
    for (const t of decoys) labels.push(t)
  }
  // Pad so winner lands in center after scroll
  while (labels.length < VISIBLE + 4) labels.push(...decoys)
  const finalIndex = labels.length
  labels.push(labelFor(winnerId))
  // Trailing buffer below center
  for (let i = 0; i < CENTER + 2; i++) {
    labels.push(decoys[i % decoys.length]!)
  }
  return { labels, finalIndex }
}

function finishLand(winnerId: number): void {
  spinning.value = false
  landedId.value = winnerId
  announce.value = `Picked ${labelFor(winnerId)}`
  emit('landed', winnerId)
  if (props.openAutomatically) {
    emit('openTag', winnerId)
  }
}

async function startSpin(): Promise<void> {
  clearSpinTimer()
  landedId.value = null
  announce.value = ''
  const winnerId = pickWheelWinner(
    props.items.map((it) => it.id),
    props.wheelUsedIds,
  )
  if (winnerId == null) {
    announce.value = 'All tags in this batch were picked — Reset to spin again.'
    return
  }

  const { labels, finalIndex } = buildStrip(winnerId)
  stripLabels.value = labels
  stripOffset.value = 0
  spinning.value = true
  await nextTick()

  const targetY = (finalIndex - CENTER) * ROW_H

  if (reducedMotion.value) {
    stripOffset.value = targetY
    finishLand(winnerId)
    return
  }

  const start = performance.now()
  const from = 0
  const easeOutCubic = (t: number) => 1 - (1 - t) ** 3

  const tick = (now: number) => {
    const t = Math.min(1, (now - start) / SPIN_MS)
    stripOffset.value = from + (targetY - from) * easeOutCubic(t)
    if (t < 1) {
      animFrame = requestAnimationFrame(tick)
    } else {
      animFrame = 0
      stripOffset.value = targetY
      finishLand(winnerId)
    }
  }
  animFrame = requestAnimationFrame(tick)
}

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      void startSpin()
    } else {
      clearSpinTimer()
      spinning.value = false
      landedId.value = null
      announce.value = ''
      stripLabels.value = []
      stripOffset.value = 0
    }
  },
)

onUnmounted(() => clearSpinTimer())

function onOpenTag(): void {
  if (landedId.value == null) return
  emit('openTag', landedId.value)
}

function onAutoChange(e: Event): void {
  emit('update:openAutomatically', (e.target as HTMLInputElement).checked)
}

function spinAgain(): void {
  if (spinning.value) return
  void startSpin()
}
</script>

<template>
  <FilterSheet
    :open="open"
    title="Pick one"
    elevated
    fit-content
    @close="emit('close')"
  >
    <div class="pick" aria-live="polite">
      <p v-if="!items.length" class="empty">Deal a batch first.</p>
      <p v-else-if="!eligible.length && !spinning && landedId == null" class="empty">
        All tags in this batch were picked — Reset on the main page to spin again.
      </p>

      <div v-else class="stage-wrap">
        <div class="reel" :style="{ '--row-h': `${ROW_H}px`, '--visible': VISIBLE }">
          <div class="ticker" aria-hidden="true" />
          <div class="viewport">
            <ul
              class="strip"
              :style="{ transform: `translate3d(0, ${-stripOffset}px, 0)` }"
            >
              <li v-for="(label, i) in stripLabels" :key="i" class="slot">
                {{ label }}
              </li>
            </ul>
          </div>
        </div>
      </div>

      <p v-if="spinning" class="status">Spinning…</p>
      <p v-else-if="landedItem" class="status win">
        <strong>{{ landedItem.title }}</strong>
      </p>
      <p v-else-if="announce" class="status">{{ announce }}</p>

      <div class="actions">
        <button
          v-if="landedId != null && !openAutomatically"
          type="button"
          class="btn btn-primary"
          @click="onOpenTag"
        >
          Open
        </button>
        <button
          type="button"
          class="btn"
          :disabled="spinning || eligible.length === 0"
          @click="spinAgain"
        >
          {{ landedId != null ? 'Pick again' : 'Spin' }}
        </button>
      </div>

      <label class="auto">
        <input
          type="checkbox"
          :checked="openAutomatically"
          @change="onAutoChange"
        />
        <span>Open automatically (fullscreen sheet)</span>
      </label>
    </div>
  </FilterSheet>
</template>

<style scoped>
.pick {
  display: grid;
  gap: 0.85rem;
  padding: 0.15rem 0 0.35rem;
}
.empty {
  margin: 0;
  color: var(--muted);
  font-size: 0.92rem;
}
.stage-wrap {
  position: relative;
  display: grid;
  place-items: center;
  padding: 0.75rem 0;
}
.reel {
  position: relative;
  width: min(100%, 22rem);
  border-radius: var(--radius);
  border: 2px solid color-mix(in srgb, var(--accent) 45%, var(--border));
  background: var(--surface);
  box-shadow: 0 8px 28px color-mix(in srgb, var(--text) 12%, transparent);
  overflow: hidden;
}
.ticker {
  position: absolute;
  left: 0;
  right: 0;
  top: calc(var(--row-h) * 2);
  height: var(--row-h);
  border-top: 2px solid var(--accent);
  border-bottom: 2px solid var(--accent);
  background: color-mix(in srgb, var(--accent) 10%, transparent);
  pointer-events: none;
  z-index: 2;
}
.viewport {
  height: calc(var(--row-h) * var(--visible));
  overflow: hidden;
  mask-image: linear-gradient(
    to bottom,
    transparent 0%,
    #000 18%,
    #000 82%,
    transparent 100%
  );
}
.strip {
  list-style: none;
  margin: 0;
  padding: 0;
  will-change: transform;
}
.slot {
  height: var(--row-h);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 0.85rem;
  text-align: center;
  font-weight: 650;
  font-size: 0.95rem;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.status {
  margin: 0;
  text-align: center;
  color: var(--muted);
  font-size: 0.92rem;
  min-height: 1.4em;
}
.status.win {
  color: var(--text);
  font-size: 1.05rem;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  justify-content: center;
}
.btn-primary {
  background: var(--accent);
  color: #fff;
  border: 1px solid var(--accent);
  border-radius: 8px;
  min-height: var(--touch);
  padding: 0.4rem 0.95rem;
  font-weight: 650;
}
.btn-primary:hover {
  background: var(--accent-hover);
  border-color: var(--accent-hover);
}
.auto {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  justify-content: center;
  margin: 0;
  font-size: 0.82rem;
  color: var(--muted);
  cursor: pointer;
}
.auto input {
  accent-color: var(--accent);
}
</style>
