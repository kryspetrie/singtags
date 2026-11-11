/**
 * 10-foot / Rehearsal Glance — one visual language for Tune · Chord · FFT · Spec.
 * Hero wash + huge word on every surface; charts are full-bleed (no inset cards).
 */
<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import type { ChordStackScore } from '../../domain/tuner/chordStack'
import type { ChordToneRow } from '../../composables/useTunerChordSession'
import {
  analyzeGlanceStatus,
  chordGlanceStatus,
  tuneGlanceStatus,
} from '../../domain/tuner/glanceStatus'
import {
  noteDisplayPartsFromMidi,
  preferFlatsForKeyPc,
} from '../../domain/tuner/noteDisplayParts'
import type { FftSpectrumView } from '../../audio/tuner/fftPeaks'
import type { SpectrogramRing } from '../../audio/tuner/spectrogramRing'
import type { SpectrogramTrack } from '../../audio/tuner/spectrogramTracks'
import type { DigitalTunerPrefs } from '../../lib/preferences/digitalTuner'
import { acquireWakeLock, releaseWakeLock } from '../../lib/wakeLock'
import TunerFftView from './TunerFftView.vue'
import TunerSpectrogramView from './TunerSpectrogramView.vue'

const props = defineProps<{
  surface: DigitalTunerPrefs['analyzeSurface']
  cents: number | null
  inTune: boolean
  displayMidi: number | null
  keyPc: number
  level: number
  score: ChordStackScore | null
  rows: ChordToneRow[]
  spectrum: FftSpectrumView | null
  fftPaused: boolean
  prefs: DigitalTunerPrefs
  specRing: SpectrogramRing
  specTracks: SpectrogramTrack[]
  specPaintGen: number
  specPaused: boolean
}>()

const emit = defineEmits<{
  exit: []
  setSurface: [DigitalTunerPrefs['analyzeSurface']]
  toggleFftPause: []
  toggleSpecPause: []
  clearSpec: []
  patch: [Partial<DigitalTunerPrefs>]
}>()

const TABS = [
  { id: 'hidden' as const, label: 'Tune' },
  { id: 'chord' as const, label: 'Chord' },
  { id: 'fft' as const, label: 'FFT' },
  { id: 'spectrogram' as const, label: 'Spec' },
]

const tuneStatus = computed(() => tuneGlanceStatus(props.cents, props.inTune))
const chordStatus = computed(() => chordGlanceStatus(props.score))

const fftPeaks = computed(() =>
  [...(props.spectrum?.peaks ?? [])].sort((a, b) => a.hz - b.hz).slice(0, 4),
)

const heldTracks = computed(() => props.specTracks.filter((t) => t.held && t.label).slice(0, 4))

const fftStatus = computed(() =>
  analyzeGlanceStatus({
    paused: props.fftPaused,
    hasSignal: fftPeaks.value.length > 0,
    heldOrStrong: false,
    detail:
      fftPeaks.value.length > 0
        ? `${fftPeaks.value.length} peak${fftPeaks.value.length === 1 ? '' : 's'}`
        : null,
  }),
)

const specStatus = computed(() =>
  analyzeGlanceStatus({
    paused: props.specPaused,
    hasSignal: props.specRing.columns.length > 0,
    heldOrStrong: heldTracks.value.length > 0,
    detail:
      heldTracks.value.length > 0
        ? `${heldTracks.value.length} held`
        : props.specRing.columns.length > 0
          ? 'scrolling'
          : null,
  }),
)

const hero = computed(() => {
  if (props.surface === 'hidden') {
    return { word: tuneStatus.value.word, keyMark: null as string | null, detail: null as string | null }
  }
  if (props.surface === 'chord') {
    return {
      word: chordStatus.value.word,
      keyMark: chordStatus.value.keyMark ? `KEY ${chordStatus.value.keyMark}` : null,
      detail: null,
    }
  }
  if (props.surface === 'fft') {
    return { word: fftStatus.value.word, keyMark: null, detail: fftStatus.value.detail }
  }
  if (props.surface === 'spectrogram') {
    return { word: specStatus.value.word, keyMark: null, detail: specStatus.value.detail }
  }
  // Detail-only / unexpected — neutral until enterGlance remaps.
  return { word: 'WAIT', keyMark: null, detail: null }
})

