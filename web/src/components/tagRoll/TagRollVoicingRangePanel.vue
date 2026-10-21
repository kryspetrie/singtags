<script setup lang="ts">
/**
 * Visual ensemble ranges beside the piano tote — drag part bands, center, max span.
 * Scroll-locked to the roll / tote pitch grid. Global arranging tool (not Optimize-only).
 * Part labels + settings float over the top of the strip (not cramped into the ruler band).
 */
import { computed, nextTick, onMounted, onUnmounted, ref, shallowRef } from 'vue'
import {
  VOICING_PART_IDS,
  voicingProfileFromPreset,
  withCustomVoicingProfile,
  type VoicingPartId,
  type VoicingPresetId,
  type VoicingProfile,
} from '../../domain/arranging/voicingProfile'
import { midiPitchLabel } from '../../lib/tagRoll/keySignature'
import { midiToY, yToMidi } from '../../lib/tagRoll/normalize'
import {
  TAG_ROLL_MIDI_MAX,
  TAG_ROLL_MIDI_MIN,
  type TagRollProject,
} from '../../lib/tagRoll/types'
import { tagRollTip } from '../../lib/tagRoll/shortcuts'
import { usePreferencesStore } from '../../stores/preferences'

const props = defineProps<{
  project: TagRollProject
  viewportHeight: number
  headerBandH: number
}>()

const prefs = usePreferencesStore()

const PART_META: Record<
  VoicingPartId,
  { label: string; short: string; color: string }
> = {
  bass: { label: 'Bass', short: 'Bs', color: '#5b3d8f' },
  bari: { label: 'Bari', short: 'Br', color: '#2f7d4a' },
  lead: { label: 'Lead', short: 'Ld', color: '#b8860b' },
  tenor: { label: 'Tenor', short: 'Tn', color: '#c45c26' },
}

const rangePresets: { id: Exclude<VoicingPresetId, 'custom'>; label: string }[] = [
  { id: 'ttbb', label: 'TTBB' },
  { id: 'satb', label: 'SATB' },
  { id: 'ssaa', label: 'SSAA' },
]

const profile = computed(
  (): VoicingProfile =>
    prefs.tagRollPathOptimizePrefs.voicingProfile ??
    ({
      presetId: 'ttbb',
      parts: {
        bass: { min: 40, max: 60 },
        bari: { min: 50, max: 69 },
        lead: { min: 50, max: 67 },
        tenor: { min: 58, max: 77 },
      },
      pitchCenter: 60,
      maxOuterSpan: 21,
      allowSpread: false,
    } satisfies VoicingProfile),
)

const voicingPresetId = computed(() => profile.value.presetId ?? 'ttbb')

const cellH = computed(() => props.project.view.cellH)
const scrollY = computed(() => props.project.view.scrollY)
const totalH = computed(
  () => (TAG_ROLL_MIDI_MAX - TAG_ROLL_MIDI_MIN + 1) * cellH.value,
)
const preferFlats = computed(() => props.project.preferFlats)
const filterOn = computed({
  get: () => prefs.tagRollVoicingRangeFilter,
  set: (on: boolean) => prefs.setTagRollVoicingRangeFilter(on),
})

const settingsOpen = ref(false)
const settingsBtnRef = shallowRef<HTMLElement | null>(null)
const settingsMenuPos = ref({ top: '0px', left: '0px' })

type DragKind =
  | { part: VoicingPartId; edge: 'min' | 'max' }
  | { kind: 'center' }
  /** `fixedMidi` = the edge that stays put for the whole gesture. */
  | { kind: 'span'; edge: 'min' | 'max'; fixedMidi: number }
let drag: DragKind | null = null
const dragging = ref(false)
const trackRef = shallowRef<HTMLElement | null>(null)

const SPAN_MIN = 12
const SPAN_MAX = 48

function persist(next: VoicingProfile): void {
  prefs.setTagRollPathOptimizePrefs({ voicingProfile: next })
}

