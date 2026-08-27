<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { TagAudioPlayer, type SoloMode } from '../audio/player'
import { formatKeyShiftLabel, clampPitchSemitones, MIN_PITCH_SEMITONES, MAX_PITCH_SEMITONES } from '../audio/pitchPlayer'
import { loadWaveformPeaks, syntheticPeaks } from '../audio/waveform'
import { buildSoloMixObjectUrl, defaultMixPanForNextSelection } from '../audio/multiPartMix'
import { buildUltraMixObjectUrl } from '../audio/partLeftReconstruct'
import {
  hasKnownSoloSide,
  soloSideForPart,
  supportsCustomSoloMix,
  type AudioLayoutSummary,
  type AudioPartLayout,
} from '../lib/audioLayout'
import { partLabel, preferredDefaultPart, sortPartIds } from '../lib/parts'
import { clampMarkA, clampMarkB, minLoopGapSec } from '../lib/waveformLayout'
import type { AudioTransform } from '../types/audio'
import { mediaUrl } from '../lib/mediaUrl'
import { usePreferencesStore, type PartSide } from '../stores/preferences'
import WaveformView from './WaveformView.vue'

/** Default playback rate (100% / as hosted). */
const DEFAULT_PLAYBACK_SPEED = 1

const SPEED_OPTIONS = [
  { value: 0.25, label: '25%' },
  { value: 0.5, label: '50%' },
  { value: 0.75, label: '75%' },
  { value: 1, label: '100%' },
  { value: 1.25, label: '125%' },
  { value: 1.5, label: '150%' },
  { value: 2, label: '200%' },
] as const

const props = withDefaults(
  defineProps<{
    parts: Record<string, string>
    /** All learning parts from tag metadata (tabs before lazy resolve). */
    availableParts?: string[]
    /** Lazy-resolve a part on first play (returns absolute or blob URL). */
    resolvePart?: (part: string) => Promise<string | null>
    baseUrl?: string
    title?: string
    pitchSemitones?: number
    /** Original song key for pitch label, e.g. "Ab Major". */
    songKey?: string
    /** Parent is still fetching tag media (show empty waveform + loading). */
    pending?: boolean
    /** Tag-level stereo layout from mirror analysis. */
    audioLayoutSummary?: AudioLayoutSummary | null
    /** Per-part layouts keyed by part id. */
    audioLayouts?: Record<string, AudioPartLayout> | null
  }>(),
  {
    pitchSemitones: undefined,
    songKey: undefined,
    pending: false,
    availableParts: undefined,
    resolvePart: undefined,
    audioLayoutSummary: undefined,
    audioLayouts: undefined,
  },
)

const emit = defineEmits<{
  transform: [AudioTransform]
  'update:pitchSemitones': [number]
  ended: []
}>()

const prefs = usePreferencesStore()
const player = new TagAudioPlayer()
/** Empty until mount / parts resolve — avoids lead→mix double-load aborting waveform. */
const part = ref<string>('')
const solo = ref<SoloMode>('stereo')
const pitch = ref(clampPitchSemitones(props.pitchSemitones ?? 0))
const speed = ref(DEFAULT_PLAYBACK_SPEED)
/** -1 left … 0 center … +1 right */
const balance = ref(0)
const loop = ref(false)
const markA = ref(0)
const markB = ref(0)
const tick = ref(0)
/** True only until we have bars to draw (placeholder or decoded). */
const waveLoading = ref(false)
const err = ref<string | null>(null)
const peaks = ref<number[]>([])
/** Which learning parts are included in the combine mix. */
const combineSelected = reactive<Record<string, boolean>>({})
let loadAbort: AbortController | null = null
let loadSeq = 0
let mixObjectUrl: string | null = null
/** In-flight load — Play waits so Custom mix is ready before starting. */
let loadGate: Promise<void> | null = null
/** When true, the next part change resumes at the prior playhead. */
let preserveNextPartLoad = false

function urlFor(p: string): string | null {
  const path = props.parts[p]
  if (!path) return null
  if (
    path.startsWith('/') ||
    path.startsWith('blob:') ||
    path.startsWith('http://') ||
    path.startsWith('https://')
  ) {
    return path
  }
  if (props.baseUrl) {
    const base = props.baseUrl.endsWith('/') ? props.baseUrl : `${props.baseUrl}/`
    return `${base}${path}`
  }
  return mediaUrl(path)
}

/** Resolve lazy part URL on first play / tab switch. */
async function ensurePartUrl(p: string): Promise<string | null> {
  // Prefer resolvePart so offline mono_solos can rebuild learning-track stereo
  // even when props.parts already holds a stale blob/path.
  if (props.resolvePart) {
    const resolved = await props.resolvePart(p)
    if (resolved) return resolved
  }
  return urlFor(p)
}

const CUSTOM_PART = 'custom'

const partIdList = computed(() => {
  const fromMeta =
    props.availableParts != null ? props.availableParts : Object.keys(props.parts)
  return sortPartIds(fromMeta.filter((k) => k !== CUSTOM_PART))
})

const available = computed(() => partIdList.value)

/** Learning parts eligible for combine (exclude full mix). */
const combineParts = computed(() => available.value.filter((p) => p !== 'mix'))

const selectedCombineParts = computed(() => combineParts.value.filter((p) => combineSelected[p]))

