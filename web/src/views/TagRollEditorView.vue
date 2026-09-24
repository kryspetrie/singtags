<script setup lang="ts">
/**
 * Tag Studio editor — piano-roll arranger for custom tags.
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { createPitchTonePlayer, type PitchTonePlayer } from '../audio/pitchTone'
import { MetronomeClicker } from '../audio/metronomeClicker'
import { midiToNote } from '../audio/pianoSamples'
import { resolvePitchPipeVoiceById } from '../audio/pitchPipeVoice'
import TagRollExpressionLane from '../components/tagRoll/TagRollExpressionLane.vue'
import TagRollDeclaredLane from '../components/tagRoll/TagRollDeclaredLane.vue'
import TagRollDetectedLane from '../components/tagRoll/TagRollDetectedLane.vue'
import TagRollHarmonizePanel from '../components/tagRoll/TagRollHarmonizePanel.vue'
import ArrangingCoachDock from '../components/arranging/ArrangingCoachDock.vue'
import ArrangingCoachLane from '../components/arranging/ArrangingCoachLane.vue'
import ArrangingCoachRollNav from '../components/arranging/ArrangingCoachRollNav.vue'
import TagRollLyricsLane from '../components/tagRoll/TagRollLyricsLane.vue'
import TagRollPartsPanel from '../components/tagRoll/TagRollPartsPanel.vue'
import TagRollMediaBar from '../components/tagRoll/TagRollMediaBar.vue'
import TagRollMixerPanel from '../components/tagRoll/TagRollMixerPanel.vue'
import TagRollShortcutsOverlay from '../components/tagRoll/TagRollShortcutsOverlay.vue'
import TagRollTote from '../components/tagRoll/TagRollTote.vue'
import TagRollToolbar from '../components/tagRoll/TagRollToolbar.vue'
import TagRollViewport from '../components/tagRoll/TagRollViewport.vue'
import TagRollSheetViewport from '../components/tagRoll/TagRollSheetViewport.vue'
import {
  provideTagRollAudio,
  type TagRollAudioApi,
} from '../composables/useTagRollAudio'
import { hearStackNotesAtTick } from '../lib/tagRoll/notesAtTick'
import { isPartAudible, mixForPart, syncProjectMix } from '../lib/tagRoll/mix'
import { createTagRollScheduler, type TagRollScheduler } from '../lib/tagRoll/scheduler'
import { downloadMidi, type MidiExportMode } from '../application/tagRoll/downloadMidi'
import { downloadMusicXml } from '../application/tagRoll/downloadMusicXml'
import { downloadAudio } from '../application/tagRoll/downloadAudio'
import { downloadTagRollProjectJson } from '../lib/tagRoll/projectJson'
import { planBlowPitch, shouldBlowPitchOnPlay } from '../lib/tagRoll/blowPitch'
import { beatsCrossedSigned } from '../lib/tagRoll/metronomeBeats'
import { saveTagRollToLibrary } from '../lib/tagRoll/saveToLibrary'
import { getTagStudioServices } from '../composition/tagStudio'
import { TAG_ROLL_DURATION_PRESETS, dottedDurationTicks, stepDurationTicks } from '../lib/tagRoll/snap'
import { findPartByHotkey } from '../lib/tagRoll/partHotkeys'
import { isTypingTarget, matchModKey, tagRollTip, tipByShortcutId } from '../lib/tagRoll/shortcuts'
import {
  nextMeasureTick,
  prevMeasureTick,
} from '../lib/tagRoll/measureBeat'
import {
  TAG_ROLL_MIDI_MAX,
  TAG_ROLL_MIDI_MIN,
  TAG_ROLL_RULER_H,
  TAG_ROLL_RULER_H_COMPOSE,
} from '../lib/tagRoll/types'
import {
  clampCellW,
  clampSheetZoom,
  minCellWToFillRoll,
  minPxPerBeatToFillSheet,
} from '../lib/tagRoll/zoomFill'
import { useSnackbarStore } from '../stores/snackbar'
import { usePreferencesStore } from '../stores/preferences'
import { useTagRollStore } from '../stores/tagRoll'
import { useTagRollCoachShell } from '../composables/useTagRollCoachShell'
import { useTagRollCoachFocus } from '../composables/useTagRollCoachFocus'
import {
  publishCoachRollTransport,
  registerCoachRollTransport,
} from '../lib/arranging/coachRollTransport'
import { installInspectEditorHooks } from '../lib/tagRoll/chordCursorTransport'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import { useChordAnalysisBar } from '../composables/useChordAnalysisBar'
import {
  isHarmonySketchQuality,
  natureToSketchQuality,
  parseHarmonyEntry,
  pillarsFromHarmonySketch,
  sketchWindowAtPlayhead,
} from '../lib/tagRoll/harmonySketch'
import { sketchHearMidis, sketchHearVoicing, optimizeSketchHearPath } from '../lib/tagRoll/sketchHearVoicing'
import { measureTicks as measureTicksFn } from '../lib/tagRoll/tempoMap'
import { useArrangementStore } from '../stores/arrangement'
import { getArrangingServices } from '../composition/arranging'

const props = defineProps<{ id: string }>()

const store = useTagRollStore()
const prefs = usePreferencesStore()
const snackbar = useSnackbarStore()
const arrStore = useArrangementStore()
const router = useRouter()

const viewportRef = ref<InstanceType<typeof TagRollViewport> | null>(null)
const sheetViewportRef = ref<InstanceType<typeof TagRollSheetViewport> | null>(null)
const stageH = ref(480)
const stageViewportH = computed(
  () => viewportRef.value?.cssH ?? sheetViewportRef.value?.cssH ?? stageH.value,
)
const harmonizeRef = ref<InstanceType<typeof TagRollHarmonizePanel> | null>(null)
const titleDraft = ref('')
const partsOpen = ref(false)
const mixerOpen = ref(false)
const harmonizeOpen = ref(false)
const arrangingEnabled = computed(() => !!prefs.arrangingEnabled)
const projectIdRef = computed(() => store.current?.id ?? props.id)
const shortcutsOpen = ref(false)
const ghostNotes = ref<
  { midi: number; startTick: number; durationTicks: number; color: string }[]
>([])
const coachFocus = useTagRollCoachFocus(() => store.current, store)
const {
  chordCursor,
  clearChordCursor,
  setChordCursor,
  onCoachFocusTick,
  onCoachFocusRange,
  onCoachFocusPart,
  armInspectPlayback,
  clearInspectPlaybackRewind,
  takeInspectPlaybackRewind,
  peekInspectRangeDelete,
  executeInspectRangeDelete,
} = coachFocus
const pendingInspectDeleteMessage = ref<string | null>(null)

function requestInspectRangeDelete(): boolean {
  const peek = peekInspectRangeDelete()
  if (!peek) return false
  if (peek.count <= 0) return true
  pendingInspectDeleteMessage.value = peek.message
  return true
}

function cancelInspectRangeDelete(): void {
  pendingInspectDeleteMessage.value = null
}

function confirmInspectRangeDelete(): void {
  pendingInspectDeleteMessage.value = null
  executeInspectRangeDelete()
}
const {
  coachOpen,
  coachDetached,
  isPopoutWindow,
  popoutHint,
  showDetachedBanner,
  toggleCoach,
  ensureCoachOpen,
  onCoachClose: closeCoachShell,
  onCoachPopOut,
  onCoachPopIn,
  postCoachFocusRange,
  postTransportState,
  postTransportIntent,
} = useTagRollCoachShell({
  arrangingEnabled,
  projectId: projectIdRef,
  harmonizeOpen,
  setPlayheadTick: (tick) => store.setPlayheadTick(tick, { snap: false }),
  onRemoteFocusRange: (start, end) => onCoachFocusRange(start, end, 'none'),
  onRemoteTransportState: (active, model) => {
    publishCoachRollTransport({ active, model })
  },
})
let unregisterDetachedTransport: (() => void) | null = null
watch(coachDetached, (detached) => {
  unregisterDetachedTransport?.()
  unregisterDetachedTransport = null
  if (!detached || isPopoutWindow.value) return
  // Main window: roll strip posts intents to the pop-out coach dock.
  unregisterDetachedTransport = registerCoachRollTransport({
    prev: () => postTransportIntent('prev'),
    next: () => postTransportIntent('next'),
    primary: () => postTransportIntent('primary'),
    hear: () => postTransportIntent('hear'),
    lock: () => postTransportIntent('lock'),
    skip: () => postTransportIntent('skip'),
    secondary: () => postTransportIntent('secondary'),
  })
})
onUnmounted(() => {
  unregisterDetachedTransport?.()
})
const showCoachRollNav = computed(
  () => arrangingEnabled.value && !isPopoutWindow.value && (coachOpen.value || coachDetached.value),
)
function relayCoachFocusRange(
  start: number,
  end: number,
  select?: 'pillar' | 'column' | 'range' | 'none',
): void {
  onCoachFocusRange(start, end, select)
  if (isPopoutWindow.value) postCoachFocusRange(start, end)
}
function relayCoachFocusTick(tick: number): void {
  onCoachFocusTick(tick)
}
let unbindInspectHooks: (() => void) | null = null
function onCoachClose(): void {
  closeCoachShell()
  ghostNotes.value = []
  clearChordCursor()
}
function onChordCursorChange(range: { startTick: number; endTick: number } | null): void {
  if (!range) {
    clearChordCursor()
    return
  }
  setChordCursor(range, { select: 'range' })
}
function onCoachLaneOpenPanel(): void {
  if (!arrangingEnabled.value) return
  ensureCoachOpen()
}
const saveBusy = ref(false)
const exportBusy = ref(false)
const exportBusyLabel = ref('')
const pointerHud = ref<{ tick: number; midi: number } | null>(null)

const project = computed(() => store.current)

const {
  declaredMode: chordDeclaredMode,
  detectedMode: chordDetectedMode,
  segments: chordAnalysisSegments,
  declaredSegments: chordDeclaredSegments,
  detectSegments: chordDetectSegments,
  setDeclaredMode: setChordDeclaredMode,
  setDetectedMode: setChordDetectedMode,
} = useChordAnalysisBar(project)

const showPianoTote = computed(
  () => !!project.value && !(project.value.view.mode === 'view' && project.value.view.scoreSurface === 'sheet'),
)

const rulerH = computed(() => {
  const p = project.value
  if (!p) return TAG_ROLL_RULER_H_COMPOSE
  return p.view.mode === 'compose' ? TAG_ROLL_RULER_H_COMPOSE : TAG_ROLL_RULER_H
})

const headerBandH = computed(() => rulerH.value)

/** Pitch-grid height only (viewport cssH includes ruler). */
const toteViewportH = computed(() => Math.max(0, stageViewportH.value - headerBandH.value))

