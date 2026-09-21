<script setup lang="ts">
/**
 * Alternates chips + candidate filters for Coach Choose.
 */
import type { AltChipDto, CandFilterId, CounterpartDto } from '../../application/arranging/CoachAlternates'

defineProps<{
  altsOpen: boolean
  altChips: AltChipDto[]
  counterpart: CounterpartDto | null
  filterOptions: { id: CandFilterId; label: string }[]
  candFilter: CandFilterId
}>()

const emit = defineEmits<{
  'update:altsOpen': [value: boolean]
  'update:candFilter': [value: CandFilterId]
  applyAlt: [chip: AltChipDto]
  applyCounterpart: []
}>()
</script>

<template>
  <div class="wrap">
    <details v-if="altChips.length || counterpart" class="alts" :open="altsOpen">
      <summary @click.prevent="emit('update:altsOpen', !altsOpen)">
        Alternates
        <span class="meta">{{ altChips.length + (counterpart ? 1 : 0) }}</span>
      </summary>
      <div v-if="altChips.length" class="chip-row">
        <button
          v-for="chip in altChips"
          :key="chip.id"
          type="button"
          class="chip"
          :title="chip.reason"
          @click="emit('applyAlt', chip)"
        >
          {{ chip.label }}
        </button>
      </div>
      <button
        v-if="counterpart"
        type="button"
        class="step-btn"
        :title="counterpart.reason"
        @click="emit('applyCounterpart')"
      >
        Counterpart → {{ counterpart.label }}
      </button>
    </details>

    <div class="filter-row" role="group" aria-label="Suggestion filter">
      <button
        v-for="f in filterOptions"
        :key="f.id"
        type="button"
        :class="{ on: candFilter === f.id }"
        @click="emit('update:candFilter', f.id)"
      >
        {{ f.label }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.wrap {
  display: grid;
  gap: 0.45rem;
}
.alts {
  font-size: 0.82rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 0.35rem 0.45rem;
}
.alts summary {
  cursor: pointer;
  font-weight: 650;
}
.meta {
  margin-left: 0.25rem;
  font-size: 0.72rem;
  color: var(--muted);
  font-weight: 600;
}
.chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  margin: 0.35rem 0;
}
.chip,
.step-btn {
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface);
  font: inherit;
  font-size: 0.75rem;
  font-weight: 650;
  cursor: pointer;
  min-height: 1.7rem;
  padding: 0.15rem 0.55rem;
}
.step-btn {
  border-radius: 8px;
}
.filter-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.25rem;
}
.filter-row button {
  min-height: 1.7rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg, var(--surface));
  font: inherit;
  font-size: 0.75rem;
  font-weight: 650;
  cursor: pointer;
}
.filter-row button.on {
  border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
  background: color-mix(in srgb, var(--accent) 12%, transparent);
}
</style>
