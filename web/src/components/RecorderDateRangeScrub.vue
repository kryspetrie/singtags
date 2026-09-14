<script setup lang="ts">
/**
 * Dual-bracket timeline scrub for recorder session date filtering.
 * Marks show session density; left/right brackets set From/To days.
 */
import { computed, onBeforeUnmount, ref } from 'vue'
import {
  clampDayKey,
  dayToFraction,
  formatShortDay,
  fractionToDay,
  shiftDayKey,
  type SessionDayBounds,
  type SessionDayMark,
} from '../lib/recorderDateRange'

const props = defineProps<{
  bounds: SessionDayBounds | null
  marks: SessionDayMark[]
  from: string
  to: string
}>()

const emit = defineEmits<{
  'update:from': [string]
  'update:to': [string]
}>()

const trackRef = ref<HTMLElement | null>(null)
const dragging = ref<'from' | 'to' | null>(null)

const maxCount = computed(() => Math.max(1, ...props.marks.map((m) => m.count)))

const spanReady = computed(() => {
  if (!props.bounds) return false
  return props.bounds.min <= props.bounds.max
})

const singleDay = computed(
  () => !!props.bounds && props.bounds.min === props.bounds.max,
)

const effectiveFrom = computed(() => {
  if (!props.bounds) return ''
  if (!props.from) return props.bounds.min
  return clampDayKey(props.from, props.bounds.min, props.bounds.max)
})

const effectiveTo = computed(() => {
  if (!props.bounds) return ''
  if (!props.to) return props.bounds.max
  return clampDayKey(props.to, props.bounds.min, props.bounds.max)
})

const fromFrac = computed(() =>
  props.bounds ? dayToFraction(effectiveFrom.value, props.bounds.min, props.bounds.max) : 0,
)

const toFrac = computed(() =>
  props.bounds ? dayToFraction(effectiveTo.value, props.bounds.min, props.bounds.max) : 1,
)

const markStyle = computed(() =>
  props.marks.map((m) => {
    const left = props.bounds
      ? dayToFraction(m.day, props.bounds.min, props.bounds.max) * 100
      : 0
    const h = 28 + Math.round((m.count / maxCount.value) * 36)
    return { day: m.day, left: `${left}%`, height: `${h}%`, count: m.count }
  }),
)

function fractionFromClientX(clientX: number): number {
  const el = trackRef.value
  if (!el) return 0
  const r = el.getBoundingClientRect()
  if (r.width <= 0) return 0
  return Math.min(1, Math.max(0, (clientX - r.left) / r.width))
}

function dayFromClientX(clientX: number): string {
  if (!props.bounds) return ''
  return fractionToDay(fractionFromClientX(clientX), props.bounds.min, props.bounds.max)
}

function setFrom(day: string): void {
  if (!props.bounds) return
  let next = clampDayKey(day, props.bounds.min, props.bounds.max)
  const to = effectiveTo.value
  if (next > to) next = to
  if (next !== props.from) emit('update:from', next)
}

function setTo(day: string): void {
  if (!props.bounds) return
  let next = clampDayKey(day, props.bounds.min, props.bounds.max)
  const from = effectiveFrom.value
  if (next < from) next = from
  if (next !== props.to) emit('update:to', next)
}

function onPointerDown(which: 'from' | 'to', e: PointerEvent): void {
  if (!spanReady.value || singleDay.value) return
  e.preventDefault()
  dragging.value = which
  const target = e.currentTarget as HTMLElement
  target.setPointerCapture?.(e.pointerId)
  const day = dayFromClientX(e.clientX)
  if (which === 'from') setFrom(day)
  else setTo(day)
}

function onPointerMove(e: PointerEvent): void {
  if (!dragging.value) return
  const day = dayFromClientX(e.clientX)
  if (dragging.value === 'from') setFrom(day)
  else setTo(day)
}

function onPointerUp(e: PointerEvent): void {
  if (!dragging.value) return
  const target = e.currentTarget as HTMLElement
  try {
    target.releasePointerCapture?.(e.pointerId)
  } catch {
    /* ignore */
  }
  dragging.value = null
}

function onTrackPointerDown(e: PointerEvent): void {
  if (!spanReady.value || singleDay.value) return
  if ((e.target as HTMLElement | null)?.closest?.('.bracket')) return
  const day = dayFromClientX(e.clientX)
  const mid =
    (dayToFraction(effectiveFrom.value, props.bounds!.min, props.bounds!.max) +
      dayToFraction(effectiveTo.value, props.bounds!.min, props.bounds!.max)) /
    2
  const f = fractionFromClientX(e.clientX)
  if (f <= mid) {
    dragging.value = 'from'
    setFrom(day)
  } else {
    dragging.value = 'to'
    setTo(day)
  }
  const el = trackRef.value
  el?.setPointerCapture?.(e.pointerId)
}

