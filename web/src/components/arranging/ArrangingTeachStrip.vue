<script setup lang="ts">
/**
 * Key-ideas glossary — inline strip or full replaceable panel.
 */
import { computed } from 'vue'
import { glossaryEntries } from '../../lib/arranging/glossaryTooltip'

const props = withDefaults(
  defineProps<{
    ids: readonly string[]
    heading?: string
    /** Full-panel mode with close (replaces coach workspace). */
    panel?: boolean
  }>(),
  { panel: false },
)

const emit = defineEmits<{
  close: []
}>()

const entries = computed(() => glossaryEntries(props.ids))
const summaryLabel = computed(() => props.heading || 'Key ideas')
</script>

<template>
  <section
    v-if="entries.length || panel"
    class="teach"
    :class="{ panel }"
    aria-label="Glossary"
  >
    <header v-if="panel" class="panel-head">
      <h3 class="head">{{ summaryLabel }}</h3>
      <button type="button" class="close" aria-label="Close" title="Close" @click="emit('close')">
        ×
      </button>
    </header>
    <h3 v-else class="head">{{ summaryLabel }}</h3>
    <p v-if="!entries.length" class="empty">No key ideas for this step.</p>
    <dl v-else>
      <div v-for="g in entries" :key="g.id" class="row">
        <dt :title="g.citations.map((c) => c.label).join(' · ')">{{ g.term }}</dt>
        <dd>{{ g.short }}</dd>
      </div>
    </dl>
  </section>
</template>

<style scoped>
.teach {
  display: grid;
  gap: 0.35rem;
  padding: 0.35rem 0.55rem 0.45rem;
  border: 1px dashed color-mix(in srgb, var(--accent) 35%, var(--border));
  border-radius: 9px;
  background: color-mix(in srgb, var(--accent) 6%, transparent);
  align-content: start;
}
.teach.panel {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  border-style: solid;
  padding: 0.55rem 0.65rem 0.7rem;
}
.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.4rem;
}
.head {
  margin: 0;
  font-size: 0.78rem;
  font-weight: 750;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--muted);
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
}
.empty {
  margin: 0;
  font-size: 0.78rem;
  color: var(--muted);
}
dl {
  margin: 0.15rem 0 0;
  display: grid;
  gap: 0.45rem;
}
.row {
  display: grid;
  gap: 0.1rem;
}
dt {
  margin: 0;
  font-size: 0.82rem;
  font-weight: 750;
  color: var(--text);
}
dd {
  margin: 0;
  font-size: 0.78rem;
  line-height: 1.4;
  color: var(--muted);
}
</style>
