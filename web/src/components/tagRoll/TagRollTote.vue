<script setup lang="ts">
/**
 * Left piano tote: click a key to audition pitch. Scrolls with the roll unless locked.
 * Uses the editor-scoped pitch player when provided.
 */
import { computed, onUnmounted, ref, watch } from 'vue'
import { createPitchTonePlayer, type PitchTonePlayer } from '../../audio/pitchTone'
import { midiToNote } from '../../audio/pianoSamples'
import { resolvePitchPipeVoiceById } from '../../audio/pitchPipeVoice'
import { useTagRollAudio } from '../../composables/useTagRollAudio'
import { midiPitchLabel } from '../../lib/tagRoll/keySignature'
import {
  TAG_ROLL_MIDI_MAX,
  TAG_ROLL_MIDI_MIN,
  type TagRollProject,
} from '../../lib/tagRoll/types'
import { midiToY } from '../../lib/tagRoll/normalize'
import { tagRollTip } from '../../lib/tagRoll/shortcuts'

const props = defineProps<{
  project: TagRollProject
  viewportHeight: number
}>()

const emit = defineEmits<{
  scrollY: [y: number]
}>()

const shared = useTagRollAudio()
let localPlayer: PitchTonePlayer | null = null
const heldMidi = ref<number | null>(null)

const keys = computed(() => {
  const flats = props.project.preferFlats
  const out: { midi: number; isBlack: boolean; label: string }[] = []
  for (let m = TAG_ROLL_MIDI_MAX; m >= TAG_ROLL_MIDI_MIN; m--) {
    const pc = ((m % 12) + 12) % 12
    const isBlack = pc === 1 || pc === 3 || pc === 6 || pc === 8 || pc === 10
    out.push({ midi: m, isBlack, label: midiPitchLabel(m, flats) })
  }
  return out
})

const cellH = computed(() => props.project.view.cellH)
const scrollY = computed(() => props.project.view.scrollY)
const totalH = computed(
  () => (TAG_ROLL_MIDI_MAX - TAG_ROLL_MIDI_MIN + 1) * cellH.value,
)

function ensurePlayer(): PitchTonePlayer {
  if (shared) return shared.ensurePlayer()
  if (!localPlayer) {
    localPlayer = createPitchTonePlayer(props.project.soundEngine, { polyphony: true })
  }
  if (props.project.soundEngine === 'synth') {
    localPlayer.setVoice(resolvePitchPipeVoiceById(props.project.pitchPipeSoundId))
  }
  return localPlayer
}

watch(
  () => [props.project.soundEngine, props.project.pitchPipeSoundId] as const,
  () => {
    // Shared player is rebuilt by the editor; only dispose a local fallback.
    localPlayer?.dispose()
    localPlayer = null
  },
)

async function onKeyDown(midi: number): Promise<void> {
  if (shared?.isTransportPlaying?.()) return
  heldMidi.value = midi
  await ensurePlayer().noteOn(midiToNote(midi))
}

function onKeyUp(midi: number): void {
  if (heldMidi.value === midi) heldMidi.value = null
  ensurePlayer().noteOff(midiToNote(midi), true)
}

function onKeyLeave(midi: number): void {
  onKeyUp(midi)
}

onUnmounted(() => {
  localPlayer?.dispose()
  localPlayer = null
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
    aria-label="Piano keys"
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
        :title="tagRollTip(`Audition ${k.label}`)"
        :aria-label="tagRollTip(`Audition ${k.label}`)"
        @pointerdown.prevent="onKeyDown(k.midi)"
        @pointerup="onKeyUp(k.midi)"
        @pointercancel="onKeyUp(k.midi)"
        @pointerleave="onKeyLeave(k.midi)"
      >
        <span class="tote-lbl">{{ k.label }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.tote {
  position: relative;
  flex: 1 1 auto;
  width: 100%;
  min-height: 0;
  overflow: hidden;
  border-right: 1px solid #b8b0a4;
  background: #2a2622;
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
  padding: 0 0.3rem 0 0.35rem;
  border: none;
  border-bottom: 1px solid #cfc7bb;
  background: #f4f0e8;
  color: #1a1714;
  cursor: pointer;
  font: inherit;
  font-size: 0.68rem;
  font-weight: 650;
  letter-spacing: 0.01em;
  text-align: left;
  display: flex;
  align-items: center;
}
.tote-key.black {
  background: #1c1916;
  color: #f0ebe3;
  border-bottom-color: #3a342e;
  /* Slight inset so black keys read as raised piano sharps. */
  left: 0;
  right: 0;
  box-shadow: inset 0 0 0 1px #0e0c0a;
}
.tote-key:hover {
  filter: brightness(1.06);
}
.tote-key.black:hover {
  filter: brightness(1.25);
}
.tote-key.on {
  background: color-mix(in srgb, var(--accent, #c45c26) 42%, #f4f0e8);
  color: #1a1714;
}
.tote-key.black.on {
  background: color-mix(in srgb, var(--accent, #c45c26) 55%, #1c1916);
  color: #fff8f0;
}
.tote-lbl {
  line-height: 1;
  pointer-events: none;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}
</style>
