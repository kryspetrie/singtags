<script setup lang="ts">
/**
 * Render Learn / glossary prose as paragraphs, lists, callouts, and epigraphs.
 */
import { computed } from 'vue'
import { asciiMusicText } from '../../lib/arranging/asciiMusicText'
import { parseTeachProse } from '../../lib/arranging/teachProse'

const props = defineProps<{
  text: string
}>()

const blocks = computed(() => parseTeachProse(props.text))
</script>

<template>
  <div v-if="blocks.length" class="teach-prose">
    <template v-for="(b, i) in blocks" :key="i">
      <p v-if="b.type === 'p'">{{ asciiMusicText(b.text) }}</p>
      <ul v-else-if="b.type === 'ul'">
        <li v-for="(item, j) in b.items" :key="j">{{ asciiMusicText(item) }}</li>
      </ul>
      <ol v-else-if="b.type === 'ol'">
        <li v-for="(item, j) in b.items" :key="j">{{ asciiMusicText(item) }}</li>
      </ol>
      <aside v-else-if="b.type === 'callout'" class="callout" role="note">
        {{ asciiMusicText(b.text) }}
      </aside>
      <blockquote v-else-if="b.type === 'epigraph'" class="epigraph">
        <p class="epigraph-text">{{ asciiMusicText(b.text) }}</p>
        <footer v-if="b.cite" class="epigraph-cite">{{ asciiMusicText(b.cite) }}</footer>
      </blockquote>
    </template>
  </div>
</template>

<style scoped>
.teach-prose {
  display: grid;
  gap: 0.45rem;
}
.teach-prose p,
.teach-prose li {
  margin: 0;
  font-size: inherit;
  line-height: 1.5;
  color: inherit;
}
.teach-prose ul,
.teach-prose ol {
  margin: 0;
  padding-left: 1.15rem;
  display: grid;
  gap: 0.28rem;
}
.teach-prose li::marker {
  color: var(--muted);
}
.callout {
  margin: 0;
  padding: 0.4rem 0.55rem;
  border-radius: 7px;
  border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--border));
  background: color-mix(in srgb, var(--accent) 10%, transparent);
  font-size: 0.84em;
  line-height: 1.45;
  font-weight: 600;
}
.epigraph {
  margin: 0;
  padding: 0.35rem 0.55rem 0.4rem 0.7rem;
  border-left: 3px solid color-mix(in srgb, var(--accent) 55%, var(--border));
  background: color-mix(in srgb, var(--muted) 8%, transparent);
  border-radius: 0 7px 7px 0;
}
.epigraph-text {
  margin: 0;
  font-size: 0.88em;
  line-height: 1.45;
  font-style: italic;
  font-weight: 550;
}
.epigraph-cite {
  margin: 0.28rem 0 0;
  font-size: 0.72em;
  font-style: normal;
  font-weight: 650;
  color: var(--muted);
  letter-spacing: 0.01em;
}
.epigraph-cite::before {
  content: '— ';
}
</style>
