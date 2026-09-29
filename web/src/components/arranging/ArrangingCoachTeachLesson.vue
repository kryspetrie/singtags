<script setup lang="ts">
/**
 * Deep Learn lesson — glossary detail, chord makeup, sheet SVG, Hear.
 * Titles / captions stay in HTML; SVG is staves + notes only.
 */
import { computed, onUnmounted, ref, watch } from 'vue'
import {
  buildTeachLesson,
  type TeachExampleView,
  type TeachLessonView,
} from '../../application/arranging/coachTeachLesson'
import { getArrangingServices } from '../../composition/arranging'
import { asciiMusicText } from '../../lib/arranging/asciiMusicText'
import type { AudioPreview } from '../../ports/AudioPreview'
import ArrangingTeachProse from './ArrangingTeachProse.vue'

const props = defineProps<{
  title: string
  glossaryIds: readonly string[]
  intro?: string
  /** When embedded (e.g. lint detail), hide the Back control. */
  hideBack?: boolean
}>()

const emit = defineEmits<{
  back: []
}>()

const lesson = ref<TeachLessonView | null>(null)
const hearingId = ref<string | null>(null)
const openTopics = ref<Record<string, boolean>>({})
const openExamples = ref<Record<string, boolean>>({})
let audio: AudioPreview | null = null
let hearToken = 0

function rebuild(): void {
  const services = getArrangingServices()
  lesson.value = buildTeachLesson({
    title: props.title,
    glossaryIds: props.glossaryIds,
    intro: props.intro,
    renderer: services.notationRenderer,
  })
  const topics: Record<string, boolean> = {}
  for (const t of lesson.value.topics) topics[t.id] = true
  openTopics.value = topics
  const examples: Record<string, boolean> = {}
  for (const ex of lesson.value.examples) examples[ex.id] = true
  openExamples.value = examples
}

watch(
  () => [props.title, props.intro, props.glossaryIds.join('|')] as const,
  () => rebuild(),
  { immediate: true },
)

onUnmounted(() => {
  hearToken += 1
  audio?.dispose()
  audio = null
})

function ensureAudio(): AudioPreview {
  if (!audio) audio = getArrangingServices().createAudioPreview()
  return audio
}

async function hearExample(ex: TeachExampleView): Promise<void> {
  const token = ++hearToken
  hearingId.value = ex.id
  const preview = ensureAudio()
  try {
    for (const ch of ex.chords) {
      if (token !== hearToken) return
      await preview.playStack({ midi: ch.midi }, 650)
      if (token !== hearToken) return
      await new Promise((r) => window.setTimeout(r, 720))
    }
  } finally {
    if (token === hearToken) hearingId.value = null
  }
}

async function hearChord(exId: string, chordIndex: number, midi: TeachExampleView['chords'][number]['midi']): Promise<void> {
  const id = `${exId}:${chordIndex}`
  const token = ++hearToken
  hearingId.value = id
  const preview = ensureAudio()
  try {
    await preview.playStack({ midi }, 900)
  } finally {
    if (token === hearToken) hearingId.value = null
  }
}

function stopHear(): void {
  hearToken += 1
  hearingId.value = null
  audio?.dispose()
  audio = null
}

function toggleTopic(id: string): void {
  openTopics.value = { ...openTopics.value, [id]: !openTopics.value[id] }
}

function toggleExample(id: string): void {
  openExamples.value = { ...openExamples.value, [id]: !openExamples.value[id] }
}

const topics = computed(() => lesson.value?.topics ?? [])
const examples = computed(() => lesson.value?.examples ?? [])
</script>

