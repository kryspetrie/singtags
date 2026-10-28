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
import ArrangingLearnChoices from './ArrangingLearnChoices.vue'
import ArrangingTeachProse from './ArrangingTeachProse.vue'
import ArrangingTeachStrip from './ArrangingTeachStrip.vue'
import './arranging-teach-chrome.css'

const props = withDefaults(
  defineProps<{
    title: string
    intro: string
    ideas: readonly CoachIdeaCard[]
    /** Drawer already supplies the title and close control. */
    embedded?: boolean
  }>(),
  { embedded: false },
)

const emit = defineEmits<{
  close: []
  learn: [lesson: { title: string; glossaryIds: readonly string[]; intro?: string }]
}>()

const teachIds = ref<string[] | null>(null)
const teachTitle = ref('')
const teachIntro = ref('')
const teaching = computed(() => teachIds.value != null)
const ideaIndex = ref(0)
const currentIdea = computed(() => {
  if (!props.ideas.length) return null
  return props.ideas[Math.min(ideaIndex.value, props.ideas.length - 1)] ?? null
})

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
  const lesson = { title: idea.title, glossaryIds: [...ids], intro: idea.body }
  emit('learn', lesson)
  if (props.embedded) return
  teachIds.value = lesson.glossaryIds
  teachTitle.value = lesson.title
  teachIntro.value = lesson.intro
}

const lessonOptions = computed(() =>
  props.ideas.map((item, i) => ({ id: `${i}:${item.title}`, label: asciiMusicText(item.title) })),
)

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
    <header v-if="!embedded || teaching" :class="TEACH_PANEL_HEAD_CLASS">
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
        v-if="!embedded"
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
      <ArrangingLearnChoices
        label="Mini lessons"
        :options="lessonOptions"
        :selected="Math.min(ideaIndex, Math.max(0, ideas.length - 1))"
        @pick="ideaIndex = $event"
      />
      <article v-if="currentIdea" class="card">
        <div class="card-head">
          <strong>{{ asciiMusicText(currentIdea.title) }}</strong>
          <button
            v-if="currentIdea.glossaryIds?.length"
            type="button"
            :class="TEACH_LEARN_BTN_CLASS"
            title="Open this lesson"
            @click="openLearn(currentIdea)"
          >
            Learn
          </button>
        </div>
        <ArrangingTeachProse class="card-body" :text="currentIdea.body" />
      </article>
    </template>

    <ArrangingCoachTeachLesson
      v-else-if="teachIds"
      :title="teachTitle"
      :glossary-ids="teachIds"
      :intro="teachIntro"
      hide-back
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
.card {
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
.card strong {
  font-size: 0.84rem;
  font-weight: 750;
}
.card-body {
  font-size: 0.78rem;
  line-height: 1.45;
  color: var(--muted);
}
</style>
