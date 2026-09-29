<script setup lang="ts">
/**
 * Full-panel Coach Help — how to use the current step’s controls.
 */
import type { CoachHelpSection } from '../../application/arranging/coachIdeasHelp'

defineProps<{
  title: string
  intro: string
  sections: readonly CoachHelpSection[]
}>()

const emit = defineEmits<{
  close: []
}>()
</script>

<template>
  <section class="help-panel" aria-label="Coach help">
    <header class="head">
      <h3>{{ title }}</h3>
      <button type="button" class="close" aria-label="Close" title="Close" @click="emit('close')">
        x
      </button>
    </header>
    <p class="intro">{{ intro }}</p>
    <ol class="sections">
      <li v-for="sec in sections" :key="sec.title">
        <strong>{{ sec.title }}</strong>
        <p>{{ sec.body }}</p>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.help-panel {
  display: grid;
  gap: 0.55rem;
  align-content: start;
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  padding: 0.55rem 0.65rem 0.7rem;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: color-mix(in srgb, var(--accent) 5%, transparent);
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.4rem;
}
h3 {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 750;
}
.close {
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  min-width: 1.7rem;
  min-height: 1.7rem;
  cursor: pointer;
  font: inherit;
  line-height: 1;
}
.intro {
  margin: 0;
  font-size: 0.84rem;
  line-height: 1.4;
  font-weight: 600;
  color: var(--text);
}
.sections {
  margin: 0;
  padding: 0 0 0 1.1rem;
  display: grid;
  gap: 0.55rem;
}
.sections li {
  display: grid;
  gap: 0.15rem;
}
.sections strong {
  font-size: 0.82rem;
  font-weight: 750;
}
.sections p {
  margin: 0;
  font-size: 0.78rem;
  line-height: 1.4;
  color: var(--muted);
}
</style>
