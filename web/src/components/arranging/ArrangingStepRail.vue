<script setup lang="ts">
/**
 * Guided 4-step rail — Pillars → Roles → Chords → Review.
 */
import {
  GUIDED_STEPS,
  type GuidedStepId,
} from '../../application/arranging/GuidedSteps'

defineProps<{
  active: GuidedStepId
  tip: string
}>()

const emit = defineEmits<{
  select: [id: GuidedStepId]
}>()
</script>

<template>
  <nav class="rail" aria-label="Guided steps">
    <ol>
      <li v-for="(s, i) in GUIDED_STEPS" :key="s.id">
        <button
          type="button"
          :class="{ on: s.id === active }"
          :aria-current="s.id === active ? 'step' : undefined"
          @click="emit('select', s.id)"
        >
          <span class="n">{{ i + 1 }}</span>
          {{ s.label }}
        </button>
      </li>
    </ol>
    <p class="tip">{{ tip }}</p>
  </nav>
</template>

<style scoped>
.rail {
  display: grid;
  gap: 0.35rem;
  padding: 0.4rem 0.45rem;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: color-mix(in srgb, var(--accent) 6%, transparent);
}
ol {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.25rem;
}
button {
  width: 100%;
  min-height: 2rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg, var(--surface));
  font: inherit;
  font-size: 0.72rem;
  font-weight: 650;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.2rem;
}
button.on {
  border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
  background: color-mix(in srgb, var(--accent) 14%, transparent);
}
.n {
  font-variant-numeric: tabular-nums;
  opacity: 0.7;
}
.tip {
  margin: 0;
  font-size: 0.75rem;
  color: var(--muted);
  line-height: 1.35;
}
</style>
