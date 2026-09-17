<script setup lang="ts">
/**
 * Left piano tote: click a key to audition pitch. Scrolls with the roll unless locked.
 */
import { computed, onUnmounted, ref, watch } from 'vue'
import { createPitchTonePlayer, type PitchTonePlayer } from '../../audio/pitchTone'
import { midiToNote } from '../../audio/pianoSamples'
import {
  TAG_ROLL_MIDI_MAX,
  TAG_ROLL_MIDI_MIN,
  type TagRollProject,
} from '../../lib/tagRoll/types'
import { midiToY } from '../../lib/tagRoll/normalize'

const props = defineProps<{
  project: TagRollProject
  viewportHeight: number
}>()

const emit = defineEmits<{
  scrollY: [y: number]
}>()

let player: PitchTonePlayer | null = null
const heldMidi = ref<number | null>(null)

const keys = computed(() => {
  const out: { midi: number; isBlack: boolean; label: string }[] = []
  for (let m = TAG_ROLL_MIDI_MAX; m >= TAG_ROLL_MIDI_MIN; m--) {
    const pc = ((m % 12) + 12) % 12
    const isBlack = pc === 1 || pc === 3 || pc === 6 || pc === 8 || pc === 10
    out.push({ midi: m, isBlack, label: midiToNote(m) })
  }
  return out
})

const cellH = computed(() => props.project.view.cellH)
const scrollY = computed(() => props.project.view.scrollY)
const totalH = computed(
  () => (TAG_ROLL_MIDI_MAX - TAG_ROLL_MIDI_MIN + 1) * cellH.value,
)

function ensurePlayer(): PitchTonePlayer {
  if (!player) {
    player = createPitchTonePlayer(props.project.soundEngine, { polyphony: true })
  }
  return player
}

watch(
  () => props.project.soundEngine,
  () => {
    player?.dispose()
    player = null
  },
)

async function onKeyDown(midi: number): Promise<void> {
  heldMidi.value = midi
  const p = ensurePlayer()
  await p.noteOn(midiToNote(midi))
}

function onKeyUp(midi: number): void {
  if (heldMidi.value === midi) heldMidi.value = null
  player?.noteOff(midiToNote(midi), true)
}

function onKeyLeave(midi: number): void {
  onKeyUp(midi)
}

onUnmounted(() => {
  player?.dispose()
  player = null
})

function onWheel(e: WheelEvent): void {
  if (props.project.view.lockPiano) return
  e.preventDefault()
  const next = Math.max(0, Math.min(totalH.value - props.viewportHeight, scrollY.value + e.deltaY))
  emit('scrollY', next)
}
</script>

<template>
  <div
    class="tote"
    :style="{ '--cell-h': `${cellH}px` }"
    @wheel="onWheel"
  >
    <div
      class="tote-inner"
      :style="{
        height: `${totalH}px`,
        transform: `translateY(${-scrollY}px)`,
      }"
    >
      <button
        v-for="k in keys"
        :key="k.midi"
        type="button"
        class="tote-key"
        :class="{ black: k.isBlack, on: heldMidi === k.midi }"
        :style="{ height: `${cellH}px`, top: `${midiToY(k.midi, cellH)}px` }"
        :title="k.label"
        :aria-label="k.label"
        @pointerdown.prevent="onKeyDown(k.midi)"
        @pointerup="onKeyUp(k.midi)"
        @pointercancel="onKeyUp(k.midi)"
        @pointerleave="onKeyLeave(k.midi)"
      >
        <span v-if="!k.isBlack && k.midi % 12 === 0" class="tote-lbl">{{ k.label }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.tote {
  position: relative;
  flex: 0 0 56px;
  width: 56px;
  overflow: hidden;
  border-right: 1px solid var(--border);
  background: var(--surface);
  touch-action: none;
  user-select: none;
}
.tote-inner {
  position: relative;
  width: 100%;
  will-change: transform;
}
.tote-key {
  position: absolute;
  left: 0;
  right: 0;
  box-sizing: border-box;
  margin: 0;
  padding: 0;
  border: none;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
  background: var(--bg);
  cursor: pointer;
  font: inherit;
  font-size: 0.62rem;
  color: var(--muted);
  text-align: left;
}
.tote-key.black {
  background: color-mix(in srgb, var(--text) 14%, var(--bg));
}
.tote-key.on {
  background: color-mix(in srgb, var(--accent) 28%, var(--bg));
}
.tote-lbl {
  padding-left: 0.25rem;
  line-height: 1;
}
</style>
