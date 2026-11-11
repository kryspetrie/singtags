<script setup lang="ts">
/**
 * Digital Tuner shell (Labs) — Tune | Analyze + canvas stages.
 */
import { computed, defineAsyncComponent, onMounted, onUnmounted, ref, watch } from 'vue'
import { usePreferencesStore } from '../stores/preferences'
import { useTunerCapture } from '../composables/useTunerCapture'
import { useTunerLayout } from '../composables/useTunerLayout'
import { useTunerChordSession } from '../composables/useTunerChordSession'
import { useTunerReferenceTone } from '../composables/useTunerReferenceTone'
import { isInTuneCents } from '../domain/tuner/displayCents'
import { tuneReadingFromHz } from '../domain/tuner/tuneTarget'
import { tunerLegendLabel } from '../domain/tuner/legendLabel'
import { displayBinsForFftSize, type TunerDspResult } from '../audio/tuner/tunerDspProtocol'
import { useTunerSpectrogram } from '../composables/useTunerSpectrogram'
import { useTunerFftSession } from '../composables/useTunerFftSession'
import { useTunerSessionStats } from '../composables/useTunerSessionStats'
import {
  analyzeModeForSurface,
  prefetchAnalyzeSurface,
} from '../composables/useTunerAnalyzeSurface'
import { toGlanceSurface } from '../domain/tuner/glanceSurface'
import {
  SPEC_ANALYSIS_SAMPLES,
  SPEC_RESOLUTION_BINS,
  type DigitalTunerPrefs,
} from '../lib/preferences/digitalTuner'
import TunerStageCanvas from '../components/tuner/TunerStageCanvas.vue'

/** Analyze / settings surfaces — separate chunks; Tune stage stays eager. */
const ChordStackView = defineAsyncComponent(() => import('../components/tuner/ChordStackView.vue'))
const TunerFftView = defineAsyncComponent(() => import('../components/tuner/TunerFftView.vue'))
const TunerSpectrogramView = defineAsyncComponent(
  () => import('../components/tuner/TunerSpectrogramView.vue'),
)
const TunerHarmonicsView = defineAsyncComponent(
  () => import('../components/tuner/TunerHarmonicsView.vue'),
)
const TunerStaffPlotView = defineAsyncComponent(
  () => import('../components/tuner/TunerStaffPlotView.vue'),
)
const TunerSessionStrip = defineAsyncComponent(
  () => import('../components/tuner/TunerSessionStrip.vue'),
)
const TunerSettingsSheet = defineAsyncComponent(
  () => import('../components/tuner/TunerSettingsSheet.vue'),
)
const TunerGlanceOverlay = defineAsyncComponent(
  () => import('../components/tuner/TunerGlanceOverlay.vue'),
)

const prefs = usePreferencesStore()
const { mode } = useTunerLayout()
const capture = useTunerCapture()
const refTone = useTunerReferenceTone({
  setSuppressDetection: (on) => capture.setSuppressDetection(on),
})

const frozen = ref(false)
const frozenReading = ref<{
  hz: number | null
  clarity: number
  displayMidi: number | null
} | null>(null)
const settingsOpen = ref(false)
const glanceOpen = ref(false)
const reducedMotion = ref(false)
const fftPaused = ref(false)
const specPaused = ref(false)
let removeDspListener: (() => void) | null = null
let forceNextFftSmooth = false

const a4Hz = computed(() => prefs.resolveTunerA4Hz())
const tunerPrefs = computed(() => prefs.digitalTunerPrefs)
const {
  ring: specRing,
  tracks: specTracks,
  paintGen: specPaintGen,
  applyDsp: applySpectrogramDsp,
  clear: clearSpectrogram,
} = useTunerSpectrogram({ prefs: tunerPrefs, a4Hz })
const windowCents = computed(() =>
  tunerPrefs.value.chordLockEnabled
    ? tunerPrefs.value.chordLockWindowCents
    : tunerPrefs.value.inTuneWindowCents,
)