/** Custom tab: need ≥2 learning tracks and part-predominant (or unknown) layout. */
const showCustomTab = computed(
  () => combineParts.value.length >= 2 && supportsCustomSoloMix(props.audioLayoutSummary),
)

/** Ultra-low mono stems — combine via panned mono mix, not stereo channel extract. */
const ultraStemCombine = computed(() => {
  const ultra = props.audioLayoutSummary?.ultra_low
  return ultra === 'mono_solos' || ultra === 'mono_downmix'
})

function hardPanPosition(side: PartSide): number {
  return side === 'left' ? -1 : 1
}

const partTabs = computed(() =>
  showCustomTab.value ? [...available.value, CUSTOM_PART] : available.value,
)

const customMode = computed(() => part.value === CUSTOM_PART)

/** Playing a built multi-part mix (Custom selected + ≥2 parts checked). */
const combineMode = computed(() => customMode.value && selectedCombineParts.value.length >= 2)

/** Transport / adjust / waveform active (Custom with nothing checked stays inert). */
const playbackReady = computed(() => !customMode.value || selectedCombineParts.value.length > 0)

/** Hide the part strip when there’s nothing to choose (e.g. mix-only). */
const showPartPicker = computed(() => partTabs.value.length > 1)

/** Solo channel for combine: metadata wins when known. */
function resolveSoloInFile(p: string): PartSide {
  return (
    soloSideForPart(p, props.audioLayouts, props.audioLayoutSummary) ??
    prefs.getPartSoloInFile(p)
  )
}

const soloSideKnown = computed(() =>
  combineParts.value.some((p) => hasKnownSoloSide(p, props.audioLayouts, props.audioLayoutSummary)),
)

const currentTransform = computed<AudioTransform>(() => ({
  pitchSemitones: pitch.value,
  speed: speed.value,
}))

function bumpPitch(delta: number): void {
  pitch.value = clampPitchSemitones(pitch.value + delta)
}

const monoSolo = computed(() => {
  void tick.value
  return player.effectivelyMono
})

const currentTime = computed(() => {
  void tick.value
  return player.currentTime
})
const duration = computed(() => {
  void tick.value
  return player.duration
})
const paused = computed(() => {
  void tick.value
  return player.paused
})

const balanceLabel = computed(() => {
  const b = balance.value
  if (Math.abs(b) < 0.02) return 'Center'
  if (b < 0) return `L +${Math.round(-b * 100)}%`
  return `R +${Math.round(b * 100)}%`
})

const pitchLabel = computed(() => formatKeyShiftLabel(props.songKey, pitch.value))

const bakeError = computed(() => {
  void tick.value
  return player.bakeError
})

const waveBusy = computed(
  () => (waveLoading.value && peaks.value.length === 0) || (props.pending && !available.value.length),
)

const combineSignature = computed(() =>
  selectedCombineParts.value
    .map((p) => {
      const soloIn = resolveSoloInFile(p)
      const pan = prefs.partMixPan[p] ?? 'left'
      return `${p}:${soloIn}:${pan}:${urlFor(p) ?? ''}`
    })
    .join('|'),
)

function revokeMixUrl(): void {
  if (mixObjectUrl) {
    URL.revokeObjectURL(mixObjectUrl)
    mixObjectUrl = null
  }
}

function syncLoopMarks(d: number): void {
  if (d <= 0) {
    markA.value = 0
    markB.value = 0
    return
  }
  markA.value = 0
  markB.value = d
}

function finishWaveIfCurrent(seq: number): void {
  if (seq === loadSeq) {
    waveLoading.value = false
    tick.value++
  }
}

function setCombineSelected(p: string, on: boolean): void {
  if (on) {
    const already = combineParts.value.filter((x) => x !== p && combineSelected[x]).length
    prefs.setPartMixPan(p, defaultMixPanForNextSelection(already))
  }
  combineSelected[p] = on
}

function onCombineCheck(p: string, e: Event): void {
  const el = e.target as HTMLInputElement
  setCombineSelected(p, el.checked)
}

function setSoloInFile(p: string, side: PartSide): void {
  prefs.setPartSoloInFile(p, side)
}

function setMixPan(p: string, side: PartSide): void {
  prefs.setPartMixPan(p, side)
}