<template>
  <div class="teach-lesson" aria-label="Theory lesson">
    <header class="top">
      <button
        v-if="!hideBack"
        type="button"
        class="back"
        @click="emit('back')"
      >
        ← Back
      </button>
      <p class="kicker">Theory lesson</p>
    </header>

    <ArrangingTeachProse
      v-if="intro || lesson?.intro"
      class="intro"
      :text="intro || lesson?.intro || ''"
    />
    <p class="key-hint">{{ lesson?.keyHint }}</p>

    <p v-if="!topics.length" class="empty">No teaching note for this topic yet.</p>

    <section v-for="t in topics" :key="t.id" class="topic">
      <button
        type="button"
        class="collapse-head"
        :aria-expanded="openTopics[t.id] !== false"
        @click="toggleTopic(t.id)"
      >
        <span class="chev" aria-hidden="true">{{ openTopics[t.id] !== false ? '▾' : '▸' }}</span>
        <h4>{{ asciiMusicText(t.term) }}</h4>
      </button>
      <div v-show="openTopics[t.id] !== false" class="collapse-body">
        <ArrangingTeachProse class="detail" :text="t.detail" />
        <div v-if="t.makeup" class="makeup">
          <span class="lbl">Makeup</span>
          <ArrangingTeachProse :text="t.makeup" />
        </div>
        <figure v-for="(img, ii) in t.images" :key="`${t.id}-img-${ii}`" class="teach-fig">
          <img :src="img.src" :alt="img.alt" loading="lazy" decoding="async" />
          <figcaption v-if="img.caption">{{ asciiMusicText(img.caption) }}</figcaption>
        </figure>
        <p v-if="t.citations.length" class="cite">{{ t.citations.join(' · ') }}</p>
      </div>
    </section>

    <template v-if="examples.length">
      <div class="examples-head">
        <p class="examples-label">Examples</p>
        <p class="examples-key">Key of C major · TTBB</p>
      </div>
      <article v-for="ex in examples" :key="ex.id" class="example">
        <header class="ex-head">
          <button
            type="button"
            class="collapse-head ex-title"
            :aria-expanded="openExamples[ex.id] !== false"
            @click="toggleExample(ex.id)"
          >
            <span class="chev" aria-hidden="true">{{
              openExamples[ex.id] !== false ? '▾' : '▸'
            }}</span>
            <div class="ex-title-copy">
              <strong>{{ asciiMusicText(ex.title) }}</strong>
              <ArrangingTeachProse class="caption" :text="ex.caption" />
            </div>
          </button>
          <button
            type="button"
            class="hear"
            :aria-pressed="hearingId === ex.id"
            :title="hearingId === ex.id ? 'Stop' : 'Hear this example'"
            @click.stop="hearingId === ex.id ? stopHear() : hearExample(ex)"
          >
            {{ hearingId === ex.id ? 'Stop' : 'Hear' }}
          </button>
        </header>
        <div v-show="openExamples[ex.id] !== false" class="collapse-body ex-body">
          <div
            v-if="ex.svg"
            class="staff"
            aria-label="Notation example"
            v-html="ex.svg"
          />
          <p class="staff-legend" aria-hidden="true">Treble-8: Tenor · Lead — Bass: Bari · Bass</p>
          <ul class="chord-list">
            <li v-for="(ch, i) in ex.chords" :key="`${ex.id}-${i}`">
              <div class="chord-row">
                <div class="chord-meta">
                  <strong>{{ asciiMusicText(ch.label) }}</strong>
                  <span class="voices">{{ asciiMusicText(ch.makeup) }}</span>
                  <em v-if="ch.annotation">{{ asciiMusicText(ch.annotation) }}</em>
                </div>
                <button
                  type="button"
                  class="hear hear-sm"
                  :aria-pressed="hearingId === `${ex.id}:${i}`"
                  :title="hearingId === `${ex.id}:${i}` ? 'Stop' : `Hear ${ch.label}`"
                  @click.stop="
                    hearingId === `${ex.id}:${i}` ? stopHear() : hearChord(ex.id, i, ch.midi)
                  "
                >
                  {{ hearingId === `${ex.id}:${i}` ? 'Stop' : 'Hear' }}
                </button>
              </div>
            </li>
          </ul>
          <p class="cite">{{ ex.cite }}</p>
        </div>
      </article>
    </template>
  </div>
</template>

