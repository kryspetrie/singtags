<script setup lang="ts">
/**
 * Post-run summary for Fill parts — filled / locked / skipped with seek.
 */
import { computed } from 'vue'
import type { CompleteFromPartsItem } from '../../lib/tagRoll/completeFromParts'
import { skipReasonLabel } from '../../lib/tagRoll/completeFromParts'
import { formatMeasureBeat } from '../../lib/tagRoll/measureBeat'
import type { TagRollTimeSignature } from '../../lib/tagRoll/types'

const props = defineProps<{
  items: readonly CompleteFromPartsItem[]
  filled: number
  locked: number
  skipped: number
  timeSignature: TagRollTimeSignature
  ppq: number
}>()

const emit = defineEmits<{
  dismiss: []
  seek: [startTick: number, endTick: number]
}>()

const summary = computed(
  () => `Filled ${props.filled} · Locked ${props.locked} · Skipped ${props.skipped}`,
)

function measureLabel(tick: number): string {
  return formatMeasureBeat(tick, props.timeSignature, props.ppq)
}

function rowLabel(item: CompleteFromPartsItem): string {
  if (item.kind === 'filled') {
    const parts =
      item.filledParts.length > 0 ? ` (+${item.filledParts.join(', ')})` : ''
    return `${item.label}${parts}`
  }
  if (item.kind === 'locked') return item.label
  return skipReasonLabel(item.reason)
}

function kindLabel(kind: CompleteFromPartsItem['kind']): string {
  if (kind === 'filled') return 'Filled'
  if (kind === 'locked') return 'Locked'
  return 'Skipped'
}
</script>

<template>
  <aside class="results" role="status" aria-live="polite">
    <header class="head">
      <strong class="title">Fill parts</strong>
      <span class="sum">{{ summary }}</span>
      <button type="button" class="dismiss" title="Dismiss results" @click="emit('dismiss')">
        ✕
      </button>
    </header>
    <ul v-if="items.length" class="list">
      <li v-for="(item, i) in items" :key="`${item.startTick}-${i}`">
        <button
          type="button"
          class="row"
          :class="item.kind"
          :title="`Seek to ${measureLabel(item.startTick)}`"
          @click="emit('seek', item.startTick, item.endTick)"
        >
          <span class="m">{{ measureLabel(item.startTick) }}</span>
          <span class="kind">{{ kindLabel(item.kind) }}</span>
          <span class="lab">{{ rowLabel(item) }}</span>
        </button>
      </li>
    </ul>
  </aside>
</template>

<style scoped>
.results {
  margin: 0.35rem 0.5rem 0.5rem;
  padding: 0.4rem 0.55rem;
  border: 1px solid color-mix(in srgb, var(--muted, #888) 35%, transparent);
  border-radius: 6px;
  background: color-mix(in srgb, var(--surface, #f5f5f5) 92%, var(--text, #222));
  max-height: 9rem;
  overflow: auto;
  font-size: 0.78rem;
}
.head {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  margin-bottom: 0.25rem;
}
.title {
  font-weight: 650;
}
.sum {
  color: var(--muted, #666);
  flex: 1;
}
.dismiss {
  border: none;
  background: transparent;
  cursor: pointer;
  padding: 0.1rem 0.35rem;
  color: var(--muted, #666);
  line-height: 1;
}
.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}
.row {
  display: flex;
  gap: 0.45rem;
  width: 100%;
  text-align: left;
  border: none;
  background: transparent;
  cursor: pointer;
  padding: 0.2rem 0.15rem;
  border-radius: 4px;
  color: inherit;
  font: inherit;
}
.row:hover {
  background: color-mix(in srgb, var(--text, #222) 8%, transparent);
}
.m {
  min-width: 2.4rem;
  color: var(--muted, #666);
  font-variant-numeric: tabular-nums;
}
.kind {
  min-width: 3.6rem;
  font-weight: 600;
  color: var(--muted, #666);
}
.row.filled .kind {
  color: color-mix(in srgb, #2a7a4b 80%, var(--text, #222));
}
.row.locked .kind {
  color: color-mix(in srgb, #2a5f8f 85%, var(--text, #222));
}
.row.skipped .kind {
  color: color-mix(in srgb, #a65c1a 85%, var(--text, #222));
}
.lab {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
