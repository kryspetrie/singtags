<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { CHROMATIC_NOTES, PitchPlayer } from '../audio/pitchPlayer'

const player = new PitchPlayer()
const detune = ref(0)
const current = ref<string | null>(null)
const gridRef = ref<HTMLElement | null>(null)

onMounted(() => {
  /* AudioContext created on first press (browser autoplay policy). */
})

onUnmounted(() => player.dispose())

async function down(note: string): Promise<void> {
  current.value = note
  await player.start(note, detune.value)
}

function up(): void {
  current.value = null
  player.stop(true)
}

function onNoteKey(e: KeyboardEvent, note: string): void {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    if (e.type === 'keydown' && !e.repeat) void down(note)
    if (e.type === 'keyup') up()
  }
}

function focusNeighbor(e: KeyboardEvent, index: number): void {
  const cols = Math.max(1, Math.floor((gridRef.value?.clientWidth ?? 320) / 72))
  let next = index
  if (e.key === 'ArrowRight') next = Math.min(CHROMATIC_NOTES.length - 1, index + 1)
  else if (e.key === 'ArrowLeft') next = Math.max(0, index - 1)
  else if (e.key === 'ArrowDown') next = Math.min(CHROMATIC_NOTES.length - 1, index + cols)
  else if (e.key === 'ArrowUp') next = Math.max(0, index - cols)
  else return
  e.preventDefault()
  const btn = gridRef.value?.querySelectorAll<HTMLButtonElement>('button.note')[next]
  btn?.focus()
}
</script>

<template>
  <section class="pipe">
    <h1>Pitch pipe</h1>
    <p class="muted">Press and hold a pitch. Detune ±100 cents. C2–B4. Arrow keys move focus; Space/Enter plays.</p>
    <label class="detune">
      Detune (cents)
      <input
        v-model.number="detune"
        type="range"
        min="-100"
        max="100"
        step="1"
        aria-valuemin="-100"
        aria-valuemax="100"
        :aria-valuenow="detune"
      />
      <span>{{ detune }}</span>
    </label>
    <div
      ref="gridRef"
      class="grid"
      role="group"
      aria-label="Chromatic pitches"
    >
      <button
        v-for="(note, i) in CHROMATIC_NOTES"
        :key="note"
        type="button"
        class="note"
        :class="{ active: current === note, black: note.includes('#') }"
        :aria-pressed="current === note"
        :aria-label="`Play ${note}`"
        @pointerdown.prevent="down(note)"
        @pointerup.prevent="up"
        @pointerleave.prevent="up"
        @pointercancel.prevent="up"
        @keydown="onNoteKey($event, note); focusNeighbor($event, i)"
        @keyup="onNoteKey($event, note)"
      >
        {{ note }}
      </button>
    </div>
  </section>
</template>

<style scoped>
.pipe h1 {
  font-family: var(--font-display);
}
.muted {
  color: var(--muted);
}
.detune {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  margin: 1rem 0 1.25rem;
  color: var(--muted);
}
.detune input {
  flex: 1;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(4.2rem, 1fr));
  gap: 0.4rem;
}
.note {
  border: 1px solid var(--border);
  background: var(--surface);
  border-radius: 8px;
  padding: 0.65rem 0.25rem;
  font: inherit;
  font-size: 0.85rem;
}
.note.black {
  background: #222;
  color: #f5f5f5;
  border-color: #111;
}
.note.active {
  outline: 2px solid var(--accent);
  background: var(--accent);
  color: #fff;
}
</style>
