<script setup lang="ts">
/**
 * Coach mode landing — pick Arrange or Review.
 */
import { COACH_MODE_CARDS, type CoachModeCard } from '../../domain/arranging/coachModeCatalog'
import type { CoachUiMode } from '../../domain/arranging/coachTips'

defineProps<{
  progressLabel: string
}>()

const emit = defineEmits<{
  pick: [mode: CoachUiMode]
}>()

const cards: readonly CoachModeCard[] = COACH_MODE_CARDS
</script>

<template>
  <div class="landing" aria-label="Choose coach mode">
    <p class="lead">
      Pick how you want to work. You can return here anytime with
      <strong>← Modes</strong>.
    </p>
    <p class="progress">{{ progressLabel }}</p>
    <ul class="cards">
      <li v-for="c in cards" :key="c.id">
        <button type="button" class="card" @click="emit('pick', c.id)">
          <span class="title">{{ c.title }}</span>
          <span class="tag">{{ c.tagline }}</span>
          <span class="body">{{ c.body }}</span>
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.landing {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
}
.lead {
  margin: 0;
  font-size: 0.84rem;
  line-height: 1.4;
  color: var(--text);
}
.progress {
  margin: 0;
  font-size: 0.75rem;
  color: var(--muted);
}
.cards {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.55rem;
}
.card {
  width: 100%;
  display: grid;
  gap: 0.25rem;
  text-align: left;
  padding: 0.7rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg, var(--surface));
  color: var(--text);
  font: inherit;
  cursor: pointer;
}
.card:hover {
  border-color: color-mix(in srgb, var(--accent) 50%, var(--border));
  background: color-mix(in srgb, var(--accent) 8%, transparent);
}
.title {
  font-size: 1rem;
  font-weight: 750;
}
.tag {
  font-size: 0.78rem;
  font-weight: 650;
  color: color-mix(in srgb, var(--accent) 80%, var(--text));
}
.body {
  font-size: 0.8rem;
  line-height: 1.4;
  color: var(--muted);
}
</style>
