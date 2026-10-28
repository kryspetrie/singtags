<script setup lang="ts">
/**
 * Visible single-choice row for Learn. Options stay on the panel
 * instead of inside a dropdown.
 */
defineProps<{
  label: string
  options: readonly { id: string; label: string }[]
  selected: number
}>()

const emit = defineEmits<{
  pick: [index: number]
}>()
</script>

<template>
  <div v-if="options.length > 1" class="choices">
    <p class="lbl">{{ label }}</p>
    <div class="row" role="group" :aria-label="label">
      <button
        v-for="(opt, i) in options"
        :key="opt.id"
        type="button"
        :aria-pressed="i === selected"
        @click="emit('pick', i)"
      >
        {{ opt.label }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.choices {
  display: grid;
  gap: 0.3rem;
}
.lbl {
  margin: 0;
  font-size: 0.68rem;
  font-weight: 750;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--muted);
}
.row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}
.row button {
  flex: 1 1 auto;
  min-height: 1.75rem;
  padding: 0.28rem 0.55rem;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 0.78rem;
  font-weight: 650;
  line-height: 1.25;
  text-align: left;
  cursor: pointer;
}
.row button[aria-pressed='true'] {
  border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
  background: color-mix(in srgb, var(--accent) 16%, var(--surface));
}
</style>
