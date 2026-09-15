<script setup lang="ts">
/**
 * Inline 1–5★ confidence control (same scale as tag My Rating).
 * 0 / unset = not rated; Clear removes the rating.
 */
import { computed, ref } from 'vue'
import type { Confidence } from '../lib/singTogether/types'
import { clampConfidence } from '../lib/singTogether/types'

const props = withDefaults(
  defineProps<{
    modelValue?: Confidence | null
    disabled?: boolean
    /** Accessible name prefix (e.g. part label). */
    label?: string
  }>(),
  {
    modelValue: 0,
    disabled: false,
    label: 'How confident?',
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: Confidence]
}>()

const hover = ref<number | null>(null)

const current = computed(() => clampConfidence(Number(props.modelValue ?? 0)))
const preview = computed(() => hover.value ?? current.value)

function pick(n: number): void {
  if (props.disabled) return
  // Tap same star again → clear (match TagMyRating “toggle off” feel).
  if (current.value === n) {
    emit('update:modelValue', 0)
    return
  }
  emit('update:modelValue', clampConfidence(n))
}

function clear(): void {
  if (props.disabled) return
  emit('update:modelValue', 0)
}
</script>

<template>
  <div class="conf-stars" :class="{ disabled }" role="group" :aria-label="label">
    <span class="conf-lbl">{{ label }}</span>
    <div class="stars" @pointerleave="hover = null">
      <button
        v-for="n in 5"
        :key="n"
        type="button"
        class="star"
        :class="{ on: n <= preview }"
        :aria-label="`${n} star${n === 1 ? '' : 's'}`"
        :aria-pressed="current === n"
        :disabled="disabled"
        @pointerenter="hover = n"
        @focus="hover = n"
        @click="pick(n)"
      >
        ★
      </button>
    </div>
    <button
      v-if="current > 0"
      type="button"
      class="clear"
      :disabled="disabled"
      title="Clear confidence rating"
      @click="clear"
    >
      Clear
    </button>
  </div>
</template>

<style scoped>
.conf-stars {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem 0.55rem;
  min-width: 0;
}
.conf-lbl {
  flex: 0 0 auto;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--muted);
}
.stars {
  display: inline-flex;
  gap: 0.05rem;
}
.star {
  margin: 0;
  padding: 0.15rem 0.2rem;
  min-width: 2rem;
  min-height: 2.5rem;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: color-mix(in srgb, var(--muted) 45%, var(--border));
  font: inherit;
  font-size: 1.35rem;
  line-height: 1;
  cursor: pointer;
  touch-action: manipulation;
}
.star.on {
  color: var(--accent);
}
.star:hover:not(:disabled),
.star:focus-visible {
  color: var(--accent-hover);
  outline: none;
  background: color-mix(in srgb, var(--accent) 10%, transparent);
}
.star:disabled {
  cursor: default;
  opacity: 0.55;
}
.clear {
  margin: 0;
  padding: 0.25rem 0.5rem;
  min-height: 2rem;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--muted);
  font: inherit;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
}
.clear:hover:not(:disabled) {
  color: var(--text);
  background: color-mix(in srgb, var(--border) 35%, transparent);
}
.disabled {
  opacity: 0.55;
  pointer-events: none;
}
</style>