async function loadCurrent(opts?: { preservePlayback?: boolean }): Promise<void> {
  const run = (async () => {
    const seq = ++loadSeq
    loadAbort?.abort()
    loadAbort = new AbortController()
    const { signal } = loadAbort
    const prevMix = mixObjectUrl
    mixObjectUrl = null

    const preserve = opts?.preservePlayback === true
    const resumeAt = preserve ? player.currentTime : 0
    const wasPlaying = preserve && !player.paused
    const prevMarkA = markA.value
    const prevMarkB = markB.value

    if (!preserve) {
      markA.value = 0
      markB.value = 0
    }
    player.pause()
    if (!preserve) await player.seek(0)
    err.value = null

    let eagerUrl: string | null = null
    if (!customMode.value) {
      // Show loading while lazy resolve / offline Mix reconstruct runs (can take seconds).
      if (!urlFor(part.value)) {
        peaks.value = []
        waveLoading.value = true
        tick.value++
      }
      eagerUrl = (await ensurePartUrl(part.value)) ?? null
    } else if (selectedCombineParts.value.length === 1) {
      eagerUrl = (await ensurePartUrl(selectedCombineParts.value[0]!)) ?? null
    }
    if (signal.aborted || seq !== loadSeq) return
    if (eagerUrl) {
      peaks.value = syntheticPeaks(280, eagerUrl)
      waveLoading.value = false
    } else {
      peaks.value = []
      waveLoading.value = customMode.value && selectedCombineParts.value.length >= 2
    }
    tick.value++

    try {
      let url: string | null = eagerUrl

      if (customMode.value) {
        const selected = selectedCombineParts.value
        if (selected.length === 0) {
          err.value = null
          waveLoading.value = false
          peaks.value = []
          player.clearSource()
          if (prevMix) URL.revokeObjectURL(prevMix)
          return
        }
        if (selected.length === 1) {
          url = (await ensurePartUrl(selected[0]!)) ?? null
          if (!url) throw new Error(`Missing audio for ${partLabel(selected[0]!)}`)
          if (prevMix) URL.revokeObjectURL(prevMix)
        } else {
          if (ultraStemCombine.value) {
            const stems: Array<{ part: string; url: string; pan: number }> = []
            for (const p of selected) {
              const u = await ensurePartUrl(p)
              if (!u) throw new Error(`Missing audio for ${partLabel(p)}`)
              stems.push({
                part: p,
                url: u,
                pan: hardPanPosition(prefs.getPartMixPan(p)),
              })
            }
            const mix = await buildUltraMixObjectUrl(stems)
            if (signal.aborted || seq !== loadSeq) {
              URL.revokeObjectURL(mix.url)
              return
            }
            mixObjectUrl = mix.url
            url = mix.url
          } else {
            const inputs = []
            for (const p of selected) {
              const u = await ensurePartUrl(p)
              if (!u) throw new Error(`Missing audio for ${partLabel(p)}`)
              inputs.push({
                url: u,
                soloInFile: resolveSoloInFile(p),
                pan: prefs.getPartMixPan(p),
              })
            }
            const mix = await buildSoloMixObjectUrl(inputs)
            if (signal.aborted || seq !== loadSeq) {
              URL.revokeObjectURL(mix.url)
              return
            }
            mixObjectUrl = mix.url
            url = mix.url
          }
          if (prevMix) URL.revokeObjectURL(prevMix)
          peaks.value = syntheticPeaks(280, url)
          waveLoading.value = false
          tick.value++
        }
      } else if (!url) {
        err.value = available.value.length ? 'No audio track available for this part.' : null
        player.clearSource()
        if (prevMix) URL.revokeObjectURL(prevMix)
        finishWaveIfCurrent(seq)
        return
      } else if (prevMix) {
        URL.revokeObjectURL(prevMix)
      }

      const wavePromise = loadWaveformPeaks(url, 280, signal).then((wave) => {
        if (signal.aborted || seq !== loadSeq) return
        peaks.value = wave.peaks
        tick.value++
      })

      // One custom part: preview that voice’s solo channel; combined mix is stereo.
      const loadSolo =
        combineMode.value
          ? 'stereo'
          : customMode.value && selectedCombineParts.value.length === 1
            ? resolveSoloInFile(selectedCombineParts.value[0]!)
            : solo.value
      // Offline ultra solos / dual-mono blobs must not fan to both speakers.
      const activePart = customMode.value
        ? selectedCombineParts.value[0]
        : part.value
      const monoPanSide =
        !combineMode.value &&
        activePart &&
        activePart.toLowerCase() !== 'mix'
          ? // Offline mono_solos blobs are rebuilt part-left; online uses metadata.
            props.audioLayoutSummary?.ultra_low === 'mono_solos'
              ? 'left'
              : soloSideForPart(activePart, props.audioLayouts, props.audioLayoutSummary)
          : null
      await player.load(url, loadSolo, { signal, monoPanSide })
      if (signal.aborted || seq !== loadSeq) return
      await player.setTransform(pitch.value, speed.value)
      await player.setBalance(combineMode.value ? 0 : balance.value)
      if (signal.aborted || seq !== loadSeq) return
      player.setLoop(false)

      const dur = player.duration
      if (preserve && dur > 0) {
        const t = Math.min(Math.max(0, resumeAt), Math.max(0, dur - 0.05))
        await player.seek(t)
        markA.value = Math.min(prevMarkA, dur)
        markB.value = Math.min(prevMarkB > 0 ? prevMarkB : dur, dur)
        if (markB.value <= markA.value) syncLoopMarks(dur)
      } else {
        syncLoopMarks(dur)
      }

      await wavePromise
      if (signal.aborted || seq !== loadSeq) return
      if (!preserve) syncLoopMarks(player.duration)
      if (wasPlaying) await player.play()
    } catch (e) {
      if (signal.aborted || (e instanceof DOMException && e.name === 'AbortError')) return
      if (seq !== loadSeq) return
      err.value = e instanceof Error ? e.message : String(e)
      if (!peaks.value.length) {
        const fallbackUrl = urlFor(part.value) ?? (part.value || 'wave')
        peaks.value = syntheticPeaks(280, fallbackUrl)
      }
    } finally {
      finishWaveIfCurrent(seq)
    }
  })()

  loadGate = run
  try {
    await run
  } finally {
    if (loadGate === run) loadGate = null
  }
}

