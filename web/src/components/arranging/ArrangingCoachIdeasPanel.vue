<script setup lang="ts">
/**
 * Full-panel Coach Ideas — mini theory lessons; Learn replaces the list (Back returns).
 */
import { computed, ref } from 'vue'
import type { CoachIdeaCard } from '../../application/arranging/coachIdeasHelp'
import { asciiMusicText } from '../../lib/arranging/asciiMusicText'
import {
  TEACH_LEARN_BTN_CLASS,
  TEACH_PANEL_CLASS,
  TEACH_PANEL_CLOSE_CLASS,
  TEACH_PANEL_HEAD_CLASS,
} from '../../lib/arranging/teachChrome'
import ArrangingCoachTeachLesson from './ArrangingCoachTeachLesson.vue'
import ArrangingTeachProse from './ArrangingTeachProse.vue'
import ArrangingTeachStrip from './ArrangingTeachStrip.vue'
import './arranging-teach-chrome.css'

const props = defineProps<{
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

const stripIds = computed(() => {
  const ids: string[] = []
  const seen = new Set<string>()
  for (const idea of props.ideas) {
    for (const id of idea.glossaryIds ?? []) {
      if (seen.has(id)) continue
      seen.add(id)
      ids.push(id)
    }
  }
  return ids.slice(0, 8)
})

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
  <section
    :class="TEACH_PANEL_CLASS"
    :aria-label="teaching ? 'Theory lesson' : 'Coach ideas'"
  >
    <header :class="TEACH_PANEL_HEAD_CLASS">
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

    <template v-if="!teaching">
      <ArrangingTeachProse class="intro" :text="intro" />
      <ArrangingTeachStrip
        v-if="stripIds.length"
        :ids="stripIds"
        heading="Key ideas"
      />
      <p class="lesson-label">Mini lessons</p>
      <ul class="cards">
        <li v-for="idea in ideas" :key="idea.title">
          <div class="card-head">
            <strong>{{ asciiMusicText(idea.title) }}</strong>
            <button
              v-if="idea.glossaryIds?.length"
              type="button"
              :class="TEACH_LEARN_BTN_CLASS"
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
.titles {
  display: grid;
  gap: 0.25rem;
  min-width: 0;
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
.card-body {
  font-size: 0.78rem;
  line-height: 1.45;
  color: var(--muted);
}
</style>
