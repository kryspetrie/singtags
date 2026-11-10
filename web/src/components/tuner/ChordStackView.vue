<script setup lang="ts">
/**
 * Chord stack Detail — Assisted (Phase 4 Conditional). Pitch-order rows, no TTBB.
 */
import type { ChordStackScore } from '../../domain/tuner/chordStack'
import { formatDisplayCents } from '../../domain/tuner/displayCents'

const PC = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

defineProps<{
  score: ChordStackScore | null
  clarity?: number
}>()

defineEmits<{
  rehearsal: []
}>()

function statusLabel(s: ChordStackScore): string {
  if (s.status === 'locked') return 'Locked'
  if (s.status === 'shifted') {
    const dir = s.commonShiftCents >= 0 ? 'sharp' : 'flat'
    return `Locked · ${Math.abs(Math.round(s.commonShiftCents))}¢ ${dir} of key`
  }
  if (s.status === 'fix') return 'Fix — hold JI roles'
  return 'Hold steady to score'
}
</script>

<template>
  <section class="stack" aria-label="Chord stack">
    <p v-if="!score || score.unstable" class="wait">Hold a chord to score…</p>
    <template v-else>
      <p v-if="score.assistedPinRequired" class="assist" role="status">
        Assisted — pin nature/root in Settings for reliable coloring when confidence is low.
      </p>
      <div class="chips">
        <span class="chip" :data-status="score.status">{{ statusLabel(score) }}</span>
        <span class="chip muted">
          {{ score.natureId }} · {{ PC[score.rootPc] }}
        </span>
      </div>
      <ul class="tones">
        <li v-for="t in score.tones" :key="`${t.midi}-${t.role}`" class="tone">
          <span class="note">{{ t.note }}</span>
          <span class="role">{{ t.role }}</span>
          <span class="cents" :class="{ ok: t.inTuneSelf }">
            {{ formatDisplayCents(t.errorCentsVsJi, { clarity: clarity ?? 0.9 }) }}
          </span>
          <span class="mark" aria-hidden="true">{{ t.glanceMark }}</span>
        </li>
      </ul>
      <button type="button" class="btn" @click="$emit('rehearsal')">Rehearsal</button>
    </template>
  </section>
</template>

<style scoped>
.stack {
  display: grid;
  gap: 0.65rem;
}
.wait,
.assist {
  margin: 0;
  font-size: 0.9rem;
  color: var(--muted);
}
.assist {
  padding: 0.5rem 0.65rem;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: color-mix(in srgb, var(--accent) 8%, var(--surface));
  color: var(--text);
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}
.chip {
  font-size: 0.85rem;
  font-weight: 650;
  padding: 0.25rem 0.55rem;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--surface);
}
.chip[data-status='locked'] {
  border-color: var(--accent);
  color: var(--accent);
}
.chip[data-status='shifted'] {
  border-color: color-mix(in srgb, #c90 70%, var(--border));
  color: #a70;
}
.chip[data-status='fix'] {
  border-color: var(--danger, #b33);
  color: var(--danger, #b33);
}
.chip.muted {
  font-weight: 500;
  color: var(--muted);
}
.tones {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.4rem;
}
.tone {
  display: grid;
  grid-template-columns: 3.5rem 2rem 1fr auto;
  gap: 0.5rem;
  align-items: center;
  padding: 0.45rem 0.55rem;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--surface);
}
.note {
  font-family: var(--font-display);
  font-weight: 700;
}
.role {
  color: var(--muted);
  font-size: 0.85rem;
}
.cents {
  font-variant-numeric: tabular-nums;
}
.cents.ok {
  color: var(--accent);
}
.mark {
  font-weight: 800;
  letter-spacing: 0.04em;
}
.btn {
  min-height: 44px;
  padding: 0.45rem 0.9rem;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  cursor: pointer;
  justify-self: start;
}
</style>