const wash = computed(() => {
  if (props.surface === 'hidden') return tuneStatus.value.wash
  if (props.surface === 'chord') return chordStatus.value.wash
  if (props.surface === 'fft') return fftStatus.value.wash
  if (props.surface === 'spectrogram') return specStatus.value.wash
  return 'neutral' as const
})

const noteParts = computed(() => {
  if (props.displayMidi == null) return null
  return noteDisplayPartsFromMidi(props.displayMidi, preferFlatsForKeyPc(props.keyPc))
})

function chipLabel(raw: string): string {
  return raw.replace('#', '♯').replace('b', '♭').replace(/\d+$/, '')
}

const exitBtnRef = ref<HTMLButtonElement | null>(null)
let priorFocus: HTMLElement | null = null

onMounted(() => {
  const active = document.activeElement
  priorFocus = active instanceof HTMLElement ? active : null
  void acquireWakeLock('tuner')
  void nextTick(() => exitBtnRef.value?.focus())
})

onUnmounted(() => {
  void releaseWakeLock('tuner')
  if (priorFocus && document.contains(priorFocus)) {
    priorFocus.focus()
  }
  priorFocus = null
})
</script>

<template>
  <div
    class="glance"
    :data-wash="wash"
    role="dialog"
    aria-modal="true"
    aria-label="Tuner 10-foot view"
  >
    <header class="bar">
      <button ref="exitBtnRef" type="button" class="exit" @click="emit('exit')">Exit</button>
      <div class="tabs" role="tablist" aria-label="Glance surface">
        <button
          v-for="t in TABS"
          :key="t.id"
          type="button"
          role="tab"
          class="tab"
          :class="{ on: surface === t.id }"
          :aria-selected="surface === t.id"
          @click="emit('setSurface', t.id)"
        >
          {{ t.label }}
        </button>
      </div>
      <p class="tag">10-ft</p>
    </header>

    <div class="stage" :data-surface="surface">
      <header class="hero" aria-live="polite">
        <p class="word">
          {{ hero.word }}
          <span v-if="hero.keyMark" class="key-mark">{{ hero.keyMark }}</span>
        </p>
        <p v-if="hero.detail" class="detail">{{ hero.detail }}</p>
      </header>

      <!-- Solo Tune -->
      <section v-if="surface === 'hidden'" class="body tune">
        <p v-if="noteParts" class="note" :aria-label="noteParts.spoken">
          <span class="letter">{{ noteParts.letter }}</span>
          <span class="acc">{{ noteParts.accidentalGlyph || '\u00a0' }}</span>
          <span class="oct">{{ noteParts.octave }}</span>
        </p>
        <p v-else class="note muted">—</p>
      </section>

      <!-- Chord -->
      <section v-else-if="surface === 'chord'" class="body chord">
        <div class="chips" :data-count="Math.min(4, Math.max(1, rows.length))">
          <div
            v-for="row in rows"
            :key="row.slot"
            class="chip"
            :class="{
              ok: row.tone?.glanceMark === 'OK',
              off: row.tone && row.tone.glanceMark !== 'OK',
              live: !row.tone && row.hearing,
              empty: !row.tone && !row.hearing,
            }"
          >
            <span class="chip-note">{{
              chipLabel(row.tone?.note ?? row.hearing?.note ?? '·')
            }}</span>
            <span class="chip-mark">{{
              row.tone?.glanceMark === 'OK'
                ? 'OK'
                : row.tone?.glanceMark === '▲'
                  ? '▲'
                  : row.tone?.glanceMark === '▼'
                    ? '▼'
                    : row.hearing
                      ? '·'
                      : '—'
            }}</span>
          </div>
        </div>
        <p v-if="score?.assistedPinRequired" class="assist">Pin nature/root in Settings</p>
      </section>

      <!-- FFT -->
      <section
        v-else-if="surface === 'fft'"
        class="body analyze"
        :class="{ 'has-chips': fftPeaks.length > 0 }"
      >
        <div class="viz">
          <TunerFftView
            glance
            :spectrum="spectrum"
            :paused="fftPaused"
            :prefs="prefs"
            @toggle-pause="emit('toggleFftPause')"
            @patch="emit('patch', $event)"
          />
        </div>
        <div
          v-if="fftPeaks.length"
          class="chips analyze-chips"
          :data-count="fftPeaks.length"
        >
          <div v-for="p in fftPeaks" :key="Math.round(p.hz)" class="chip ok">
            <span class="chip-note">{{ chipLabel(p.note ?? `${p.hz.toFixed(0)}`) }}</span>
            <span class="chip-mark">{{ p.hz.toFixed(0) }}</span>
          </div>
        </div>
      </section>

      <!-- Spec -->
      <section
        v-else-if="surface === 'spectrogram'"
        class="body analyze"
        :class="{ 'has-chips': heldTracks.length > 0 }"
      >
        <div class="viz">
          <TunerSpectrogramView
            glance
            :ring="specRing"
            :tracks="specTracks"
            :paint-gen="specPaintGen"
            :paused="specPaused"
            :prefs="prefs"
            @toggle-pause="emit('toggleSpecPause')"
            @clear="emit('clearSpec')"
            @patch="emit('patch', $event)"
          />
        </div>
        <div
          v-if="heldTracks.length"
          class="chips analyze-chips"
          :data-count="heldTracks.length"
        >
          <div v-for="t in heldTracks" :key="t.id" class="chip ok">
            <span class="chip-note">{{ chipLabel(t.label ?? '·') }}</span>
            <span class="chip-mark">HELD</span>
          </div>
        </div>
      </section>

      <!-- Detail-only surfaces should be remapped before open; keep a safe empty body. -->
      <section v-else class="body tune" aria-live="polite">
        <p class="note muted">—</p>
      </section>

      <div class="level" aria-hidden="true">
        <div class="level-fill" :style="{ width: `${Math.round(level * 100)}%` }" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.glance {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  width: 100%;
  height: 100dvh;
  max-height: 100dvh;
  overflow: hidden;
  box-sizing: border-box;
  padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom)
    env(safe-area-inset-left);
  color: var(--text);
  background: var(--bg);
}
@supports (height: 100svh) {
  .glance {
    height: 100svh;
    max-height: 100svh;
  }
}
.glance[data-wash='good'] {
  background:
    repeating-linear-gradient(
      -28deg,
      transparent 0 10px,
      color-mix(in srgb, var(--accent) 14%, transparent) 10px 14px
    ),
    color-mix(in srgb, var(--accent) 28%, var(--bg));
}
.glance[data-wash='sharp'] {
  background:
    repeating-linear-gradient(
      -28deg,
      transparent 0 10px,
      color-mix(in srgb, #c45c26 16%, transparent) 10px 14px
    ),
    color-mix(in srgb, #c45c26 26%, var(--bg));
}
.glance[data-wash='flat'] {
  background:
    repeating-linear-gradient(
      -28deg,
      transparent 0 10px,
      color-mix(in srgb, #2a5f9e 16%, transparent) 10px 14px
    ),
    color-mix(in srgb, #2a5f9e 26%, var(--bg));
}
.glance[data-wash='shifted'] {
  background:
    repeating-linear-gradient(
      -28deg,
      transparent 0 10px,
      color-mix(in srgb, #c9a227 18%, transparent) 10px 14px
    ),
    color-mix(in srgb, #c9a227 30%, var(--bg));
}
.glance[data-wash='fault'] {
  background:
    repeating-linear-gradient(
      -28deg,
      transparent 0 10px,
      color-mix(in srgb, var(--danger) 16%, transparent) 10px 14px
    ),
    color-mix(in srgb, var(--danger) 26%, var(--bg));
}
.glance[data-wash='neutral'] {
  background: color-mix(in srgb, var(--muted) 14%, var(--bg));
}

.bar {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.5rem;
  padding: 0.45rem 0.65rem;
  border-bottom: 2px solid color-mix(in srgb, var(--text) 18%, transparent);
}
.exit {
  min-height: 48px;
  min-width: 4.75rem;
  padding: 0.4rem 0.85rem;
  border-radius: 10px;
  border: 2px solid var(--text);
  background: color-mix(in srgb, var(--surface) 88%, transparent);
  color: var(--text);
  font: inherit;
  font-weight: 750;
  font-size: 1rem;
  cursor: pointer;
}
.tabs {
  display: flex;
  flex-wrap: nowrap;
  justify-content: center;
  gap: 0.3rem;
  min-width: 0;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
}
.tabs::-webkit-scrollbar {
  display: none;
}
.tab {
  flex: 0 0 auto;
  min-height: 40px;
  padding: 0.3rem 0.75rem;
  border-radius: 10px;
  border: 2px solid color-mix(in srgb, var(--text) 28%, transparent);
  background: transparent;
  color: var(--text);
  font: inherit;
  font-weight: 700;
  font-size: 0.95rem;
  cursor: pointer;
}
.tab.on {
  background: var(--text);
  color: var(--bg);
  border-color: var(--text);
}
.tag {
  margin: 0;
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  opacity: 0.7;
  white-space: nowrap;
}

.stage {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  min-height: 0;
  gap: 0.5rem;
  padding: 0.5rem 0.7rem 0.65rem;
}
.hero {
  display: grid;
  justify-items: center;
  gap: 0.15rem;
  text-align: center;
}
.word {
  margin: 0;
  font-family: var(--font-display);
  font-size: clamp(1.75rem, min(10vw, 12vh), 5.5rem);
  font-weight: 800;
  letter-spacing: 0.02em;
  line-height: 0.95;
  text-shadow: 0 1px 0 color-mix(in srgb, var(--bg) 40%, transparent);
}
.key-mark {
  display: block;
  margin-top: 0.2rem;
  font-size: 0.42em;
  letter-spacing: 0.06em;
}
.detail {
  margin: 0;
  font-family: var(--font-display);
  font-size: clamp(0.95rem, min(3.2vw, 3.8vh), 1.6rem);
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  opacity: 0.8;
}

.body {
  display: grid;
  min-height: 0;
  align-content: center;
  justify-items: center;
  gap: 0.65rem;
}
.body.analyze {
  grid-template-rows: minmax(0, 1fr);
  align-content: stretch;
  width: 100%;
  max-width: min(72rem, 100%);
  margin: 0 auto;
}
.body.analyze.has-chips {
  grid-template-rows: minmax(0, 1fr) auto;
}
.viz {
  min-height: 0;
  width: 100%;
  display: grid;
}
.viz :deep(.fft),
.viz :deep(.spec) {
  height: 100%;
  min-height: 0;
}

.note {
  margin: 0;
  display: flex;
  align-items: baseline;
  gap: 0.15rem;
  font-family: var(--font-display);
  font-size: clamp(2rem, min(10vw, 14vh), 5rem);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.note.muted {
  opacity: 0.45;
}
.acc {
  min-width: 0.7em;
  text-align: center;
}
.oct {
  font-size: 0.55em;
  opacity: 0.75;
}

.chips {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.5rem;
  width: min(56rem, 94vw);
}
.chips[data-count='1'] {
  grid-template-columns: minmax(0, 12rem);
  justify-content: center;
}
.chips[data-count='2'] {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.chips[data-count='3'] {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
.chip {
  display: grid;
  place-content: center;
  gap: 0.2rem;
  min-height: clamp(4.25rem, 16vmin, 8.5rem);
  border-radius: 14px;
  border: 3px solid color-mix(in srgb, var(--text) 35%, transparent);
  background: color-mix(in srgb, var(--surface) 72%, transparent);
  text-align: center;
}
.analyze-chips .chip {
  min-height: clamp(2.5rem, 9vmin, 4.25rem);
  border-width: 2px;
  border-radius: 10px;
}
.chip.ok {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 22%, var(--surface));
}
.chip.off {
  border-color: var(--danger);
  background: color-mix(in srgb, var(--danger) 18%, var(--surface));
}
.chip.live {
  border-style: dashed;
}
.chip.empty {
  opacity: 0.4;
}
.chip-note {
  font-family: var(--font-display);
  font-size: clamp(1.35rem, 5vw, 2.75rem);
  font-weight: 800;
}
.analyze-chips .chip-note {
  font-size: clamp(1.05rem, 3.4vw, 1.85rem);
}
.chip-mark {
  font-size: clamp(1rem, 3.6vw, 1.85rem);
  font-weight: 800;
  letter-spacing: 0.04em;
}
.analyze-chips .chip-mark {
  font-size: clamp(0.8rem, 2.4vw, 1.15rem);
}
.assist {
  margin: 0;
  font-size: clamp(0.95rem, 3.2vw, 1.35rem);
  font-weight: 650;
  text-align: center;
  opacity: 0.85;
}

.level {
  width: min(36rem, 86vw);
  height: 0.55rem;
  margin: 0 auto;
  border-radius: 999px;
  background: color-mix(in srgb, var(--text) 16%, transparent);
  overflow: hidden;
}
.level-fill {
  height: 100%;
  background: var(--text);
  opacity: 0.55;
}

@media (max-width: 640px) and (orientation: portrait) {
  .bar {
    grid-template-columns: auto minmax(0, 1fr);
  }
  .tag {
    display: none;
  }
  .chips:not(.analyze-chips) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .chips:not(.analyze-chips)[data-count='3'] {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .tab {
    padding: 0.28rem 0.55rem;
    font-size: 0.85rem;
  }
}

@media (max-height: 520px) {
  .bar {
    padding: 0.28rem 0.45rem;
    gap: 0.35rem;
  }
  .exit {
    min-height: 36px;
    min-width: 3.75rem;
    padding: 0.2rem 0.55rem;
    font-size: 0.85rem;
  }
  .tab {
    min-height: 34px;
    padding: 0.18rem 0.5rem;
    font-size: 0.8rem;
  }
  .tag {
    display: none;
  }
  .stage {
    gap: 0.3rem;
    padding: 0.3rem 0.5rem 0.4rem;
  }
  .word {
    font-size: clamp(1.35rem, 9vh, 2.4rem);
  }
  .detail {
    font-size: clamp(0.75rem, 3.2vh, 1rem);
  }
  .note {
    font-size: clamp(1.6rem, 14vh, 3.2rem);
  }
  .chip {
    min-height: clamp(2.6rem, 18vh, 4.5rem);
  }
  .analyze-chips .chip {
    min-height: clamp(2rem, 12vh, 3.1rem);
  }
  .level {
    height: 0.4rem;
  }
}

@media (orientation: landscape) and (max-height: 430px) {
  .body.analyze.has-chips {
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-rows: minmax(0, 1fr);
    gap: 0.45rem;
    align-items: stretch;
  }
  .body.analyze.has-chips .analyze-chips {
    grid-template-columns: 1fr;
    width: min(6.75rem, 20vw);
    gap: 0.3rem;
    align-content: center;
  }
  .body.analyze.has-chips .chip {
    min-height: clamp(2.1rem, 18vh, 3.4rem);
  }
  .body.chord .chips {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    width: min(56rem, 96vw);
  }
  .body.chord .chip {
    min-height: clamp(2.4rem, 22vh, 4rem);
  }
}
</style>