<style scoped>
.teach-lesson {
  display: grid;
  gap: 0.65rem;
  align-content: start;
}
.top {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.45rem 0.75rem;
}
.back {
  border: none;
  background: none;
  padding: 0;
  color: var(--accent, #0f6b5c);
  font: inherit;
  font-size: 0.8rem;
  font-weight: 750;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.kicker {
  margin: 0;
  font-size: 0.68rem;
  font-weight: 750;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--muted);
}
.examples-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.35rem 0.75rem;
  margin-top: 0.15rem;
}
.examples-label,
.examples-key {
  margin: 0;
  font-size: 0.68rem;
  font-weight: 750;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--muted);
}
.examples-key {
  font-weight: 650;
  text-transform: none;
  letter-spacing: 0.01em;
}
.intro {
  font-size: 0.84rem;
  line-height: 1.5;
  font-weight: 600;
  color: var(--text);
}
.intro :deep(p),
.intro :deep(li) {
  font-size: inherit;
  font-weight: inherit;
  color: inherit;
}
.key-hint,
.empty {
  margin: 0;
  font-size: 0.75rem;
  color: var(--muted);
}
.topic,
.example {
  display: grid;
  gap: 0.4rem;
  padding: 0.55rem 0.6rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
}
.collapse-head {
  display: flex;
  align-items: flex-start;
  gap: 0.35rem;
  width: 100%;
  margin: 0;
  padding: 0;
  border: none;
  background: none;
  text-align: left;
  cursor: pointer;
  font: inherit;
  color: inherit;
}
.collapse-head h4,
.collapse-head strong {
  margin: 0;
  font-size: 0.9rem;
  font-weight: 750;
}
.ex-title-copy {
  display: grid;
  gap: 0.25rem;
  min-width: 0;
}
.chev {
  flex-shrink: 0;
  width: 0.85rem;
  color: var(--muted);
  font-size: 0.75rem;
  line-height: 1.4;
}
.collapse-body {
  display: grid;
  gap: 0.45rem;
  padding-left: 1.15rem;
}
.ex-body {
  gap: 0.5rem;
}
.detail {
  font-size: 0.8rem;
  color: color-mix(in srgb, var(--muted) 35%, var(--text));
}
.makeup {
  display: grid;
  gap: 0.25rem;
  padding: 0.4rem 0.5rem;
  border-radius: 6px;
  border: 1px solid color-mix(in srgb, var(--accent) 22%, var(--border));
  background: color-mix(in srgb, var(--accent) 7%, var(--surface));
  font-size: 0.76rem;
  line-height: 1.45;
  color: var(--text);
}
.makeup .lbl {
  font-weight: 750;
  color: var(--muted);
  text-transform: uppercase;
  font-size: 0.62rem;
  letter-spacing: 0.04em;
}
.teach-fig {
  margin: 0.1rem 0 0;
  padding: 0;
  display: grid;
  gap: 0.25rem;
}
.teach-fig img {
  display: block;
  width: 100%;
  max-width: 28rem;
  height: auto;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: #fff;
}
.teach-fig figcaption {
  margin: 0;
  font-size: 0.7rem;
  line-height: 1.35;
  color: var(--muted);
}
.cite {
  margin: 0;
  font-size: 0.68rem;
  color: color-mix(in srgb, var(--muted) 85%, var(--text));
}
.ex-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.45rem;
}
.ex-title {
  min-width: 0;
  flex: 1 1 auto;
}
.caption {
  font-size: 0.76rem;
  color: var(--muted);
}
.hear {
  flex-shrink: 0;
  border: 1px solid color-mix(in srgb, var(--accent) 45%, var(--border));
  border-radius: 6px;
  background: color-mix(in srgb, var(--accent) 12%, var(--surface));
  color: var(--text);
  font: inherit;
  font-size: 0.72rem;
  font-weight: 750;
  cursor: pointer;
  padding: 0.2rem 0.55rem;
  min-height: 1.6rem;
}
.staff {
  overflow-x: auto;
  max-width: 100%;
  line-height: 0;
  position: relative;
  contain: layout paint;
  padding: 0.35rem 0.4rem;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: #fbfaf7;
}
.staff :deep(svg) {
  display: block;
  max-width: 100%;
  width: 100%;
  height: auto;
  position: static !important;
}
.staff-legend {
  margin: 0;
  font-size: 0.68rem;
  color: var(--muted);
  letter-spacing: 0.01em;
}
.chord-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.35rem;
}
.chord-list li {
  padding: 0.4rem 0.45rem;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: color-mix(in srgb, var(--surface) 88%, var(--bg));
  font-size: 0.74rem;
  line-height: 1.4;
  color: var(--muted);
}
.chord-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.45rem;
}
.chord-meta {
  display: grid;
  gap: 0.12rem;
  min-width: 0;
  flex: 1 1 auto;
}
.voices {
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.01em;
}
.hear-sm {
  font-size: 0.68rem;
  padding: 0.12rem 0.45rem;
  min-height: 1.4rem;
}
.chord-list strong {
  color: var(--text);
  font-weight: 750;
  font-size: 0.8rem;
}
.chord-list em {
  font-style: italic;
  font-size: 0.7rem;
  color: color-mix(in srgb, var(--muted) 80%, var(--text));
}
</style>
