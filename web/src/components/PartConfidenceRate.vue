<script setup lang="ts">
/**
 * Compact part know + confidence control (TagMyRating-style popover).
 * null = don't know this part; 0 = know, unrated; 1–5 = rated.
 */
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import type { Confidence } from '../lib/singTogether/types'
import { clampConfidence } from '../lib/singTogether/types'

const props = defineProps<{
  label: string
  /** null = not known; 0–5 = known (0 = unrated). */
  modelValue: Confidence | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: Confidence | null]
}>()

const open = ref(false)
const hoverStars = ref<number | null>(null)
const rootEl = ref<HTMLElement | null>(null)

const known = computed(() => props.modelValue != null)
const stars = computed(() =>
  props.modelValue == null ? 0 : clampConfidence(Number(props.modelValue)),
)
const previewStars = computed(() => hoverStars.value ?? stars.value)

const triggerAria = computed(() => {
  if (!known.value) return `Add ${props.label}`
  if (stars.value <= 0) return `${props.label}: known, not rated — tap to rate`
  return `${props.label}: ${stars.value} of 5 — tap to change`
})

const triggerTitle = computed(() => {
  if (!known.value) return `Mark ${props.label} as a part you know`
  if (stars.value <= 0) return `${props.label} — tap to rate confidence`
  return `${props.label}: ${stars.value}★ — tap to change`
})

watch(
  () => props.label,
  () => {
    open.value = false
    hoverStars.value = null
  },
)

function onDocPointer(e: Event): void {
  const t = e.target
  if (!(t instanceof Node) || !rootEl.value?.contains(t)) {
    open.value = false
    hoverStars.value = null
  }
}

function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    open.value = false
    hoverStars.value = null
  }
}

watch(open, async (isOpen) => {
  if (isOpen) {
    await nextTick()
    document.addEventListener('pointerdown', onDocPointer, true)
    document.addEventListener('keydown', onKey)
  } else {
    hoverStars.value = null
    document.removeEventListener('pointerdown', onDocPointer, true)
    document.removeEventListener('keydown', onKey)
  }
})

onUnmounted(() => {
  document.removeEventListener('pointerdown', onDocPointer, true)
  document.removeEventListener('keydown', onKey)
})

function onTriggerClick(): void {
  if (!known.value) {
    emit('update:modelValue', 0)
    open.value = true
    return
  }
  open.value = !open.value
}

function setHover(n: number | null): void {
  hoverStars.value = n
}

function pick(n: number): void {
  const next = clampConfidence(n)
  if (stars.value === next) {
    emit('update:modelValue', 0)
    open.value = false
    return
  }
  emit('update:modelValue', next)
  open.value = false
}

function clearRating(): void {
  emit('update:modelValue', 0)
  open.value = false
}

function removePart(): void {
  emit('update:modelValue', null)
  open.value = false
}
</script>

<template>
  <div ref="rootEl" class="part-rate" :class="{ open, known }">
    <button
      type="button"
      class="part-btn"
      :class="{ on: known, rated: stars > 0 }"
      :aria-expanded="open"
      aria-haspopup="true"
      :aria-label="triggerAria"
      :title="triggerTitle"
      @click="onTriggerClick"
    >
      <span class="part-name">{{ label }}</span>
      <span v-if="stars > 0" class="part-stars" aria-hidden="true">{{ stars }}★</span>
      <span v-else-if="known" class="part-rate-hint" aria-hidden="true">★</span>
    </button>

    <div
      v-if="open"
      class="rate-pop"
      role="dialog"
      :aria-label="`Rate ${label} from 1 to 5 stars`"
      @pointerleave="setHover(null)"
    >
      <div class="stars">
        <button
          v-for="n in 5"
          :key="n"
          type="button"
          class="star"
          :class="{ on: n <= previewStars }"
          :aria-label="`${n} star${n === 1 ? '' : 's'}`"
          :aria-pressed="stars === n"
          @pointerenter="setHover(n)"
          @focus="setHover(n)"
          @click="pick(n)"
        >
          ★
        </button>
      </div>
      <button
        v-if="stars > 0"
        type="button"
        class="clear"
        title="Clear rating (keep part)"
        @pointerenter="setHover(null)"
        @click="clearRating"
      >
        Clear
      </button>
      <button
        type="button"
        class="clear remove"
        title="Remove this part"
        @pointerenter="setHover(null)"
        @click="removePart"
      >
        Don’t know
      </button>
    </div>
  </div>
</template>

<style scoped>
.part-rate {
  position: relative;
  display: inline-flex;
  flex-direction: column;
  align-items: flex-start;
}
.part-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.28rem;
  margin: 0;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface);
  color: var(--muted);
  font: inherit;
  font-size: 0.82rem;
  font-weight: 650;
  min-height: 36px;
  padding: 0.25rem 0.65rem;
  cursor: pointer;
  white-space: nowrap;
}
.part-btn.on {
  color: var(--text);
  border-color: color-mix(in srgb, var(--accent) 40%, var(--border));
  background: color-mix(in srgb, var(--accent) 10%, var(--surface));
}
.part-btn.rated {
  color: var(--accent);
}
.part-btn:hover {
  border-color: color-mix(in srgb, var(--accent) 35%, var(--border));
  color: var(--text);
}
.part-btn.rated:hover {
  color: var(--accent-hover, var(--accent));
}
.part-name {
  line-height: 1;
}
.part-stars {
  font-size: 0.78rem;
  line-height: 1;
  letter-spacing: 0.02em;
}
.part-rate-hint {
  font-size: 0.85rem;
  line-height: 1;
  opacity: 0.55;
}
.rate-pop {
  position: absolute;
  top: calc(100% + 0.3rem);
  left: 0;
  z-index: 30;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.2rem 0.3rem;
  padding: 0.35rem 0.45rem;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
  box-shadow: 0 8px 24px color-mix(in srgb, var(--text) 14%, transparent);
  min-width: max-content;
}
.stars {
  display: flex;
  align-items: center;
  gap: 0.05rem;
}
.star {
  border: 0;
  background: transparent;
  color: color-mix(in srgb, var(--muted) 65%, var(--border));
  font-size: 1.25rem;
  line-height: 1;
  padding: 0.15rem 0.12rem;
  min-height: 36px;
  min-width: 1.7rem;
  cursor: pointer;
}
.star.on {
  color: var(--accent);
}
.clear {
  border: 0;
  background: transparent;
  color: var(--muted);
  font: inherit;
  font-size: 0.72rem;
  font-weight: 600;
  min-height: 32px;
  padding: 0.15rem 0.35rem;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.clear:hover {
  color: var(--text);
}
.clear.remove:hover {
  color: var(--danger, #b42318);
}
</style>