const TOTE_W = 112

const activePartName = computed(() => {
  const p = project.value
  if (!p) return '—'
  return p.parts.find((x) => x.id === p.view.activePartId)?.name ?? '—'
})

const selectionSummary = computed(() => {
  const p = project.value
  if (!p || store.selectedNoteIds.length !== 1) return null
  const n = p.notes.find((x) => x.id === store.selectedNoteIds[0])
  if (!n) return null
  return {
    multi: false as const,
    pitch: midiToNote(n.midi),
    noteId: n.id,
  }
})

/** Lower-right roll overlay: active part + current note. */
const rollHudLabel = computed(() => {
  const part = activePartName.value
  if (pointerHud.value) return `${part} · ${midiToNote(pointerHud.value.midi)}`
  const sel = selectionSummary.value
  if (sel && !sel.multi) return `${part} · ${sel.pitch}`
  return part
})

watch(
  () => prefs.tagRollLyricsLaneCollapsed,
  (collapsed) => {
    const p = project.value
    if (!p) return
    if (collapsed) {
      if (p.view.mode === 'lyrics') store.setMode('compose')
    } else if (p.view.mode !== 'lyrics') {
      store.setMode('lyrics')
    }
  },
)

/** Horizontal zoom (±). Cannot zoom out past “all measures fill the viewport”. */
function onNudgeCellW(delta: number): void {
  const p = project.value
  if (!p) return
  const sheet = p.view.mode === 'view' && p.view.scoreSurface === 'sheet'
  const raw =
    (sheet ? sheetViewportRef.value?.cssW : viewportRef.value?.cssW) ?? 640
  const vpW = typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? raw : 640
  if (sheet) {
    const minW = minPxPerBeatToFillSheet(vpW, p.lengthTicks, p.timeSignature, p.ppq)
    store.setSheetZoom(clampSheetZoom(p.view.sheetZoom + delta, minW))
    return
  }
  const minW = minCellWToFillRoll(vpW, p.lengthTicks, p.ppq)
  store.setCellSize(clampCellW(p.view.cellW + delta, minW), p.view.cellH)
}

let player: PitchTonePlayer | null = null
let blowPitchPlayer: PitchTonePlayer | null = null
let metronome: MetronomeClicker | null = null
let scheduler: TagRollScheduler | null = null
let previewNote: string | null = null
let blowPitchGen = 0
let blowPitchRaf = 0

function ensurePlayer(): PitchTonePlayer {
  const eng = project.value?.soundEngine ?? 'synth'
  if (!player) {
    player = createPitchTonePlayer(eng, { polyphony: true })
  }
  if (eng === 'synth') {
    player.setVoice(resolvePitchPipeVoiceById(project.value?.pitchPipeSoundId))
  }
  const env = project.value?.soundEnvelope
  if (env) player.setEnvelope?.(env)
  return player
}

/** Dedicated pitch-pipe voice (no project envelope) for the blow-pitch intro. */
function ensureBlowPitchPlayer(): PitchTonePlayer {
  if (!blowPitchPlayer) {
    blowPitchPlayer = createPitchTonePlayer('synth', { polyphony: true })
  }
  blowPitchPlayer.setVoice(resolvePitchPipeVoiceById(project.value?.pitchPipeSoundId))
  return blowPitchPlayer
}

function ensureMetronome(): MetronomeClicker {
  if (!metronome) metronome = new MetronomeClicker(prefs.tagRollMetronomeSound)
  metronome.setSoundId(prefs.tagRollMetronomeSound)
  metronome.setGain(prefs.tagRollMetronomeVolume)
  metronome.setEnabled(!!project.value?.metronomeEnabled)
  return metronome
}

function cancelBlowPitchIntro(): void {
  blowPitchGen += 1
  if (blowPitchRaf) {
    cancelAnimationFrame(blowPitchRaf)
    blowPitchRaf = 0
  }
  blowPitchPlayer?.allNotesOff(false)
}

function rebuildScheduler(): void {
  scheduler?.dispose()
  scheduler = null
  if (!project.value) return
  const p = ensurePlayer()
  scheduler = createTagRollScheduler({
    getNotes: () => store.current?.notes ?? [],
    getBpm: () => store.current?.bpm ?? 104,
    getTempoMarkers: () => store.current?.tempoMarkers ?? [],
    getExpressions: () => store.current?.expressions ?? [],
    getLengthTicks: () => store.current?.lengthTicks ?? 0,
    getMix: () => {
      const cur = store.current
      if (!cur) return []
      return syncProjectMix(cur.parts, cur.mix)
    },
    getSoundEnvelope: () =>
      store.current?.soundEnvelope ?? {
        attackSec: 0.05,
        decaySec: 0.05,
        phraseDecaySec: 0.45,
      },
    getTimeSignature: () =>
      store.current?.timeSignature ?? { numerator: 4, denominator: 4 },
    getSwing: () => store.current?.swing ?? { enabled: false, unit: 'eighth', style: 'triplet', amount: 0 },
    getMetronomeEnabled: () => !!store.current?.metronomeEnabled,
    getMetronomeSwing: () => store.current?.metronomeSwing !== false,
    getHarmonySketch: () => store.current?.harmonySketch ?? [],
    getDetectedSpans: () =>
      chordDetectSegments.value
        .filter((s) => s.rootPc != null)
        .map((s) => ({
          id: s.id,
          startTick: s.startTick,
          endTick: s.endTick,
          rootPc: s.rootPc!,
          quality: natureToSketchQuality(s.quality ?? 'major'),
        })),
    getMelodyPartId: () => {
      const cur = store.current
      if (!cur) return null
      return (
        cur.view.melodyPartId ??
        cur.parts.find((p) => p.name === 'Lead')?.id ??
        null
      )
    },
    getLeadMidiAt: (tick) => harmonyLeadMidiAt(tick),
    getTonality: () => store.current?.tonality ?? 0,
    onMetronomeBeat: (hit) => {
      void ensureMetronome().click(hit.downbeat)
    },
    player: p,
    onPlayhead: (tick) => {
      if (store.current) store.setPlayheadTick(tick, { snap: false })
    },
    onEnded: () => {
      store.transportPlaying = false
      const rewind = takeInspectPlaybackRewind()
      if (rewind != null) store.setPlayheadTick(rewind, { snap: false })
    },
  })
}

