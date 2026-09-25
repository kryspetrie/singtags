<script setup lang="ts">
/**
 * Vertical Coach stage rail — docked to the right of the coach panel body.
 */
import {
  GUIDED_STEPS,
  type GuidedStepId,
} from '../../application/arranging/GuidedSteps'

defineProps<{
  active: GuidedStepId
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
          :title="s.buttonTip"
          @click="emit('select', s.id)"
        >
          <span class="n">{{ i + 1 }}</span>
          <span class="lab">{{ s.label }}</span>
        </button>
      </li>
    </ol>
  </nav>
</template>

<style scoped>
.rail {
  display: flex;
  flex-direction: column;
  flex: 0 0 auto;
  width: 5.6rem;
  min-width: 5.6rem;
  padding: 0.3rem;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: color-mix(in srgb, var(--accent) 6%, transparent);
  overflow: auto;
}
ol {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
button {
  width: 100%;
  min-height: 2.6rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg, var(--surface));
  color: var(--text);
  font: inherit;
  font-size: 0.68rem;
  font-weight: 700;
  cursor: pointer;
  padding: 0.25rem 0.2rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.08rem;
  line-height: 1.15;
  text-align: center;
}
.n {
  font-size: 0.62rem;
  font-weight: 750;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}
.lab {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
button.on {
  border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
  background: color-mix(in srgb, var(--accent) 14%, transparent);
}
button:hover {
  border-color: color-mix(in srgb, var(--accent) 40%, var(--border));
}
</style>
