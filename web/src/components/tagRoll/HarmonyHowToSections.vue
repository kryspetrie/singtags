<script setup lang="ts">
/**
 * Shared renderer for Tag Studio harmony how-to popover sections.
 */
import type { HarmonyHowToSection } from '../../lib/tagRoll/harmonyHowTo'
import { asciiMusicText } from '../../lib/arranging/asciiMusicText'

defineProps<{
  sections: readonly HarmonyHowToSection[]
}>()
</script>

<template>
  <section v-for="sec in sections" :key="sec.title" class="howto-sec">
    <strong>{{ asciiMusicText(sec.title) }}</strong>
    <p>{{ asciiMusicText(sec.body) }}</p>
    <ol v-if="sec.steps?.length">
      <li v-for="(step, i) in sec.steps" :key="i">{{ asciiMusicText(step) }}</li>
    </ol>
  </section>
</template>

<style scoped>
.howto-sec + .howto-sec {
  margin-top: 0.55rem;
  padding-top: 0.5rem;
  border-top: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
}
.howto-sec strong {
  display: block;
  font-size: 0.82rem;
  font-weight: 750;
  margin-bottom: 0.15rem;
}
.howto-sec p {
  margin: 0;
  font-size: 0.78rem;
  line-height: 1.4;
  color: var(--muted);
}
.howto-sec ol {
  margin: 0.35rem 0 0;
  padding-left: 1.1rem;
  display: grid;
  gap: 0.22rem;
  font-size: 0.76rem;
  line-height: 1.4;
  color: var(--text);
}
</style>