async function previewPitch(midi: number | null): Promise<void> {
  if (store.transportPlaying) return
  const tone = ensurePlayer()
  if (previewNote) {
    tone.noteOff(previewNote, true)
    previewNote = null
  }
  if (midi == null) return
  const name = midiToNote(midi)
  previewNote = name
  await tone.noteOn(name)
}

async function auditionMidi(midi: number): Promise<void> {
  if (store.transportPlaying) return
  const tone = ensurePlayer()
  const name = midiToNote(midi)
  tone.allNotesOff(false)
  await tone.noteOn(name)
  window.setTimeout(() => tone.noteOff(name, true), 450)
}

const audioApi: TagRollAudioApi = {
  ensurePlayer,
  previewPitch,
  auditionMidi,
  allNotesOff: (soft = true) => {
    if (store.transportPlaying) return
    ensurePlayer().allNotesOff(soft)
  },
  isTransportPlaying: () => store.transportPlaying,
}
provideTagRollAudio(audioApi)

onMounted(async () => {
  const p = await store.openProject(props.id)
  if (!p) {
    await router.replace({ name: 'tag-studio' })
    return
  }
  titleDraft.value = p.title
  rebuildScheduler()
  unbindInspectHooks = installInspectEditorHooks({
    tryDeleteInspectRangeNotes: requestInspectRangeDelete,
    tryCopyInspectRangeNotes: coachFocus.tryCopyInspectRangeNotes,
    tryCutInspectRangeNotes: coachFocus.tryCutInspectRangeNotes,
    setChordCursor: coachFocus.setChordCursor,
  })
  window.addEventListener('keydown', onKeyDown)
  if (arrangingEnabled.value) void arrStore.hydrate()
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown)
  unbindInspectHooks?.(); unbindInspectHooks = null
  cancelBlowPitchIntro()
  scheduler?.dispose()
  player?.dispose()
  blowPitchPlayer?.dispose()
  metronome?.dispose()
  scheduler = null
  player = null
  blowPitchPlayer = null
  metronome = null
  void store.persistNow()
  store.clearCurrent()
})

watch(
  () => props.id,
  async (id) => {
    cancelBlowPitchIntro()
    scheduler?.stop({ resetPlayhead: false })
    store.transportPlaying = false
    const p = await store.openProject(id)
    if (!p) {
      await router.replace({ name: 'tag-studio' })
      return
    }
    titleDraft.value = p.title
    rebuildScheduler()
  },
)

watch(
  () => project.value?.view.mode,
  (mode) => {
    if (mode !== 'view') return
    harmonizeOpen.value = false
    partsOpen.value = false
    ghostNotes.value = []
  },
)

watch(
  () => project.value?.soundEngine,
  () => {
    player?.dispose()
    player = null
    rebuildScheduler()
  },
)

watch(
  () => project.value?.pitchPipeSoundId,
  () => {
    if (project.value?.soundEngine !== 'synth') return
    player?.setVoice(resolvePitchPipeVoiceById(project.value?.pitchPipeSoundId))
  },
)

watch(
  () => project.value?.soundEnvelope,
  (env) => {
    if (env) player?.setEnvelope?.(env)
  },
  { deep: true },
)

/** Harmonize / external sketch writes should keep Coach pillars aligned when linked. */
watch(
  () =>
    (project.value?.harmonySketch ?? [])
      .map((s) => `${s.id}:${s.startTick}:${s.endTick}:${s.rootPc}:${s.quality}:${s.locked}`)
      .join('|'),
  () => {
    if (!arrangingEnabled.value) return
    syncSketchToCoachPillars()
  },
)

function onTitleBlur(): void {
  const t = titleDraft.value.trim() || 'Untitled tag'
  titleDraft.value = t
  if (project.value && t !== project.value.title) {
    store.patchProject({ title: t })
  }
}

function snapPlayheadToGrid(): void {
  const tick = store.current?.view.playheadTick ?? 0
  store.setPlayheadTick(tick, { snap: true })
}

const playbackOriginTick = ref(0)

async function runBlowPitchIntro(): Promise<boolean> {
  const p = project.value
  if (!p) return false
  const plan = planBlowPitch(p)
  if (!plan) return false
  const gen = ++blowPitchGen
  const tone = ensureBlowPitchPlayer()
  const clicker = ensureMetronome()
  void clicker.ensureLoaded(prefs.tagRollMetronomeSound)
  const voiceKey = 'blow-pitch'
  await tone.noteOn(plan.noteName, 0, { voiceKey, pan: 0, gain: 1 })
  if (gen !== blowPitchGen) {
    tone.noteOff(voiceKey, false)
    return false
  }
  const t0 = performance.now()
  let released = false
  let prevVirtual = plan.pitchStartTick
  // Opening downbeat of the pitch measure.
  if (p.metronomeEnabled) void clicker.click(true)
  return new Promise((resolve) => {
    const tick = () => {
      if (gen !== blowPitchGen) {
        tone.noteOff(voiceKey, false)
        resolve(false)
        return
      }
      const elapsed = (performance.now() - t0) / 1000
      const frac = Math.min(1, elapsed / plan.measureSec)
      const virtual = plan.pitchStartTick + frac * plan.measureTicks
      if (p.metronomeEnabled) {
        for (const h of beatsCrossedSigned(prevVirtual, virtual, p.timeSignature, p.ppq)) {
          void clicker.click(h.downbeat)
        }
      }
      prevVirtual = virtual
      if (plan.pitchStartTick >= 0) {
        store.setPlayheadTick(
          Math.min(plan.contentStartTick, Math.round(virtual)),
          { snap: false },
        )
      }
      if (!released && elapsed >= plan.holdSec) {
        released = true
        tone.noteOff(voiceKey, plan.releaseSec)
      }
      if (elapsed >= plan.measureSec) {
        blowPitchRaf = 0
        store.setPlayheadTick(plan.contentStartTick, { snap: false })
        resolve(true)
        return
      }
      blowPitchRaf = requestAnimationFrame(tick)
    }
    blowPitchRaf = requestAnimationFrame(tick)
  })
}

async function onPlay(): Promise<void> {
  // Keep compose/lyrics mode + selection; view-mode force was clearing edits mid-flow.
  const playhead = store.current?.view.playheadTick ?? 0
  const bounds = armInspectPlayback(playhead)
  playbackOriginTick.value = bounds?.rewindTick ?? playhead
  cancelBlowPitchIntro()
  void ensureMetronome().ensureLoaded(prefs.tagRollMetronomeSound)
  rebuildScheduler()
  const from = bounds?.fromTick ?? playbackOriginTick.value
  const p = project.value
  store.transportPlaying = true
  if (!bounds && p && shouldBlowPitchOnPlay(p, from)) {
    const ok = await runBlowPitchIntro()
    if (!ok || !store.transportPlaying) return
    // Skip double metronome click after blow-pitch measure when clicker is on.
    scheduler?.play(planBlowPitch(p)?.contentStartTick ?? from, { metronomePrime: false })
    return
  }
  scheduler?.play(from, bounds ? { untilTick: bounds.untilTick } : undefined)
}

