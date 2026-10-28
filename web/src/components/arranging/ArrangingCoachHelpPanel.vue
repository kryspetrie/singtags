<script setup lang="ts">
/**
 * Full-panel Coach Help — how to use the current step’s controls.
 */
import { computed, ref } from 'vue'
import type { CoachHelpSection } from '../../application/arranging/coachIdeasHelp'
import {
  TEACH_PANEL_CLASS,
  TEACH_PANEL_CLOSE_CLASS,
  TEACH_PANEL_HEAD_CLASS,
} from '../../lib/arranging/teachChrome'
import ArrangingLearnChoices from './ArrangingLearnChoices.vue'
import './arranging-teach-chrome.css'

const props = withDefaults(
  defineProps<{
    title: string
    intro: string
    sections: readonly CoachHelpSection[]
    /** Drawer already supplies the title and close control. */
    embedded?: boolean
  }>(),
  { embedded: false },
)

const emit = defineEmits<{
  close: []
}>()

const sectionIndex = ref(0)
const section = computed(() => {
  if (!props.sections.length) return null
  return props.sections[Math.min(sectionIndex.value, props.sections.length - 1)] ?? null
})
const topicOptions = computed(() =>
  props.sections.map((sec, i) => ({ id: `${i}:${sec.title}`, label: sec.title })),
)
</script>

<template>
  <section :class="TEACH_PANEL_CLASS" aria-label="Coach help">
    <header v-if="!embedded" :class="TEACH_PANEL_HEAD_CLASS" class="help-head">
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
    <ArrangingLearnChoices
      label="Topic"
      :options="topicOptions"
      :selected="Math.min(sectionIndex, Math.max(0, sections.length - 1))"
      @pick="sectionIndex = $event"
    />
    <article v-if="section" class="topic">
      <h4>{{ section.title }}</h4>
      <p>{{ section.body }}</p>
    </article>
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
.topic {
  display: grid;
  gap: 0.35rem;
}
.topic h4 {
  margin: 0;
  font-size: 0.9rem;
  font-weight: 750;
}
.topic p {
  margin: 0;
  font-size: 0.8rem;
  line-height: 1.45;
  color: var(--text);
}
</style>
