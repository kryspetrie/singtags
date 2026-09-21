<script setup lang="ts">
/**
 * Grouped issue board for Coach Check.
 */
import type { ArrangementLint } from '../../domain/arranging/qa/types'
import type { IssueGroup } from '../../application/arranging/IssueBoard'

defineProps<{
  groups: IssueGroup[]
  canFix: (lint: ArrangementLint) => boolean
  /** Pipe row label: `| measure:beat | message |` */
  rowLabel: (lint: ArrangementLint) => string
}>()

const emit = defineEmits<{
  jump: [lint: ArrangementLint]
  fix: [lint: ArrangementLint]
  learn: [lint: ArrangementLint]
}>()
</script>

<template>
  <div v-if="groups.length" class="board">
    <section v-for="g in groups" :key="g.id" class="group" :data-group="g.id">
      <h3 class="title">
        {{ g.title }}
        <span class="count">{{ g.items.length }}</span>
      </h3>
      <ul>
        <li v-for="lint in g.items" :key="lint.id" :class="lint.severity">
          <button type="button" class="jump" @click="emit('jump', lint)">
            {{ rowLabel(lint) }}
          </button>
          <div class="acts">
            <button
              v-if="canFix(lint)"
              type="button"
              class="btn"
              @click="emit('fix', lint)"
            >
              Fix
            </button>
            <button
              v-else
              type="button"
              class="btn"
              title="Open teaching note for this issue"
              @click="emit('learn', lint)"
            >
              {{ lint.teachingId ? 'Learn' : 'Needs your ear' }}
            </button>
          </div>
        </li>
      </ul>
    </section>
  </div>
  <p v-else class="muted">No issues in this selection.</p>
</template>

<style scoped>
.board {
  display: grid;
  gap: 0.55rem;
}
.group {
  display: grid;
  gap: 0.3rem;
}
.title {
  margin: 0;
  font-size: 0.82rem;
  font-weight: 700;
}
.count {
  margin-left: 0.25rem;
  font-size: 0.72rem;
  color: var(--muted);
  font-weight: 600;
}
ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.3rem;
}
li {
  display: flex;
  gap: 0.35rem;
  align-items: flex-start;
  padding: 0.3rem 0.35rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 0.78rem;
}
li.error {
  border-color: color-mix(in srgb, #c0392b 45%, var(--border));
}
li.warn {
  border-color: color-mix(in srgb, #c47a12 40%, var(--border));
}
.jump {
  flex: 1;
  border: 0;
  background: transparent;
  text-align: left;
  font: inherit;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  cursor: pointer;
  color: var(--text);
  padding: 0;
  white-space: pre-wrap;
}
.jump:hover {
  text-decoration: underline;
}
.acts {
  display: flex;
  gap: 0.25rem;
}
.btn {
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  font: inherit;
  font-size: 0.72rem;
  font-weight: 650;
  cursor: pointer;
  min-height: 1.55rem;
  padding: 0.15rem 0.4rem;
}
.muted {
  margin: 0;
  font-size: 0.78rem;
  color: var(--muted);
}
</style>