const PRIMARY_TABS = [
  { id: 'tune' as const, label: 'Tune' },
  { id: 'analyze' as const, label: 'Analyze' },
]
const ANALYZE_TABS = [
  { id: 'chord' as const, label: 'Chord' },
  { id: 'fft' as const, label: 'FFT' },
  { id: 'spectrogram' as const, label: 'Spec' },
  { id: 'harmonics' as const, label: 'Harm' },
  { id: 'staff' as const, label: 'Staff' },
]

const live = computed(() => {
  if (frozen.value && frozenReading.value) return frozenReading.value
  return {
    hz: capture.reading.value.hz,
    clarity: capture.reading.value.clarity,
    displayMidi: capture.reading.value.displayMidi,
  }
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
    chordRootPc: tunerPrefs.value.pinnedRootPc ?? tunerPrefs.value.keyPc,
    chordRole: 'auto',
    displayMidi: live.value.displayMidi,
  })
})

const inTune = computed(() => {
  if (!reading.value) return false
  return isInTuneCents(reading.value.errorCents, windowCents.value)
})

const legend = computed(() =>
  tunerLegendLabel({
    a4Hz: a4Hz.value,
    temperament: tunerPrefs.value.keyGridTemperament,
    chordLock: reading.value?.targetKind === 'chordLock',
    chordNatureId: tunerPrefs.value.chordNatureId,
  }),
)

const legendShort = computed(() =>
  tunerLegendLabel({
    a4Hz: a4Hz.value,
    temperament: tunerPrefs.value.keyGridTemperament,
    chordLock: reading.value?.targetKind === 'chordLock',
    chordNatureId: tunerPrefs.value.chordNatureId,
    short: true,
  }),
)

/** Animated Tune displays collapse to needle under reduced motion. */
const tuneStageMode = computed((): 'needle' | 'strobe' | 'scope' => {
  if (reducedMotion.value) return 'needle'
  const d = tunerPrefs.value.tuneDisplay
  return d === 'strobe' || d === 'scope' ? d : 'needle'
})

const surface = computed(() => tunerPrefs.value.analyzeSurface)
const primaryMode = computed(() => (surface.value === 'hidden' ? 'tune' : 'analyze'))
const chordEnabled = computed(() => surface.value === 'chord' && capture.running.value)
const fftEnabled = computed(
  () =>
    (surface.value === 'fft' || surface.value === 'harmonics') && capture.running.value,
)
const specEnabled = computed(() => surface.value === 'spectrogram' && capture.running.value)
/** Accumulate whenever mic runs (strip/staff read it); never in Glance. */
const sessionEnabled = computed(() => capture.running.value && !glanceOpen.value)
const sessionStats = useTunerSessionStats({
  enabled: sessionEnabled,
  frozen,
  windowCents,
  clarityMin: computed(() => tunerPrefs.value.detectionThreshold),
})

const chordSession = useTunerChordSession({
  prefs: tunerPrefs,
  a4Hz,
  enabled: chordEnabled,
})

const { spectrum: fftSpectrum, applyDsp: applyFftDsp } = useTunerFftSession({
  prefs: tunerPrefs,
  enabled: fftEnabled,
  paused: fftPaused,
})

function syncAnalysisOpts(): void {
  const p = tunerPrefs.value
  capture.setAnalysisOpts({
    noiseGateDb: p.noiseGateDb,
    clarityMin: p.detectionThreshold,
    fMinHz: p.pitchFMinHz,
    fMaxHz: p.pitchFMaxHz,
  })
  capture.setSmoothA4Hz(a4Hz.value)
  syncDspConfig()
}