function applyRangePreset(id: Exclude<VoicingPresetId, 'custom'>): void {
  prefs.setTagRollPathOptimizePrefs({ voicingProfile: voicingProfileFromPreset(id) })
}

function placeSettingsMenu(): void {
  const btn = settingsBtnRef.value
  if (!btn) return
  const r = btn.getBoundingClientRect()
  settingsMenuPos.value = {
    top: `${Math.round(r.top)}px`,
    left: `${Math.round(r.right + 6)}px`,
  }
}

function toggleSettings(): void {
  settingsOpen.value = !settingsOpen.value
  if (settingsOpen.value) {
    void nextTick(() => placeSettingsMenu())
  }
}

/**
 * Decode Sp bracket as integer MIDI edges.
 * bot = center − floor(span/2), top = bot + span — lossless for any int span.
 */
function spanEdges(p: VoicingProfile): { top: number; bot: number } {
  const span = Math.min(SPAN_MAX, Math.max(SPAN_MIN, Math.round(p.maxOuterSpan)))
  let bot = p.pitchCenter - Math.floor(span / 2)
  let top = bot + span
  if (bot < TAG_ROLL_MIDI_MIN) {
    bot = TAG_ROLL_MIDI_MIN
    top = bot + span
  }
  if (top > TAG_ROLL_MIDI_MAX) {
    top = TAG_ROLL_MIDI_MAX
    bot = top - span
  }
  return { top, bot }
}

/** Encode edges back so spanEdges() reconstructs the same pair (prefer fixed edge). */
function profileFromSpanEdges(
  top: number,
  bot: number,
  prefer: 'top' | 'bot',
): Pick<VoicingProfile, 'pitchCenter' | 'maxOuterSpan'> {
  let span = Math.round(top - bot)
  span = Math.min(SPAN_MAX, Math.max(SPAN_MIN, span))
  let nextTop = top
  let nextBot = bot
  if (prefer === 'bot') {
    nextBot = Math.max(TAG_ROLL_MIDI_MIN, Math.min(TAG_ROLL_MIDI_MAX - span, bot))
    nextTop = nextBot + span
  } else {
    nextTop = Math.min(TAG_ROLL_MIDI_MAX, Math.max(TAG_ROLL_MIDI_MIN + span, top))
    nextBot = nextTop - span
  }
  return {
    maxOuterSpan: span,
    pitchCenter: nextBot + Math.floor(span / 2),
  }
}

function clientYToContentY(clientY: number, el: HTMLElement): number {
  const rect = el.getBoundingClientRect()
  return clientY - rect.top + scrollY.value
}

function applyDragAtClientY(clientY: number): void {
  if (!drag || !trackRef.value) return
  const y = clientYToContentY(clientY, trackRef.value)
  const midi = yToMidi(y, cellH.value)
  if ('kind' in drag && drag.kind === 'center') {
    persist(withCustomVoicingProfile(profile.value, { pitchCenter: midi }))
    return
  }
  if ('kind' in drag && drag.kind === 'span') {
    if (drag.edge === 'max') {
      // Drag top — bottom stays at fixedMidi for the whole gesture.
      const nextTop = Math.min(
        TAG_ROLL_MIDI_MAX,
        Math.max(midi, drag.fixedMidi + SPAN_MIN),
      )
      persist(
        withCustomVoicingProfile(
          profile.value,
          profileFromSpanEdges(nextTop, drag.fixedMidi, 'bot'),
        ),
      )
    } else {
      // Drag bottom — top stays at fixedMidi.
      const nextBot = Math.max(
        TAG_ROLL_MIDI_MIN,
        Math.min(midi, drag.fixedMidi - SPAN_MIN),
      )
      persist(
        withCustomVoicingProfile(
          profile.value,
          profileFromSpanEdges(drag.fixedMidi, nextBot, 'top'),
        ),
      )
    }
    return
  }
  if (!('part' in drag)) return
  const { part, edge } = drag
  const cur = profile.value.parts[part]
  let min = cur.min
  let max = cur.max
  if (edge === 'min') min = Math.min(midi, max - 1)
  else max = Math.max(midi, min + 1)
  min = Math.max(TAG_ROLL_MIDI_MIN, Math.min(TAG_ROLL_MIDI_MAX, min))
  max = Math.max(TAG_ROLL_MIDI_MIN, Math.min(TAG_ROLL_MIDI_MAX, max))
  persist(
    withCustomVoicingProfile(profile.value, {
      parts: { ...profile.value.parts, [part]: { min, max } },
    }),
  )
}

