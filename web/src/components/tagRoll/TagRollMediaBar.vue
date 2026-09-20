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
  mixerOpen?: boolean
}>()

const emit = defineEmits<{
  beginning: []
  prevMeasure: []
  nextMeasure: []
  returnOrigin: []
  playPause: []
  stop: []
  hearStack: []
  mixer: []
  nudgeTime: [delta: number]
  nudgePitch: [delta: number]
}>()

const store = useTagRollStore()
const prefs = usePreferencesStore()
const project = computed(() => store.current)
const isView = computed(() => project.value?.view.mode === 'view')
const mixerOpen = computed(() => !!props.mixerOpen)
const showPitchZoom = computed(() => {
  const p = project.value
  if (!p) return false
  return !(p.view.mode === 'view' && p.view.scoreSurface === 'sheet')
})

/** Max part chips visible before carousel arrows appear. */
const PART_PAGE_SIZE = 6
const PART_COL_SIZE = 2

/** TTBB-first order, then any custom / extra parts in project order. */
const orderedParts = computed(() => {
  const parts = project.value?.parts ?? []
  const used = new Set<string>()
  const out: typeof parts = []
  for (const name of ['tenor', 'lead', 'bari', 'bass'] as const) {
    const hit = parts.find((p) => p.name.toLowerCase() === name)
    if (hit) {
      out.push(hit)
      used.add(hit.id)
    }
  }
  for (const p of parts) {
    if (!used.has(p.id)) out.push(p)
  }
  return out
})

const showPartCarousel = computed(() => orderedParts.value.length > PART_PAGE_SIZE)
const maxPartPage = computed(() =>
  Math.max(0, orderedParts.value.length - PART_PAGE_SIZE),
)

/** Index into orderedParts for the left edge of the visible window (even-aligned). */
const partPage = ref(0)

function clampPartPage(raw: number): number {
  const max = maxPartPage.value
  let next = Math.max(0, Math.min(max, raw))
  // Keep columns paired (2 stacked chips).
  next -= next % PART_COL_SIZE
  if (next > max) next = Math.max(0, max - (max % PART_COL_SIZE))
  return next
}

function shiftPartPage(dir: -1 | 1): void {
  partPage.value = clampPartPage(partPage.value + dir * PART_COL_SIZE)
}

const visibleParts = computed(() => {
  const all = orderedParts.value
  if (all.length <= PART_PAGE_SIZE) return all
  const start = clampPartPage(partPage.value)
  return all.slice(start, start + PART_PAGE_SIZE)
})

/** Stacked pairs: [Tenor, Lead], [Bari, Bass], then custom pairs. */
const partColumns = computed(() => {
  const parts = visibleParts.value
  const cols: (typeof parts)[] = []
  for (let i = 0; i < parts.length; i += PART_COL_SIZE) {
    cols.push(parts.slice(i, i + PART_COL_SIZE))
  }
  return cols
})

const canPartPrev = computed(() => showPartCarousel.value && partPage.value > 0)
const canPartNext = computed(
  () => showPartCarousel.value && partPage.value < maxPartPage.value,
)

watch(
  () => orderedParts.value.map((p) => p.id).join(','),
  () => {
    partPage.value = clampPartPage(partPage.value)
  },
)

/** Keep the active part in the carousel window (e.g. after C / hotkey). */
watch(
  () => project.value?.view.activePartId,
  (id) => {
    if (!id || !showPartCarousel.value) return
    const idx = orderedParts.value.findIndex((p) => p.id === id)
    if (idx < 0) return
    const start = clampPartPage(partPage.value)
    if (idx >= start && idx < start + PART_PAGE_SIZE) return
    let page = idx - (idx % PART_COL_SIZE)
    if (page + PART_PAGE_SIZE > orderedParts.value.length) {
      page = clampPartPage(orderedParts.value.length - PART_PAGE_SIZE)
    }
    partPage.value = page
  },
)

const soundOpen = ref(false)
const soundWrap = ref<HTMLElement | null>(null)
const pitchSoundChoices = ref(listPitchPipeSoundChoices())

const keyChoices = MAJOR_KEY_CHOICES