function syncDspConfig(): void {
  const p = tunerPrefs.value
  const surf = surface.value
  capture.setDspConfig({
    a4Hz: a4Hz.value,
    analyze: analyzeModeForSurface({
      running: capture.running.value,
      surface: surf,
      fftPaused: fftPaused.value,
      specPaused: specPaused.value,
    }),
    // Mono for Tune + session strip/staff; skip on FFT/Spec to save worker budget.
    monoEnabled: surf === 'hidden' || surf === 'chord' || surf === 'staff',
    salienceFloor: p.multiF0SalienceFloor,
    fftSize: p.fftSize,
    fftDisplayBins: displayBinsForFftSize(p.fftSize),
    keyPc: p.keyPc,
    temperament: p.keyGridTemperament,
    customOffsetsCents: [...p.customOffsetsCents],
    analysisFMinHz: p.pitchFMinHz,
    analysisFMaxHz: p.pitchFMaxHz,
    specAnalysisSamples: SPEC_ANALYSIS_SAMPLES[p.specResolution],
    specBinCount: SPEC_RESOLUTION_BINS[p.specResolution],
    specFMinHz: p.specFMinHz,
    specFMaxHz: p.specFMaxHz,
    specFreqScale: p.specFreqScale,
    specShowTracks: p.specShowTracks,
  })
}

function onDspResult(result: TunerDspResult): void {
  if (result.chord && chordEnabled.value) chordSession.applyDsp(result.chord)
  if (result.fft && fftEnabled.value) {
    const force = forceNextFftSmooth
    forceNextFftSmooth = false
    applyFftDsp(result.fft, { forceSmooth: force })
  }
  if (result.spec && specEnabled.value && !specPaused.value) {
    applySpectrogramDsp(result.spec)
  }
}

function toggleFftPause(): void {
  fftPaused.value = !fftPaused.value
  syncDspConfig()
  if (!fftPaused.value) {
    forceNextFftSmooth = true
    capture.recomputeFft()
  }
}

function setSurface(next: DigitalTunerPrefs['analyzeSurface']): void {
  refTone.stopAll()
  if (next !== 'hidden') {
    frozen.value = false
    frozenReading.value = null
  }
  prefetchAnalyzeSurface(next)
  prefs.setDigitalTunerPrefs({ analyzeSurface: next })
}

function setPrimary(next: 'tune' | 'analyze'): void {
  if (next === 'tune') setSurface('hidden')
  else if (surface.value === 'hidden') setSurface('chord')
  else prefetchAnalyzeSurface(surface.value)
}

async function onFftPlayPeak(hz: number): Promise<void> {
  await refTone.playHzChord([hz], 0.9)
}

async function onFftAudition(hzList: number[]): Promise<void> {
  const { auditionRegionFromPeaks } = await import('../audio/tuner/regionAudition')
  const region = auditionRegionFromPeaks(hzList)
  if (!region) return
  await refTone.playHzChord(region.hz, region.durationSec)
}

async function downloadExport(): Promise<void> {
  const { downloadTunerExport } = await import('../domain/tuner/downloadExport')
  downloadTunerExport({
    surface: surface.value,
    a4Hz: a4Hz.value,
    prefs: tunerPrefs.value,
    fftPeaks: fftSpectrum.value?.peaks ?? [],
    chordScore: chordSession.score.value,
    reading: reading.value,
  })
}

function toggleFreeze(): void {
  // Freeze is Tune-only — Analyze surfaces ignore frozen readings.
  if (!capture.running.value || surface.value !== 'hidden' || glanceOpen.value) return
  if (frozen.value) {
    frozen.value = false
    frozenReading.value = null
    return
  }
  frozen.value = true
  frozenReading.value = {
    hz: capture.reading.value.hz,
    clarity: capture.reading.value.clarity,
    displayMidi: capture.reading.value.displayMidi,
  }
}

async function enterGlance(): Promise<void> {
  settingsOpen.value = false
  await ensureListening()
  if (!capture.running.value) return
  // Harmonics / Staff are Detail-only — remap so Glance never falls through to Spec.
  const next = toGlanceSurface(surface.value)
  if (next !== surface.value) setSurface(next)
  glanceOpen.value = true
  prefs.setDigitalTunerPrefs({ glanceFullscreen: true })
}

function exitGlance(): void {
  glanceOpen.value = false
  prefs.setDigitalTunerPrefs({ glanceFullscreen: false })
}

