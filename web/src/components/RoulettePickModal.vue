<script setup lang="ts">
/**
 * Modal reel: slot-style pick from the current batch.
 */
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import FilterSheet from './FilterSheet.vue'
import {
  buildRouletteSpinStrip,
  pickWheelWinner,
  visibleRouletteReelRows,
} from '../lib/rouletteDraw'
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

const SPIN_MS = 3000
const ROW_H = 52

const spinning = ref(false)
const landedId = ref<number | null>(null)
const stripLabels = ref<string[]>([])
const stripOffset = ref(0)
const visibleRows = ref(5)
const announce = ref('')
let spinTimer: ReturnType<typeof setTimeout> | null = null
let animFrame = 0

const eligible = computed(() =>
  props.items.filter((it) => !props.wheelUsedIds.includes(it.id)),
)

const centerRow = computed(() => Math.floor(visibleRows.value / 2))

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

  const pool = eligible.value.length ? eligible.value : props.items
  const poolLen = pool.length
  // Single remaining tag: no reel — land immediately.
  if (poolLen <= 1) {
    visibleRows.value = 1
    stripLabels.value = [labelFor(winnerId)]
    stripOffset.value = 0
    finishLand(winnerId)
    return
  }

  const visible = visibleRouletteReelRows(poolLen)
  const center = Math.floor(visible / 2)
  visibleRows.value = visible

  const { labels, finalIndex } = buildRouletteSpinStrip(pool, winnerId, visible, center)
  stripLabels.value = labels
  stripOffset.value = 0
  spinning.value = true
  await nextTick()

  const targetY = (finalIndex - center) * ROW_H

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

/** Flip from the prop — don't trust the input event (mobile checkbox desync). */
function toggleAutoOpen(): void {
  emit('update:openAutomatically', !props.openAutomatically)
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
        <div
          class="reel"
          :style="{
            '--row-h': `${ROW_H}px`,
            '--visible': visibleRows,
            '--center': centerRow,
          }"
        >
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
          v-if="landedId != null"
          type="button"
          class="btn btn-primary"
          @click="onOpenTag"
        >
          Open
        </button>
        <button
          type="button"
          class="btn"
          :disabled="spinning || eligible.length < 2"
          @click="spinAgain"
        >
          {{ landedId != null ? 'Pick again' : 'Spin' }}
        </button>
      </div>

      <label class="auto" :class="{ on: openAutomatically }">
        <span class="auto-copy">
          <span class="auto-title">Open automatically</span>
          <span class="auto-desc">Jump to the tag (fullscreen sheet) when the reel lands</span>
        </span>
        <input
          type="checkbox"
          class="setting-switch"
          role="switch"
          :checked="openAutomatically"
          :aria-checked="openAutomatically"
          aria-label="Open automatically"
          @change="toggleAutoOpen"
        />
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
  top: calc(var(--row-h) * var(--center));
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
  justify-content: space-between;
  gap: 0.75rem;
  margin: 0;
  padding: 0.55rem 0.65rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: color-mix(in srgb, var(--surface) 92%, var(--bg));
  cursor: pointer;
  min-height: var(--touch);
}
.auto.on {
  border-color: color-mix(in srgb, var(--accent) 40%, var(--border));
  background: color-mix(in srgb, var(--accent) 8%, var(--surface));
}
.auto-copy {
  display: grid;
  gap: 0.1rem;
  min-width: 0;
  text-align: left;
}
.auto-title {
  font-size: 0.88rem;
  font-weight: 650;
  color: var(--text);
}
.auto-desc {
  font-size: 0.75rem;
  color: var(--muted);
  line-height: 1.3;
}
.setting-switch {
  flex-shrink: 0;
  width: 2.75rem;
  height: 1.55rem;
  appearance: none;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: color-mix(in srgb, var(--muted) 22%, var(--surface));
  position: relative;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
}
.setting-switch::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 1.15rem;
  height: 1.15rem;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
  transition: transform 0.15s ease;
}
.setting-switch:checked {
  background: var(--accent);
  border-color: var(--accent);
}
.setting-switch:checked::after {
  transform: translateX(1.15rem);
}
.setting-switch:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
</style>
