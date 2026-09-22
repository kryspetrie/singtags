<script setup lang="ts">
/**
 * Pillars step panel — home-root list, editor, uncovered gaps, advanced batch.
 */
import type { MelodyEvent, Pillar } from '../../domain/arranging/types'

defineProps<{
  repairTour: boolean
  canWalkArrange: boolean
  canLockRemaining: boolean
  skippedCount: number
  pillars: readonly Pillar[]
  selectedPil: Pillar | null
  preferFlats: boolean
  pillarGlossaryTip: string
  coverageGaps: readonly MelodyEvent[]
  formatGapRow: (g: { startTick: number; midi: number }) => string
  canExtendPreviousAtGap: (noteId: string) => boolean
  pcName: (pc: number, flats: boolean) => string
}>()

defineEmits<{
  addAtPlayhead: []
  nextRoles: []
  inferBatch: []
  lockRemaining: []
  clearSkips: []
  focusPillar: [id: string]
  updateRoot: [rootPc: number]
  deletePillar: []
  jumpUncovered: [id: string]
  addUncovered: [id: string]
  extendUncovered: [id: string]
}>()
</script>

<template>
  <section class="panel">
    <p class="hint">
      Mark home roots under phrases — not full chords yet. Bands on the Coach lane show destinations;
      Hear the root, then Lock when it feels right. Inspect bounds (L/R) highlight the phrase —
      notes stay unselected for edit.
    </p>
    <p v-if="repairTour" class="muted tiny">
      This chart already has harmony on the roll — review home roots here; existing stacks stay put.
    </p>
    <div class="row">
      <button
        type="button"
        class="step-btn"
        title="Insert a draft home root starting at the playhead (or selected moment)."
        @click="$emit('addAtPlayhead')"
      >
        Add at playhead
      </button>
      <button
        type="button"
        class="step-btn"
        :disabled="!canWalkArrange"
        title="Next: mark Lead notes as Strong (home) or Passing (connective)"
        @click="$emit('nextRoles')"
      >
        Next: Strong / passing →
      </button>
    </div>
    <details class="advanced">
      <summary class="muted tiny">Advanced</summary>
      <div class="row">
        <button
          type="button"
          class="step-btn"
          title="Draft a home root for every measure with melody (batch — not the teaching path)."
          @click="$emit('inferBatch')"
        >
          Draft all measures
        </button>
        <button
          v-if="canLockRemaining"
          type="button"
          class="step-btn"
          title="Lock every remaining draft after you have locked at least one (advanced)."
          @click="$emit('lockRemaining')"
        >
          Lock all drafts
        </button>
        <button
          v-if="skippedCount > 0"
          type="button"
          class="step-btn"
          title="Allow propose to revisit spans you Skip’d this session"
          @click="$emit('clearSkips')"
        >
          Reset skips ({{ skippedCount }})
        </button>
      </div>
    </details>
    <ul v-if="pillars.length" class="pillar-list">
      <li v-for="(pil, i) in pillars" :key="pil.id">
        <button
          type="button"
          class="pillar-btn"
          :class="{ on: pil.id === selectedPil?.id, locked: pil.confirmed }"
          :title="
            [
              `Pillar ${i + 1}: ${pcName(pil.rootPc, preferFlats)}`,
              pil.confirmed ? 'Locked home root' : 'Draft — Hear and Lock when ready',
              pil.reason || '',
              pillarGlossaryTip,
            ]
              .filter(Boolean)
              .join(' — ')
          "
          @click="$emit('focusPillar', pil.id)"
        >
          <span class="idx">{{ i + 1 }}</span>
          <strong>{{ pcName(pil.rootPc, preferFlats) }}</strong>
          <span class="pill-state">{{ pil.confirmed ? 'locked' : 'draft' }}</span>
        </button>
      </li>
    </ul>
    <div v-if="selectedPil" class="card">
      <label class="root-big" :title="pillarGlossaryTip || 'Pitch-class home root for this phrase'">
        Home root
        <select
          class="root-sel"
          :value="selectedPil.rootPc"
          @change="$emit('updateRoot', Number(($event.target as HTMLSelectElement).value))"
        >
          <option v-for="n in 12" :key="n - 1" :value="n - 1">
            {{ pcName(n - 1, preferFlats) }}
          </option>
        </select>
      </label>
      <span
        class="stack-state"
        :class="selectedPil.confirmed ? 'ok' : 'missing'"
        :title="
          selectedPil.confirmed
            ? 'Locked — coach treats this as a confirmed home root'
            : 'Draft — still editable; Lock when you are happy with it'
        "
      >
        {{ selectedPil.confirmed ? 'locked' : 'draft' }}
      </span>
      <p v-if="selectedPil.reason" class="muted tiny">{{ selectedPil.reason }}</p>
      <div class="row">
        <button
          type="button"
          class="step-btn"
          title="Remove this home-root span"
          @click="$emit('deletePillar')"
        >
          Delete
        </button>
      </div>
    </div>
    <div v-if="coverageGaps.length" class="gaps">
      <h3 class="subh">Uncovered ({{ coverageGaps.length }})</h3>
      <p class="muted tiny">Melody outside any home-root span — jump to look, then add if you want.</p>
      <ul>
        <li v-for="g in coverageGaps.slice(0, 6)" :key="g.id" class="gap-row">
          <button
            type="button"
            class="gap-jump"
            title="Overlay the roll at this uncovered note (does not select notes)"
            @click="$emit('jumpUncovered', g.id)"
          >
            {{ formatGapRow(g) }}
          </button>
          <button
            type="button"
            class="step-btn gap-add"
            title="Add a draft home root covering this note"
            @click="$emit('addUncovered', g.id)"
          >
            Add
          </button>
          <button
            v-if="canExtendPreviousAtGap(g.id)"
            type="button"
            class="step-btn gap-add"
            title="Stretch the previous home-root span forward to here"
            @click="$emit('extendUncovered', g.id)"
          >
            Extend
          </button>
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.panel {
  display: grid;
  gap: 0.55rem;
}
.hint {
  margin: 0;
  font-size: 0.82rem;
  line-height: 1.35;
}
.row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
}
.advanced {
  margin-top: 0.1rem;
}
.advanced summary {
  cursor: pointer;
  user-select: none;
}
.pillar-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.2rem;
  max-height: 9rem;
  overflow: auto;
}
.pillar-btn {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  font: inherit;
  font-size: 0.8rem;
  cursor: pointer;
  padding: 0.28rem 0.4rem;
  color: var(--text);
  text-align: left;
}
.pillar-btn.on {
  border-color: color-mix(in srgb, var(--accent) 50%, var(--border));
  background: color-mix(in srgb, var(--accent) 10%, transparent);
}
.pillar-btn .idx {
  font-variant-numeric: tabular-nums;
  color: var(--muted);
  width: 1.2rem;
}
.pillar-btn .pill-state {
  margin-left: auto;
  font-size: 0.68rem;
  font-weight: 700;
  color: var(--muted);
}
.pillar-btn.locked .pill-state {
  color: #2d7a3e;
}
.card {
  display: grid;
  gap: 0.4rem;
  padding: 0.5rem;
  border: 1px solid var(--border);
  border-radius: 9px;
}
.root-big {
  display: grid;
  gap: 0.2rem;
  font-size: 0.78rem;
  font-weight: 650;
}
.root-sel {
  font: inherit;
  font-size: 1rem;
  font-weight: 700;
}
.stack-state {
  font-size: 0.72rem;
  font-weight: 700;
}
.stack-state.ok {
  color: #2d7a3e;
}
.stack-state.missing {
  color: var(--muted);
}
.gaps ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.3rem;
}
.subh {
  margin: 0;
  font-size: 0.78rem;
}
.gap-jump {
  border: 0;
  background: transparent;
  font: inherit;
  font-size: 0.78rem;
  cursor: pointer;
  color: var(--text);
  padding: 0;
  text-align: left;
}
.gap-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.gap-add {
  font-size: 0.72rem;
  padding: 0.15rem 0.45rem;
}
.gap-jump:hover {
  text-decoration: underline;
}
.muted {
  color: var(--muted);
}
.tiny {
  font-size: 0.72rem;
  margin: 0;
}
</style>