function onWindowMove(e: PointerEvent): void {
  applyDragAtClientY(e.clientY)
}

function endDrag(): void {
  drag = null
  dragging.value = false
  window.removeEventListener('pointermove', onWindowMove)
  window.removeEventListener('pointerup', endDrag)
  window.removeEventListener('pointercancel', endDrag)
}

function beginDrag(next: DragKind): void {
  drag = next
  dragging.value = true
  settingsOpen.value = false
  window.addEventListener('pointermove', onWindowMove)
  window.addEventListener('pointerup', endDrag)
  window.addEventListener('pointercancel', endDrag)
}

function onBandPointerDown(part: VoicingPartId, edge: 'min' | 'max', e: PointerEvent): void {
  if (e.button !== 0) return
  e.preventDefault()
  e.stopPropagation()
  beginDrag({ part, edge })
}

function onCenterPointerDown(e: PointerEvent): void {
  if (e.button !== 0) return
  e.preventDefault()
  e.stopPropagation()
  beginDrag({ kind: 'center' })
}

function onSpanPointerDown(edge: 'min' | 'max', e: PointerEvent): void {
  if (e.button !== 0) return
  e.preventDefault()
  e.stopPropagation()
  const { top, bot } = spanEdges(profile.value)
  beginDrag({
    kind: 'span',
    edge,
    fixedMidi: edge === 'max' ? bot : top,
  })
}

function onTrackPointerDown(e: PointerEvent): void {
  if (e.button !== 0 || drag) return
  beginDrag({ kind: 'center' })
  applyDragAtClientY(e.clientY)
}

function close(): void {
  settingsOpen.value = false
  prefs.setTagRollVoicingRangesOpen(false)
}

function bandStyle(part: VoicingPartId): Record<string, string> {
  const band = profile.value.parts[part]
  const top = midiToY(band.max, cellH.value)
  const bottom = midiToY(band.min, cellH.value) + cellH.value
  return {
    top: `${top}px`,
    height: `${Math.max(cellH.value, bottom - top)}px`,
    '--part': PART_META[part].color,
  }
}

function centerY(): number {
  return midiToY(profile.value.pitchCenter, cellH.value) + cellH.value / 2
}

/** Max outer span as a vertical bracket (top/bottom drag independently). */
function spanStyle(): Record<string, string> {
  const { top: topMidi, bot: botMidi } = spanEdges(profile.value)
  const top = midiToY(topMidi, cellH.value)
  const bottom = midiToY(botMidi, cellH.value) + cellH.value
  return {
    top: `${top}px`,
    height: `${Math.max(cellH.value, bottom - top)}px`,
  }
}

const centerLabel = computed(() =>
  midiPitchLabel(profile.value.pitchCenter, preferFlats.value),
)

function onDocPointer(e: PointerEvent): void {
  if (!settingsOpen.value) return
  const el = e.target as HTMLElement | null
  if (el?.closest?.('.vrp-settings') || el?.closest?.('.vrp-menu-pop')) return
  settingsOpen.value = false
}

function onSettingsScrollOrResize(): void {
  if (settingsOpen.value) placeSettingsMenu()
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocPointer, true)
  window.addEventListener('resize', onSettingsScrollOrResize)
  window.addEventListener('scroll', onSettingsScrollOrResize, true)
})

