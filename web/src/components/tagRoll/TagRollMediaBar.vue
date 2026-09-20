<script setup lang="ts">
/**
 * Persistent bottom transport / mixer / sound / parts / zoom bar for Tag Studio.
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { METRONOME_SOUND_PAIRS } from '../../audio/metronomeSamples'
import { PIANO_SAMPLE_ENGINE_OPTIONS } from '../../audio/pianoSamples'
import { listPitchPipeSoundChoices } from '../../audio/pitchPipeVoice'
import {
  MAJOR_KEY_CHOICES,
  majorKeyChoiceById,
  majorKeyChoiceId,
} from '../../lib/tagRoll/keySignature'
import { displayHotkeyForPart } from '../../lib/tagRoll/partHotkeys'
import { syncProjectMix } from '../../lib/tagRoll/mix'
import {
  TAG_ROLL_ATTACK_SEC_MAX,
  TAG_ROLL_ATTACK_SEC_MIN,
  TAG_ROLL_DECAY_SEC_MAX,
  TAG_ROLL_DECAY_SEC_MIN,
  TAG_ROLL_ENVELOPE_SEC_STEP,
  TAG_ROLL_PHRASE_DECAY_SEC_MAX,
  TAG_ROLL_PHRASE_DECAY_SEC_MIN,
} from '../../lib/tagRoll/soundEnvelope'
import { tagRollTip, tipByShortcutId } from '../../lib/tagRoll/shortcuts'
import { usePreferencesStore } from '../../stores/preferences'
import { useTagRollStore } from '../../stores/tagRoll'

const props = defineProps<{
  playing: boolean
  playheadLabel: string
  statusLine?: string
}>()

const emit = defineEmits<{
  beginning: []
  prevMeasure: []
  nextMeasure: []
  returnOrigin: []
  playPause: []
  stop: []
  mixer: []
  parts: []
  nudgeTime: [delta: number]
  nudgePitch: [delta: number]
}>()

const store = useTagRollStore()
const prefs = usePreferencesStore()
const project = computed(() => store.current)
const isView = computed(() => project.value?.view.mode === 'view')
const showPitchZoom = computed(() => {
  const p = project.value
  if (!p) return false
  return !(p.view.mode === 'view' && p.view.scoreSurface === 'sheet')
})
const soundOpen = ref(false)
const soundWrap = ref<HTMLElement | null>(null)
const pitchSoundChoices = ref(listPitchPipeSoundChoices())

const keyChoices = MAJOR_KEY_CHOICES

function partTitle(part: { name: string; hotkey?: string }): string {
  const hk = displayHotkeyForPart(part as never)
  return tagRollTip(`Select ${part.name}`, hk)
}

function partMix(partId: string): { mute: boolean; solo: boolean } {
  const p = project.value
  if (!p) return { mute: false, solo: false }
  const row = syncProjectMix(p.parts, p.mix).find((m) => m.partId === partId)
  return { mute: !!row?.mute, solo: !!row?.solo }
}

function toggleMute(partId: string, e: Event): void {
  e.stopPropagation()
  const m = partMix(partId)
  store.patchPartMix(partId, { mute: !m.mute })
}

function toggleSolo(partId: string, e: Event): void {
  e.stopPropagation()
  const m = partMix(partId)
  store.patchPartMix(partId, { solo: !m.solo })
}

function refreshPitchChoices(): void {
  pitchSoundChoices.value = listPitchPipeSoundChoices()
  const p = project.value
  if (!p) return
  // Keep current selection visible even if lab voice was deleted.
  if (!pitchSoundChoices.value.some((c) => c.value === p.pitchPipeSoundId)) {
    pitchSoundChoices.value = [
      ...pitchSoundChoices.value,
      { value: p.pitchPipeSoundId, label: p.pitchPipeSoundId },
    ]
  }
}

function onSound(e: Event): void {
  const v = (e.target as HTMLSelectElement).value
  if (v === 'synth' || v === 'samples') store.setSoundEngine(v)
}

function onPitchSound(e: Event): void {
  const v = (e.target as HTMLSelectElement).value
  if (v) store.setPitchPipeSoundId(v)
}

function onBlowPitch(e: Event): void {
  store.setBlowPitchEnabled((e.target as HTMLInputElement).checked)
}

function onMetronome(e: Event): void {
  store.setMetronomeEnabled((e.target as HTMLInputElement).checked)
}

function onMetronomeSound(e: Event): void {
  prefs.setTagRollMetronomeSound((e.target as HTMLSelectElement).value)
}

function onKey(e: Event): void {
  const choice = majorKeyChoiceById((e.target as HTMLSelectElement).value)
  if (choice) store.setTonality(choice.tonality, choice.preferFlats)
}

function onAttack(e: Event): void {
  const v = Number((e.target as HTMLInputElement).value)
  if (Number.isFinite(v)) store.setSoundEnvelope({ attackSec: v })
}

function onDecay(e: Event): void {
  const v = Number((e.target as HTMLInputElement).value)
  if (Number.isFinite(v)) store.setSoundEnvelope({ decaySec: v })
}

function onPhraseDecay(e: Event): void {
  const v = Number((e.target as HTMLInputElement).value)
  if (Number.isFinite(v)) store.setSoundEnvelope({ phraseDecaySec: v })
}

function onDocPointer(e: PointerEvent): void {
  if (!soundOpen.value) return
  const t = e.target as Node | null
  if (soundWrap.value?.contains(t)) return
  soundOpen.value = false
}

watch(soundOpen, (open) => {
  if (open) refreshPitchChoices()
})

onMounted(() => document.addEventListener('pointerdown', onDocPointer, true))
onUnmounted(() => document.removeEventListener('pointerdown', onDocPointer, true))
</script>

<template>
  <div v-if="project" class="media-bar" role="region" aria-label="Transport and sound">
    <div class="side left">
      <button
        type="button"
        class="link-btn"
        :class="{ on: false }"
        :title="tagRollTip('Mixer')"
        @click="emit('mixer')"
      >
        Mixer
      </button>
      <div ref="soundWrap" class="sound-wrap">
        <button
          type="button"
          class="link-btn"
          :class="{ on: soundOpen }"
          :aria-expanded="soundOpen"
          :title="tagRollTip('Synth / sample sound setup')"
          @click="soundOpen = !soundOpen"
        >
          Sound
        </button>
        <div v-if="soundOpen" class="sound-pop" role="dialog" aria-label="Sound setup">
          <p v-if="isView" class="view-hint">View mode — sound settings are read-only</p>
          <label class="field">
            <span class="lbl">Engine</span>
            <select
              class="sel"
              :value="project.soundEngine"
              :disabled="isView"
              aria-label="Sound engine"
              @change="onSound"
            >
              <option
                v-for="o in PIANO_SAMPLE_ENGINE_OPTIONS"
                :key="o.value"
                :value="o.value"
              >
                {{ o.label }}
              </option>
            </select>
          </label>
          <label
            class="field wide"
            :title="tagRollTip('Pitch pipe voice — used for blow-pitch and synth engine')"
          >
            <span class="lbl">Pitch pipe</span>
            <select
              class="sel"
              :value="project.pitchPipeSoundId"
              :disabled="isView"
              aria-label="Pitch pipe sound"
              @change="onPitchSound"
            >
              <option
                v-for="o in pitchSoundChoices"
                :key="o.value"
                :value="o.value"
              >
                {{ o.label }}
              </option>
            </select>
          </label>
          <label
            class="field"
            :title="tagRollTip('Blow a centered pitch-pipe tonic for one measure before the first notes')"
          >
            <span class="lbl">Blow pitch</span>
            <input
              type="checkbox"
              class="chk"
              :checked="project.blowPitchEnabled"
              :disabled="isView"
              aria-label="Blow pitch before arrangement"
              @change="onBlowPitch"
            />
          </label>
          <label
            class="field"
            :title="tagRollTip('Click the meter during playback — different sound on beat 1')"
          >
            <span class="lbl">Metronome</span>
            <input
              type="checkbox"
              class="chk"
              :checked="project.metronomeEnabled"
              :disabled="isView"
              aria-label="Metronome during playback"
              @change="onMetronome"
            />
          </label>
          <label
            class="field"
            :title="tagRollTip('Metronome click sample pair (saved as a setting)')"
          >
            <span class="lbl">Click</span>
            <select
              class="sel"
              :value="prefs.tagRollMetronomeSound"
              aria-label="Metronome sound"
              @change="onMetronomeSound"
            >
              <option v-for="o in METRONOME_SOUND_PAIRS" :key="o.id" :value="o.id">
                {{ o.label }}
              </option>
            </select>
          </label>
          <label
            class="field"
            :title="tagRollTip('Key — scale highlight, blow-pitch tonic, and sheet key signature')"
          >
            <span class="lbl">Key</span>
            <select
              class="sel"
              :value="majorKeyChoiceId(project.tonality, project.preferFlats)"
              :disabled="isView"
              aria-label="Key"
              @change="onKey"
            >
              <option v-for="o in keyChoices" :key="o.id" :value="o.id">
                {{ o.id }}
              </option>
            </select>
          </label>
          <label class="field wide" :title="tagRollTip('Note attack')">
            <span class="lbl">Attack</span>
            <input
              class="range"
              type="range"
              :min="TAG_ROLL_ATTACK_SEC_MIN"
              :max="TAG_ROLL_ATTACK_SEC_MAX"
              :step="TAG_ROLL_ENVELOPE_SEC_STEP"
              :value="project.soundEnvelope.attackSec"
              :disabled="isView"
              aria-label="Attack seconds"
              @input="onAttack"
            />
            <span class="val">{{ project.soundEnvelope.attackSec.toFixed(3) }}s</span>
          </label>
          <label
            class="field wide"
            :title="tagRollTip('Decay into the next note on the same part')"
          >
            <span class="lbl">Decay</span>
            <input
              class="range"
              type="range"
              :min="TAG_ROLL_DECAY_SEC_MIN"
              :max="TAG_ROLL_DECAY_SEC_MAX"
              :step="TAG_ROLL_ENVELOPE_SEC_STEP"
              :value="project.soundEnvelope.decaySec"
              :disabled="isView"
              aria-label="Decay seconds into next note"
              @input="onDecay"
            />
            <span class="val">{{ project.soundEnvelope.decaySec.toFixed(3) }}s</span>
          </label>
          <label
            class="field wide"
            :title="tagRollTip('Phrase decay — fade when a note ends with silence after it (no following note on that part), including after fermatas')"
          >
            <span class="lbl">Phrase</span>
            <input
              class="range"
              type="range"
              :min="TAG_ROLL_PHRASE_DECAY_SEC_MIN"
              :max="TAG_ROLL_PHRASE_DECAY_SEC_MAX"
              :step="TAG_ROLL_ENVELOPE_SEC_STEP"
              :value="project.soundEnvelope.phraseDecaySec"
              :disabled="isView"
              aria-label="Phrase-end decay seconds"
              @input="onPhraseDecay"
            />
            <span class="val">{{ project.soundEnvelope.phraseDecaySec.toFixed(3) }}s</span>
          </label>
        </div>
      </div>

      <div class="zoom" role="group" aria-label="Zoom">
        <div class="zoom-axis" role="group" aria-label="Horizontal zoom">
          <button
            type="button"
            class="zoom-btn"
            aria-label="Zoom out time"
            :title="tagRollTip('Narrower cells (time)')"
            @click="emit('nudgeTime', -2)"
          >
            −
          </button>
          <span class="zoom-lbl" title="Time zoom">W</span>
          <button
            type="button"
            class="zoom-btn"
            aria-label="Zoom in time"
            :title="tagRollTip('Wider cells (time)')"
            @click="emit('nudgeTime', 4)"
          >
            +
          </button>
        </div>
        <div
          v-if="showPitchZoom"
          class="zoom-axis"
          role="group"
          aria-label="Vertical zoom"
        >
          <button
            type="button"
            class="zoom-btn"
            aria-label="Zoom out pitch"
            :title="tagRollTip('Shorter cells (pitch)')"
            @click="emit('nudgePitch', -1)"
          >
            −
          </button>
          <span class="zoom-lbl" title="Pitch zoom">H</span>
          <button
            type="button"
            class="zoom-btn"
            aria-label="Zoom in pitch"
            :title="tagRollTip('Taller cells (pitch)')"
            @click="emit('nudgePitch', 1)"
          >
            +
          </button>
        </div>
      </div>
    </div>

    <div class="transport" role="group" aria-label="Transport">
      <button
        type="button"
        class="tr-btn"
        :title="tipByShortcutId('return-zero', 'Go to beginning')"
        aria-label="Go to beginning"
        @click="emit('beginning')"
      >
        <font-awesome-icon :icon="['fas', 'backward-step']" class="tr-ico" aria-hidden="true" />
      </button>
      <button
        type="button"
        class="tr-btn"
        :title="tagRollTip('Previous measure')"
        aria-label="Previous measure"
        @click="emit('prevMeasure')"
      >
        <font-awesome-icon :icon="['fas', 'backward-fast']" class="tr-ico" aria-hidden="true" />
      </button>
      <button
        type="button"
        class="tr-btn"
        :title="tagRollTip('Return to playback start')"
        aria-label="Return to playback start"
        @click="emit('returnOrigin')"
      >
        <font-awesome-icon :icon="['fas', 'rotate-left']" class="tr-ico" aria-hidden="true" />
      </button>
      <button
        type="button"
        class="tr-btn primary"
        :title="
          props.playing
            ? tipByShortcutId('pause-enter', 'Pause in place')
            : tipByShortcutId('play-pause', 'Play')
        "
        :aria-label="props.playing ? 'Pause' : 'Play'"
        @click="emit('playPause')"
      >
        <font-awesome-icon
          :icon="props.playing ? ['fas', 'pause'] : ['fas', 'play']"
          class="tr-ico"
          aria-hidden="true"
        />
      </button>
      <button
        type="button"
        class="tr-btn"
        :title="tipByShortcutId('stop', 'Stop — return to playback start')"
        aria-label="Stop"
        @click="emit('stop')"
      >
        <font-awesome-icon :icon="['fas', 'stop']" class="tr-ico" aria-hidden="true" />
      </button>
      <button
        type="button"
        class="tr-btn"
        :title="tagRollTip('Next measure')"
        aria-label="Next measure"
        @click="emit('nextMeasure')"
      >
        <font-awesome-icon :icon="['fas', 'forward-fast']" class="tr-ico" aria-hidden="true" />
      </button>
    </div>

    <div class="side right">
      <div class="parts" role="group" aria-label="Active part">
        <div v-for="part in project.parts" :key="part.id" class="chip-wrap">
          <button
            type="button"
            class="chip"
            :class="{ on: project.view.activePartId === part.id }"
            :style="{ '--part': part.color }"
            :title="partTitle(part)"
            @click="store.setActivePart(part.id)"
          >
            <span class="chip-name">{{ part.name }}</span>
            <kbd v-if="displayHotkeyForPart(part)" class="chip-key">{{
              displayHotkeyForPart(part)
            }}</kbd>
          </button>
          <div class="chip-ms" role="group" :aria-label="`${part.name} mute solo`">
            <button
              type="button"
              class="ms"
              :class="{ on: partMix(part.id).mute }"
              :aria-pressed="partMix(part.id).mute"
              :title="tagRollTip(`${part.name} mute`)"
              @click="toggleMute(part.id, $event)"
            >
              M
            </button>
            <button
              type="button"
              class="ms"
              :class="{ on: partMix(part.id).solo }"
              :aria-pressed="partMix(part.id).solo"
              :title="tagRollTip(`${part.name} solo`)"
              @click="toggleSolo(part.id, $event)"
            >
              S
            </button>
          </div>
        </div>
        <button
          type="button"
          class="part-btn"
          :title="tipByShortcutId('part-cycle', 'Next part')"
          @click="store.cycleActivePart(1)"
        >
          Next
        </button>
        <button
          v-if="!isView"
          type="button"
          class="part-btn ghost"
          :title="tagRollTip('Edit parts')"
          @click="emit('parts')"
        >
          Parts…
        </button>
        <button
          v-if="!isView"
          type="button"
          class="part-btn"
          :class="{ on: project.view.focusActivePart }"
          :title="tagRollTip('Only edit the current part — others show as ghosts but still play')"
          :aria-pressed="project.view.focusActivePart"
          @click="store.setFocusActivePart(!project.view.focusActivePart)"
        >
          Current only
        </button>
      </div>
      <span class="ph" :title="tagRollTip('Playhead')">{{ playheadLabel }}</span>
      <span v-if="statusLine" class="status">{{ statusLine }}</span>
    </div>
  </div>
</template>

<style scoped>
.media-bar {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) auto minmax(0, 1.4fr);
  align-items: center;
  gap: 0.45rem 0.65rem;
  flex: 0 0 auto;
  padding: 0.45rem 0.75rem calc(0.45rem + env(safe-area-inset-bottom, 0));
  border-top: 1px solid var(--border);
  background: color-mix(in srgb, var(--surface) 92%, var(--bg, var(--surface)));
}
.side {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  min-width: 0;
}
.side.left {
  justify-content: flex-start;
  flex-wrap: wrap;
}
.side.right {
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 0.35rem 0.55rem;
}
.zoom {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  margin-left: 0.15rem;
  padding-left: 0.45rem;
  border-left: 1px solid var(--border);
}
.zoom-axis {
  display: inline-flex;
  align-items: center;
  gap: 0.1rem;
  padding: 0.1rem;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: color-mix(in srgb, var(--bg, var(--surface)) 55%, var(--surface));
}
.zoom-lbl {
  min-width: 0.9rem;
  text-align: center;
  font-size: 0.62rem;
  font-weight: 750;
  letter-spacing: 0.04em;
  color: var(--muted);
  user-select: none;
}
.zoom-btn {
  min-width: 1.55rem;
  min-height: 1.55rem;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: 0.85rem;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
}
.zoom-btn:hover {
  background: color-mix(in srgb, var(--accent) 12%, transparent);
}
.parts {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.25rem;
  min-width: 0;
}
.chip-wrap {
  display: inline-flex;
  align-items: stretch;
  border-radius: 8px;
  border: 1px solid var(--border);
  overflow: hidden;
  background: var(--surface);
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  min-height: 30px;
  padding: 0.1rem 0.45rem;
  border: none;
  background: color-mix(in srgb, var(--part, var(--accent)) 14%, var(--surface));
  color: var(--text);
  font: inherit;
  font-size: 0.78rem;
  font-weight: 650;
  cursor: pointer;
}
.chip.on {
  background: color-mix(in srgb, var(--part, var(--accent)) 28%, var(--surface));
  box-shadow: inset 0 -2px 0 var(--part, var(--accent));
}
.chip-name {
  max-width: 4.2rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.chip-key {
  font-size: 0.65rem;
  font-weight: 700;
  padding: 0.05rem 0.22rem;
  border-radius: 4px;
  border: 1px solid var(--border);
  background: var(--bg, var(--surface));
  color: var(--muted);
}
.chip-ms {
  display: inline-flex;
  border-left: 1px solid var(--border);
}
.ms {
  min-width: 1.35rem;
  min-height: 30px;
  padding: 0;
  border: none;
  border-left: 1px solid transparent;
  background: transparent;
  color: var(--muted);
  font: inherit;
  font-size: 0.68rem;
  font-weight: 750;
  cursor: pointer;
}
.ms + .ms {
  border-left-color: var(--border);
}
.ms.on {
  color: var(--text);
  background: color-mix(in srgb, var(--accent) 18%, var(--surface));
}
.part-btn {
  min-height: 30px;
  padding: 0.1rem 0.45rem;
  border-radius: 7px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 0.76rem;
  font-weight: 650;
  cursor: pointer;
  white-space: nowrap;
}
.part-btn.ghost {
  background: transparent;
  color: var(--muted);
}
.part-btn.on {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 14%, var(--surface));
}
.link-btn {
  min-height: 34px;
  padding: 0.2rem 0.6rem;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 0.84rem;
  font-weight: 650;
  cursor: pointer;
}
.link-btn.on {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 16%, var(--surface));
}
.sound-wrap {
  position: relative;
}
.sound-pop {
  position: absolute;
  left: 0;
  bottom: calc(100% + 8px);
  z-index: 40;
  width: min(18rem, 80vw);
  display: grid;
  gap: 0.45rem;
  padding: 0.65rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
  box-shadow: 0 10px 28px color-mix(in srgb, #000 16%, transparent);
}
.view-hint {
  margin: 0;
  font-size: 0.78rem;
  color: var(--muted);
}
.field {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}
.field.wide {
  display: grid;
  grid-template-columns: 3.2rem 1fr auto;
  align-items: center;
  gap: 0.35rem;
}
.lbl {
  font-size: 0.68rem;
  font-weight: 700;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.sel {
  flex: 1;
  min-height: 34px;
  padding: 0.2rem 0.4rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg, var(--surface));
  color: var(--text);
  font: inherit;
}
.range {
  width: 100%;
  accent-color: var(--accent);
}
.val {
  font-size: 0.75rem;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
  color: var(--muted);
  min-width: 2.6rem;
  text-align: right;
}
.chk {
  width: 1.05rem;
  height: 1.05rem;
  accent-color: var(--accent);
}
.transport {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
}
.tr-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 2.55rem;
  min-height: 2.55rem;
  padding: 0.2rem 0.4rem;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  line-height: 1;
  cursor: pointer;
}
.tr-ico {
  width: 0.95rem;
  height: 0.95rem;
}
.tr-btn.primary {
  min-width: 3rem;
  min-height: 2.85rem;
  border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
  background: color-mix(in srgb, var(--accent) 16%, var(--surface));
  color: var(--accent);
}
.tr-btn.primary .tr-ico {
  width: 1.1rem;
  height: 1.1rem;
}
.tr-btn:active {
  transform: translateY(1px);
}
.ph {
  font-size: 0.9rem;
  font-weight: 750;
  font-variant-numeric: tabular-nums;
  color: var(--text);
}
.status {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 14rem;
}
@media (max-width: 720px) {
  .media-bar {
    grid-template-columns: 1fr;
    justify-items: center;
  }
  .side.left,
  .side.right {
    justify-content: center;
    width: 100%;
  }
}
</style>
