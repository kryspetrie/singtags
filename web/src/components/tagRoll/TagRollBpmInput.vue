<script setup lang="ts">
/**
 * Tempo BPM: type any value; datalist offers canned presets (no spinner arrows).
 */
import { computed, useId } from 'vue'
import { TAG_ROLL_BPM_PRESETS } from '../../lib/tagRoll/types'

const props = withDefaults(
  defineProps<{
    modelValue: number
    ariaLabel?: string
    disabled?: boolean
    min?: number
    max?: number
  }>(),
  {
    ariaLabel: 'Tempo BPM',
    disabled: false,
    min: 20,
    max: 320,
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: number]
  change: [value: number]
}>()

const listId = useId()

const display = computed(() => String(props.modelValue))

function commit(raw: string): void {
  const v = Math.round(Number(raw))
  if (!Number.isFinite(v)) return
  const clamped = Math.max(props.min, Math.min(props.max, v))
  emit('update:modelValue', clamped)
  emit('change', clamped)
}

function onChange(e: Event): void {
  commit((e.target as HTMLInputElement).value)
}

function onPreset(e: Event): void {
  const v = Number((e.target as HTMLSelectElement).value)
  if (!Number.isFinite(v) || v <= 0) return
  commit(String(v))
  ;(e.target as HTMLSelectElement).value = ''
}
</script>

<template>
  <span class="bpm-field">
    <input
      class="bpm-input"
      type="text"
      inputmode="numeric"
      pattern="[0-9]*"
      autocomplete="off"
      :list="listId"
      :value="display"
      :disabled="disabled"
      :aria-label="ariaLabel"
      @change="onChange"
    />
    <datalist :id="listId">
      <option v-for="b in TAG_ROLL_BPM_PRESETS" :key="b" :value="b" />
    </datalist>
    <select
      class="bpm-preset"
      :disabled="disabled"
      aria-label="Tempo preset"
      title="Common tempos"
      @change="onPreset"
    >
      <option value="">▾</option>
      <option v-for="b in TAG_ROLL_BPM_PRESETS" :key="b" :value="b">{{ b }}</option>
    </select>
  </span>
</template>

<style scoped>
.bpm-field {
  display: inline-flex;
  align-items: stretch;
  gap: 0;
  min-width: 0;
}
.bpm-input {
  width: 3.2rem;
  min-height: 1.6rem;
  padding: 0.1rem 0.35rem;
  border: 1px solid var(--border);
  border-right: 0;
  border-radius: 6px 0 0 6px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 0.82rem;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
}
.bpm-preset {
  width: 1.65rem;
  min-height: 1.6rem;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 0 6px 6px 0;
  background: var(--surface);
  color: var(--muted);
  font: inherit;
  font-size: 0.72rem;
  cursor: pointer;
  appearance: none;
  text-align: center;
}
.bpm-input:disabled,
.bpm-preset:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.bpm-input:focus {
  outline: none;
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
  z-index: 1;
}
.bpm-preset:focus {
  outline: none;
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
}
</style>
