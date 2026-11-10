<script setup lang="ts">
/**
 * Digital Tuner shell (Labs) — Tune / Chord / FFT + Glance. Keep under 800 lines.
 */
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import { usePreferencesStore } from '../stores/preferences'
import { useTunerCapture } from '../composables/useTunerCapture'
import { useTunerLayout } from '../composables/useTunerLayout'
import { useTunerChordSession } from '../composables/useTunerChordSession'
import { formatDisplayCents, isInTuneCents } from '../domain/tuner/displayCents'
import { tuneReadingFromHz } from '../domain/tuner/tuneTarget'
import { fftPeaks, type FftPeak } from '../audio/tuner/fftPeaks'
import {
  clearSpectrogramRing,
  createSpectrogramRing,
  frameMagnitudeBins,
  pushSpectrogramColumn,
  type SpectrogramRing,
} from '../audio/tuner/spectrogramRing'
import { buildTunerExportSnapshot, tunerExportToCsv } from '../domain/tuner/exportSchema'
import { acquireWakeLock, releaseWakeLock } from '../lib/wakeLock'
import type { DigitalTunerPrefs } from '../lib/preferences/digitalTuner'
import TunerNeedle from '../components/tuner/TunerNeedle.vue'
import TunerStrobe from '../components/tuner/TunerStrobe.vue'
import TunerGlance from '../components/tuner/TunerGlance.vue'
import ChordGlance from '../components/tuner/ChordGlance.vue'
import ChordStackView from '../components/tuner/ChordStackView.vue'
import TunerFftView from '../components/tuner/TunerFftView.vue'
import TunerSpectrogramView from '../components/tuner/TunerSpectrogramView.vue'
import TunerSettingsSheet from '../components/tuner/TunerSettingsSheet.vue'

const prefs = usePreferencesStore()
const { mode } = useTunerLayout()
const capture = useTunerCapture()

const frozen = ref(false)
const frozenReading = ref<{ hz: number | null; clarity: number } | null>(null)
const settingsOpen = ref(false)
/** Cold start always Detail — sticky glance only after mic is running. */
const glanceOpen = ref(false)
const chordGlanceOpen = ref(false)
const reducedMotion = ref(false)
const fftPaused = ref(false)
const specPaused = ref(false)
const fftPeakList = shallowRef<FftPeak[]>([])
const specRing = shallowRef<SpectrogramRing>(createSpectrogramRing(64, 240))
let lastFftFrame: Float32Array | null = null
let lastFftSr = 48000
let removeFrameListener: (() => void) | null = null
let specHopCounter = 0

const a4Hz = computed(() => prefs.resolveTunerA4Hz())
const tunerPrefs = computed(() => prefs.digitalTunerPrefs)
const windowCents = computed(() =>
  tunerPrefs.value.chordLockEnabled
    ? tunerPrefs.value.chordLockWindowCents
    : tunerPrefs.value.inTuneWindowCents,
)

const live = computed(() => {
  if (frozen.value && frozenReading.value) return frozenReading.value
  return { hz: capture.reading.value.hz, clarity: capture.reading.value.clarity }
})

const reading = computed(() => {
  const hz = live.value.hz
  if (hz == null) return null
  return tuneReadingFromHz(hz, {
    a4Hz: a4Hz.value,
    keyPc: tunerPrefs.value.keyPc,
    temperament: tunerPrefs.value.keyGridTemperament,
    customOffsetsCents: tunerPrefs.value.customOffsetsCents,
    chordLockEnabled: tunerPrefs.value.chordLockEnabled,
    chordNatureId: tunerPrefs.value.chordNatureId,
  })
})

const centsLabel = computed(() => {
  if (!reading.value) return '—'
  return formatDisplayCents(reading.value.errorCents, { clarity: live.value.clarity })
})

const inTune = computed(() => {
  if (!reading.value) return false
  return isInTuneCents(reading.value.errorCents, windowCents.value)
})

