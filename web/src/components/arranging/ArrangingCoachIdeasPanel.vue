<script setup lang="ts">
/**
 * Full-panel Coach Ideas — mini theory lessons; Learn replaces the list (Back returns).
 */
import { computed, ref } from 'vue'
import type { CoachIdeaCard } from '../../application/arranging/coachIdeasHelp'
import { asciiMusicText } from '../../lib/arranging/asciiMusicText'
import ArrangingCoachTeachLesson from './ArrangingCoachTeachLesson.vue'
import ArrangingTeachProse from './ArrangingTeachProse.vue'

defineProps<{
  title: string
  intro: string
  ideas: readonly CoachIdeaCard[]
}>()

const emit = defineEmits<{
  close: []
}>()

const teachIds = ref<string[] | null>(null)
const teachTitle = ref('')
const teachIntro = ref('')
const teaching = computed(() => teachIds.value != null)

function openLearn(idea: CoachIdeaCard): void {
  const ids = idea.glossaryIds
  if (!ids?.length) return
  teachIds.value = [...ids]
  teachTitle.value = idea.title
  teachIntro.value = idea.body
}

function backToIdeas(): void {
  teachIds.value = null
  teachTitle.value = ''
  teachIntro.value = ''
}
</script>

<template>
  <section class="ideas-panel" :aria-label="teaching ? 'Theory lesson' : 'Coach ideas'">
    <header class="head">
      <div class="titles">
        <button
          v-if="teaching"
          type="button"
          class="back"
          title="Back to Ideas"
          @click="backToIdeas"
        >
          ← Back
        </button>
        <h3>{{ teaching ? asciiMusicText(teachTitle) : title }}</h3>
      </div>
      <button type="button" class="close" aria-label="Close" title="Close" @click="emit('close')">
        ×
      </button>
    </header>

    <template v-if="!teaching">
      <ArrangingTeachProse class="intro" :text="intro" />
      <p class="lesson-label">Mini lessons</p>
      <ul class="cards">
        <li v-for="idea in ideas" :key="idea.title">
          <div class="card-head">
            <strong>{{ asciiMusicText(idea.title) }}</strong>
            <button
              v-if="idea.glossaryIds?.length"
              type="button"
              class="learn"
              title="Open full theory lesson with examples"
              @click="openLearn(idea)"
            >
              Learn
            </button>
          </div>
          <ArrangingTeachProse class="card-body" :text="idea.body" />
        </li>
      </ul>
    </template>

    <ArrangingCoachTeachLesson
      v-else-if="teachIds"
      :title="teachTitle"
      :glossary-ids="teachIds"
      :intro="teachIntro"
      @back="backToIdeas"
    />
  </section>
</template>

<style scoped>
.ideas-panel {
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
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.4rem;
}
.titles {
  display: grid;
  gap: 0.25rem;
  min-width: 0;
}
h3 {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 750;
}
.back {
  justify-self: start;
  border: none;
  background: none;
  padding: 0;
  color: var(--accent, #0f6b5c);
  font: inherit;
  font-size: 0.75rem;
  font-weight: 700;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
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
  flex-shrink: 0;
}
.intro {
  font-size: 0.84rem;
  line-height: 1.45;
  font-weight: 600;
  color: var(--text);
}
.lesson-label {
  margin: 0;
  font-size: 0.68rem;
  font-weight: 750;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--muted);
}
.cards {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.5rem;
}
.cards li {
  display: grid;
  gap: 0.3rem;
  padding: 0.5rem 0.55rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
}
.card-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.4rem;
}
.cards strong {
  font-size: 0.84rem;
  font-weight: 750;
}
.learn {
  flex-shrink: 0;
  border: 1px solid color-mix(in srgb, var(--accent) 45%, var(--border));
  border-radius: 6px;
  background: color-mix(in srgb, var(--accent) 10%, var(--surface));
  color: var(--text);
  font: inherit;
  font-size: 0.68rem;
  font-weight: 700;
  cursor: pointer;
  padding: 0.12rem 0.4rem;
  min-height: 1.4rem;
}
.card-body {
  font-size: 0.78rem;
  line-height: 1.45;
  color: var(--muted);
}
</style>