function hasPlayRegion(): boolean {
  const d = player.duration || 0
  if (d <= 0) return false
  return markB.value - markA.value >= minLoopGapSec(d) - 0.001
}

/** Keep playhead inside A–B when starting; resume mid-region after pause. */
async function seekToRegionStartIfNeeded(): Promise<void> {
  if (!hasPlayRegion()) return
  const t = player.currentTime
  if (t < markA.value || t >= markB.value - 0.03) {
    await player.seek(markA.value)
  }
}

function maybeEnforceRegionEnd(): void {
  if (!hasPlayRegion() || player.paused) return
  if (player.currentTime < markB.value - 0.03) return
  if (loop.value) {
    // seek() restarts while playing — keep the A–B loop without player.setPlayRegion.
    void player.seek(markA.value)
    return
  }
  player.pause()
  void player.seek(Math.min(markB.value, player.duration || markB.value))
  tick.value++
}

onUnmounted(() => {
  loadAbort?.abort()
  revokeMixUrl()
  player.setEndedListener(null)
  player.dispose()
})

watch(part, (p) => {
  if (!p) return
  const preserve = preserveNextPartLoad
  preserveNextPartLoad = false
  void loadCurrent({ preservePlayback: preserve })
})

function selectPart(p: string): void {
  if (part.value === p) return
  // Channel Solo Left/Right fans one ear to both speakers — reset so learning-track
  // hard L/R imaging is audible when switching Mix ↔ Lead/Tenor/…
  if (solo.value !== 'stereo') solo.value = 'stereo'
  preserveNextPartLoad = true
  part.value = p
}

onMounted(() => {
  // Ensure DSP warm-up has started by the time the user can touch pitch/speed.
  void import('../audio/bakeClient')
    .then((m) => m.preloadBakePipeline())
    .catch(() => {})

  player.setUpdateListener(() => {
    tick.value++
    maybeEnforceRegionEnd()
  })
  player.setEndedListener(() => {
    // Fires only on full-buffer end (not A–B stop). Mid-track A–B is TagPlayer-owned.
    if (loop.value && hasPlayRegion()) {
      void player.seek(markA.value).then(() => player.play())
      return
    }
    if (hasPlayRegion()) {
      void player.seek(Math.min(markB.value, player.duration || markB.value))
    }
    emit('ended')
  })
  if (available.value.length) {
    const preferred = preferredDefaultPart(available.value) ?? available.value[0]!
    // Prefer watch(part) for the load; if already set, load explicitly.
    if (part.value === preferred) {
      void loadCurrent()
    } else part.value = preferred
  }
})

watch(combineSignature, (sig, prev) => {
  if (!customMode.value) return
  if (sig === prev) return
  void loadCurrent({ preservePlayback: true })
})

/** Custom track is stereo L/R placed; hearing both sides needs Solo = Stereo. */
watch(customMode, (on) => {
  if (on && solo.value !== 'stereo') solo.value = 'stereo'
})

watch(
  () => props.availableParts,
  (parts) => {
    if (parts == null || !parts.length) return
    if (part.value === CUSTOM_PART) {
      if (!showCustomTab.value) {
        part.value = preferredDefaultPart(parts) ?? parts[0]!
      }
      return
    }
    // Select default when part is still empty (e.g. availableParts arrived after mount).
    if (!part.value || !parts.includes(part.value)) {
      part.value = preferredDefaultPart(parts) ?? parts[0]!
      return
    }
    // Valid selection but nothing loaded yet (e.g. Mix URL warmed after a failed first load).
    if (!loadGate && player.duration <= 0) {
      void loadCurrent()
    }
  },
)

watch(
  () => Object.keys(props.parts).sort().join('\0'),
  (keys, prev) => {
    if (keys === prev) return
    if (!available.value.length) {
      loadAbort?.abort()
      loadSeq++ // invalidate in-flight load so it cannot leave waveLoading stuck
      waveLoading.value = false
      peaks.value = []
      part.value = ''
      err.value = null
      return
    }
    const preferred = preferredDefaultPart(available.value) ?? available.value[0]!
    // With lazy resolve, props.parts may omit the current part until first play —
    // availableParts (not props.parts) decides whether the tab is still valid.
    if (
      !part.value ||
      (part.value !== CUSTOM_PART && !available.value.includes(part.value))
    ) {
      part.value = preferred
      return
    }
    if (part.value === CUSTOM_PART && !showCustomTab.value) {
      part.value = preferred
      return
    }
    // Lazy resolvePart adds keys as each part is first played. Reloading here
    // without preservePlayback aborts the in-flight part switch and resets the playhead.
    const prevKeys = (prev ?? '').split('\0').filter(Boolean)
    const nextKeys = keys.split('\0').filter(Boolean)
    const onlyAddedKeys =
      nextKeys.length >= prevKeys.length && prevKeys.every((k) => nextKeys.includes(k))
    if (onlyAddedKeys) {
      const active = part.value
      // If the active part's URL just appeared and no load is in flight, start one
      // (recovers when an earlier load aborted after resolvePart stored the URL).
      if (
        active &&
        active !== CUSTOM_PART &&
        props.parts[active] &&
        !prevKeys.includes(active) &&
        !loadGate &&
        player.duration <= 0
      ) {
        void loadCurrent({ preservePlayback: true })
      }
      return
    }
    void loadCurrent()
  },
)
watch(solo, () => void player.setSolo(solo.value).then(() => tick.value++))
watch(monoSolo, (mono) => {
  if (mono && solo.value !== 'stereo') solo.value = 'stereo'
})
watch(balance, (v) => void player.setBalance(v).then(() => tick.value++))
watch(
  () => props.pitchSemitones,
  (v) => {
    if (v == null) return
    const c = clampPitchSemitones(v)
    if (c === pitch.value) return
    pitch.value = c
  },
)
watch(pitch, (v) => {
  const c = clampPitchSemitones(v)
  if (c !== v) {
    pitch.value = c
    return
  }
  void player.setPitchSemitones(c).then(() => {
    // Bake failure reverts requested → audible; keep UI truthful.
    if (player.getPitchSemitones() !== c) pitch.value = player.getPitchSemitones()
    if (player.getSpeed() !== speed.value) speed.value = player.getSpeed()
    tick.value++
  })
  emit('transform', currentTransform.value)
  emit('update:pitchSemitones', c)
})
watch(speed, (v) => {
  void player.setSpeed(v).then(() => {
    if (player.getSpeed() !== v) speed.value = player.getSpeed()
    if (player.getPitchSemitones() !== pitch.value) pitch.value = player.getPitchSemitones()
    tick.value++
  })
  emit('transform', currentTransform.value)
})
watch(loop, () => {
  // TagPlayer owns A–B via maybeEnforceRegionEnd / ended listener.
  // Keep BufferSource loop off so we don't double-loop with UI marks.
  player.setLoop(false)
})

