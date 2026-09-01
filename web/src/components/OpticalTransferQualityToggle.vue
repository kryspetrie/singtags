<script setup lang="ts">
defineProps<{
  available: boolean
  disabled?: boolean
}>()

const useHighRes = defineModel<boolean>({ default: false })
</script>

<template>
  <label
    class="quality-row"
    :class="{ on: useHighRes, unavailable: !available }"
    title="Render upgraded PDF sheets before transfer (larger, sharper, slower to scan)"
  >
    <span class="quality-copy">
      <span class="quality-title">High quality</span>
      <span v-if="available" class="quality-desc">
        Sharper sheets when an upgraded PDF is on file (larger payload)
      </span>
      <span v-else class="quality-desc">
        No upgraded PDF on file for the selected tags — standard preview quality only
      </span>
    </span>
    <input
      v-model="useHighRes"
      type="checkbox"
      class="quality-switch"
      role="switch"
      :disabled="disabled || !available"
      :aria-checked="useHighRes"
      aria-label="Transfer high quality sheets"
    />
  </label>
</template>

<style scoped>
.quality-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin: 0;
  padding: 0.55rem 0.65rem;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--surface);
  cursor: pointer;
  user-select: none;
}
.quality-row.unavailable {
  cursor: default;
  opacity: 0.92;
}
.quality-row.on .quality-title {
  color: var(--accent-hover);
}
.quality-copy {
  display: grid;
  gap: 0.1rem;
  min-width: 0;
}
.quality-title {
  font-size: 0.92rem;
  font-weight: 650;
}
.quality-desc {
  font-size: 0.78rem;
  color: var(--muted);
  line-height: 1.35;
}
.quality-switch {
  appearance: none;
  position: relative;
  flex: 0 0 auto;
  width: 2.6rem;
  height: 1.45rem;
  margin: 0;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: color-mix(in srgb, var(--border) 55%, var(--surface));
  cursor: pointer;
}
.quality-switch:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.quality-switch::after {
  content: '';
  position: absolute;
  top: 1px;
  left: 1px;
  width: calc(1.45rem - 4px);
  height: calc(1.45rem - 4px);
  border-radius: 50%;
  background: var(--surface);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
  transition: transform 0.15s ease;
}
.quality-switch:checked {
  background: var(--accent);
  border-color: var(--accent);
}
.quality-switch:checked::after {
  transform: translateX(1.15rem);
}
</style>