onUnmounted(() => {
  endDrag()
  document.removeEventListener('pointerdown', onDocPointer, true)
  window.removeEventListener('resize', onSettingsScrollOrResize)
  window.removeEventListener('scroll', onSettingsScrollOrResize, true)
})
</script>

<template>
  <div class="vrp" :class="{ dragging }" aria-label="Ensemble voicing ranges">
    <!-- Align with piano tote ruler; chrome floats over the body instead. -->
    <div
      class="vrp-gutter"
      :style="{ height: `${headerBandH}px` }"
      aria-hidden="true"
    />
    <div class="vrp-body" :style="{ height: `${viewportHeight}px` }">
      <div class="vrp-float" @pointerdown.stop>
        <div class="vrp-float-bar">
          <span class="vrp-title" :title="tagRollTip('Drag bands · click center · drag Sp top/bottom for max span')">
            Ranges
          </span>
          <div class="vrp-float-actions">
            <div class="vrp-settings">
              <button
                ref="settingsBtnRef"
                type="button"
                class="vrp-icon"
                :class="{ on: settingsOpen }"
                :aria-expanded="settingsOpen"
                :title="tagRollTip('Range presets and Suggest filter')"
                aria-label="Range settings"
                @click="toggleSettings"
              >
                ⚙
              </button>
            </div>
            <button
              type="button"
              class="vrp-icon"
              :title="tagRollTip('Close ranges')"
              aria-label="Close ranges"
              @click="close"
            >
              ×
            </button>
          </div>
        </div>
        <div class="vrp-cols" aria-hidden="true">
          <span class="vrp-col-lbl span-lbl">Sp</span>
          <span
            v-for="part in VOICING_PART_IDS"
            :key="part"
            class="vrp-col-lbl"
            :style="{ color: PART_META[part].color }"
          >
            {{ PART_META[part].short }}
          </span>
        </div>
      </div>

      <div
        ref="trackRef"
        class="vrp-track"
        :style="{
          height: `${totalH}px`,
          transform: `translateY(${-scrollY}px)`,
        }"
        @pointerdown="onTrackPointerDown"
      >
        <div class="vrp-lanes">
          <div class="vrp-lane span-lane">
            <div
              class="vrp-span"
              :style="spanStyle()"
              :title="tagRollTip(`Max outer span ${profile.maxOuterSpan} semitones — drag top or bottom independently`)"
            >
              <button
                type="button"
                class="vrp-handle top"
                aria-label="Max span top"
                @pointerdown="onSpanPointerDown('max', $event)"
              />
              <button
                type="button"
                class="vrp-handle bot"
                aria-label="Max span bottom"
                @pointerdown="onSpanPointerDown('min', $event)"
              />
              <span class="vrp-span-n">{{ profile.maxOuterSpan }}</span>
            </div>
          </div>
          <div
            v-for="part in VOICING_PART_IDS"
            :key="part"
            class="vrp-lane"
          >
            <div
              class="vrp-band"
              :style="bandStyle(part)"
              :title="
                tagRollTip(
                  `${PART_META[part].label} ${midiPitchLabel(profile.parts[part].min, preferFlats)}–${midiPitchLabel(profile.parts[part].max, preferFlats)}`,
                )
              "
            >
              <button
                type="button"
                class="vrp-handle top"
                :aria-label="`${PART_META[part].label} top`"
                @pointerdown="onBandPointerDown(part, 'max', $event)"
              />
              <button
                type="button"
                class="vrp-handle bot"
                :aria-label="`${PART_META[part].label} bottom`"
                @pointerdown="onBandPointerDown(part, 'min', $event)"
              />
            </div>
          </div>
        </div>
        <div
          class="vrp-center"
          :style="{ top: `${centerY()}px` }"
          :title="tagRollTip(`Pitch center ${centerLabel}`)"
          @pointerdown="onCenterPointerDown"
        >
          <span class="vrp-center-lbl">{{ centerLabel }}</span>
        </div>
      </div>
    </div>

    <Teleport to="body">
      <div
        v-if="settingsOpen"
        class="vrp-menu-pop"
        role="menu"
        :style="settingsMenuPos"
        @pointerdown.stop
      >
        <p class="vrp-menu-lbl">Preset</p>
        <div class="vrp-preset-row">
          <button
            v-for="p in rangePresets"
            :key="p.id"
            type="button"
            class="vrp-preset"
            :class="{ on: voicingPresetId === p.id }"
            role="menuitemradio"
            :aria-checked="voicingPresetId === p.id"
            @click="applyRangePreset(p.id)"
          >
            {{ p.label }}
          </button>
        </div>
        <label class="vrp-filter">
          <input v-model="filterOn" type="checkbox" />
          Filter Suggest to ranges
        </label>
        <p class="vrp-hint">
          Coach Check flags parts outside these bands.
        </p>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.vrp {
  display: flex;
  flex-direction: column;
  flex: 0 0 auto;
  width: 100px;
  min-height: 0;
  background: color-mix(in srgb, var(--surface, #f4f0e8) 94%, #2a2622);
  border-right: 1px solid #b8b0a4;
  user-select: none;
  touch-action: none;
}
.vrp-gutter {
  flex: 0 0 auto;
  box-sizing: border-box;
  border-bottom: 1px solid var(--border, #cfc7bb);
  background: color-mix(in srgb, var(--surface, #f4f0e8) 92%, transparent);
}
.vrp-body {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
  background: #2a2622;
}
.vrp-float {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 4;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  padding: 0.2rem 0.2rem 0.25rem;
  background: linear-gradient(
    to bottom,
    color-mix(in srgb, #2a2622 92%, transparent) 0%,
    color-mix(in srgb, #2a2622 78%, transparent) 70%,
    transparent 100%
  );
  pointer-events: none;
}
.vrp-float-bar,
.vrp-float-actions,
.vrp-settings,
.vrp-icon {
  pointer-events: auto;
}
.vrp-float-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.15rem;
}
.vrp-title {
  font-size: 0.68rem;
  font-weight: 750;
  letter-spacing: 0.02em;
  color: #f0ebe3;
  text-shadow: 0 1px 2px #0008;
}
.vrp-float-actions {
  display: inline-flex;
  align-items: center;
  gap: 0.05rem;
}
.vrp-settings {
  position: relative;
}
.vrp-icon {
  margin: 0;
  min-width: 1.35rem;
  min-height: 1.35rem;
  padding: 0 0.15rem;
  border: 1px solid color-mix(in srgb, #f0ebe3 28%, transparent);
  border-radius: 5px;
  background: color-mix(in srgb, #2a2622 72%, transparent);
  font: inherit;
  font-size: 0.85rem;
  line-height: 1;
  cursor: pointer;
  color: #f0ebe3;
}
.vrp-icon.on,
.vrp-icon:hover {
  border-color: color-mix(in srgb, var(--accent, #c45c26) 55%, #f0ebe3);
  background: color-mix(in srgb, var(--accent, #c45c26) 28%, #2a2622);
}
.vrp-cols {
  display: grid;
  grid-template-columns: 1fr repeat(4, 1fr);
  gap: 2px;
  pointer-events: none;
}
.vrp-col-lbl {
  font-size: 0.58rem;
  font-weight: 750;
  text-align: center;
  line-height: 1.1;
  text-shadow: 0 1px 2px #000a;
}
.vrp-col-lbl.span-lbl {
  color: color-mix(in srgb, #f0ebe3 75%, transparent);
}
.vrp-track {
  position: relative;
  width: 100%;
  will-change: transform;
  cursor: crosshair;
}
.vrp-lanes {
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-columns: 1fr repeat(4, 1fr);
  gap: 2px;
  padding: 0 2px;
  box-sizing: border-box;
}
.vrp-lane {
  position: relative;
  min-width: 0;
}
.vrp-band,
.vrp-span {
  position: absolute;
  left: 1px;
  right: 1px;
  border-radius: 3px;
}
.vrp-band {
  background: color-mix(in srgb, var(--part) 42%, transparent);
  border: 1px solid color-mix(in srgb, var(--part) 75%, #fff);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--part) 25%, transparent);
}
.vrp-span {
  z-index: 3;
  background: color-mix(in srgb, #f0ebe3 12%, transparent);
  border: 1px dashed color-mix(in srgb, #f0ebe3 55%, transparent);
}
.vrp-span-n {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  font-size: 0.55rem;
  font-weight: 750;
  color: #f0ebe3;
  pointer-events: none;
}
.vrp-handle {
  position: absolute;
  left: -1px;
  right: -1px;
  height: 10px;
  margin: 0;
  padding: 0;
  border: none;
  border-radius: 2px;
  background: var(--part, #c4b8a8);
  cursor: ns-resize;
  opacity: 0.92;
  z-index: 4;
}
.vrp-span .vrp-handle {
  background: #c4b8a8;
}
.vrp-handle.top {
  top: -5px;
}
.vrp-handle.bot {
  bottom: -5px;
}
.vrp-handle:hover,
.vrp.dragging .vrp-handle:active {
  opacity: 1;
  filter: brightness(1.1);
}
.vrp-center {
  position: absolute;
  left: 18%;
  right: 0;
  z-index: 1;
  height: 0;
  border-top: 2px dashed color-mix(in srgb, #f0ebe3 70%, #c45c26);
  cursor: ns-resize;
  pointer-events: auto;
}
.vrp-center-lbl {
  position: absolute;
  right: 2px;
  top: -0.85rem;
  font-size: 0.58rem;
  font-weight: 700;
  color: #f0ebe3;
  background: color-mix(in srgb, #2a2622 80%, transparent);
  padding: 0 0.15rem;
  border-radius: 2px;
  pointer-events: none;
}
</style>

<style>
/* Teleported beside the Ranges strip — must sit above the roll. */
.vrp-menu-pop {
  position: fixed;
  z-index: 80;
  min-width: 10rem;
  display: grid;
  gap: 0.3rem;
  padding: 0.45rem 0.5rem;
  border: 1px solid color-mix(in srgb, #f0ebe3 22%, #2a2622);
  border-radius: 8px;
  background: color-mix(in srgb, #2a2622 97%, #000);
  box-shadow: 0 10px 28px #0008;
  color: #f0ebe3;
}
.vrp-menu-pop .vrp-menu-lbl {
  margin: 0;
  font-size: 0.62rem;
  font-weight: 700;
  color: color-mix(in srgb, #f0ebe3 70%, transparent);
}
.vrp-menu-pop .vrp-preset-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.2rem;
}
.vrp-menu-pop .vrp-preset {
  margin: 0;
  min-height: 1.5rem;
  padding: 0.1rem 0.35rem;
  border: 1px solid color-mix(in srgb, #f0ebe3 28%, transparent);
  border-radius: 5px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 0.68rem;
  font-weight: 650;
  cursor: pointer;
}
.vrp-menu-pop .vrp-preset.on,
.vrp-menu-pop .vrp-preset:hover {
  border-color: color-mix(in srgb, #c45c26 60%, #f0ebe3);
  background: color-mix(in srgb, #c45c26 24%, transparent);
}
.vrp-menu-pop .vrp-filter {
  display: flex;
  align-items: flex-start;
  gap: 0.3rem;
  font-size: 0.65rem;
  font-weight: 650;
  line-height: 1.25;
  cursor: pointer;
}
.vrp-menu-pop .vrp-hint {
  margin: 0;
  font-size: 0.6rem;
  color: color-mix(in srgb, #f0ebe3 65%, transparent);
  line-height: 1.3;
}
</style>
