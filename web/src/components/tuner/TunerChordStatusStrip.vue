/**
 * Compact “is this chord in tune?” strip for FFT / Spec — scored from spectral fundamentals.
 */
<script setup lang="ts">
import { computed } from 'vue'
import type { ChordStackScore } from '../../domain/tuner/chordStack'
import { formatDisplayCents } from '../../domain/tuner/displayCents'

const props = defineProps<{
  score: ChordStackScore | null
  statusLabel?: string | null
}>()

const toneBits = computed(() => {
  const tones = props.score?.tones ?? []
  return tones.map((t) => ({
    key: `${t.role}-${t.midi}`,
    note: t.note,
    mark: t.glanceMark,
    ok: t.inTuneSelf,
    cents: t.errorCentsVsJi,
  }))
})

const badge = computed(() => {
  const s = props.score
  if (!s || s.status === 'wait') return 'wait'
  if (s.assistedPinRequired) return 'assist'
  return s.status
})

const label = computed(() => {
  if (props.statusLabel) return props.statusLabel
  const s = props.score
  if (!s) return 'Chord — listening for stack…'
  if (s.assistedPinRequired) return 'Chord — pin nature/root in Settings'
  if (s.status === 'wait') return 'Chord — hearing…'
  if (s.status === 'locked') return 'Chord locked'
  if (s.status === 'shifted') return `Chord shifted ${Math.round(s.commonShiftCents)}¢`
  return 'Chord — fix tones'
})
</script>

<template>
  <section class="chord-strip" aria-label="Chord intonation from spectrum">
    <div class="row">
      <span class="badge" :class="badge">{{ label }}</span>
    </div>
    <ul v-if="toneBits.length" class="tones">
      <li v-for="t in toneBits" :key="t.key" class="tone" :class="{ ok: t.ok }">
        <span class="note">{{ t.note }}</span>
        <span class="mark">{{ t.mark }}</span>
        <span class="cents">{{ formatDisplayCents(t.cents, { clarity: 0.9 }) }}</span>
      </li>
    </ul>
    <p v-else class="hint">
      Sing a chord — note names and JI tuning appear here from spectrum fundamentals.
      Pin nature/root in Settings for Locked / Fix colors.
    </p>
  </section>
</template>

<style scoped>
.chord-strip {
  display: grid;
  gap: 0.35rem;
  padding: 0.45rem 0.55rem;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--surface);
}
.row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.badge {
  font-size: 0.85rem;
  font-weight: 700;
}
.badge.locked {
  color: var(--accent);
}
.badge.shifted {
  color: #c9a227;
}
.badge.fix,
.badge.wait,
.badge.assist {
  color: var(--text);
}
.tones {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}
.tone {
  display: inline-flex;
  align-items: baseline;
  gap: 0.25rem;
  padding: 0.2rem 0.45rem;
  border-radius: 6px;
  border: 1px solid var(--border);
  font-variant-numeric: tabular-nums;
  font-size: 0.8rem;
}
.tone.ok {
  border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
  color: var(--accent);
}
.note {
  font-weight: 700;
}
.mark,
.cents {
  color: var(--muted);
}
.tone.ok .mark,
.tone.ok .cents {
  color: inherit;
}
.hint {
  margin: 0;
  font-size: 0.8rem;
  color: var(--muted);
}
</style>
