<script setup lang="ts">
/**
 * Shared chrome for Tag Studio bottom lanes.
 * Compact density: vertical spine label + tight actions (Sketch/Detected/Mods).
 * Default density: stacked label + View select (Coach / taller lanes).
 */
import { computed } from 'vue'

export type BottomLaneViewOption = {
  value: string
  label: string
}

const props = withDefaults(
  defineProps<{
    label: string
    leftGutterPx?: number
    viewOptions?: readonly BottomLaneViewOption[]
    viewValue?: string
    /** Caption above the select (default View; Mods uses Add). Ignored when compact. */
    viewFieldLabel?: string
    viewAriaLabel?: string
    /** Compact = vertical label + short gutter (Sketch / Detected / Mods). */
    density?: 'default' | 'compact'
  }>(),
  { density: 'default' },
)

const emit = defineEmits<{
  'update:view': [value: string]
}>()

const gutterStyle = computed(() => {
  const g = Math.max(64, props.leftGutterPx ?? 112)
  return { '--lane-gutter': `${g}px` } as Record<string, string>
})

const hasView = computed(() => (props.viewOptions?.length ?? 0) > 0)
const compact = computed(() => props.density === 'compact')
/** Two options → segmented toggle; otherwise keep a select. */
const useSegment = computed(
  () => compact.value && (props.viewOptions?.length ?? 0) === 2,
)

function onViewChange(e: Event): void {
  const el = e.target as HTMLSelectElement
  emit('update:view', el.value)
}

function shortOpt(label: string): string {
  if (label === 'Chord') return 'C'
  if (label === 'Number') return '#'
  return label.slice(0, 1)
}
</script>

<template>
  <div class="bottom-lane" :class="{ compact }" :style="gutterStyle">
    <div class="gutter">
      <div class="gutter-label" :title="label">{{ label }}</div>
      <div class="gutter-actions">
        <div
          v-if="hasView && useSegment"
          class="view-seg"
          role="group"
          :aria-label="viewAriaLabel ?? `${label} view`"
        >
          <button
            v-for="opt in viewOptions"
            :key="opt.value"
            type="button"
            class="seg-btn"
            :class="{ on: opt.value === viewValue }"
            :aria-pressed="opt.value === viewValue"
            :title="opt.label"
            @click="emit('update:view', opt.value)"
          >
            {{ shortOpt(opt.label) }}
          </button>
        </div>
        <label v-else-if="hasView" class="view-field">
          <span v-if="!compact" class="view-lbl">{{ viewFieldLabel ?? 'View' }}</span>
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
.bottom-lane.compact .gutter {
  flex-direction: row;
  align-items: stretch;
  gap: 0.3rem;
  padding: 0.2rem 0.3rem;
}
.gutter-label {
  font-size: 0.8rem;
  font-weight: 750;
  letter-spacing: 0.02em;
  color: var(--text);
  line-height: 1.15;
  text-align: center;
}
.bottom-lane.compact .gutter-label {
  flex: 0 0 auto;
  writing-mode: vertical-rl;
  transform: rotate(180deg);
  font-size: 0.68rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--muted);
  text-align: center;
  padding: 0.15rem 0;
  user-select: none;
}
.gutter-actions {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0.2rem;
  min-width: 0;
  flex: 1 1 auto;
  justify-content: center;
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
.bottom-lane.compact .view-select {
  min-height: 1.35rem;
  font-size: 0.65rem;
  padding: 0.05rem 0.15rem;
}
.view-seg {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.15rem;
}
.seg-btn {
  min-height: 1.35rem;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: var(--surface);
  color: var(--muted);
  font: inherit;
  font-size: 0.68rem;
  font-weight: 750;
  cursor: pointer;
}
.seg-btn.on {
  color: var(--text);
  border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
  background: color-mix(in srgb, var(--accent) 16%, var(--surface));
}
.seg-btn:hover {
  color: var(--text);
  background: color-mix(in srgb, var(--accent) 10%, var(--surface));
}
.gutter-extra {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0.15rem;
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
