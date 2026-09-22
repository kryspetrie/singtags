<script setup lang="ts">
/**
 * Piano-roll overlay: chord / issue / repair transport while Coach is open.
 */
import { computed } from 'vue'
import {
  coachRollNavState,
  coachRollNavStepMoment,
  coachRollNavStepNextGap,
  coachRollNavStepNextIssue,
  coachRollNavStepNextProblem,
} from '../../lib/arranging/coachRollNav'

const st = coachRollNavState

const visible = computed(() => st.value.active && (st.value.chordMode || st.value.issueMode))

const positionLabel = computed(() => {
  const s = st.value
  if (!s.chordMode || s.momentCount <= 0) return ''
  const n = s.momentIndex >= 0 ? s.momentIndex + 1 : '—'
  return `Chord ${n} / ${s.momentCount}`
})

const problemCount = computed(() => {
  const s = st.value
  return s.unrecognizedCount + s.emptyCount + s.issueCount
})
</script>

<template>
  <div v-if="visible" class="roll-nav" role="toolbar" aria-label="Coach chord navigation">
    <template v-if="st.chordMode">
      <span class="kind">Chords</span>
      <button
        type="button"
        class="nav-btn"
        :disabled="st.momentCount < 2"
        title="Previous chord moment"
        @click="coachRollNavStepMoment(-1)"
      >
        ← Prev chord
      </button>
      <button
        type="button"
        class="nav-btn"
        :disabled="st.momentCount < 2"
        title="Next chord moment"
        @click="coachRollNavStepMoment(1)"
      >
        Next chord →
      </button>
      <button
        type="button"
        class="nav-btn"
        :disabled="st.emptyCount < 1"
        title="Jump to next empty chord moment"
        @click="coachRollNavStepNextGap"
      >
        Next empty
      </button>
      <span class="meta">
        <strong>{{ positionLabel }}</strong>
        <span v-if="st.momentLabel" class="lab">{{ st.momentLabel }}</span>
      </span>
    </template>
    <template v-else-if="st.issueMode && st.repairTour">
      <span class="kind">Repair</span>
      <button
        type="button"
        class="nav-btn"
        :disabled="problemCount < 1"
        title="Next QA issue, unrecognized chord, or empty moment"
        @click="coachRollNavStepNextProblem"
      >
        Next problem →
      </button>
      <button
        type="button"
        class="nav-btn"
        :disabled="st.emptyCount < 1"
        title="Next empty chord moment"
        @click="coachRollNavStepNextGap"
      >
        Empty
      </button>
      <button
        type="button"
        class="nav-btn"
        :disabled="st.issueCount < 1"
        title="Next QA issue"
        @click="coachRollNavStepNextIssue"
      >
        Issue
      </button>
      <span class="meta">
        <strong>{{ problemCount }}</strong>
        problems
        <span v-if="st.unrecognizedCount" class="lab"
          >{{ st.unrecognizedCount }} unrecognized</span
        >
      </span>
    </template>
    <template v-else-if="st.issueMode">
      <span class="kind">Issues</span>
      <button
        type="button"
        class="nav-btn"
        :disabled="st.issueCount < 1"
        title="Jump to next QA issue on the roll"
        @click="coachRollNavStepNextIssue"
      >
        Next issue →
      </button>
      <span class="meta">
        <strong>{{ st.issueCount }}</strong>
        in range
      </span>
    </template>
  </div>
</template>

<style scoped>
.roll-nav {
  position: absolute;
  left: 0.35rem;
  right: 0.35rem;
  bottom: 0.35rem;
  z-index: 6;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.3rem;
  padding: 0.3rem 0.45rem;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: color-mix(in srgb, var(--surface) 92%, transparent);
  backdrop-filter: blur(6px);
  box-shadow: 0 4px 14px color-mix(in srgb, #000 12%, transparent);
  pointer-events: auto;
}
.kind {
  font-size: 0.68rem;
  font-weight: 750;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--muted);
  margin-right: 0.15rem;
}
.nav-btn {
  border: 1px solid var(--border);
  border-radius: 7px;
  background: var(--bg, var(--surface));
  color: var(--text);
  font: inherit;
  font-size: 0.72rem;
  font-weight: 650;
  cursor: pointer;
  min-height: 1.7rem;
  padding: 0.15rem 0.45rem;
}
.nav-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.nav-btn:not(:disabled):hover {
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
}
.meta {
  margin-left: auto;
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.35rem;
  font-size: 0.72rem;
  color: var(--muted);
  font-weight: 550;
  min-width: 0;
}
.meta strong {
  color: var(--text);
  font-weight: 700;
}
.lab {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 14rem;
}
</style>
