<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { TagAudioPlayer, type SoloMode } from '../audio/player'
import { formatKeyShiftLabel } from '../audio/pitchPlayer'
import { loadWaveformPeaks, syntheticPeaks } from '../audio/waveform'
import { buildSoloMixObjectUrl, defaultMixPanForNextSelection } from '../audio/multiPartMix'
import { partLabel, preferredDefaultPart, sortPartIds } from '../lib/parts'
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
    /** Catalog relative paths (for fetching hosted original while online). */
    catalogPaths?: Record<string, string>
    baseUrl?: string
    title?: string
    tagId?: number
    pitchSemitones?: number
    /** Original song key for pitch label, e.g. "Ab Major". */
    songKey?: string
    /** Parent is still fetching tag media (show empty waveform + loading). */
    pending?: boolean
  }>(),
  { pitchSemitones: undefined, songKey: undefined, pending: false, catalogPaths: undefined },
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
const pitch = ref(props.pitchSemitones ?? 0)
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
const channels = ref(2)
/** Which learning parts are included in the combine mix. */
const combineSelected = reactive<Record<string, boolean>>({})
let loadAbort: AbortController | null = null
let loadSeq = 0
let mixObjectUrl: string | null = null
/** In-flight load — Play waits so Custom mix is ready before starting. */
let loadGate: Promise<void> | null = null
/** Object URLs for network originals fetched while online. */
const originalUrls = reactive<Record<string, string>>({})
const originalFetchGen = reactive<Record<string, number>>({})