/** Mic is on for the lifetime of this route — no in-app enable/disable. */
let listeningTask: Promise<void> | null = null
async function ensureListening(): Promise<void> {
  if (capture.running.value) {
    await capture.resumeIfNeeded()
    return
  }
  if (listeningTask) return listeningTask
  listeningTask = (async () => {
    frozen.value = false
    frozenReading.value = null
    syncAnalysisOpts()
    await capture.start({ deviceId: tunerPrefs.value.inputDeviceId })
    if (capture.deviceId.value) {
      prefs.setDigitalTunerPrefs({ inputDeviceId: capture.deviceId.value })
    }
  })().finally(() => {
    listeningTask = null
  })
  return listeningTask
}

async function onSettingsPatch(patch: Partial<DigitalTunerPrefs>): Promise<void> {
  const prevDevice = tunerPrefs.value.inputDeviceId
  prefs.setDigitalTunerPrefs(patch)
  syncAnalysisOpts()
  if (patch.inputDeviceId !== undefined && patch.inputDeviceId !== prevDevice) {
    // Device change: restart capture on the new input (still no Stop control).
    frozen.value = false
    frozenReading.value = null
    await capture.start({ deviceId: patch.inputDeviceId })
  }
}

function onKeydown(ev: KeyboardEvent): void {
  const tag = (ev.target as HTMLElement | null)?.tagName
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
  if (ev.key === 'Escape') {
    if (glanceOpen.value) {
      exitGlance()
      ev.preventDefault()
      return
    }
    if (settingsOpen.value) {
      settingsOpen.value = false
      ev.preventDefault()
    }
    return
  }
  if (ev.key === ' ' || ev.code === 'Space') {
    if (glanceOpen.value) {
      ev.preventDefault()
      return
    }
    if (capture.running.value && surface.value === 'hidden') toggleFreeze()
    else if (!capture.running.value) void ensureListening()
    ev.preventDefault()
  }
}

watch(
  () => capture.running.value,
  (on) => {
    if (!on) {
      frozen.value = false
      frozenReading.value = null
      if (glanceOpen.value) exitGlance()
    }
  },
)

watch(
  () =>
    [
      tunerPrefs.value.noiseGateDb,
      tunerPrefs.value.detectionThreshold,
      tunerPrefs.value.multiF0SalienceFloor,
      tunerPrefs.value.pitchFMinHz,
      tunerPrefs.value.pitchFMaxHz,
    ] as const,
  () => syncAnalysisOpts(),
)

watch(a4Hz, (hz) => {
  capture.setSmoothA4Hz(hz)
  syncDspConfig()
})

watch(
  () =>
    [
      capture.reading.value.hz,
      capture.reading.value.clarity,
      capture.reading.value.displayMidi,
      reading.value?.errorCents ?? null,
      frozen.value,
    ] as const,
  () => {
    sessionStats.push({
      tMs: performance.now(),
      cents: reading.value?.errorCents ?? null,
      clarity: live.value.clarity,
      displayMidi: live.value.displayMidi,
    })
  },
)

watch(
  () =>
    [
      surface.value,
      capture.running.value,
      fftPaused.value,
      specPaused.value,
      tunerPrefs.value.fftSize,
      tunerPrefs.value.keyPc,
      tunerPrefs.value.keyGridTemperament,
      tunerPrefs.value.customOffsetsCents,
      tunerPrefs.value.specResolution,
      tunerPrefs.value.specFMinHz,
      tunerPrefs.value.specFMaxHz,
      tunerPrefs.value.pitchFMinHz,
      tunerPrefs.value.pitchFMaxHz,
      tunerPrefs.value.pitchRangeId,
      tunerPrefs.value.specFreqScale,
      tunerPrefs.value.specShowTracks,
      tunerPrefs.value.multiF0SalienceFloor,
    ] as const,
  () => syncDspConfig(),
)

let motionMq: MediaQueryList | null = null
function onMotionMqChange(): void {
  if (motionMq) reducedMotion.value = motionMq.matches
}

