<script setup lang="ts">
/**
 * Candidate Why? panel — plain bullets + relative factor bars.
 */
import type { CandidateWhyView } from '../../application/arranging/CandidateWhy'

defineProps<{
  why: CandidateWhyView
  showNumbers: boolean
}>()

const emit = defineEmits<{
  'update:showNumbers': [value: boolean]
}>()
</script>

<template>
  <aside class="why">
    <p class="why-head"><strong>{{ why.headline }}</strong></p>
    <p class="hint">{{ why.summary }}</p>
    <ul>
      <li v-for="(b, bi) in why.bullets" :key="bi">
        <strong>{{ b.label }}</strong>
        <span class="muted"> — {{ b.whyItMatters }}</span>
      </li>
    </ul>
    <div v-if="why.factors.length" class="factor-bars">
      <div
        v-for="(f, fi) in why.factors"
        :key="fi"
        class="factor-row"
        :title="f.whyItMatters"
      >
        <span class="factor-label">{{ f.label }}</span>
        <span class="factor-track">
          <span class="factor-fill" :style="{ width: `${Math.round(f.relative * 100)}%` }" />
        </span>
        <span v-if="showNumbers" class="factor-raw">{{ f.raw }}</span>
      </div>
    </div>
    <label class="adv-nums">
      <input
        type="checkbox"
        :checked="showNumbers"
        @change="emit('update:showNumbers', ($event.target as HTMLInputElement).checked)"
      />
      Show numbers
    </label>
  </aside>
</template>

<style scoped>
.why {
  display: grid;
  gap: 0.3rem;
  font-size: 0.78rem;
  color: var(--muted);
}
.why-head {
  margin: 0;
  color: var(--text);
}
.hint,
.muted {
  margin: 0;
  font-size: 0.78rem;
  color: var(--muted);
  line-height: 1.35;
}
ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.25rem;
}
.factor-bars {
  display: grid;
  gap: 0.25rem;
}
.factor-row {
  display: grid;
  grid-template-columns: 5.5rem 1fr auto;
  gap: 0.35rem;
  align-items: center;
}
.factor-label {
  font-size: 0.72rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.factor-track {
  height: 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--border) 80%, transparent);
  overflow: hidden;
}
.factor-fill {
  display: block;
  height: 100%;
  background: color-mix(in srgb, var(--accent) 70%, #888);
}
.factor-raw {
  font-size: 0.68rem;
  font-variant-numeric: tabular-nums;
}
.adv-nums {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.72rem;
  cursor: pointer;
}
</style>