/** Pause and leave the playhead where playback stopped. */
function onPauseInPlace(): void {
  cancelBlowPitchIntro()
  scheduler?.pause()
  store.transportPlaying = false
  clearInspectPlaybackRewind()
  snapPlayheadToGrid()
}

/** Stop and jump the playhead back to where this play-through began. */
function onStopToOrigin(): void {
  cancelBlowPitchIntro()
  scheduler?.stop({ resetPlayhead: false })
  store.transportPlaying = false
  clearInspectPlaybackRewind()
  store.setPlayheadTick(playbackOriginTick.value, { snap: true })
}

function onStop(): void {
  onStopToOrigin()
}

function onReturnToZero(): void {
  if (store.transportPlaying) onPauseInPlace()
  store.setPlayheadTick(0, { snap: false })
}

function onReturnToOrigin(): void {
  if (store.transportPlaying) onPauseInPlace()
  store.setPlayheadTick(playbackOriginTick.value, { snap: true })
}

function onPrevMeasure(): void {
  const p = project.value
  if (!p) return
  if (store.transportPlaying) onPauseInPlace()
  const tick = prevMeasureTick(p.view.playheadTick, p.timeSignature, p.ppq)
  store.setPlayheadTick(tick, { snap: false })
}

function onNextMeasure(): void {
  const p = project.value
  if (!p) return
  if (store.transportPlaying) onPauseInPlace()
  const tick = nextMeasureTick(p.view.playheadTick, p.timeSignature, p.lengthTicks, p.ppq)
  store.setPlayheadTick(tick, { snap: false })
}

/** Transport ▶ / ⏸: play or pause in place. */
function onPlayPause(): void {
  if (store.transportPlaying) onPauseInPlace()
  else onPlay()
}

/** Space: play from cursor, or stop and restore the start cursor. */
function onSpaceTransport(): void {
  if (store.transportPlaying) onStopToOrigin()
  else onPlay()
}

/** Enter: pause in place (no jump). */
function onEnterTransport(): void {
  if (store.transportPlaying) onPauseInPlace()
}

let hearStackSeq = 0
/** Sustained sketch-hear voice keys while pointer is held on a chord chip. */
let sketchHearKeys: string[] | null = null
let sketchHearTimer: ReturnType<typeof window.setTimeout> | null = null

function clearSketchHearTimer(): void {
  if (sketchHearTimer != null) {
    window.clearTimeout(sketchHearTimer)
    sketchHearTimer = null
  }
}

function stopSketchHear(): void {
  clearSketchHearTimer()
  if (!sketchHearKeys) return
  const tone = ensurePlayer()
  for (const key of sketchHearKeys) tone.noteOff(key, true)
  sketchHearKeys = null
}

/** Chord at tick — layers over transport / prior hears (does not cut them off). */
async function auditionTick(tick: number): Promise<void> {
  const p = project.value
  if (!p) return
  const notes = hearStackNotesAtTick(p.notes, tick)
  if (ghostNotes.value.length) {
    for (const g of ghostNotes.value) {
      notes.push({
        id: `ghost-${g.midi}`,
        partId: '',
        midi: g.midi,
        startTick: g.startTick,
        durationTicks: g.durationTicks,
      })
    }
  }
  const tone = ensurePlayer()
  const mix = p.mix ?? []
  const sounding = notes.filter((n) => !n.partId || isPartAudible(n.partId, mix))
  if (!sounding.length) return
  const batch = ++hearStackSeq
  const keys = sounding.map((n) => `hear-${batch}-${n.id}`)
  await Promise.all(
    sounding.map((n, i) => {
      const { volume, pan } = n.partId
        ? mixForPart(n.partId, mix)
        : { volume: 0.9, pan: 0 }
      return tone.noteOn(midiToNote(n.midi), 0, {
        voiceKey: keys[i]!,
        gain: volume,
        pan,
      })
    }),
  )
  window.setTimeout(() => {
    for (const key of keys) tone.noteOff(key, true)
  }, 650)
}

function onHearStack(): void {
  void auditionTick(project.value?.view.playheadTick ?? 0)
}

function harmonyLeadMidiAt(tick: number): number {
  const p = project.value
  if (!p) return 60
  const leadId =
    p.view.melodyPartId ?? p.parts.find((x) => x.name === 'Lead')?.id ?? null
  const note = p.notes.find(
    (n) =>
      (!leadId || n.partId === leadId) &&
      n.startTick <= tick &&
      tick < n.startTick + n.durationTicks,
  )
  return note?.midi ?? 60
}

async function onHearHarmonySketch(
  startTick: number,
  _endTick: number,
  draft?: { rootPc: number; quality: import('../lib/tagRoll/types').HarmonySketchQuality },
): Promise<void> {
  if (store.transportPlaying) return
  const p = project.value
  if (!p) return
  const detectSegs = chordDetectSegments.value.filter((s) => s.rootPc != null)
  const declaredSegs = [...chordDeclaredSegments.value].sort(
    (a, b) => a.startTick - b.startTick,
  )
  const seg =
    declaredSegs.find((s) => s.startTick === startTick) ??
    detectSegs.find((s) => s.startTick === startTick) ??
    chordAnalysisSegments.value.find((s) => s.startTick === startTick)
  const stored =
    (p.harmonySketch ?? []).find((s) => s.startTick === startTick) ??
    (seg ? (p.harmonySketch ?? []).find((s) => s.id === seg.id) : undefined)

  // Prefer globally optimized path across My Chords + Detected so Hear matches mixer.
  type SeqItem = { id: string; startTick: number; rootPc: number; quality: string }
  const byTick = new Map<number, SeqItem>()
  for (const s of detectSegs) {
    if (s.rootPc == null) continue
    byTick.set(s.startTick, {
      id: s.id,
      startTick: s.startTick,
      rootPc: s.rootPc,
      quality: natureToSketchQuality(s.quality ?? 'major'),
    })
  }
  for (const s of declaredSegs) {
    if (s.rootPc == null) continue
    byTick.set(s.startTick, {
      id: s.id,
      startTick: s.startTick,
      rootPc: s.rootPc,
      quality: natureToSketchQuality(s.quality ?? 'major'),
    })
  }
  const sequence = [...byTick.values()].sort(
    (a, b) => a.startTick - b.startTick || a.id.localeCompare(b.id),
  )
  const seqIdx = sequence.findIndex(
    (s) => s.startTick === startTick || (seg != null && s.id === seg.id),
  )
  let midis: number[] | null = null
  if (seqIdx >= 0 && !draft) {
    const path = optimizeSketchHearPath(
      sequence.map((s) => ({
        rootPc: s.rootPc,
        quality: natureToSketchQuality(s.quality),
        leadMidi: harmonyLeadMidiAt(s.startTick),
      })),
      { tonality: p.tonality },
    )
    const hit = path[seqIdx]
    if (hit) midis = [hit.bass, hit.bari, hit.lead, hit.tenor]
  }
  if (!midis) {
    const rootPc = draft?.rootPc ?? stored?.rootPc ?? seg?.rootPc
    const quality =
      draft?.quality ??
      stored?.quality ??
      (seg?.quality && isHarmonySketchQuality(seg.quality) ? seg.quality : 'major')
    if (rootPc == null) return
    const prevSeg = seqIdx > 0 ? sequence[seqIdx - 1] : undefined
    const nextSeg = seqIdx >= 0 ? sequence[seqIdx + 1] : undefined
    const prevVoicing =
      prevSeg?.rootPc != null
        ? sketchHearVoicing({
            rootPc: prevSeg.rootPc,
            quality: natureToSketchQuality(prevSeg.quality ?? 'major'),
            leadMidi: harmonyLeadMidiAt(prevSeg.startTick),
          })
        : null
    midis = sketchHearMidis({
      rootPc,
      quality,
      leadMidi: harmonyLeadMidiAt(startTick),
      prev: prevVoicing,
      next:
        nextSeg?.rootPc != null
          ? {
              rootPc: nextSeg.rootPc,
              quality: natureToSketchQuality(nextSeg.quality ?? 'major'),
              leadMidi: harmonyLeadMidiAt(nextSeg.startTick),
            }
          : null,
    })
  }
  const tone = ensurePlayer()
  tone.allNotesOff(false)
  clearSketchHearTimer()
  sketchHearKeys = null
  const keys = midis.map((_, i) => `hs:${startTick}:${i}`)
  await Promise.all(
    midis.map((m, i) => tone.noteOn(midiToNote(m), 0, { voiceKey: keys[i]!, gain: 0.7 })),
  )
  // Draft previews (popover hold) sustain until hearStop; one-shot Hear uses a short ring.
  if (draft) {
    sketchHearKeys = keys
    return
  }
  sketchHearKeys = keys
  sketchHearTimer = window.setTimeout(() => {
    stopSketchHear()
  }, 700)
}

