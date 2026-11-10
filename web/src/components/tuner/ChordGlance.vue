<script setup lang="ts">
/**
 * Chord Rehearsal Glance — distance wash + LOCKED / FIX / WAIT + KEY ▲/▼.
 * Pitch blocks use OK / ▲ / ▼ (not SHARP/FLAT).
 */
import type { ChordStackScore } from '../../domain/tuner/chordStack'

const props = defineProps<{
  score: ChordStackScore | null
}>()

defineEmits<{
  exit: []
}>()

const glanceWord = (): string => {
  const s = props.score
  if (!s || s.unstable || s.status === 'wait') return 'WAIT'
  if (s.status === 'fix') return 'FIX'
  return 'LOCKED'
}

const keyShift = (): string | null => {
  const s = props.score
  if (!s || s.status !== 'shifted') return null
  return s.commonShiftCents >= 0 ? 'KEY ▲' : 'KEY ▼'
}
</script>

<template>
  <div
    class="glance"
    :data-status="glanceWord()"
    :data-shifted="score?.status === 'shifted' ? '1' : '0'"
    role="dialog"
    aria-modal="true"
    aria-label="Chord rehearsal view"
  >
    <p class="word">{{ glanceWord() }}</p>
    <p v-if="keyShift()" class="key">{{ keyShift() }}</p>
    <div v-if="score?.tones?.length" class="blocks">
      <div
        v-for="t in score.tones"
        :key="`${t.midi}-${t.role}`"
        class="block"
        :data-mark="t.glanceMark"
      >
        <span class="bn">{{ t.note }}</span>
        <span class="bm">{{ t.glanceMark }}</span>
      </div>
    </div>
    <button type="button" class="exit" @click="$emit('exit')">Exit rehearsal</button>
  </div>
</template>

<style scoped>
.glance {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  place-content: center;
  gap: 0.75rem;
  padding: max(1rem, env(safe-area-inset-top)) max(1rem, env(safe-area-inset-right))
    max(1rem, env(safe-area-inset-bottom)) max(1rem, env(safe-area-inset-left));
  background: var(--bg);
  text-align: center;
}
.glance[data-status='LOCKED'][data-shifted='0'] {
  background: color-mix(in srgb, var(--accent) 28%, var(--bg));
}
.glance[data-status='LOCKED'][data-shifted='1'] {
  background: color-mix(in srgb, #c90 32%, var(--bg));
}
.glance[data-status='FIX'] {
  background: color-mix(in srgb, var(--danger, #b33) 22%, var(--bg));
}
.glance[data-status='WAIT'] {
  background: color-mix(in srgb, var(--muted) 18%, var(--bg));
}
.word {
  margin: 0;
  font-family: var(--font-display);
  font-weight: 800;
  letter-spacing: 0.08em;
  font-size: clamp(2.75rem, 14vh, 6rem);
  line-height: 1;
}
.key {
  margin: 0;
  font-family: var(--font-display);
  font-weight: 800;
  font-size: clamp(1.75rem, 8vh, 3rem);
  letter-spacing: 0.06em;
}
.blocks {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(5.5rem, 1fr));
  gap: 0.65rem;
  width: min(100%, 36rem);
  margin: 0.5rem auto 0;
}
.block {
  min-height: 5.5rem;
  border-radius: 12px;
  border: 3px solid var(--text);
  background: var(--surface);
  display: grid;
  place-content: center;
  gap: 0.15rem;
}
.block[data-mark='OK'] {
  border-color: var(--accent);
}
.bn {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 1.35rem;
}
.bm {
  font-weight: 800;
  font-size: 1.5rem;
  letter-spacing: 0.04em;
}
.exit {
  margin-top: 1rem;
  min-height: 48px;
  min-width: 12rem;
  padding: 0.65rem 1.25rem;
  border-radius: 10px;
  border: 2px solid var(--text);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-weight: 700;
  font-size: 1.05rem;
  cursor: pointer;
  justify-self: center;
}
</style>