function onBracketKey(which: 'from' | 'to', e: KeyboardEvent): void {
  if (!props.bounds || singleDay.value) return
  let delta = 0
  if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') delta = -1
  else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') delta = 1
  else return
  e.preventDefault()
  const cur = which === 'from' ? effectiveFrom.value : effectiveTo.value
  const next = shiftDayKey(cur, delta)
  if (which === 'from') setFrom(next)
  else setTo(next)
}

onBeforeUnmount(() => {
  dragging.value = null
})
</script>

<template>
  <div class="date-scrub" :class="{ empty: !spanReady, single: singleDay }">
    <p v-if="!spanReady" class="scrub-empty muted">No sessions to plot on the timeline.</p>
    <template v-else>
      <div class="scrub-labels" aria-hidden="true">
        <span>{{ formatShortDay(bounds!.min) }}</span>
        <span>{{ formatShortDay(bounds!.max) }}</span>
      </div>
      <div
        ref="trackRef"
        class="track"
        role="group"
        aria-label="Session date range"
        @pointerdown="onTrackPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
      >
        <div class="rail" />
        <i
          v-for="m in markStyle"
          :key="m.day"
          class="mark"
          :style="{ left: m.left, height: m.height }"
          :title="`${m.day}: ${m.count} session${m.count === 1 ? '' : 's'}`"
        />
        <div
          class="band"
          :style="{
            left: `${Math.min(fromFrac, toFrac) * 100}%`,
            width: `${Math.abs(toFrac - fromFrac) * 100}%`,
          }"
        />
        <button
          type="button"
          class="bracket from"
          :class="{ on: dragging === 'from' }"
          :style="{ left: `${fromFrac * 100}%` }"
          :disabled="singleDay"
          aria-label="Range start"
          :aria-valuetext="effectiveFrom"
          @pointerdown.stop="onPointerDown('from', $event)"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointercancel="onPointerUp"
          @keydown="onBracketKey('from', $event)"
        />
        <button
          type="button"
          class="bracket to"
          :class="{ on: dragging === 'to' }"
          :style="{ left: `${toFrac * 100}%` }"
          :disabled="singleDay"
          aria-label="Range end"
          :aria-valuetext="effectiveTo"
          @pointerdown.stop="onPointerDown('to', $event)"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointercancel="onPointerUp"
          @keydown="onBracketKey('to', $event)"
        />
      </div>
    </template>
  </div>
</template>

<style scoped>
.date-scrub {
  display: grid;
  gap: 0.35rem;
  min-width: 0;
}
.scrub-empty {
  margin: 0;
  font-size: 0.88rem;
}
.scrub-labels {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  font-size: 0.75rem;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}
.track {
  position: relative;
  height: 3.25rem;
  min-width: 0;
  touch-action: none;
  user-select: none;
  cursor: pointer;
}
.rail {
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  height: 4px;
  margin-top: -2px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--border) 80%, var(--muted));
}
.mark {
  position: absolute;
  bottom: 50%;
  width: 2px;
  margin-left: -1px;
  border-radius: 1px;
  background: color-mix(in srgb, var(--accent) 55%, var(--muted));
  pointer-events: none;
  transform-origin: bottom center;
}
.band {
  position: absolute;
  top: 50%;
  height: 4px;
  margin-top: -2px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 70%, transparent);
  pointer-events: none;
}
.bracket {
  position: absolute;
  top: 50%;
  z-index: 2;
  width: 44px;
  height: 44px;
  margin: -22px 0 0 -22px;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: ew-resize;
  touch-action: none;
}
.bracket::before {
  content: '';
  position: absolute;
  left: 50%;
  top: 50%;
  width: 14px;
  height: 28px;
  margin: -14px 0 0 -7px;
  border-radius: 4px;
  border: 2px solid var(--accent);
  background: var(--surface);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12);
}
.bracket.from::before {
  border-radius: 4px 2px 2px 4px;
}
.bracket.to::before {
  border-radius: 2px 4px 4px 2px;
}
.bracket.on::before,
.bracket:focus-visible::before {
  background: color-mix(in srgb, var(--accent) 18%, var(--surface));
  outline: 2px solid color-mix(in srgb, var(--accent) 45%, transparent);
  outline-offset: 2px;
}
.bracket:disabled {
  cursor: default;
  opacity: 0.55;
}
.muted {
  color: var(--muted);
}
</style>
