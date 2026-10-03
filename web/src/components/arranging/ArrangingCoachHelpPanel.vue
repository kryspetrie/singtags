<script setup lang="ts">
/**
 * Full-panel Coach Help — how to use the current step’s controls.
 */
import type { CoachHelpSection } from '../../application/arranging/coachIdeasHelp'
import {
  TEACH_PANEL_CLASS,
  TEACH_PANEL_CLOSE_CLASS,
  TEACH_PANEL_HEAD_CLASS,
} from '../../lib/arranging/teachChrome'
import './arranging-teach-chrome.css'

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
  <section :class="TEACH_PANEL_CLASS" aria-label="Coach help">
    <header :class="TEACH_PANEL_HEAD_CLASS" class="help-head">
      <h3>{{ title }}</h3>
      <button
        type="button"
        :class="TEACH_PANEL_CLOSE_CLASS"
        aria-label="Close"
        title="Close"
        @click="emit('close')"
      >
        ×
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
.help-head {
  align-items: center;
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