function onStopHearHarmonySketch(): void {
  stopSketchHear()
}

/** Hear declared sketch at playhead — ignores TTBB stacks (shortcut J). */
function onHearSketchAtPlayhead(): void {
  const p = project.value
  if (!p) return
  const tick = p.view.playheadTick ?? 0
  const span =
    (p.harmonySketch ?? []).find((s) => s.locked && s.startTick <= tick && tick < s.endTick) ??
    chordDeclaredSegments.value.find((s) => s.startTick <= tick && tick < s.endTick)
  if (!span) return
  void onHearHarmonySketch(span.startTick, span.endTick)
}

function syncSketchToCoachPillars(): void {
  const tag = project.value
  if (!tag || !arrangingEnabled.value) return
  const linkId = `arr_${tag.id}`
  if (arrStore.current?.id !== linkId) return
  const existing = arrStore.current.pillars
  const fromSketch = pillarsFromHarmonySketch(tag.harmonySketch ?? [], (prefix) =>
    getArrangingServices().idGen.next(prefix),
  ).map((p) => {
    const hit =
      existing.find((e) => e.startTick === p.startTick && e.endTick === p.endTick) ??
      existing.find((e) => e.startTick < p.endTick && p.startTick < e.endTick && e.rootPc === p.rootPc)
    return {
      id: hit?.id ?? p.id,
      rootPc: p.rootPc,
      startTick: p.startTick,
      endTick: p.endTick,
      source: p.source,
      confirmed: p.confirmed,
    }
  })
  // Keep unconfirmed Coach drafts that do not overlap locked Chords spans
  const drafts = existing.filter(
    (d) =>
      !d.confirmed &&
      !fromSketch.some((s) => d.startTick < s.endTick && s.startTick < d.endTick),
  )
  arrStore.setPillars([...fromSketch, ...drafts])
}

function defaultSketchWindow(): { startTick: number; endTick: number } {
  const p = project.value!
  const playhead = p.view.playheadTick ?? 0
  const leadId =
    p.view.melodyPartId ?? p.parts.find((x) => x.name === 'Lead')?.id ?? null
  const mel =
    p.notes.find(
      (n) =>
        (!leadId || n.partId === leadId) &&
        n.startTick <= playhead &&
        playhead < n.startTick + n.durationTicks,
    ) ?? null
  return sketchWindowAtPlayhead({
    playheadTick: playhead,
    measureTicks: measureTicksFn(p.timeSignature, p.ppq),
    inspectRange: chordCursor.value,
    melodyNote: mel
      ? { startTick: mel.startTick, durationTicks: mel.durationTicks }
      : null,
  })
}

function onRemoveHarmonySketch(id: string): void {
  store.removeHarmonySketchSpan(id)
  syncSketchToCoachPillars()
}

function onApplyHarmonyDraft(
  id: string,
  draft: { rootPc: number; quality: import('../lib/tagRoll/types').HarmonySketchQuality },
): void {
  const p = project.value
  if (!p) return
  const span = (p.harmonySketch ?? []).find((s) => s.id === id)
  if (span) {
    store.upsertHarmonySketchSpan({
      ...span,
      rootPc: draft.rootPc,
      quality: draft.quality,
      locked: true,
      source: 'user',
    })
    syncSketchToCoachPillars()
    return
  }
  const det =
    chordDetectSegments.value.find((s) => s.id === id) ??
    chordAnalysisSegments.value.find((s) => s.id === id)
  if (!det) return
  store.upsertHarmonySketchSpan({
    id,
    startTick: det.startTick,
    endTick: det.endTick,
    rootPc: draft.rootPc,
    quality: draft.quality,
    source: 'user',
    locked: true,
  })
  syncSketchToCoachPillars()
}

function onLockAllDetected(): void {
  const holes = chordDetectSegments.value
    .filter((s) => s.rootPc != null)
    .map((s) => ({
      id: s.id,
      startTick: s.startTick,
      endTick: s.endTick,
      rootPc: s.rootPc!,
      quality: natureToSketchQuality(s.quality ?? 'major'),
    }))
  if (!holes.length) return
  const n = store.lockDetectedAsMyChords(holes)
  if (n > 0) syncSketchToCoachPillars()
}

function onHarmonyCommitAt(payload: {
  raw: string
  startTick: number
  endTick: number
  id?: string
}): void {
  const p = project.value
  if (!p) return
  const parsed = parseHarmonyEntry(payload.raw, {
    tonality: p.tonality,
    mode: p.tonalityMode ?? 'major',
    preferFlats: p.preferFlats,
    entryMode: chordDeclaredMode.value === 'roman' ? 'roman' : 'name',
  })
  if (!parsed) {
    snackbar.show('Could not parse chord', { tone: 'info', ms: 2000 })
    return
  }
  const existing = payload.id
    ? (p.harmonySketch ?? []).find((s) => s.id === payload.id)
    : undefined
  store.upsertHarmonySketchSpan({
    id: payload.id,
    startTick: payload.startTick,
    endTick: Math.max(payload.startTick + 1, payload.endTick),
    rootPc: parsed.rootPc,
    quality: parsed.quality,
    source: 'user',
    locked: true,
    ...(existing ? {} : {}),
  })
  syncSketchToCoachPillars()
}

function onHarmonyGeometry(payload: { id: string; startTick: number; endTick: number }): void {
  const p = project.value
  if (!p) return
  const span = (p.harmonySketch ?? []).find((s) => s.id === payload.id)
  if (!span) return
  store.upsertHarmonySketchSpan({
    ...span,
    startTick: payload.startTick,
    endTick: Math.max(payload.startTick + 1, payload.endTick),
    locked: true,
    source: span.source === 'detect' ? 'user' : span.source,
  })
  syncSketchToCoachPillars()
}

function onHarmonyGeometryMany(
  payloads: Array<{ id: string; startTick: number; endTick: number }>,
): void {
  store.moveSketchSpansGeometry(payloads)
  syncSketchToCoachPillars()
}

function onAuditionColumn(payload: { tick: number; movePlayhead: boolean }): void {
  if (payload.movePlayhead) store.setPlayheadTick(payload.tick)
  void auditionTick(payload.tick)
}

function onExportMidi(mode: MidiExportMode): void {
  if (!project.value) return
  const { midiExporter } = getTagStudioServices()
  downloadMidi(midiExporter, project.value, mode)
}

function onExportMusicXml(): void {
  if (!project.value) return
  const { musicXmlExporter } = getTagStudioServices()
  downloadMusicXml(musicXmlExporter, project.value)
}

function onExportJson(): void {
  if (!project.value) return
  downloadTagRollProjectJson(project.value)
}

