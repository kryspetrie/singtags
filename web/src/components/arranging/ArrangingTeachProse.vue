<script setup lang="ts">
/**
 * Render Learn / glossary prose as paragraphs and lists.
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
      <ol v-else>
        <li v-for="(item, j) in b.items" :key="j">{{ asciiMusicText(item) }}</li>
      </ol>
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
</style>
