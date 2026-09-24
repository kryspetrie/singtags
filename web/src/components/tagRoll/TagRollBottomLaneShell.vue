<script setup lang="ts">
/**
 * Shared chrome for Tag Studio bottom lanes:
 * left tote gutter = label + View select; body = time-aligned content.
 * Open/close lives on the media bar (no per-lane dismiss).
 */
import { computed } from 'vue'

export type BottomLaneViewOption = {
  value: string
  label: string
}

const props = defineProps<{
  label: string
  leftGutterPx?: number
  /** Options for the dropdown under the lane label. */
  viewOptions?: readonly BottomLaneViewOption[]
  viewValue?: string
  /** Caption above the select (default View; Mods uses Add). */
  viewFieldLabel?: string
  viewAriaLabel?: string
}>()

const emit = defineEmits<{
  'update:view': [value: string]
}>()

const gutterStyle = computed(() => {
  const g = Math.max(64, props.leftGutterPx ?? 112)
  return { '--lane-gutter': `${g}px` } as Record<string, string>
})

const hasView = computed(() => (props.viewOptions?.length ?? 0) > 0)

function onViewChange(e: Event): void {
  const el = e.target as HTMLSelectElement
  emit('update:view', el.value)
}
</script>

<template>
  <div class="bottom-lane" :style="gutterStyle">
    <div class="gutter">
      <div class="gutter-label">{{ label }}</div>
      <label v-if="hasView" class="view-field">
        <span class="view-lbl">{{ viewFieldLabel ?? 'View' }}</span>
        <select
          class="view-select"
          :aria-label="viewAriaLabel ?? `${label} ${viewFieldLabel ?? 'view'}`"
          :value="viewValue"
          @change="onViewChange"
        >
          <option v-for="opt in viewOptions" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
      </label>
      <div v-if="$slots.gutter" class="gutter-extra">
        <slot name="gutter" />
      </div>
    </div>
    <div class="lane-main">
      <div class="lane-body">
        <slot />
        <div v-if="$slots.inspect" class="lane-inspect">
          <slot name="inspect" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.bottom-lane {
  display: grid;
  grid-template-columns: var(--lane-gutter, 112px) minmax(0, 1fr);
  gap: 0;
  align-items: stretch;
  margin: 0;
  border-top: 1px solid var(--border);
  background: color-mix(in srgb, var(--surface) 94%, var(--bg, var(--surface)));
}
.gutter {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: center;
  gap: 0.28rem;
  padding: 0.35rem 0.35rem 0.4rem;
  box-sizing: border-box;
}
.gutter-label {
  font-size: 0.8rem;
  font-weight: 750;
  letter-spacing: 0.02em;
  color: var(--text);
  line-height: 1.15;
  text-align: center;
}
.view-field {
  display: flex;
  flex-direction: column;
  gap: 0.12rem;
  min-width: 0;
}
.view-lbl {
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--muted);
  line-height: 1;
}
.view-select {
  width: 100%;
  min-width: 0;
  max-width: 100%;
  min-height: 1.7rem;
  padding: 0.15rem 0.2rem;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 0.72rem;
  font-weight: 650;
  cursor: pointer;
}
.gutter-extra {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.2rem;
  min-width: 0;
}
.lane-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  align-self: stretch;
}
.lane-body {
  position: relative;
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  height: 100%;
}
.lane-inspect {
  position: absolute;
  right: 0.35rem;
  top: 0.25rem;
  z-index: 4;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.3rem;
  max-width: min(100%, 28rem);
  padding: 0.2rem 0.35rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: color-mix(in srgb, var(--surface) 92%, var(--bg, var(--surface)));
  box-shadow: 0 4px 14px color-mix(in srgb, #000 12%, transparent);
}
</style>
