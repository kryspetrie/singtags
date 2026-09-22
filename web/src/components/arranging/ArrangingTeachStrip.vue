<script setup lang="ts">
/**
 * Inline curriculum glossary — collapsible so veterans can tuck it away.
 */
import { computed, ref, watch } from 'vue'
import { glossaryEntries } from '../../lib/arranging/glossaryTooltip'
import {
  loadTeachStripCollapsed,
  saveTeachStripCollapsed,
} from '../../lib/arranging/teachStripPrefs'

const props = defineProps<{
  ids: readonly string[]
  /** Optional heading in the summary row. */
  heading?: string
}>()

const entries = computed(() => glossaryEntries(props.ids))
const open = ref(!loadTeachStripCollapsed(false))

watch(open, (isOpen) => {
  saveTeachStripCollapsed(!isOpen)
})

const summaryLabel = computed(() => props.heading || 'Key ideas')
const summaryMeta = computed(() => {
  const n = entries.value.length
  if (!n) return ''
  return n === 1 ? '1 term' : `${n} terms`
})
</script>

<template>
  <details
    v-if="entries.length"
    class="teach"
    :open="open"
    aria-label="Glossary"
    @toggle="open = ($event.target as HTMLDetailsElement).open"
  >
    <summary class="sum">
      <span class="head">{{ summaryLabel }}</span>
      <span class="meta">{{ summaryMeta }}</span>
      <span class="chev" aria-hidden="true">{{ open ? '▾' : '▸' }}</span>
    </summary>
    <dl>
      <div v-for="g in entries" :key="g.id" class="row">
        <dt :title="g.citations.map((c) => c.label).join(' · ')">{{ g.term }}</dt>
        <dd>{{ g.short }}</dd>
      </div>
    </dl>
  </details>
</template>

<style scoped>
.teach {
  display: grid;
  gap: 0.35rem;
  padding: 0.35rem 0.55rem 0.45rem;
  border: 1px dashed color-mix(in srgb, var(--accent) 35%, var(--border));
  border-radius: 9px;
  background: color-mix(in srgb, var(--accent) 6%, transparent);
}
.sum {
  display: flex;
  align-items: baseline;
  gap: 0.4rem;
  cursor: pointer;
  list-style: none;
  user-select: none;
  min-height: 1.4rem;
}
.sum::-webkit-details-marker {
  display: none;
}
.head {
  margin: 0;
  font-size: 0.68rem;
  font-weight: 750;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--muted);
}
.meta {
  font-size: 0.68rem;
  font-weight: 600;
  color: var(--muted);
  opacity: 0.85;
}
.chev {
  margin-left: auto;
  font-size: 0.72rem;
  color: var(--muted);
}
dl {
  margin: 0.15rem 0 0;
  display: grid;
  gap: 0.35rem;
}
.row {
  display: grid;
  gap: 0.1rem;
}
dt {
  margin: 0;
  font-size: 0.78rem;
  font-weight: 750;
  color: var(--text);
}
dd {
  margin: 0;
  font-size: 0.75rem;
  line-height: 1.35;
  color: var(--muted);
}
</style>
