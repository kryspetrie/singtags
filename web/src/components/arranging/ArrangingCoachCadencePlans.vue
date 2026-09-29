<script setup lang="ts">
/**
 * Multi-moment cadence plans — Hear, Show range, Apply first / all.
 */
import { ref } from 'vue'
import type { CadenceSuggestion } from '../../domain/arranging/cadences'
import { asciiMusicText } from '../../lib/arranging/asciiMusicText'

defineProps<{
  plans: readonly CadenceSuggestion[]
  hearingPlanId?: string | null
  previewPlanId?: string | null
}>()

const emit = defineEmits<{
  applyPlan: [plan: CadenceSuggestion]
  applyStep: [plan: CadenceSuggestion, stepIndex: number]
  learn: [plan: CadenceSuggestion]
  hear: [plan: CadenceSuggestion]
  preview: [plan: CadenceSuggestion]
}>()

const open = ref(false)

function stepsLine(plan: CadenceSuggestion): string {
  return plan.steps.map((s) => asciiMusicText(s.label)).join(' → ')
}

function startCue(plan: CadenceSuggestion): string {
  return `from note ${plan.startMomentIndex + 1}`
}
</script>

<template>
  <aside v-if="plans.length" class="cadence-plans" aria-label="Cadence plans">
    <button
      type="button"
      class="collapse-head"
      :aria-expanded="open"
      @click="open = !open"
    >
      <span class="chev" aria-hidden="true">{{ open ? '▾' : '▸' }}</span>
      <h4 class="title">Cadence plans</h4>
      <span class="count">{{ plans.length }}</span>
    </button>
    <div v-show="open" class="body">
      <p class="hint">
        Multi-chord textbook moves from this moment. <strong>Show</strong> marks the replace
        range and previews the notes; <strong>Hear</strong> plays the path.
        <strong>Apply first</strong> writes only the opening chord; <strong>Apply all</strong>
        writes the full plan.
      </p>
      <ul>
        <li v-for="plan in plans" :key="plan.id">
          <div class="row">
            <div class="meta">
              <strong>{{ stepsLine(plan) }}</strong>
              <span class="sub">
                {{ asciiMusicText(plan.label) }}
                · {{ startCue(plan) }}
              </span>
              <span v-if="plan.conflicts.length" class="warn">{{ plan.conflicts[0] }}</span>
            </div>
            <div class="acts">
              <button
                type="button"
                class="btn"
                title="Open theory lesson for this cadence"
                @click="emit('learn', plan)"
              >
                Learn
              </button>
              <button
                type="button"
                class="btn"
                :class="{ on: previewPlanId === plan.id }"
                :aria-pressed="previewPlanId === plan.id"
                title="Show replace range on the roll and preview TTBB notes"
                @click="emit('preview', plan)"
              >
                {{ previewPlanId === plan.id ? 'Hide' : 'Show' }}
              </button>
              <button
                type="button"
                class="btn"
                :class="{ on: hearingPlanId === plan.id }"
                :aria-pressed="hearingPlanId === plan.id"
                title="Hear this cadence path"
                @click="emit('hear', plan)"
              >
                {{ hearingPlanId === plan.id ? 'Stop' : 'Hear' }}
              </button>
              <button
                type="button"
                class="btn"
                title="Apply only the first chord of this plan to Sketch"
                @click="emit('applyStep', plan, 0)"
              >
                Apply first
              </button>
              <button
                type="button"
                class="btn primary"
                title="Apply the full cadence plan to Sketch"
                @click="emit('applyPlan', plan)"
              >
                Apply all
              </button>
            </div>
          </div>
        </li>
      </ul>
    </div>
  </aside>
</template>

<style scoped>
.cadence-plans {
  display: grid;
  gap: 0.35rem;
  padding: 0.45rem 0.5rem;
  border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--border));
  border-radius: 8px;
  background: color-mix(in srgb, var(--accent) 6%, var(--surface));
}
.collapse-head {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  width: 100%;
  margin: 0;
  padding: 0;
  border: none;
  background: none;
  cursor: pointer;
  font: inherit;
  color: inherit;
  text-align: left;
}
.chev {
  flex-shrink: 0;
  width: 0.85rem;
  color: var(--muted);
  font-size: 0.75rem;
}
.title {
  margin: 0;
  font-size: 0.72rem;
  font-weight: 750;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--muted);
}
.count {
  margin-left: auto;
  font-size: 0.68rem;
  font-weight: 700;
  color: var(--muted);
}
.body {
  display: grid;
  gap: 0.35rem;
}
.hint {
  margin: 0;
  font-size: 0.72rem;
  color: var(--muted);
  line-height: 1.35;
}
ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.35rem;
}
.row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.4rem;
}
.meta {
  display: grid;
  gap: 0.1rem;
  min-width: 0;
}
.meta strong {
  font-size: 0.8rem;
  font-weight: 750;
}
.sub {
  font-size: 0.72rem;
  color: var(--muted);
}
.warn {
  font-size: 0.68rem;
  color: color-mix(in srgb, #b45309 70%, var(--text));
}
.acts {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  flex-shrink: 0;
  justify-content: flex-end;
  max-width: 14rem;
}
.btn {
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  font: inherit;
  font-size: 0.68rem;
  font-weight: 700;
  min-height: 1.45rem;
  padding: 0.1rem 0.35rem;
  cursor: pointer;
}
.btn.on {
  border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
  background: color-mix(in srgb, var(--accent) 16%, var(--surface));
}
.btn.primary {
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
  background: color-mix(in srgb, var(--accent) 12%, var(--surface));
}
</style>
