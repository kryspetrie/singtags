<script setup lang="ts">
/**
 * Compact one-octave reference piano for Digital Tuner.
 * Forced off on short landscape unless pinned (parent gates visibility).
 */
import { computed } from 'vue'
import { keyGridOffsetCents, type KeyGridTemperament } from '../../domain/tuner/keyGridTemperament'

const props = defineProps<{
  octave: number
  highlightMidi: number | null
  keyPc: number
  temperament: KeyGridTemperament
  customOffsetsCents: readonly number[]
}>()

const emit = defineEmits<{
  noteOn: [note: string, detuneCents: number]
  noteOff: [note: string]
}>()

const PC = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const
const WHITE = [0, 2, 4, 5, 7, 9, 11] as const
const BLACK = [1, 3, 6, 8, 10] as const

const whites = computed(() =>
  WHITE.map((pc) => {
    const midi = (props.octave + 1) * 12 + pc
    return { pc, midi, name: `${PC[pc]}${props.octave}`, black: false }
  }),
)

const blacks = computed(() =>
  BLACK.map((pc) => {
    const midi = (props.octave + 1) * 12 + pc
    // Position over white gaps (C# between C-D, etc.)
    const leftIndex = WHITE.findIndex((w) => w > pc) - 1
    return {
      pc,
      midi,
      name: `${PC[pc]}${props.octave}`,
      black: true,
      leftPct: ((Math.max(0, leftIndex) + 0.65) / WHITE.length) * 100,
    }
  }),
)

function detuneFor(pc: number): number {
  return keyGridOffsetCents(pc, props.keyPc, props.temperament, props.customOffsetsCents)
}

function down(name: string, pc: number): void {
  emit('noteOn', name, detuneFor(pc))
}
function up(name: string): void {
  emit('noteOff', name)
}
</script>

<template>
  <div class="dock" aria-label="Reference piano">
    <div class="keys">
      <button
        v-for="k in whites"
        :key="k.name"
        type="button"
        class="white"
        :class="{ on: highlightMidi === k.midi }"
        :aria-label="k.name"
        @pointerdown.prevent="down(k.name, k.pc)"
        @pointerup.prevent="up(k.name)"
        @pointerleave="up(k.name)"
        @pointercancel="up(k.name)"
      >
        <span>{{ k.name.replace(/\d+$/, '') }}</span>
      </button>
      <button
        v-for="k in blacks"
        :key="k.name"
        type="button"
        class="black"
        :class="{ on: highlightMidi === k.midi }"
        :style="{ left: `${k.leftPct}%` }"
        :aria-label="k.name"
        @pointerdown.prevent="down(k.name, k.pc)"
        @pointerup.prevent="up(k.name)"
        @pointerleave="up(k.name)"
        @pointercancel="up(k.name)"
      />
    </div>
  </div>
</template>

<style scoped>
.dock {
  width: 100%;
  max-width: 36rem;
  margin: 0 auto;
  padding: 0.35rem 0.25rem;
}
.keys {
  position: relative;
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 2px;
  height: 4.5rem;
  user-select: none;
  touch-action: none;
}
.white {
  border: 1px solid var(--border);
  border-radius: 0 0 6px 6px;
  background: var(--surface);
  color: var(--muted);
  font: inherit;
  font-size: 0.7rem;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding-bottom: 0.25rem;
  cursor: pointer;
  min-height: 44px;
}
.white.on {
  background: color-mix(in srgb, var(--accent) 22%, var(--surface));
  border-color: var(--accent);
  color: var(--text);
}
.black {
  position: absolute;
  top: 0;
  width: 8%;
  height: 58%;
  margin-left: -4%;
  border: 1px solid #222;
  border-radius: 0 0 4px 4px;
  background: #222;
  cursor: pointer;
  z-index: 1;
}
.black.on {
  background: var(--accent);
  border-color: var(--accent);
}
</style>