watch(playbackReady, (ready) => {
  if (ready) return
  loop.value = false
  if (!player.paused) player.pause()
  tick.value++
})

watch(duration, (d) => {
  if (d > 0 && markB.value <= 0) syncLoopMarks(d)
})

function onMarkA(t: number): void {
  const max = player.duration || 0
  markA.value = clampMarkA(t, markB.value, max)
  if (markB.value - markA.value < minLoopGapSec(max)) {
    markB.value = clampMarkB(markA.value + minLoopGapSec(max), markA.value, max)
  }
}

function onMarkB(t: number): void {
  const max = player.duration || 0
  markB.value = clampMarkB(t, markA.value, max)
  if (markB.value - markA.value < minLoopGapSec(max)) {
    markA.value = clampMarkA(markB.value - minLoopGapSec(max), markB.value, max)
  }
}

function fmt(t: number): string {
  if (!Number.isFinite(t)) return '0:00'
  const m = Math.floor(t / 60)
  const s = Math.floor(t % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

async function togglePlay(): Promise<void> {
  if (player.paused) {
    if (customMode.value && selectedCombineParts.value.length === 0) {
      err.value = 'Select at least one part to preview, or two to combine.'
      return
    }
    // Wait for in-flight mix/track load so Play uses the selection, not a stale source.
    if (loadGate) {
      try {
        await loadGate
      } catch {
        /* loadCurrent reports err */
      }
    }
    if (customMode.value && selectedCombineParts.value.length >= 2 && !mixObjectUrl) {
      await loadCurrent()
      if (!mixObjectUrl) return
    }
    await seekToRegionStartIfNeeded()
    try {
      await player.play()
    } catch (e) {
      err.value = e instanceof Error ? e.message : String(e)
    }
  } else player.pause()
  tick.value++
}

function onSeek(t: number): void {
  let next = t
  if (hasPlayRegion()) {
    next = Math.min(Math.max(t, markA.value), markB.value)
  }
  void player.seek(next)
  tick.value++
}

function nudge(delta: number): void {
  let next = player.currentTime + delta
  if (hasPlayRegion()) {
    next = Math.min(Math.max(next, markA.value), markB.value)
  } else {
    next = Math.min(player.duration || 0, Math.max(0, next))
  }
  void player.seek(next)
  tick.value++
}

/** Pause and move playhead to region start (mark A) or track start — same whether playing or paused. */
async function stopPlayback(): Promise<void> {
  player.pause()
  const start = hasPlayRegion() ? markA.value : 0
  await player.seek(start)
  tick.value++
}
</script>

<template>
  <div class="player" role="region" aria-label="Tag audio player">
    <div
      v-if="showPartPicker"
      class="ctrl-tabs parts"
      role="tablist"
      aria-label="Voice parts"
    >
      <button
        v-for="p in partTabs"
        :key="p"
        type="button"
        role="tab"
        class="ctrl-tab part-btn"
        :class="{ active: part === p }"
        :aria-selected="part === p"
        @click="selectPart(p)"
      >
        {{ p === CUSTOM_PART ? 'Custom' : partLabel(p) }}
      </button>
    </div>
    <p v-else-if="!available.length && !waveBusy" class="error" role="status">
      No audio parts available for this tag.
    </p>

    <div v-if="customMode && showCustomTab" class="combine">
      <p class="combine-hint">
        <template v-if="soloSideKnown">
          Check two or more learning tracks, then pan each voice hard left or hard right. Solo channels
          are taken from the analyzed part-predominant side. Voices sharing a side are attenuated so
          left and right stay roughly balanced.
        </template>
        <template v-else>
          Check two or more learning tracks. Set which file channel holds the solo, then pan each voice
          hard left or hard right. Voices sharing a side are attenuated so left and right stay roughly
          balanced.
        </template>
      </p>
      <ul class="combine-list">
        <li v-for="p in combineParts" :key="p" class="combine-row">
          <label class="combine-check">
            <input
              type="checkbox"
              :checked="!!combineSelected[p]"
              :aria-label="`Include ${partLabel(p)}`"
              @change="onCombineCheck(p, $event)"
            />
            <span>{{ partLabel(p) }}</span>
          </label>
          <div class="combine-ctrls" :class="{ dim: !combineSelected[p] }">
            <div
              v-if="!hasKnownSoloSide(p, audioLayouts, audioLayoutSummary)"
              class="mini-row"
            >
              <span class="mini-lbl">Solo in file</span>
              <div class="ctrl-segment ctrl-segment--compact mini-seg" role="group" :aria-label="`${partLabel(p)} solo in file`">
                <button
                  type="button"
                  :aria-pressed="resolveSoloInFile(p) === 'left'"
                  :disabled="!combineSelected[p]"
                  @click="setSoloInFile(p, 'left')"
                >
                  Part L
                </button>
                <button
                  type="button"
                  :aria-pressed="resolveSoloInFile(p) === 'right'"
                  :disabled="!combineSelected[p]"
                  @click="setSoloInFile(p, 'right')"
                >
                  Part R
                </button>
              </div>
            </div>
            <div v-else class="mini-row">
              <span class="mini-lbl">Solo in file</span>
              <span class="mini-fixed">{{ resolveSoloInFile(p) === 'right' ? 'Part R' : 'Part L' }}</span>
            </div>
            <div class="mini-row">
              <span class="mini-lbl">Pan</span>
              <div class="ctrl-segment ctrl-segment--compact mini-seg" role="group" :aria-label="`${partLabel(p)} pan`">
                <button
                  type="button"
                  :aria-pressed="prefs.getPartMixPan(p) === 'left'"
                  :disabled="!combineSelected[p]"
                  @click="setMixPan(p, 'left')"
                >
                  Hard L
                </button>
                <button
                  type="button"
                  :aria-pressed="prefs.getPartMixPan(p) === 'right'"
                  :disabled="!combineSelected[p]"
                  @click="setMixPan(p, 'right')"
                >
                  Hard R
                </button>
              </div>
            </div>
          </div>
        </li>
      </ul>
      <p v-if="selectedCombineParts.length === 0" class="combine-need" role="status">
        Select parts to preview; choose two or more to combine.
      </p>
      <p v-else-if="selectedCombineParts.length === 1" class="combine-need" role="status">
        Select one more part to combine.
      </p>
    </div>

    <p v-if="err" class="error" role="alert">{{ err }}</p>

    <div v-if="available.length || waveBusy" class="ctrl-panel player-panel">
      <div class="wave-wrap">
        <WaveformView
          :peaks="peaks"
          :current-time="currentTime"
          :duration="duration"
          :mark-a="markA"
          :mark-b="markB"
          :interactive="playbackReady"
          @seek="onSeek"
          @update:mark-a="onMarkA"
          @update:mark-b="onMarkB"
        />
        <div v-if="waveBusy" class="wave-loading" role="status" aria-live="polite">
          Loading waveform…
        </div>
      </div>

      <div class="ctrl-transport transport" :class="{ muted: !playbackReady }">
        <button
          type="button"
          class="ctrl-transport-btn ctrl-transport-btn--primary transport-btn play"
          :aria-label="paused ? 'Play' : 'Pause'"
          :disabled="!playbackReady"
          @click="togglePlay"
        >
          {{ paused ? '▶' : '⏸' }}
        </button>
        <button
          type="button"
          class="ctrl-transport-btn transport-btn"
          aria-label="Stop — pause and go to start"
          title="Stop and go to start"
          :disabled="!playbackReady"
          @click="stopPlayback"
        >
          ■
        </button>
        <button
          type="button"
          class="ctrl-transport-btn transport-btn"
          aria-label="Back 1 second"
          :disabled="!playbackReady"
          @click="nudge(-1)"
        >
          −1s
        </button>
        <button
          type="button"
          class="ctrl-transport-btn transport-btn"
          aria-label="Forward 1 second"
          :disabled="!playbackReady"
          @click="nudge(1)"
        >
          +1s
        </button>
        <span class="time">{{ fmt(currentTime) }} / {{ fmt(duration) }}</span>
        <button
          type="button"
          class="ctrl-toggle toggle-btn"
          :aria-pressed="loop"
          :disabled="!playbackReady"
          @click="loop = !loop"
        >
          Loop
        </button>
      </div>
      <p class="hint ab-hint">
        Drag the side brackets to set the play region. Playback starts at the left bracket and stops at
        the right; turn on Loop to repeat that region.
      </p>

      <div class="advanced-bar">
        <details class="advanced-playback" :class="{ muted: !playbackReady }">
          <summary>Advanced</summary>
          <div class="adjust">
            <div class="adjust-row">
              <div class="ctrl-field adjust-field solo-field" role="group" aria-label="Channel solo">
                <span class="ctrl-field-label lbl">Solo</span>
                <div class="ctrl-segment seg">
                  <button
                    type="button"
                    :aria-pressed="solo === 'stereo'"
                    :class="{ on: solo === 'stereo' }"
                    :disabled="!playbackReady || monoSolo"
                    :title="monoSolo ? 'Track is mono — solo unavailable' : undefined"
                    @click="solo = 'stereo'"
                  >
                    Stereo
                  </button>
                  <button
                    type="button"
                    :aria-pressed="solo === 'left'"
                    :class="{ on: solo === 'left' }"
                    :disabled="!playbackReady || monoSolo"
                    :title="monoSolo ? 'Track is mono — solo unavailable' : undefined"
                    @click="solo = 'left'"
                  >
                    Left
                  </button>
                  <button
                    type="button"
                    :aria-pressed="solo === 'right'"
                    :class="{ on: solo === 'right' }"
                    :disabled="!playbackReady || monoSolo"
                    :title="monoSolo ? 'Track is mono — solo unavailable' : undefined"
                    @click="solo = 'right'"
                  >
                    Right
                  </button>
                </div>
              </div>
              <label class="ctrl-field adjust-field balance-field">
                <span class="ctrl-field-label lbl">Balance <strong>{{ balanceLabel }}</strong></span>
                <input
                  v-model.number="balance"
                  type="range"
                  min="-1"
                  max="1"
                  step="0.01"
                  :disabled="!playbackReady || solo !== 'stereo'"
                  aria-label="Stereo balance — ducks one side, boosts the other when headroom allows"
                />
              </label>
              <label class="ctrl-field adjust-field speed-field">
                <span class="ctrl-field-label lbl">Speed</span>
                <select v-model.number="speed" aria-label="Playback speed" :disabled="!playbackReady">
                  <option v-for="opt in SPEED_OPTIONS" :key="opt.value" :value="opt.value">
                    {{ opt.label }}
                  </option>
                </select>
              </label>
              <div class="ctrl-field adjust-field pitch-field" role="group" aria-label="Pitch">
                <span class="ctrl-field-label lbl">Pitch <strong>{{ pitchLabel }}</strong></span>
                <div class="pitch-btns">
                  <button
                    type="button"
                    aria-label="Lower pitch one semitone"
                    :disabled="!playbackReady || pitch <= MIN_PITCH_SEMITONES"
                    @click="bumpPitch(-1)"
                  >
                    −
                  </button>
                  <button
                    type="button"
                    aria-label="Raise pitch one semitone"
                    :disabled="!playbackReady || pitch >= MAX_PITCH_SEMITONES"
                    @click="bumpPitch(1)"
                  >
                    +
                  </button>
                  <button type="button" :disabled="!playbackReady || !pitch" @click="pitch = 0">Reset</button>
                </div>
              </div>
            </div>
            <p v-if="bakeError" class="warn" role="alert">{{ bakeError }}</p>
            <p v-if="monoSolo" class="warn" role="status">
              This track is mono (or the same on both sides) — channel solo is unavailable.
            </p>
          </div>
        </details>
        <div v-if="$slots['advanced-actions']" class="advanced-actions">
          <slot name="advanced-actions" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.player {
  display: grid;
  gap: 0.75rem;
  padding: 0;
  background: transparent;
  border: 0;
  min-width: 0;
  max-width: 100%;
}
.wave-wrap {
  position: relative;
  min-width: 0;
  max-width: 100%;
}
.wave-loading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  background: color-mix(in srgb, var(--surface) 72%, transparent);
  backdrop-filter: blur(2px);
  color: var(--muted);
  font-size: 0.95rem;
  font-weight: 600;
  pointer-events: none;
}
.player-panel {
  padding: 0.75rem;
}
/* Keep voice-part tabs on one row; compress width, keep readable type. */
.parts.ctrl-tabs {
  display: flex;
  flex-wrap: nowrap;
  width: 100%;
  gap: 0.1rem;
}
.parts .ctrl-tab.part-btn {
  flex: 1 1 0;
  min-width: 0;
  max-width: none;
  padding: 0.4rem 0.25rem;
  font-size: 0.9rem;
}
@media (min-width: 720px) {
  .parts.ctrl-tabs {
    display: flex;
    flex-wrap: nowrap;
    grid-template-columns: unset;
  }
  .parts .ctrl-tab.part-btn {
    flex: 1 1 0;
    min-width: 0;
  }
}

/* Transport + Loop: one row, shrink width — not type size. */
.transport.ctrl-transport {
  display: flex;
  flex-wrap: nowrap;
  align-items: stretch;
  gap: 0.3rem;
  width: 100%;
}
.transport .ctrl-transport-btn {
  flex: 1 1 0;
  min-width: 0;
  width: auto;
  padding: 0.4rem 0.2rem;
  font-size: 0.9rem;
}
.transport .ctrl-transport-btn--primary {
  font-size: 1.05rem;
}
.transport .time {
  grid-column: unset;
  flex: 1.15 1 0;
  min-width: 0;
  margin: 0;
  align-self: center;
  text-align: center;
  font-variant-numeric: tabular-nums;
  color: var(--muted);
  font-size: 0.85rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.transport .ctrl-toggle {
  grid-column: unset;
  flex: 1 1 0;
  min-width: 0;
  width: auto;
  padding: 0.35rem 0.35rem;
  font-size: 0.9rem;
  gap: 0.25rem;
}
.transport .ctrl-toggle::before {
  width: 0.4rem;
  height: 0.4rem;
}
.combine {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 0.65rem;
  background: var(--surface);
  min-width: 0;
  max-width: 100%;
}
.combine-hint {
  margin: 0 0 0.75rem;
  font-size: 0.85rem;
  color: var(--muted);
  line-height: 1.4;
}
.combine-need {
  margin: 0.75rem 0 0;
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--accent-hover);
}
.combine-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.75rem;
}
.combine-row {
  display: grid;
  gap: 0.45rem;
  min-width: 0;
}
.combine-check {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 600;
  min-width: 0;
}
.combine-check input {
  width: 1.15rem;
  height: 1.15rem;
  flex-shrink: 0;
  accent-color: var(--accent);
}
.combine-ctrls {
  display: grid;
  gap: 0.45rem;
  min-width: 0;
}
.combine-ctrls.dim {
  opacity: 0.45;
}
.mini-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
  min-width: 0;
}
.mini-lbl {
  flex: 0 0 auto;
  font-size: 0.8rem;
  color: var(--muted);
  min-width: 4.5rem;
}
.mini-fixed {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text);
}
.mini-seg {
  flex: 1 1 8rem;
  min-width: 0;
}
.muted {
  opacity: 0.45;
}
.pitch-btns button:disabled,
.adjust select:disabled,
.adjust input:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.adjust {
  display: grid;
  gap: 0.65rem;
  min-width: 0;
}
.seg {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  width: 100%;
}
.adjust-row {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0.75rem;
  align-items: end;
  min-width: 0;
}
.balance-field input[type='range'] {
  width: 100%;
  max-width: 100%;
  height: 44px;
  accent-color: var(--accent);
}
.balance-field input[type='range']:disabled {
  opacity: 0.45;
}
.speed-field select {
  min-height: 44px;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  padding: 0.4rem 0.65rem;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--bg);
  font: inherit;
  font-weight: 600;
  font-size: 0.95rem;
  color: inherit;
}
.pitch-field .pitch-btns {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  align-items: center;
  min-width: 0;
}
.pitch-btns button {
  flex: 1 1 auto;
  border: 1px solid var(--border);
  background: var(--bg);
  border-radius: 10px;
  padding: 0.4rem 0.55rem;
  min-height: 44px;
  min-width: 2.75rem;
  font: inherit;
  font-weight: 600;
}
.pitch-btns button:disabled {
  opacity: 0.45;
}
.error,
.warn {
  color: var(--danger);
  margin: 0;
  font-size: 0.9rem;
}
.ab-hint {
  margin-top: -0.25rem;
  font-size: 0.85rem;
  color: var(--muted);
}
.advanced-bar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.5rem 0.75rem;
  min-width: 0;
}
.advanced-playback {
  flex: 1 1 auto;
  margin: 0;
  min-width: 0;
}
.advanced-actions {
  flex: 0 0 auto;
  padding-top: 0.3rem;
}
.advanced-playback > summary {
  cursor: pointer;
  user-select: none;
  font-weight: 700;
  font-size: 0.92rem;
  color: var(--muted);
  padding: 0.35rem 0;
  list-style: none;
}
.advanced-playback > summary::-webkit-details-marker {
  display: none;
}
.advanced-playback > summary::before {
  content: '▸';
  display: inline-block;
  margin-right: 0.45rem;
  transition: transform 0.15s ease;
  font-size: 0.85em;
}
.advanced-playback[open] > summary::before {
  transform: rotate(90deg);
}
.advanced-playback > summary:hover {
  color: var(--accent-hover);
}
.advanced-playback[open] > summary {
  margin-bottom: 0.65rem;
}
.advanced-playback .adjust {
  padding-top: 0.15rem;
}