async function onExportAudio(kind: 'mix' | 'parts' | 'partLeft'): Promise<void> {
  if (!project.value || exportBusy.value) return
  exportBusy.value = true
  exportBusyLabel.value = 'Rendering MP3…'
  try {
    const { audioBounce } = getTagStudioServices()
    await downloadAudio(audioBounce, project.value, {
      mix: kind === 'mix',
      perPart: kind === 'parts',
      partLeft: kind === 'partLeft',
      format: 'mp3',
      onProgress: (p) => {
        exportBusyLabel.value = p.label
      },
    })
    snackbar.show(
      kind === 'mix'
        ? 'Downloaded mix MP3'
        : kind === 'parts'
          ? 'Downloaded part MP3s'
          : 'Downloaded Mix + part-left MP3s',
    )
  } catch (e) {
    snackbar.show(e instanceof Error ? e.message : 'MP3 export failed', { tone: 'error' })
  } finally {
    exportBusy.value = false
    exportBusyLabel.value = ''
  }
}

async function onSaveLibrary(): Promise<void> {
  if (!project.value || saveBusy.value) return
  saveBusy.value = true
  try {
    const { entryId } = await saveTagRollToLibrary(project.value, {
      mix: true,
      perPart: true,
      updateLinked: true,
    })
    store.setLocalEntryId(entryId)
    snackbar.show('Saved to My Library', {
      action: {
        label: 'Open',
        onClick: () => {
          void router.push({ name: 'library-doc', params: { id: entryId } })
        },
      },
    })
  } catch (e) {
    snackbar.show(e instanceof Error ? e.message : 'Save to My Library failed', {
      tone: 'error',
    })
  } finally {
    saveBusy.value = false
  }
}

function onMove(payload: { id: string; midi: number; startTick: number }): void {
  store.updateNoteLive(payload.id, { midi: payload.midi, startTick: payload.startTick })
}

function onMoveGroup(
  updates: Array<{ id: string; midi: number; startTick: number }>,
): void {
  store.updateNotesLive(updates)
}

function onResize(payload: { id: string; startTick: number; durationTicks: number }): void {
  store.updateNoteLive(payload.id, {
    startTick: payload.startTick,
    durationTicks: payload.durationTicks,
  })
}

function onSelect(id: string | null, opts?: { additive?: boolean }): void {
  store.selectNote(id, opts)
}

function onSelectMany(ids: string[], opts?: { additive?: boolean }): void {
  store.selectNotes(ids, opts)
}

function onGhost(
  ghosts: {
    role?: string
    midi: number
    startTick: number
    durationTicks: number
    color: string
  }[],
): void {
  ghostNotes.value = ghosts.map((g) => ({
    midi: g.midi,
    startTick: g.startTick,
    durationTicks: g.durationTicks,
    color: g.color,
  }))
}

function onHarmonizeClose(): void {
  harmonizeOpen.value = false
  ghostNotes.value = []
}

function toggleHarmonize(): void {
  if (harmonizeOpen.value) onHarmonizeClose()
  else {
    coachOpen.value = false
    harmonizeOpen.value = true
  }
}

function toggleParts(): void {
  if (partsOpen.value) {
    partsOpen.value = false
    return
  }
  partsOpen.value = true
  mixerOpen.value = false
}

function nudgePlayhead(dir: -1 | 1): void {
  const p = project.value
  if (!p) return
  const snap = p.snapTicks || 120
  store.setPlayheadTick(p.view.playheadTick + dir * snap)
}

function nudgeSelectedNotes(deltaMidi: number, deltaTicks: number): void {
  const p = project.value
  const ids = store.selectedNoteIds
  if (!p || !ids.length) return

  const selected = ids
    .map((id) => p.notes.find((n) => n.id === id))
    .filter((n): n is NonNullable<typeof n> => !!n)
  if (!selected.length) return

  let dMidi = deltaMidi
  let dTicks = deltaTicks
  for (const n of selected) {
    if (n.midi + dMidi > TAG_ROLL_MIDI_MAX) dMidi = TAG_ROLL_MIDI_MAX - n.midi
    if (n.midi + dMidi < TAG_ROLL_MIDI_MIN) dMidi = TAG_ROLL_MIDI_MIN - n.midi
    if (n.startTick + dTicks < 0) dTicks = -n.startTick
  }
  if (dMidi === 0 && dTicks === 0) return

  store.pushHistoryCheckpoint()
  const primaryId = store.selectedNoteId
  let audition: number | null = null
  const updates = selected.map((n) => {
    const midi = n.midi + dMidi
    const startTick = n.startTick + dTicks
    if (n.id === primaryId) audition = midi
    return { id: n.id, midi, startTick }
  })
  store.updateNotesLive(updates)
  if (audition != null) void auditionMidi(audition)
  else if (updates[0]) void auditionMidi(updates[0].midi)
}

function applyEnteringDuration(ticks: number, opts?: { applyToSelection?: boolean }): void {
  const next = Math.max(1, Math.round(ticks))
  store.addDurationTicks = next
  if (opts?.applyToSelection === false) return
  const ids = store.selectedNoteIds
  if (!ids.length) return
  store.pushHistoryCheckpoint()
  for (const id of ids) {
    store.updateNoteLive(id, { durationTicks: next })
  }
}

function setDurationPreset(index: number): void {
  const preset = TAG_ROLL_DURATION_PRESETS[index]
  if (!preset) return
  applyEnteringDuration(preset.ticks)
}

function nudgeDuration(dir: -1 | 1): void {
  const base = store.selectedNote?.durationTicks ?? store.addDurationTicks
  applyEnteringDuration(stepDurationTicks(base, dir))
}

function applyDottedDuration(): void {
  const ids = store.selectedNoteIds
  if (ids.length) {
    store.pushHistoryCheckpoint()
    const notes = store.current?.notes ?? []
    for (const id of ids) {
      const n = notes.find((x) => x.id === id)
      if (n) store.updateNoteLive(id, { durationTicks: dottedDurationTicks(n.durationTicks) })
    }
  }
  store.addDurationTicks = dottedDurationTicks(store.addDurationTicks)
}