function urlFor(p: string): string | null {
  if (originalUrls[p]) return originalUrls[p]!
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

function catalogNetworkUrl(p: string): string | null {
  const path = props.catalogPaths?.[p]
  if (!path) return null
  return mediaUrl(path)
}

function revokeOriginalUrls(): void {
  for (const [k, u] of Object.entries(originalUrls)) {
    URL.revokeObjectURL(u)
    delete originalUrls[k]
    delete originalFetchGen[k]
  }
}

const CUSTOM_PART = 'custom'

const available = computed(() => sortPartIds(Object.keys(props.parts).filter((k) => !!props.parts[k])))

/** Learning parts eligible for combine (exclude full mix). */
const combineParts = computed(() => available.value.filter((p) => p !== 'mix'))

const selectedCombineParts = computed(() => combineParts.value.filter((p) => combineSelected[p]))

/** Custom tab is offered when at least two learning tracks exist. */
const showCustomTab = computed(() => combineParts.value.length >= 2)

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

const currentTransform = computed<AudioTransform>(() => ({
  pitchSemitones: pitch.value,
  speed: speed.value,
}))

const hasTransform = computed(
  () => Math.abs(pitch.value) >= 0.01 || Math.abs(speed.value - 1) >= 0.001,
)

const monoSolo = computed(() => channels.value < 2 && solo.value !== 'stereo')

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
const usingWorklet = computed(() => {
  void tick.value
  return player.usingWorklet
})

const balanceLabel = computed(() => {
  const b = balance.value
  if (Math.abs(b) < 0.02) return 'Center'
  if (b < 0) return `L +${Math.round(-b * 100)}%`
  return `R +${Math.round(b * 100)}%`
})

const pitchLabel = computed(() => formatKeyShiftLabel(props.songKey, pitch.value))

const waveBusy = computed(
  () => (waveLoading.value && peaks.value.length === 0) || (props.pending && !available.value.length),
)

const combineSignature = computed(() =>
  selectedCombineParts.value
    .map((p) => {
      const soloIn = prefs.partSoloInFile[p] ?? 'left'
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
  if (on) void prefetchOriginal(p)
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

/**
 * While online + preference on, fetch hosted original in the background.
 * Playback keeps using the cached URL until the original is ready, then reloads.
 */
async function prefetchOriginal(partId: string): Promise<void> {
  if (!prefs.playOriginalWhileOnline) return
  if (typeof navigator !== 'undefined' && !navigator.onLine) return
  if (originalUrls[partId]) return
  const net = catalogNetworkUrl(partId)
  if (!net) return
  const current = props.parts[partId]
  if (current && !current.startsWith('blob:')) return

  const gen = (originalFetchGen[partId] ?? 0) + 1
  originalFetchGen[partId] = gen
  try {
    const res = await fetch(net)
    if (!res.ok || originalFetchGen[partId] !== gen) return
    const buf = await res.arrayBuffer()
    if (originalFetchGen[partId] !== gen) return
    const mime = res.headers.get('content-type') || 'audio/mp4'
    const url = URL.createObjectURL(new Blob([buf], { type: mime }))
    if (originalUrls[partId]) URL.revokeObjectURL(originalUrls[partId]!)
    originalUrls[partId] = url

    if (prefs.upgradeCachedOnPlay && props.tagId != null && props.catalogPaths?.[partId]) {
      const { upgradeStarredAudioPart } = await import('../offline/starredDb')
      void upgradeStarredAudioPart(props.tagId, partId, {
        path: props.catalogPaths[partId]!,
        mime,
        data: buf.slice(0),
        quality: 'original',
      })
    }

    if (part.value === partId || (customMode.value && combineSelected[partId])) {
      void loadCurrent()
    }
  } catch {
    /* keep cached playback */
  }
}

function prefetchForCurrentSelection(): void {
  if (customMode.value) {
    for (const p of selectedCombineParts.value) void prefetchOriginal(p)
    return
  }
  if (part.value && part.value !== CUSTOM_PART) void prefetchOriginal(part.value)
}

async function loadCurrent(): Promise<void> {
  const run = (async () => {
    const seq = ++loadSeq
    loadAbort?.abort()
    loadAbort = new AbortController()
    const { signal } = loadAbort
    const prevMix = mixObjectUrl
    mixObjectUrl = null

    markA.value = 0
    markB.value = 0
    player.pause()
    player.seek(0)
    err.value = null

    const eagerUrl = !customMode.value
      ? urlFor(part.value)
      : selectedCombineParts.value.length === 1
        ? urlFor(selectedCombineParts.value[0]!)
        : null
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
          // Preview the first checked part until a second voice is added.
          url = urlFor(selected[0]!)
          if (!url) throw new Error(`Missing audio for ${partLabel(selected[0]!)}`)
          if (prevMix) URL.revokeObjectURL(prevMix)
        } else {
          const inputs = []
          for (const p of selected) {
            const u = urlFor(p)
            if (!u) throw new Error(`Missing audio for ${partLabel(p)}`)
            inputs.push({
              url: u,
              soloInFile: prefs.getPartSoloInFile(p),
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
        channels.value = wave.channels
        tick.value++
      })

      // One custom part: preview that voice’s solo channel; combined mix is stereo.
      const loadSolo =
        combineMode.value
          ? 'stereo'
          : customMode.value && selectedCombineParts.value.length === 1
            ? prefs.getPartSoloInFile(selectedCombineParts.value[0]!)
            : solo.value
      await player.load(url, loadSolo)
      if (signal.aborted || seq !== loadSeq) return
      await player.setPitchSemitones(pitch.value)
      await player.setSpeed(speed.value)
      await player.setBalance(combineMode.value ? 0 : balance.value)
      if (signal.aborted || seq !== loadSeq) return
      player.setLoop(false)
      syncLoopMarks(player.duration)

      await wavePromise
      if (signal.aborted || seq !== loadSeq) return
      syncLoopMarks(player.duration)
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

function maybeWrapLoop(): void {
  if (!loop.value) return
  if (markB.value <= markA.value) return
  if (player.currentTime >= markB.value - 0.03) {
    player.seek(markA.value)
  }
}

onUnmounted(() => {
  loadAbort?.abort()
  revokeMixUrl()
  revokeOriginalUrls()
  player.setEndedListener(null)
  player.dispose()
})

watch(part, (p) => {
  if (!p) return
  prefetchForCurrentSelection()
  void loadCurrent()
})

onMounted(() => {
  player.setUpdateListener(() => {
    tick.value++
    maybeWrapLoop()
  })
  player.setEndedListener(() => {
    if (loop.value && markB.value > markA.value) {
      player.seek(markA.value)
      void player.play()
      return
    }
    emit('ended')
  })
  if (available.value.length) {
    const preferred = preferredDefaultPart(available.value) ?? available.value[0]!
    // Prefer watch(part) for the load; if already set, load explicitly.
    if (part.value === preferred) {
      prefetchForCurrentSelection()
      void loadCurrent()
    } else part.value = preferred
  }
})

watch(combineSignature, (sig, prev) => {
  if (!customMode.value) return
  if (sig === prev) return
  void loadCurrent()
})

/** Custom track is stereo L/R placed; hearing both sides needs Solo = Stereo. */
watch(customMode, (on) => {
  if (on && solo.value !== 'stereo') solo.value = 'stereo'
})

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
    if (!part.value || (part.value !== CUSTOM_PART && !props.parts[part.value])) {
      part.value = preferred
      return
    }
    if (part.value === CUSTOM_PART && !showCustomTab.value) {
      part.value = preferred
      return
    }
    void loadCurrent()
  },
)
watch(solo, () => void player.setSolo(solo.value).then(() => tick.value++))
watch(balance, (v) => void player.setBalance(v).then(() => tick.value++))
watch(
  () => props.pitchSemitones,
  (v) => {
    if (v == null || v === pitch.value) return
    pitch.value = v
  },
)
watch(pitch, (v) => {
  void player.setPitchSemitones(v)
  emit('transform', currentTransform.value)
  emit('update:pitchSemitones', v)
})
watch(speed, (v) => {
  void player.setSpeed(v)
  emit('transform', currentTransform.value)
})
watch(loop, () => {
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
  markA.value = Math.min(Math.max(0, t), Math.max(0, markB.value - 0.05))
  if (markB.value <= markA.value) markB.value = Math.min(max, markA.value + 0.5)
}

function onMarkB(t: number): void {
  const max = player.duration || 0
  markB.value = Math.max(Math.min(max, t), markA.value + 0.05)
  if (markA.value >= markB.value) markA.value = Math.max(0, markB.value - 0.5)
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
    if (loop.value && markB.value > markA.value) {
      if (player.currentTime < markA.value || player.currentTime >= markB.value) {
        player.seek(markA.value)
      }
    }
    try {
      await player.play()
    } catch (e) {
      err.value = e instanceof Error ? e.message : String(e)
    }
  } else player.pause()
  tick.value++
}

function onSeek(t: number): void {
  player.seek(t)
  tick.value++
}

function nudge(delta: number): void {
  player.seek(Math.min(player.duration || 0, Math.max(0, player.currentTime + delta)))
  tick.value++
}

async function stopToLoopStart(): Promise<void> {
  const wasPlaying = !player.paused
  player.seek(markA.value)
  if (wasPlaying) await player.play()
  else player.pause()
  tick.value++
}
</script>

<template>
  <div class="player" role="region" aria-label="Tag audio player">
    <div
      v-if="showPartPicker"
      class="parts"
      role="tablist"
      aria-label="Voice parts"
      :style="{ gridTemplateColumns: `repeat(${partTabs.length}, minmax(0, 1fr))` }"
    >
      <button
        v-for="p in partTabs"
        :key="p"
        type="button"
        role="tab"
        class="part-btn"
        :class="{ active: part === p }"
        :aria-selected="part === p"
        @click="part = p"
      >
        {{ p === CUSTOM_PART ? 'Custom' : partLabel(p) }}
      </button>
    </div>
    <p v-else-if="!available.length && !waveBusy" class="error" role="status">
      No audio parts available for this tag.
    </p>

    <div v-if="customMode && showCustomTab" class="combine">
      <p class="combine-hint">
        Check two or more learning tracks. Set which file channel holds the solo, then pan each voice hard
        left or hard right. Voices sharing a side are attenuated so left and right stay roughly balanced.
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
            <div class="mini-seg" role="group" :aria-label="`${partLabel(p)} solo in file`">
              <span class="mini-lbl">Solo in file</span>
              <button
                type="button"
                :class="{ on: prefs.getPartSoloInFile(p) === 'left' }"
                :disabled="!combineSelected[p]"
                @click="setSoloInFile(p, 'left')"
              >
                Part L
              </button>
              <button
                type="button"
                :class="{ on: prefs.getPartSoloInFile(p) === 'right' }"
                :disabled="!combineSelected[p]"
                @click="setSoloInFile(p, 'right')"
              >
                Part R
              </button>
            </div>
            <div class="mini-seg" role="group" :aria-label="`${partLabel(p)} pan`">
              <span class="mini-lbl">Pan</span>
              <button
                type="button"
                :class="{ on: prefs.getPartMixPan(p) === 'left' }"
                :disabled="!combineSelected[p]"
                @click="setMixPan(p, 'left')"
              >
                Hard L
              </button>
              <button
                type="button"
                :class="{ on: prefs.getPartMixPan(p) === 'right' }"
                :disabled="!combineSelected[p]"
                @click="setMixPan(p, 'right')"
              >
                Hard R
              </button>
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

    <div v-if="available.length || waveBusy" class="wave-wrap">
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

    <div class="transport" :class="{ muted: !playbackReady }">
      <button
        type="button"
        class="transport-btn play"
        :aria-label="paused ? 'Play' : 'Pause'"
        :disabled="!playbackReady"
        @click="togglePlay"
      >
        {{ paused ? '▶' : '⏸' }}
      </button>
      <button
        type="button"
        class="transport-btn"
        aria-label="Stop — go to loop start"
        title="Go to loop start"
        :disabled="!playbackReady"
        @click="stopToLoopStart"
      >
        ■
      </button>
      <button
        type="button"
        class="transport-btn"
        aria-label="Back 5 seconds"
        :disabled="!playbackReady"
        @click="nudge(-5)"
      >
        −5s
      </button>
      <button
        type="button"
        class="transport-btn"
        aria-label="Forward 5 seconds"
        :disabled="!playbackReady"
        @click="nudge(5)"
      >
        +5s
      </button>
      <span class="time">{{ fmt(currentTime) }} / {{ fmt(duration) }}</span>
      <button
        type="button"
        class="toggle-btn"
        :class="{ on: loop }"
        :aria-pressed="loop"
        :disabled="!playbackReady"
        @click="loop = !loop"
      >
        Loop
      </button>
    </div>
    <p class="hint ab-hint">Drag the side brackets to set the loop region.</p>

    <div class="adjust" :class="{ muted: !playbackReady }">
      <div class="solo" role="group" aria-label="Channel solo">
        <span class="lbl">Solo</span>
        <div class="seg">
          <button
            type="button"
            :class="{ on: solo === 'stereo' }"
            :disabled="!playbackReady"
            @click="solo = 'stereo'"
          >
            Stereo
          </button>
          <button
            type="button"
            :class="{ on: solo === 'left' }"
            :disabled="!playbackReady"
            @click="solo = 'left'"
          >
            Left
          </button>
          <button
            type="button"
            :class="{ on: solo === 'right' }"
            :disabled="!playbackReady"
            @click="solo = 'right'"
          >
            Right
          </button>
        </div>
      </div>
      <p v-if="monoSolo" class="warn" role="status">This track is mono — Left/Right solo won’t change the sound.</p>

      <div class="adjust-row">
        <label class="adjust-field balance-field">
          <span class="lbl">Balance <strong>{{ balanceLabel }}</strong></span>
          <input
            v-model.number="balance"
            type="range"
            min="-1"
            max="1"
            step="0.01"
            :disabled="!playbackReady || solo !== 'stereo'"
            aria-label="Stereo balance — boosts the favored side"
          />
        </label>
        <label class="adjust-field speed-field">
          <span class="lbl">Speed</span>
          <select v-model.number="speed" aria-label="Playback speed" :disabled="!playbackReady">
            <option v-for="opt in SPEED_OPTIONS" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
        </label>
        <div class="adjust-field pitch-field" role="group" aria-label="Pitch">
          <span class="lbl">Pitch <strong>{{ pitchLabel }}</strong></span>
          <div class="pitch-btns">
            <button
              type="button"
              aria-label="Lower pitch one semitone"
              :disabled="!playbackReady"
              @click="pitch--"
            >
              −
            </button>
            <button
              type="button"
              aria-label="Raise pitch one semitone"
              :disabled="!playbackReady"
              @click="pitch++"
            >
              +
            </button>
            <button type="button" :disabled="!playbackReady || !pitch" @click="pitch = 0">Reset</button>
          </div>
        </div>
      </div>
    </div>

    <p class="hint">
      {{
        usingWorklet
          ? 'Independent pitch and speed via SoundTouch.'
          : hasTransform
            ? 'Using browser pitch/speed until SoundTouch loads.'
            : 'Playback at original pitch and speed.'
      }}
      <template v-if="combineMode">
        Custom track places each solo hard left or right; Solo Left/Right here isolates that side of the mix.
      </template>
      <template v-else-if="solo === 'stereo'">
        Balance boosts the side you favor (up to +6 dB). Quieter channels are matched automatically.
      </template>
      <template v-else> Solo plays that channel in mono on both speakers.</template>
    </p>
  </div>
</template>

<style scoped>
.player {
  display: grid;
  gap: 0.85rem;
  padding: 0;
  background: transparent;
  border: 0;
}
.wave-wrap {
  position: relative;
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
.parts {
  display: grid;
  gap: 0.45rem;
}
.part-btn {
  min-height: 48px;
  min-width: 0;
  width: 100%;
  border: 1px solid var(--border);
  background: var(--bg);
  border-radius: 10px;
  padding: 0.55rem 0.75rem;
  font: inherit;
  font-weight: 600;
  font-size: 0.95rem;
}
.part-btn.active {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
}
.combine {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 0.75rem;
  background: var(--surface);
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
}
.combine-check {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 600;
}
.combine-check input {
  width: 1.15rem;
  height: 1.15rem;
  accent-color: var(--accent);
}
.combine-ctrls {
  display: grid;
  gap: 0.45rem;
}
.combine-ctrls.dim {
  opacity: 0.45;
}
.mini-seg {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
}
.mini-lbl {
  font-size: 0.8rem;
  color: var(--muted);
  min-width: 5.5rem;
}
.mini-seg button {
  min-height: 40px;
  padding: 0.35rem 0.65rem;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg);
  font: inherit;
  font-size: 0.85rem;
  font-weight: 600;
}
.mini-seg button.on {
  background: color-mix(in srgb, var(--accent) 16%, var(--surface));
  border-color: var(--accent);
  color: var(--accent-hover);
}
.mini-seg button:disabled {
  cursor: not-allowed;
}
.muted {
  opacity: 0.45;
}
.transport-btn:disabled,
.toggle-btn:disabled,
.seg button:disabled,
.pitch-btns button:disabled,
.adjust select:disabled,
.adjust input:disabled {
  cursor: not-allowed;
}
.transport {
  display: flex;
  flex-wrap: wrap;
  align-items: stretch;
  gap: 0.5rem;
}
.transport-btn {
  flex: 1 1 0;
  min-height: 52px;
  min-width: 4.5rem;
  padding: 0.45rem 1rem;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: var(--bg);
  font: inherit;
  font-weight: 600;
  font-size: 1rem;
}
.transport-btn.play {
  border: 0;
  background: var(--accent);
  color: #fff;
  font-size: 1.1rem;
}
.toggle-btn {
  flex: 1 1 auto;
  min-height: 52px;
  min-width: 7rem;
  padding: 0.45rem 1rem;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: var(--bg);
  font: inherit;
  font-weight: 600;
  font-size: 0.95rem;
}
.toggle-btn.on {
  background: color-mix(in srgb, var(--accent) 16%, var(--surface));
  border-color: var(--accent);
  color: var(--accent-hover);
}
.adjust {
  display: grid;
  gap: 0.85rem;
}
.solo {
  display: grid;
  gap: 0.35rem;
}
.lbl {
  font-size: 0.85rem;
  color: var(--muted);
}
.seg {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.45rem;
}
.seg button {
  min-height: 48px;
  width: 100%;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--bg);
  font: inherit;
  font-weight: 600;
  font-size: 0.95rem;
  padding: 0.55rem 0.5rem;
}
.seg button.on {
  background: color-mix(in srgb, var(--accent) 16%, var(--surface));
  border-color: var(--accent);
  color: var(--accent-hover);
}
.slider {
  display: grid;
  gap: 0.35rem;
}
.slider input[type='range'] {
  width: 100%;
  height: 44px;
  accent-color: var(--accent);
}
.slider input[type='range']:disabled {
  opacity: 0.45;
}
.adjust-row {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) auto auto;
  gap: 0.65rem 1rem;
  align-items: end;
}
.adjust-field {
  display: grid;
  gap: 0.35rem;
  min-width: 0;
}
.adjust-field .lbl {
  white-space: nowrap;
}
.balance-field input[type='range'] {
  width: 100%;
  height: 44px;
  accent-color: var(--accent);
}
.balance-field input[type='range']:disabled {
  opacity: 0.45;
}
.speed-field select {
  min-height: 44px;
  min-width: 6.5rem;
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
  gap: 0.4rem;
  align-items: center;
}
.pitch-btns button {
  border: 1px solid var(--border);
  background: var(--bg);
  border-radius: 10px;
  padding: 0.45rem 0.7rem;
  min-height: 44px;
  min-width: 44px;
  font: inherit;
  font-weight: 600;
}
.pitch-btns button:disabled {
  opacity: 0.45;
}
@media (max-width: 720px) {
  .adjust-row {
    grid-template-columns: 1fr;
    align-items: stretch;
  }
}
.time {
  font-variant-numeric: tabular-nums;
  color: var(--muted);
  margin-left: auto;
  align-self: center;
  min-width: 6.5rem;
  text-align: right;
}
.error,
.warn {
  color: var(--danger);
  margin: 0;
  font-size: 0.9rem;
}
.hint {
  margin: 0;
  font-size: 0.8rem;
  color: var(--muted);
}
.ab-hint {
  margin-top: -0.35rem;
}
@media (min-width: 720px) {
  .adjust {
    grid-template-columns: 1fr 1fr;
    align-items: end;
  }
  .solo {
    grid-column: 1 / -1;
  }
  .combine-ctrls {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
