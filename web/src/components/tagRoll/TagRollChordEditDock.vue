<script setup lang="ts">
/**
 * Right-hand dock for Sketch / Detected chord picking (Coach-column companion).
 * Hosts TagRollChordEditPopover; empty/dimmed when nothing is selected.
 */
import { computed } from 'vue'
import type { ChordAnalysisMode, ChordAnalysisSegment } from '../../domain/arranging/chordAnalysisBar'
import type { ChordRankHint } from '../../lib/tagRoll/harmonizer/chordPickOptions'
import { tagRollTip } from '../../lib/tagRoll/shortcuts'
import type { TagRollProject } from '../../lib/tagRoll/types'
import TagRollChordEditPopover, {
  type ChordEditDraft,
} from './TagRollChordEditPopover.vue'

const props = defineProps<{
  variant: 'declared' | 'detected'
  seg: ChordAnalysisSegment | null
  mode: ChordAnalysisMode
  project: TagRollProject
  leadMidi?: number | null
  rankHints?: readonly ChordRankHint[] | null
  /** Hide ↗ when this panel is already the pop-out window. */
  allowPopOut?: boolean
}>()

const emit = defineEmits<{
  close: []
  apply: [draft: ChordEditDraft]
  'update:draft': [draft: ChordEditDraft | null]
  hear: [draft: ChordEditDraft]
  hearStop: []
  remove: []
  popOut: []
  togglePillar: []
}>()

const title = computed(() => (props.variant === 'detected' ? 'Detected' : 'Sketch'))
const hasTarget = computed(() => props.seg != null && props.seg.rootPc != null)
const showPopOut = computed(() => props.allowPopOut !== false)
const isPillar = computed(() => {
  if (!props.seg) return false
  const s = (props.project.harmonySketch ?? []).find((x) => x.id === props.seg!.id)
  return !!(s?.locked && s.pillar !== false)
})
</script>

<template>
  <aside
    class="chord-edit-dock"
    role="complementary"
    :aria-label="`${title} chord editor`"
  >
    <header class="head">
      <h2 class="title">{{ title }}</h2>
      <div class="head-actions">
        <button
          v-if="hasTarget"
          type="button"
          class="btn ghost"
          :class="{ on: isPillar }"
          :title="isPillar ? 'Clear pillar' : 'Assign as pillar'"
          :aria-pressed="isPillar"
          @click="emit('togglePillar')"
        >
          Pillar
        </button>
        <button
          v-if="showPopOut"
          type="button"
          class="btn ghost"
          title="Pop out"
          aria-label="Pop out"
          @click="emit('popOut')"
        >
          ↗
        </button>
        <button
          type="button"
          class="btn ghost"
          :aria-label="tagRollTip('Close', 'Esc')"
          :title="tagRollTip('Close', 'Esc')"
          @click="emit('close')"
        >
          ✕
        </button>
      </div>
    </header>

    <div class="body" :class="{ dimmed: !hasTarget }">
      <p v-if="!hasTarget" class="empty">
        Select a {{ title.toLowerCase() }} chord on the lane to edit.
      </p>
      <TagRollChordEditPopover
        v-else
        :seg="seg!"
        :mode="mode"
        :project="project"
        :variant="variant"
        docked
        :lead-midi="leadMidi ?? null"
        :rank-hints="rankHints ?? null"
        @cancel="emit('close')"
        @apply="emit('apply', $event)"
        @update:draft="emit('update:draft', $event)"
        @hear="emit('hear', $event)"
        @hear-stop="emit('hearStop')"
        @remove="emit('remove')"
      />
    </div>
  </aside>
</template>

<style scoped>
.chord-edit-dock {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  width: min(28rem, 40vw);
  min-width: min(18rem, 100%);
  max-width: min(36rem, 92vw);
  height: 100%;
  padding: 0.55rem 0.7rem 0.75rem;
  border-left: 1px solid var(--border);
  background: color-mix(in srgb, var(--surface) 94%, var(--bg));
  overflow: hidden;
  flex: 0 0 auto;
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  flex: 0 0 auto;
}
.head-actions {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}
.title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 700;
}
.btn.ghost {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.7rem;
  height: 1.7rem;
  padding: 0 0.4rem;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 0.72rem;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
}
.btn.ghost.on {
  border-color: color-mix(in srgb, #2a8c5a 55%, var(--border));
  background: color-mix(in srgb, #2a8c5a 16%, transparent);
  color: #1f6b45;
}
.btn.ghost:hover {
  background: color-mix(in srgb, var(--accent) 10%, var(--surface));
}
.body {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}
.body.dimmed {
  opacity: 0.55;
  pointer-events: none;
}
.empty {
  margin: 0.35rem 0 0;
  font-size: 0.82rem;
  color: var(--muted);
  line-height: 1.4;
}
</style>