function onKeyDown(e: KeyboardEvent): void {
  if (isTypingTarget(e.target)) return
  if (!project.value) return

  const mod = matchModKey(e)
  const key = e.key
  const readOnly = project.value.view.mode === 'view'

  if (mod && key.toLowerCase() === 'z' && e.shiftKey) {
    if (readOnly) return
    e.preventDefault()
    store.redo()
    return
  }
  if (mod && key.toLowerCase() === 'z') {
    if (readOnly) return
    e.preventDefault()
    store.undo()
    return
  }
  if (mod && key.toLowerCase() === 'y') {
    if (readOnly) return
    e.preventDefault()
    store.redo()
    return
  }
  if (mod && key === 'Backspace') {
    if (readOnly) return
    e.preventDefault()
    if (harmonizeOpen.value) harmonizeRef.value?.onCancel()
    else store.cancelLastEdit()
    return
  }

  if (mod && (key.toLowerCase() === 'c' || key.toLowerCase() === 'x')) {
    if (readOnly) return
    e.preventDefault()
    if (store.chordsLaneFocused) {
      if (key.toLowerCase() === 'x') {
        if (store.cutSelectedSketchSpans()) syncSketchToCoachPillars()
      } else store.copySelectedSketchSpans()
    } else if (key.toLowerCase() === 'x') store.cutSelectedNotes()
    else store.copySelectedNotes()
    return
  }
  if (mod && key.toLowerCase() === 'v') {
    if (readOnly) return
    e.preventDefault()
    if (store.chordsLaneFocused) {
      if (store.pasteSketchSpansAtPlayhead()) syncSketchToCoachPillars()
    } else store.pasteNotesAtPlayhead()
    return
  }
  if (mod && key.toLowerCase() === 'a') {
    if (readOnly) return
    e.preventDefault()
    if (store.chordsLaneFocused) {
      store.selectSketchSpans((project.value.harmonySketch ?? []).filter((s) => s.locked).map((s) => s.id))
      return
    }
    const p = project.value
    if (!p) return
    const focus = p.view.focusActivePart ? p.view.activePartId : null
    const ids = p.notes
      .filter((n) => !focus || n.partId === focus)
      .map((n) => n.id)
    store.selectNotes(ids)
    return
  }

  if (mod) return

  if (key === ' ' || key === 'Spacebar') {
    e.preventDefault()
    onSpaceTransport()
    return
  }
  if (key === 'Enter') {
    e.preventDefault()
    onEnterTransport()
    return
  }
  if (key === 'Escape') {
    e.preventDefault()
    if (shortcutsOpen.value) {
      shortcutsOpen.value = false
      return
    }
    if (harmonizeOpen.value) {
      onHarmonizeClose()
      return
    }
    if (partsOpen.value) {
      partsOpen.value = false
      return
    }
    if (mixerOpen.value) {
      mixerOpen.value = false
      return
    }
    if (store.expressionTool) {
      store.setExpressionTool(null)
      return
    }
    if (store.selectedExpressionId) {
      store.selectExpression(null)
      return
    }
    if (!prefs.tagRollLyricsLaneCollapsed) {
      prefs.setTagRollLaneCollapsed('lyrics', true)
      return
    }
    store.selectNote(null)
    return
  }
  if (key === '?' || (key === '/' && e.shiftKey)) {
    e.preventDefault()
    shortcutsOpen.value = !shortcutsOpen.value
    return
  }
  if (key === 'Home') {
    e.preventDefault()
    store.setPlayheadTick(0)
    return
  }
  if (key === 'ArrowLeft' || key === 'ArrowRight' || key === 'ArrowUp' || key === 'ArrowDown') {
    e.preventDefault()
    const mode = project.value.view.mode
    const moveNotes =
      mode !== 'view' && store.selectedNoteIds.length > 0
    if (moveNotes) {
      const snap = project.value.snapTicks || 120
      if (key === 'ArrowLeft') nudgeSelectedNotes(0, -snap)
      else if (key === 'ArrowRight') nudgeSelectedNotes(0, snap)
      else if (key === 'ArrowUp') nudgeSelectedNotes(1, 0)
      else nudgeSelectedNotes(-1, 0)
      return
    }
    if (key === 'ArrowLeft') nudgePlayhead(-1)
    else if (key === 'ArrowRight') nudgePlayhead(1)
    return
  }
  if (key === ',') {
    e.preventDefault()
    nudgePlayhead(-1)
    return
  }
  if (key === '.') {
    e.preventDefault()
    nudgePlayhead(1)
    return
  }
  if (key === 'Delete' || key === 'Backspace') {
    if (readOnly) return
    const exprId = store.selectedExpressionId
    if (exprId) {
      e.preventDefault()
      const marker = project.value.tempoMarkers.find((m) => m.id === exprId)
      if (marker?.tick === 0) return // never delete the start tempo via keyboard
      if (marker) store.deleteTempoMarker(exprId)
      else store.deleteExpression(exprId)
      return
    }
    if (store.selectedSketchSpanIds.length) {
      e.preventDefault()
      store.deleteSelectedSketchSpans()
      syncSketchToCoachPillars()
      return
    }
    if (store.selectedNoteIds.length) {
      e.preventDefault()
      store.deleteSelectedNotes()
    }
    return
  }
  if (key === '[') {
    if (readOnly) return
    e.preventDefault()
    if (harmonizeOpen.value) {
      harmonizeRef.value?.step(-1)
      return
    }
    nudgeDuration(-1)
    return
  }
  if (key === ']') {
    if (readOnly) return
    e.preventDefault()
    if (harmonizeOpen.value) {
      harmonizeRef.value?.step(1)
      return
    }
    nudgeDuration(1)
    return
  }
  if (key === '>') {
    if (readOnly) return
    e.preventDefault()
    applyDottedDuration()
    return
  }

  const lower = key.toLowerCase()
  if (project.value && !mod) {
    const part = findPartByHotkey(project.value.parts, lower)
    if (part) {
      e.preventDefault()
      store.setActivePart(part.id)
      return
    }
  }
  if (lower === 'v') {
    e.preventDefault()
    store.setMode('view')
    return
  }
  if (lower === 'e') {
    e.preventDefault()
    store.setMode('compose')
    return
  }
  if (lower === 'c') {
    e.preventDefault()
    store.cycleActivePart(1)
    return
  }
  if (lower === 'y') {
    e.preventDefault()
    prefs.toggleTagRollLane('lyrics')
    return
  }
  if (lower === 's') {
    e.preventDefault()
    onStop()
    return
  }
  if (lower === 'h') {
    e.preventDefault()
    onHearStack()
    return
  }
  if (lower === 'j') {
    e.preventDefault()
    onHearSketchAtPlayhead()
    return
  }
  if (lower === 'm') {
    if (readOnly) return
    e.preventDefault()
    toggleHarmonize()
    return
  }
  if (key >= '1' && key <= '6') {
    if (readOnly) return
    e.preventDefault()
    setDurationPreset(Number(key) - 1)
  }
}
</script>