@media (min-width: 420px) {
  .adjust-row {
    grid-template-columns: 1fr 1fr;
  }
  .solo-field,
  .balance-field {
    grid-column: 1 / -1;
  }
}

@media (min-width: 720px) {
  .player {
    gap: 0.85rem;
  }
  .player-panel {
    padding: 0.95rem 1rem 1rem;
  }
  .transport {
    gap: 0.45rem;
  }
  .transport .ctrl-transport-btn {
    flex: 1 1 0;
    padding: 0.4rem 0.35rem;
    font-size: 0.95rem;
  }
  .transport .ctrl-transport-btn--primary {
    font-size: 1.1rem;
  }
  .transport .time {
    flex: 0 1 auto;
    margin-left: 0.15rem;
    min-width: 6.5rem;
    text-align: right;
    font-size: 0.9rem;
  }
  .transport .ctrl-toggle {
    flex: 0 1 auto;
    min-width: 5rem;
    width: auto;
    padding: 0.4rem 0.75rem;
    font-size: 0.92rem;
  }
  .adjust-row {
    grid-template-columns: minmax(11rem, 1.15fr) minmax(0, 1.35fr) auto auto;
    gap: 0.65rem 1rem;
    align-items: end;
  }
  .solo-field,
  .balance-field {
    grid-column: auto;
  }
  .speed-field select {
    width: auto;
    min-width: 6.5rem;
  }
  .pitch-btns button {
    flex: 0 0 auto;
  }
  .combine-ctrls {
    grid-template-columns: 1fr 1fr;
  }
  .combine {
    padding: 0.75rem;
  }
}
</style>