onMounted(() => {
  motionMq = window.matchMedia('(prefers-reduced-motion: reduce)')
  reducedMotion.value = motionMq.matches
  motionMq.addEventListener('change', onMotionMqChange)
  window.addEventListener('keydown', onKeydown)
  void capture.refreshDevices()
  syncAnalysisOpts()
  removeDspListener = capture.addDspListener(onDspResult)
  void ensureListening().then(() => {
    // Sticky Glance only after mic is running (Detail first for setup).
    if (tunerPrefs.value.glanceFullscreen && capture.running.value) {
      const next = toGlanceSurface(surface.value)
      if (next !== surface.value) setSurface(next)
      glanceOpen.value = true
    }
  })
  // Warm DSP worker after first paint so Analyze tabs are not cold-start.
  const warm = () => capture.warmupDsp()
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(warm, { timeout: 2500 })
  } else {
    window.setTimeout(warm, 800)
  }
})

onUnmounted(() => {
  motionMq?.removeEventListener('change', onMotionMqChange)
  motionMq = null
  window.removeEventListener('keydown', onKeydown)
  removeDspListener?.()
  refTone.stopAll()
  glanceOpen.value = false
})
</script>

<template>
  <section class="tuner" :data-layout="mode" @pointerdown="ensureListening">
    <header class="toolbar">
      <div class="title-row">
        <h1 class="title">Digital Tuner</h1>
        <div class="title-actions">
          <button type="button" class="btn icon" title="Settings" @click="settingsOpen = true">
            Settings
          </button>
          <button
            type="button"
            class="btn icon"
            title="10-foot / Rehearsal fullscreen"
            @click="enterGlance"
          >
            10-ft
          </button>
          <button
            v-if="capture.running.value && surface === 'hidden'"
            type="button"
            class="btn icon"
            :class="{ on: frozen }"
            :title="frozen ? 'Unfreeze reading' : 'Freeze reading'"
            @click="toggleFreeze"
          >
            {{ frozen ? 'Frozen' : 'Freeze' }}
          </button>
          <button type="button" class="btn icon" title="Export snapshot" @click="downloadExport">
            Export
          </button>
        </div>
      </div>
      <p class="privacy">
        On-device only — mic audio never leaves this browser. Analysis clears when you leave.
      </p>
      <p v-if="refTone.headphoneHint.value" class="banner" role="status">
        Headphones recommended while reference tones play — detection pauses to avoid feedback.
        <button type="button" class="btn link" @click="refTone.dismissHeadphoneHint()">Dismiss</button>
      </p>
      <div class="mode-tabs" role="tablist" aria-label="Tuner mode">
        <button
          v-for="m in PRIMARY_TABS"
          :id="`tuner-tab-${m.id}`"
          :key="m.id"
          type="button"
          role="tab"
          class="mode-tab"
          :class="{ on: primaryMode === m.id }"
          :aria-selected="primaryMode === m.id"
          @click="setPrimary(m.id)"
        >
          {{ m.label }}
        </button>
      </div>
      <div
        v-if="primaryMode === 'analyze'"
        class="mode-tabs analyze-tabs"
        role="tablist"
        aria-label="Analyze surface"
      >
        <button
          v-for="m in ANALYZE_TABS"
          :id="`tuner-analyze-${m.id}`"
          :key="m.id"
          type="button"
          role="tab"
          class="mode-tab"
          :class="{ on: surface === m.id }"
          :aria-selected="surface === m.id"
          @click="setSurface(m.id)"
        >
          {{ m.label }}
        </button>
      </div>
    </header>

    <p v-if="capture.errorMessage.value" class="err" role="alert">
      {{ capture.errorMessage.value }}
      <button type="button" class="btn link" @click="ensureListening">Retry</button>
    </p>

    <template v-if="!glanceOpen">
      <TunerStageCanvas
        v-if="surface === 'hidden'"
        :cents="reading?.errorCents ?? null"
        :in-tune="inTune"
        :clarity="live.clarity"
        :display-midi="live.displayMidi"
        :hz="live.hz"
        :key-pc="tunerPrefs.keyPc"
        :legend="mode === 'narrow-landscape' ? legendShort : legend"
        :level="capture.reading.value.level"
        :mode="tuneStageMode"
        :strobe-style="tunerPrefs.strobeStyle"
        :hold-progress="sessionStats.holdProgress.value"
        :active="capture.running.value && !frozen"
        :window-cents="windowCents"
      />

      <ChordStackView
        v-else-if="surface === 'chord'"
        :score="chordSession.score.value"
        :rows="chordSession.rows.value"
        :clarity="live.clarity"
        :window-cents="tunerPrefs.chordLockWindowCents"
        :peaks-hz="chordSession.livePeaksHz.value"
        :a4-hz="a4Hz"
        :active="capture.running.value"
        :reduced-motion="reducedMotion"
      />

      <TunerFftView
        v-else-if="surface === 'fft'"
        :spectrum="fftSpectrum"
        :paused="fftPaused"
        :prefs="tunerPrefs"
        @toggle-pause="toggleFftPause"
        @play-peak="onFftPlayPeak"
        @audition-selected="onFftAudition"
        @patch="onSettingsPatch"
      />

      <TunerSpectrogramView
        v-else-if="surface === 'spectrogram'"
        :ring="specRing"
        :tracks="specTracks"
        :paint-gen="specPaintGen"
        :paused="specPaused"
        :prefs="tunerPrefs"
        @toggle-pause="specPaused = !specPaused"
        @clear="clearSpectrogram"
        @patch="onSettingsPatch"
      />

      <TunerHarmonicsView
        v-else-if="surface === 'harmonics'"
        :spectrum="fftSpectrum"
        :paused="fftPaused"
        :prefs="tunerPrefs"
        @toggle-pause="toggleFftPause"
        @patch="onSettingsPatch"
      />

      <TunerStaffPlotView
        v-else-if="surface === 'staff'"
        :history="sessionStats.history.value"
        :prefs="tunerPrefs"
        :window-cents="windowCents"
        @patch="onSettingsPatch"
      />

      <TunerSessionStrip
        v-if="tunerPrefs.sessionStripEnabled && (surface === 'hidden' || surface === 'chord')"
        :percents="sessionStats.percents.value"
        :history="sessionStats.history.value"
        :has-voice="sessionStats.hasVoice.value"
        :hold-progress="sessionStats.holdProgress.value"
        @reset="sessionStats.reset()"
      />

      <p v-if="surface === 'hidden' && tuneStageMode === 'scope'" class="hint">
        Scope — wave freezes when you are in tune; scrolls when sharp or flat.
      </p>

      <div v-if="surface !== 'hidden'" class="level" aria-hidden="true">
        <div
          class="level-fill"
          :style="{ width: `${Math.round(capture.reading.value.level * 100)}%` }"
        />
      </div>
    </template>

    <TunerSettingsSheet
      :open="settingsOpen"
      :prefs="tunerPrefs"
      :devices="capture.devices.value"
      :resolved-a4="a4Hz"
      @close="settingsOpen = false"
      @patch="onSettingsPatch"
    />

    <TunerGlanceOverlay
      v-if="glanceOpen"
      :surface="surface"
      :cents="reading?.errorCents ?? null"
      :in-tune="inTune"
      :display-midi="live.displayMidi"
      :key-pc="tunerPrefs.keyPc"
      :level="capture.reading.value.level"
      :score="chordSession.score.value"
      :rows="chordSession.rows.value"
      :spectrum="fftSpectrum"
      :fft-paused="fftPaused"
      :prefs="tunerPrefs"
      :spec-ring="specRing"
      :spec-tracks="specTracks"
      :spec-paint-gen="specPaintGen"
      :spec-paused="specPaused"
      @exit="exitGlance"
      @set-surface="setSurface"
      @toggle-fft-pause="toggleFftPause"
      @toggle-spec-pause="specPaused = !specPaused"
      @clear-spec="clearSpectrogram"
      @patch="onSettingsPatch"
    />
  </section>
</template>

<style scoped src="./TunerView.css"></style>