<template>
  <section
    v-if="project"
    class="tr-ed"
    aria-label="Tag Roll editor"
  >
    <header class="top">
      <RouterLink class="back" to="/tag-studio" :title="tagRollTip('Back to projects')">
        ← Projects
      </RouterLink>
      <input
        v-model="titleDraft"
        class="title-input"
        aria-label="Project title"
        :title="tagRollTip('Project title')"
        :readonly="project.view.mode === 'view'"
        @blur="onTitleBlur"
        @keydown.enter="($event.target as HTMLInputElement).blur()"
      />
      <button
        type="button"
        class="shortcuts-btn"
        :title="tipByShortcutId('shortcuts', 'Keyboard shortcuts overview')"
        @click="shortcutsOpen = true"
      >
        Keyboard Shortcuts
      </button>
    </header>

    <TagRollToolbar
      :harmonize-open="harmonizeOpen"
      :parts-open="partsOpen"
      :coach-open="coachOpen"
      :arranging-enabled="arrangingEnabled"
      @export-midi="onExportMidi"
      @export-music-xml="onExportMusicXml"
      @export-audio="onExportAudio"
      @export-json="onExportJson"
      @save-library="onSaveLibrary"
      @open-harmonize="toggleHarmonize"
      @open-parts="toggleParts"
      @open-coach="toggleCoach"
    />

    <p v-if="store.error" class="err" role="alert">{{ store.error }}</p>
    <p v-if="saveBusy" class="hint">Saving to My Library…</p>
    <p v-if="exportBusy" class="hint">{{ exportBusyLabel || 'Exporting…' }}</p>
    <p v-if="popoutHint || showDetachedBanner" class="hint" role="status">
      <template v-if="popoutHint">{{ popoutHint }}</template>
      <template v-if="showDetachedBanner">
        Coach is on another window.
        <button type="button" class="linkish-inline" @click="onCoachPopIn">Pop in</button>
      </template>
    </p>

    <div class="stage" :class="{ 'coach-popout': isPopoutWindow }">
      <div class="stage-body">
        <div
          v-if="showPianoTote && !isPopoutWindow"
          class="tote-col"
          :style="{ width: `${TOTE_W}px`, flex: `0 0 ${TOTE_W}px` }"
        >
          <div
            class="ruler-gutter"
            :style="{ height: `${headerBandH}px` }"
            aria-hidden="true"
          />
          <TagRollTote
            :project="project"
            :viewport-height="toteViewportH"
            @scroll-y="(y) => project && store.setScroll(project.view.scrollX, y)"
          />
        </div>
        <div v-if="!isPopoutWindow" class="roll-col">
          <TagRollSheetViewport
            v-if="project.view.mode === 'view' && project.view.scoreSurface === 'sheet'"
            ref="sheetViewportRef"
            :project="project"
            @scroll="(x, y) => store.setSheetScroll(x, y)"
            @playhead="(t) => store.setPlayheadTick(t)"
            @sheet-zoom="(z) => store.setSheetZoom(z)"
          />
          <TagRollViewport
            v-else
            ref="viewportRef"
            :project="project"
            :selected-note-ids="store.selectedNoteIds"
            :ghost-notes="ghostNotes"
            :chord-cursor="chordCursor"
            :header-extra-h="0"
            @chord-cursor-change="onChordCursorChange"
            @scroll="(x, y) => store.setScroll(x, y)"
            @playhead="(t) => store.setPlayheadTick(t)"
            @select="onSelect"
            @select-many="onSelectMany"
            @move="onMove"
            @move-group="onMoveGroup"
            @resize="onResize"
            @begin-gesture="store.pushHistoryCheckpoint()"
            @cell-size="(p) => store.setCellSize(p.cellW, p.cellH)"
            @audition-column="onAuditionColumn"
            @audition-note="(m) => void auditionMidi(m)"
            @preview-pitch="(m) => void previewPitch(m)"
            @pointer-hud="(p) => (pointerHud = p)"
          />
          <div
            v-if="!(project.view.mode === 'view' && project.view.scoreSurface === 'sheet')"
            class="roll-hud"
            aria-live="polite"
          >
            {{ rollHudLabel }}
          </div>
          <ArrangingCoachRollNav v-if="showCoachRollNav" />
        </div>
        <ArrangingCoachDock
          v-if="coachOpen && arrangingEnabled"
          :inspect-range="chordCursor"
          :is-popout-window="isPopoutWindow"
          :post-transport-state="isPopoutWindow ? postTransportState : undefined"
          @close="onCoachClose"
          @preview-ghost="onGhost"
          @clear-ghost="ghostNotes = []"
          @focus-tick="relayCoachFocusTick"
          @focus-range="relayCoachFocusRange"
          @focus-part="onCoachFocusPart"
          @pop-out="onCoachPopOut"
        />
      </div>
      <TagRollDeclaredLane
        v-if="showPianoTote && !isPopoutWindow && !prefs.tagRollChordsLaneCollapsed"
        :project="project"
        :segments="chordDeclaredSegments"
        :detect-segments="chordDetectSegments"
        :mode="chordDeclaredMode"
        :read-only="project.view.mode === 'view'"
        :left-gutter-px="TOTE_W"
        @update:mode="setChordDeclaredMode"
        @focus-range="relayCoachFocusRange"
        @hear="onHearHarmonySketch"
        @hear-stop="onStopHearHarmonySketch"
        @remove="onRemoveHarmonySketch"
        @apply-draft="onApplyHarmonyDraft"
        @commit-at="onHarmonyCommitAt"
        @geometry="onHarmonyGeometry"
        @geometry-many="onHarmonyGeometryMany"
        @begin-gesture="store.pushHistoryCheckpoint()"
      />
      <TagRollDetectedLane
        v-if="showPianoTote && !isPopoutWindow && !prefs.tagRollDetectedLaneCollapsed"
        :project="project"
        :segments="chordDetectSegments"
        :mode="chordDetectedMode"
        :left-gutter-px="TOTE_W"
        @update:mode="setChordDetectedMode"
        @focus-range="relayCoachFocusRange"
        @hear="onHearHarmonySketch"
        @hear-stop="onStopHearHarmonySketch"
        @apply-draft="onApplyHarmonyDraft"
        @lock-all="onLockAllDetected"
      />
      <TagRollExpressionLane
        v-if="showPianoTote && !isPopoutWindow && !prefs.tagRollExpressionLaneCollapsed"
        :project="project"
        :read-only="project.view.mode === 'view'"
        :left-gutter-px="TOTE_W"
      />
      <ArrangingCoachLane
        v-if="showPianoTote && !isPopoutWindow && !prefs.tagRollCoachLaneCollapsed"
        :project="project"
        :left-gutter-px="isPopoutWindow ? 0 : TOTE_W"
        @select-tick="relayCoachFocusTick"
        @focus-range="relayCoachFocusRange"
        @open-panel="onCoachLaneOpenPanel"
      />
      <TagRollLyricsLane
        v-if="showPianoTote && !isPopoutWindow && !prefs.tagRollLyricsLaneCollapsed"
        :left-gutter-px="TOTE_W"
      />
    </div>

    <TagRollMediaBar
      :playing="store.transportPlaying"
      :mixer-open="mixerOpen"
      @beginning="onReturnToZero"
      @prev-measure="onPrevMeasure"
      @next-measure="onNextMeasure"
      @return-origin="onReturnToOrigin"
      @play-pause="onPlayPause"
      @stop="onStop"
      @hear-stack="onHearStack"
      @mixer="mixerOpen = !mixerOpen; if (mixerOpen) partsOpen = false"
      @nudge-time="onNudgeCellW"
      @nudge-pitch="(d) => store.nudgeCellH(d)"
    />

    <TagRollPartsPanel
      v-if="project.view.mode !== 'view'"
      :open="partsOpen"
      @close="partsOpen = false"
    />
    <TagRollMixerPanel :open="mixerOpen" @close="mixerOpen = false" />
    <TagRollHarmonizePanel
      v-if="project.view.mode !== 'view'"
      ref="harmonizeRef"
      :open="harmonizeOpen"
      @close="onHarmonizeClose"
      @preview-ghost="onGhost"
      @clear-ghost="ghostNotes = []"
    />

    <TagRollShortcutsOverlay :open="shortcutsOpen" @close="shortcutsOpen = false" />

    <ConfirmDialog
      :open="!!pendingInspectDeleteMessage"
      title="Delete notes in selection?"
      :message="pendingInspectDeleteMessage ?? ''"
      confirm-label="Delete"
      @close="cancelInspectRangeDelete"
      @confirm="confirmInspectRangeDelete"
    />
  </section>
  <p v-else class="loading">Loading…</p>
</template>

<style scoped>
.tr-ed {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding: 0.55rem 0.7rem 0;
  overflow: hidden;
  background: var(--bg, var(--surface));
  min-height: 100dvh;
}
.top {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.55rem;
  flex: 0 0 auto;
}
.back {
  color: var(--accent);
  text-decoration: none;
  font-weight: 600;
  font-size: 0.9rem;
}
.title-input {
  min-width: 10rem;
  max-width: min(22rem, 70vw);
  min-height: 40px;
  padding: 0.35rem 0.55rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-weight: 650;
  font-size: 1.05rem;
}
.shortcuts-btn {
  margin-left: auto;
  min-height: 36px;
  padding: 0.3rem 0.7rem;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 0.84rem;
  font-weight: 650;
  cursor: pointer;
  white-space: nowrap;
}
.shortcuts-btn:hover {
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
  background: color-mix(in srgb, var(--accent) 10%, var(--surface));
}
.stage {
  position: relative;
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
  border: 1px solid var(--border);
  border-radius: 12px;
  overflow: hidden;
  background: var(--surface);
}
.stage-body {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
}
.tote-col {
  display: flex;
  flex-direction: column;
  flex: 0 0 auto;
  min-height: 0;
}
.ruler-gutter {
  flex: 0 0 auto;
  background: color-mix(in srgb, var(--surface) 92%, transparent);
  border-right: 1px solid #b8b0a4;
  border-bottom: 1px solid var(--border);
}
.roll-col {
  position: relative;
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-width: 18rem;
  min-height: 0;
}
.stage.coach-popout :deep(.coach-dock) {
  width: 100% !important;
  max-width: none;
  min-width: 0;
  border-left: 0;
}
.linkish-inline {
  border: 0;
  background: transparent;
  color: var(--accent);
  font: inherit;
  font-weight: 650;
  cursor: pointer;
  text-decoration: underline;
  padding: 0;
}
.roll-col :deep(.viewport) {
  flex: 1 1 auto;
}
.roll-hud {
  position: absolute;
  right: 0.55rem;
  top: 0.45rem;
  z-index: 5;
  pointer-events: none;
  padding: 0.2rem 0.45rem;
  border-radius: 6px;
  background: color-mix(in srgb, var(--surface) 82%, transparent);
  border: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
  color: var(--text);
  font-size: 0.78rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  box-shadow: 0 1px 4px color-mix(in srgb, #000 10%, transparent);
}
.err { margin: 0; color: var(--danger, #b42318); }
.hint, .loading { margin: 0; color: var(--muted); font-size: 0.9rem; }
</style>