const statusWord = computed((): 'IN TUNE' | 'SHARP' | 'FLAT' | 'WAIT' => {
  if (!capture.running.value) return 'WAIT'
  if (!reading.value) return 'WAIT'
  if (inTune.value) return 'IN TUNE'
  return reading.value.errorCents > 0 ? 'SHARP' : 'FLAT'
})

const legend = computed(() => {
  if (reading.value?.targetKind === 'chordLock') {
    const nature = tunerPrefs.value.chordNatureId || 'chord'
    return `vs Chord lock · ${nature} · A=${Math.round(a4Hz.value)}`
  }
  const grid =
    tunerPrefs.value.keyGridTemperament === 'equal'
      ? 'Equal'
      : tunerPrefs.value.keyGridTemperament === 'justTriad'
        ? 'Just triad'
        : 'Custom'
  return `vs ${grid} · A=${Math.round(a4Hz.value)}`
})

const showStrobe = computed(() => {
  if (reducedMotion.value) return false
  return tunerPrefs.value.tuneDisplay === 'strobe'
})

const surface = computed(() => tunerPrefs.value.analyzeSurface)
const chordEnabled = computed(() => surface.value === 'chord' && capture.running.value)
const fftEnabled = computed(() => surface.value === 'fft' && capture.running.value)
const specEnabled = computed(() => surface.value === 'spectrogram' && capture.running.value)

const chordSession = useTunerChordSession({
  prefs: tunerPrefs,
  a4Hz,
  enabled: chordEnabled,
})

function syncAnalysisOpts(): void {
  capture.setAnalysisOpts({ noiseGateDb: tunerPrefs.value.noiseGateDb })
}

function onAudioFrame(frame: { samples: Float32Array; sampleRate: number }): void {
  if (chordEnabled.value) chordSession.ingest(frame)
  if (fftEnabled.value) {
    lastFftFrame = frame.samples
    lastFftSr = frame.sampleRate
    if (!fftPaused.value) {
      fftPeakList.value = fftPeaks(frame.samples, frame.sampleRate, {
        a4Hz: a4Hz.value,
        keyPc: tunerPrefs.value.keyPc,
        temperament: tunerPrefs.value.keyGridTemperament,
        customOffsetsCents: tunerPrefs.value.customOffsetsCents,
        maxPeaks: 10,
      })
    }
  }
  if (specEnabled.value && !specPaused.value) {
    // ~15–20 Hz UI columns from 1024-hop worklet frames
    specHopCounter++
    if (specHopCounter % 2 === 0) {
      const bins = frameMagnitudeBins(frame.samples, frame.sampleRate, specRing.value.binCount)
      pushSpectrogramColumn(specRing.value, bins)
    }
  }
}

function toggleFftPause(): void {
  fftPaused.value = !fftPaused.value
  if (!fftPaused.value && lastFftFrame) {
    fftPeakList.value = fftPeaks(lastFftFrame, lastFftSr, {
      a4Hz: a4Hz.value,
      keyPc: tunerPrefs.value.keyPc,
      temperament: tunerPrefs.value.keyGridTemperament,
      customOffsetsCents: tunerPrefs.value.customOffsetsCents,
      maxPeaks: 10,
    })
  }
}

function setSurface(next: DigitalTunerPrefs['analyzeSurface']): void {
  prefs.setDigitalTunerPrefs({ analyzeSurface: next })
}