function partTitle(part: { name: string; hotkey?: string }): string {
  const hk = displayHotkeyForPart(part as never)
  return tagRollTip(`Select ${part.name}`, hk)
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

function onDocKey(e: KeyboardEvent): void {
  if (e.key !== 'Escape' || !soundOpen.value) return
  e.preventDefault()
  e.stopPropagation()
  soundOpen.value = false
}

watch(soundOpen, (open) => {
  if (open) refreshPitchChoices()
})

onMounted(() => {
  document.addEventListener('pointerdown', onDocPointer, true)
  document.addEventListener('keydown', onDocKey, true)
})
onUnmounted(() => {
  document.removeEventListener('pointerdown', onDocPointer, true)
  document.removeEventListener('keydown', onDocKey, true)
})
</script>

<template>
  <div v-if="project" class="media-bar" role="region" aria-label="Transport and sound">
    <div class="side left">
      <div class="util-stack" role="group" aria-label="Mixer and sound">
        <button
          type="button"
          class="link-btn"
          :class="{ on: mixerOpen }"
          :aria-expanded="mixerOpen"
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
      <button
        type="button"
        class="tr-btn stack"
        :title="tipByShortcutId('hear-stack', 'Play stack')"
        aria-label="Play stack"
        @click="emit('hearStack')"
      >
        <font-awesome-icon :icon="['fas', 'layer-group']" class="tr-ico" aria-hidden="true" />
      </button>
    </div>

    <div class="side right">
      <div class="parts" role="group" aria-label="Active part">
        <button
          v-if="showPartCarousel"
          type="button"
          class="part-nav"
          :disabled="!canPartPrev"
          :title="tagRollTip('Previous parts')"
          aria-label="Previous parts"
          @click="shiftPartPage(-1)"
        >
          <font-awesome-icon :icon="['fas', 'chevron-left']" class="nav-ico" aria-hidden="true" />
        </button>
        <div class="part-grid">
          <div
            v-for="(col, ci) in partColumns"
            :key="ci"
            class="part-col"
          >
            <div v-for="part in col" :key="part.id" class="chip-wrap">
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
            </div>
          </div>
        </div>
        <button
          v-if="showPartCarousel"
          type="button"
          class="part-nav"
          :disabled="!canPartNext"
          :title="tagRollTip('More parts')"
          aria-label="More parts"
          @click="shiftPartPage(1)"
        >
          <font-awesome-icon :icon="['fas', 'chevron-right']" class="nav-ico" aria-hidden="true" />
        </button>
        <button
          v-if="!isView"
          type="button"
          class="focus-btn"
          :class="{ on: project.view.focusActivePart }"
          :title="tagRollTip('Only edit the current part — others show as ghosts but still play')"
          :aria-pressed="project.view.focusActivePart"
          aria-label="Current part only"
          @click="store.setFocusActivePart(!project.view.focusActivePart)"
        >
          <font-awesome-icon :icon="['fas', 'eye']" class="focus-ico" aria-hidden="true" />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.media-bar {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 0.45rem 0.75rem;
  flex: 0 0 auto;
  padding: 0.4rem 0.75rem calc(0.4rem + env(safe-area-inset-bottom, 0));
  border-top: 1px solid var(--border);
  background: color-mix(in srgb, var(--surface) 92%, var(--bg, var(--surface)));
}
.side {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  min-width: 0;
}
.side.left {
  justify-content: flex-start;
}
.side.right {
  justify-content: flex-end;
}
.util-stack {
  display: inline-flex;
  flex-direction: column;
  gap: 0.2rem;
}
.zoom {
  display: inline-flex;
  align-items: stretch;
  gap: 0.25rem;
  padding-left: 0.45rem;
  border-left: 1px solid var(--border);
}
.zoom-axis {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 0.05rem;
  padding: 0.1rem;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: color-mix(in srgb, var(--bg, var(--surface)) 55%, var(--surface));
}
.zoom-lbl {
  min-width: 0.9rem;
  text-align: center;
  font-size: 0.58rem;
  font-weight: 750;
  letter-spacing: 0.04em;
  color: var(--muted);
  user-select: none;
  line-height: 1;
}
.zoom-btn {
  min-width: 1.45rem;
  min-height: 1.35rem;
  padding: 0;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: 0.82rem;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
}
.zoom-btn:hover {
  background: color-mix(in srgb, var(--accent) 12%, transparent);
}
.parts {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  min-width: 0;
}
.part-grid {
  display: inline-flex;
  align-items: stretch;
  gap: 0.3rem;
}
.part-col {
  display: inline-flex;
  flex-direction: column;
  gap: 0.2rem;
}
.part-nav {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  align-self: stretch;
  min-width: 1.55rem;
  padding: 0.1rem;
  border-radius: 7px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  cursor: pointer;
}
.part-nav:disabled {
  opacity: 0.35;
  cursor: default;
}
.part-nav:not(:disabled):hover {
  background: color-mix(in srgb, var(--accent) 12%, var(--surface));
}
.nav-ico {
  width: 0.7rem;
  height: 0.7rem;
}
.focus-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  align-self: stretch;
  min-width: 2rem;
  min-height: 2rem;
  padding: 0.2rem;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--muted);
  cursor: pointer;
}
.focus-btn:hover {
  color: var(--text);
  background: color-mix(in srgb, var(--accent) 10%, var(--surface));
}
.focus-btn.on {
  color: var(--accent);
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 14%, var(--surface));
}
.focus-ico {
  width: 0.95rem;
  height: 0.95rem;
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
  gap: 0.22rem;
  min-height: 26px;
  min-width: 4.2rem;
  padding: 0.05rem 0.4rem;
  border: none;
  background: color-mix(in srgb, var(--part, var(--accent)) 14%, var(--surface));
  color: var(--text);
  font: inherit;
  font-size: 0.74rem;
  font-weight: 650;
  cursor: pointer;
}
.chip.on {
  background: color-mix(in srgb, var(--part, var(--accent)) 28%, var(--surface));
  box-shadow: inset 0 -2px 0 var(--part, var(--accent));
}
.chip-name {
  max-width: 3.6rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.chip-key {
  font-size: 0.6rem;
  font-weight: 700;
  padding: 0.02rem 0.18rem;
  border-radius: 3px;
  border: 1px solid var(--border);
  background: var(--bg, var(--surface));
  color: var(--muted);
}
.link-btn {
  min-height: 28px;
  min-width: 3.6rem;
  padding: 0.15rem 0.5rem;
  border-radius: 7px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 0.78rem;
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
.tr-btn.stack {
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
  background: color-mix(in srgb, var(--accent) 14%, var(--surface));
  color: var(--accent);
}
.tr-btn:active {
  transform: translateY(1px);
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
