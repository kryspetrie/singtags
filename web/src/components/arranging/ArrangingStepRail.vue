<script setup lang="ts">
/**
 * Ordered Coach steps — Pillars → Strong/passing → Chords → Check → Polish.
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
      <template v-for="(s, i) in GUIDED_STEPS" :key="s.id">
        <li v-if="i > 0" class="sep" aria-hidden="true">→</li>
        <li>
          <button
            type="button"
            :class="{ on: s.id === active }"
            :aria-current="s.id === active ? 'step' : undefined"
            :title="s.buttonTip"
            @click="emit('select', s.id)"
          >
            <span class="n">{{ i + 1 }}</span>
            {{ s.label }}
          </button>
        </li>
      </template>
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
  display: flex;
  align-items: stretch;
  gap: 0.15rem;
}
ol > li {
  min-width: 0;
}
ol > li:not(.sep) {
  flex: 1 1 0;
}
.sep {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  color: var(--muted);
  font-size: 0.75rem;
  font-weight: 650;
  opacity: 0.7;
  user-select: none;
}
button {
  width: 100%;
  min-height: 2rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg, var(--surface));
  color: var(--text);
  font: inherit;
  font-size: 0.72rem;
  font-weight: 700;
  cursor: pointer;
  padding: 0.2rem 0.25rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.05rem;
  line-height: 1.15;
}
button .n {
  font-size: 0.62rem;
  font-weight: 750;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}
button.on {
  border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
  background: color-mix(in srgb, var(--accent) 14%, transparent);
}
button:hover {
  border-color: color-mix(in srgb, var(--accent) 40%, var(--border));
}
.tip {
  margin: 0;
  font-size: 0.75rem;
  color: var(--muted);
  line-height: 1.35;
}
</style>