function downloadExport(): void {
  const surfaceLabel =
    surface.value === 'chord'
      ? 'chord'
      : surface.value === 'fft'
        ? 'fft'
        : surface.value === 'spectrogram'
          ? 'spectrogram'
          : 'tune'
  const rows =
    surface.value === 'fft'
      ? fftPeakList.value.map((p) => ({
          hz: p.hz,
          note: p.note ?? undefined,
          cents: p.errorCents ?? undefined,
          salience: p.salience,
        }))
      : surface.value === 'chord' && chordSession.score.value
        ? chordSession.score.value.tones.map((t) => ({
            hz: t.hz,
            note: t.note,
            cents: t.errorCentsVsJi,
            role: t.role,
          }))
        : reading.value
          ? [
              {
                hz: reading.value.targetHz * 2 ** (reading.value.errorCents / 1200),
                note: reading.value.name,
                cents: reading.value.errorCents,
              },
            ]
          : []
  const snap = buildTunerExportSnapshot({
    a4Hz: a4Hz.value,
    keyPc: tunerPrefs.value.keyPc,
    keyGridTemperament: tunerPrefs.value.keyGridTemperament,
    chordLockEnabled: tunerPrefs.value.chordLockEnabled,
    chordNatureId: tunerPrefs.value.chordNatureId,
    surface: surfaceLabel,
    rows,
    killGate: 'conditional',
  })
  const blob = new Blob([JSON.stringify(snap, null, 2) + '\n\n' + tunerExportToCsv(snap)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `singtags-tuner-${snap.exportedAt.slice(0, 19)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

function toggleFreeze(): void {
  if (!capture.running.value) return
  if (frozen.value) {
    frozen.value = false
    frozenReading.value = null
    return
  }
  frozen.value = true
  frozenReading.value = {
    hz: capture.reading.value.hz,
    clarity: capture.reading.value.clarity,
  }
}

async function onStart(): Promise<void> {
  frozen.value = false
  frozenReading.value = null
  syncAnalysisOpts()
  await capture.start({ deviceId: tunerPrefs.value.inputDeviceId })
  if (capture.deviceId.value) {
    prefs.setDigitalTunerPrefs({ inputDeviceId: capture.deviceId.value })
  }
  if (capture.running.value && tunerPrefs.value.glanceFullscreen) {
    await enterGlance()
  }
}

async function onStop(): Promise<void> {
  await exitGlance()
  frozen.value = false
  frozenReading.value = null
  clearSpectrogramRing(specRing.value)
  fftPeakList.value = []
  await capture.stop()
}

async function enterGlance(): Promise<void> {
  if (!capture.running.value) return
  if (surface.value === 'chord') {
    chordGlanceOpen.value = true
    glanceOpen.value = false
  } else {
    glanceOpen.value = true
    chordGlanceOpen.value = false
  }
  prefs.setDigitalTunerPrefs({ glanceFullscreen: true })
  await acquireWakeLock('tuner')
}

async function exitGlance(): Promise<void> {
  glanceOpen.value = false
  chordGlanceOpen.value = false
  prefs.setDigitalTunerPrefs({ glanceFullscreen: false })
  await releaseWakeLock('tuner')
}

async function onSettingsPatch(patch: Partial<DigitalTunerPrefs>): Promise<void> {
  const prevDevice = tunerPrefs.value.inputDeviceId
  prefs.setDigitalTunerPrefs(patch)
  syncAnalysisOpts()
  if (
    capture.running.value &&
    patch.inputDeviceId !== undefined &&
    patch.inputDeviceId !== prevDevice
  ) {
    await capture.start({ deviceId: patch.inputDeviceId })
  }
}

function onKeydown(ev: KeyboardEvent): void {
  const tag = (ev.target as HTMLElement | null)?.tagName
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
  if (ev.key === 'Escape') {
    if (settingsOpen.value) {
      settingsOpen.value = false
      ev.preventDefault()
      return
    }
    if (glanceOpen.value || chordGlanceOpen.value) {
      void exitGlance()
      ev.preventDefault()
    }
    return
  }
  if (ev.key === ' ' || ev.code === 'Space') {
    if (capture.running.value && !glanceOpen.value) {
      toggleFreeze()
      ev.preventDefault()
    }
  }
}

watch(
  () => capture.running.value,
  (on) => {
    if (!on) {
      frozen.value = false
      frozenReading.value = null
      void exitGlance()
    }
  },
)

watch(
  () => tunerPrefs.value.noiseGateDb,
  () => syncAnalysisOpts(),
)

onMounted(() => {
  reducedMotion.value = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  window.addEventListener('keydown', onKeydown)
  void capture.refreshDevices()
  syncAnalysisOpts()
  removeFrameListener = capture.addFrameListener(onAudioFrame)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  removeFrameListener?.()
  void releaseWakeLock('tuner')
})
</script>

<template>
  <section class="tuner" :data-layout="mode">
    <header class="toolbar">
      <div class="title-row">
        <h1 class="title">Digital Tuner</h1>
        <div class="title-actions">
          <button type="button" class="btn icon" title="Settings" @click="settingsOpen = true">
            Settings
          </button>
          <button
            v-if="capture.running.value"
            type="button"
            class="btn icon"
            title="Rehearsal glance"
            @click="enterGlance"
          >
            Rehearsal
          </button>
          <button type="button" class="btn icon" title="Export snapshot" @click="downloadExport">
            Export
          </button>
        </div>
      </div>
      <p class="privacy">
        On-device only — mic audio never leaves this browser. Analysis clears when you leave.
      </p>
      <div class="actions">
        <button
          v-if="!capture.running.value"
          type="button"
          class="btn primary"
          @click="onStart"
        >
          Allow microphone
        </button>
        <template v-else>
          <button type="button" class="btn" :class="{ on: frozen }" @click="toggleFreeze">
            {{ frozen ? 'Unfreeze' : 'Freeze' }}
          </button>
          <button type="button" class="btn" @click="onStop">Stop</button>
        </template>
      </div>
      <div class="surfaces" role="tablist" aria-label="Tuner surface">
        <button
          type="button"
          class="btn chip"
          role="tab"
          :aria-selected="surface === 'hidden'"
          :class="{ on: surface === 'hidden' }"
          @click="setSurface('hidden')"
        >
          Tune
        </button>
        <button
          type="button"
          class="btn chip"
          role="tab"
          :aria-selected="surface === 'chord'"
          :class="{ on: surface === 'chord' }"
          @click="setSurface('chord')"
        >
          Chord
        </button>
        <button
          type="button"
          class="btn chip"
          role="tab"
          :aria-selected="surface === 'fft'"
          :class="{ on: surface === 'fft' }"
          @click="setSurface('fft')"
        >
          FFT
        </button>
        <button
          type="button"
          class="btn chip"
          role="tab"
          :aria-selected="surface === 'spectrogram'"
          :class="{ on: surface === 'spectrogram' }"
          @click="setSurface('spectrogram')"
        >
          Spec
        </button>
      </div>
    </header>

    <p v-if="capture.errorMessage.value" class="err" role="alert">
      {{ capture.errorMessage.value }}
      <button type="button" class="btn link" @click="onStart">Retry</button>
    </p>

    <div v-if="surface === 'hidden'" class="stage">
      <div class="readout" aria-live="polite">
        <div class="note">{{ reading?.name ?? '—' }}</div>
        <div class="cents" :class="{ in: inTune }">{{ centsLabel }}</div>
        <div class="status">{{ statusWord }}</div>
        <div class="legend">{{ legend }}</div>
      </div>
      <TunerStrobe
        v-if="showStrobe"
        :cents="reading?.errorCents ?? null"
        :in-tune="inTune"
        :active="capture.running.value && !frozen"
      />
      <TunerNeedle v-else :cents="reading?.errorCents ?? null" :in-tune="inTune" />
    </div>

    <ChordStackView
      v-else-if="surface === 'chord'"
      :score="chordSession.score.value"
      :clarity="live.clarity"
      @rehearsal="enterGlance"
    />

    <TunerFftView
      v-else-if="surface === 'fft'"
      :peaks="fftPeakList"
      :paused="fftPaused"
      :fft-size="tunerPrefs.fftSize"
      @toggle-pause="toggleFftPause"
    />

    <TunerSpectrogramView
      v-else-if="surface === 'spectrogram'"
      :ring="specRing"
      :paused="specPaused"
      @toggle-pause="specPaused = !specPaused"
      @clear="clearSpectrogramRing(specRing)"
    />

    <div class="level" aria-hidden="true">
      <div
        class="level-fill"
        :style="{ width: `${Math.round(capture.reading.value.level * 100)}%` }"
      />
    </div>

    <TunerSettingsSheet
      :open="settingsOpen"
      :prefs="tunerPrefs"
      :devices="capture.devices.value"
      :resolved-a4="a4Hz"
      @close="settingsOpen = false"
      @patch="onSettingsPatch"
    />

    <TunerGlance
      v-if="glanceOpen"
      :status-word="statusWord"
      :note-name="reading?.name ?? null"
      @exit="exitGlance"
    />
    <ChordGlance
      v-if="chordGlanceOpen"
      :score="chordSession.score.value"
      @exit="exitGlance"
    />
  </section>
</template>

<style scoped>
.tuner {
  display: grid;
  gap: 1rem;
  width: 100%;
  max-width: 56rem;
  margin: 0 auto;
  padding: 0.5rem 0.75rem calc(1rem + var(--bottom-nav-h, 0px) + env(safe-area-inset-bottom));
  box-sizing: border-box;
  min-height: calc(100dvh - var(--header-h, 3.5rem) - var(--bottom-nav-h, 0px));
}
.toolbar {
  display: grid;
  gap: 0.35rem;
}
.title-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}
.title-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}
.title {
  margin: 0;
  font-family: var(--font-display);
  font-size: clamp(1.35rem, 3vw, 1.75rem);
}
.privacy {
  margin: 0;
  color: var(--muted);
  font-size: 0.9rem;
  line-height: 1.35;
  max-width: 40rem;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.35rem;
}
.surfaces {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin-top: 0.25rem;
}
.btn.chip {
  min-height: 36px;
  padding: 0.3rem 0.7rem;
  font-size: 0.85rem;
}
.btn {
  min-height: 44px;
  padding: 0.45rem 0.9rem;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  cursor: pointer;
}
.btn.icon {
  min-height: 40px;
  padding: 0.35rem 0.7rem;
  font-size: 0.9rem;
}
.btn.primary {
  background: var(--accent);
  color: var(--on-accent);
  border-color: var(--accent);
}
.btn.on {
  border-color: var(--accent);
  color: var(--accent);
}
.btn.link {
  border: none;
  background: transparent;
  color: var(--accent);
  min-height: 36px;
  padding: 0.2rem 0.4rem;
}
.err {
  margin: 0;
  padding: 0.65rem 0.75rem;
  border-radius: 8px;
  background: color-mix(in srgb, var(--danger) 12%, var(--surface));
  color: var(--danger);
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
}
.stage {
  display: grid;
  gap: 1rem;
  align-items: center;
}
.tuner[data-layout='wide'] .stage {
  grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
}
.readout {
  display: grid;
  gap: 0.2rem;
  justify-items: start;
}
.tuner[data-layout='narrow-portrait'] .readout {
  justify-items: center;
  text-align: center;
}
.note {
  font-family: var(--font-display);
  font-size: clamp(2.75rem, 12vw, 4.5rem);
  font-weight: 700;
  line-height: 1;
  letter-spacing: 0.02em;
}
.cents {
  font-size: clamp(1.25rem, 4vw, 1.75rem);
  font-variant-numeric: tabular-nums;
  min-height: 1.2em;
}
.cents.in {
  color: var(--accent);
}
.status {
  font-weight: 700;
  letter-spacing: 0.06em;
  font-size: 0.95rem;
  color: var(--muted);
}
.legend {
  font-size: 0.85rem;
  color: var(--muted);
}
.level {
  height: 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--border) 70%, var(--surface));
  overflow: hidden;
}
.level-fill {
  height: 100%;
  background: var(--accent);
  transition: width 0.08s linear;
}
.tuner[data-layout='narrow-landscape'] {
  gap: 0.5rem;
  padding-top: 0.25rem;
}
.tuner[data-layout='narrow-landscape'] .stage {
  grid-template-columns: minmax(0, 0.7fr) minmax(0, 1fr);
}
.tuner[data-layout='narrow-landscape'] .note {
  font-size: clamp(1.75rem, 8vw, 2.5rem);
}
.tuner[data-layout='narrow-landscape'] .privacy {
  display: none;
}
@media (prefers-reduced-motion: reduce) {
  .level-fill {
    transition: none;
  }
}
</style>
