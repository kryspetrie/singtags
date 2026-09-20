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
import TagRollHarmonizePanel from '../components/tagRoll/TagRollHarmonizePanel.vue'
import TagRollLyricsInput from '../components/tagRoll/TagRollLyricsInput.vue'
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
import { isPartAudible, mixForPart } from '../lib/tagRoll/mix'
import { createTagRollScheduler, type TagRollScheduler } from '../lib/tagRoll/scheduler'
import { downloadTagRollMidi, type MidiExportMode } from '../lib/tagRoll/midiExport'
import { downloadTagRollMusicXml } from '../lib/tagRoll/musicxmlExport'
import { downloadTagRollAudio } from '../lib/tagRoll/audioExport'
import { downloadTagRollProjectJson } from '../lib/tagRoll/projectJson'
import { planBlowPitch, shouldBlowPitchOnPlay } from '../lib/tagRoll/blowPitch'
import { beatsCrossedSigned } from '../lib/tagRoll/metronomeBeats'
import { saveTagRollToLibrary } from '../lib/tagRoll/saveToLibrary'
import { TAG_ROLL_DURATION_PRESETS, dottedDurationTicks, stepDurationTicks } from '../lib/tagRoll/snap'
import { findPartByHotkey } from '../lib/tagRoll/partHotkeys'
import { isTypingTarget, matchModKey, tagRollTip, tipByShortcutId } from '../lib/tagRoll/shortcuts'
import {
  formatDurationBeats,
  formatMeasureBeat,
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

const props = defineProps<{ id: string }>()

const store = useTagRollStore()
const prefs = usePreferencesStore()
const snackbar = useSnackbarStore()
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
const shortcutsOpen = ref(false)
const ghostNotes = ref<
  { midi: number; startTick: number; durationTicks: number; color: string }[]
>([])
const saveBusy = ref(false)
const exportBusy = ref(false)
const exportBusyLabel = ref('')
const pointerHud = ref<{ tick: number; midi: number } | null>(null)

const project = computed(() => store.current)

const showPianoTote = computed(
  () => !!project.value && !(project.value.view.mode === 'view' && project.value.view.scoreSurface === 'sheet'),
)

const rulerH = computed(() => {
  const p = project.value
  if (!p) return TAG_ROLL_RULER_H_COMPOSE
  return p.view.mode === 'compose' ? TAG_ROLL_RULER_H_COMPOSE : TAG_ROLL_RULER_H
})

/** Pitch-grid height only (viewport cssH includes the ruler strip). */
const toteViewportH = computed(() => Math.max(0, stageViewportH.value - rulerH.value))

const TOTE_W = 72

const activePartName = computed(() => {
  const p = project.value
  if (!p) return '—'
  return p.parts.find((x) => x.id === p.view.activePartId)?.name ?? '—'
})

const selectionSummary = computed(() => {
  const p = project.value
  if (!p || !store.selectedNoteIds.length) return null
  const notes = store.selectedNoteIds
    .map((id) => p.notes.find((n) => n.id === id))
    .filter(Boolean) as typeof p.notes
  if (!notes.length) return null
  if (notes.length === 1) {
    const n = notes[0]!
    return {
      multi: false as const,
      pitch: midiToNote(n.midi),
      start: formatMeasureBeat(n.startTick, p.timeSignature, p.ppq),
      length: formatDurationBeats(n.durationTicks, p.timeSignature, p.ppq),
      lyric: n.lyric ?? '',
      noteId: n.id,
    }
  }
  return { multi: true as const, count: notes.length }
})

/** Lower-right roll overlay: active part + current note. */
const rollHudLabel = computed(() => {
  const part = activePartName.value
  if (pointerHud.value) return `${part} · ${midiToNote(pointerHud.value.midi)}`
  const sel = selectionSummary.value
  if (sel && !sel.multi) return `${part} · ${sel.pitch}`
  return part
})

function onLyricInspect(e: Event): void {
  const id = selectionSummary.value && !selectionSummary.value.multi ? selectionSummary.value.noteId : null
  if (!id) return
  store.setLyric(id, (e.target as HTMLInputElement).value)
}

/** Horizontal zoom with fill-width floor from the active viewport. */
function onNudgeCellW(delta: number): void {
  const p = project.value
  if (!p) return
  const sheet = p.view.mode === 'view' && p.view.scoreSurface === 'sheet'
  const vpW =
    (sheet ? sheetViewportRef.value?.cssW : viewportRef.value?.cssW) ?? 640
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
    getMix: () => store.current?.mix ?? [],
    getSoundEnvelope: () =>
      store.current?.soundEnvelope ?? {
        attackSec: 0.05,
        decaySec: 0.05,
        phraseDecaySec: 0.45,
      },
    getTimeSignature: () =>
      store.current?.timeSignature ?? { numerator: 4, denominator: 4 },
    getMetronomeEnabled: () => !!store.current?.metronomeEnabled,
    onMetronomeBeat: (hit) => {
      void ensureMetronome().click(hit.downbeat)
    },
    player: p,
    onPlayhead: (tick) => {
      if (store.current) store.setPlayheadTick(tick, { snap: false })
    },
    onEnded: () => {
      store.transportPlaying = false
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
  window.addEventListener('keydown', onKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown)
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

/** Playhead tick when the current play-through started (Space returns here). */
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
  playbackOriginTick.value = store.current?.view.playheadTick ?? 0
  cancelBlowPitchIntro()
  const clicker = ensureMetronome()
  void clicker.ensureLoaded(prefs.tagRollMetronomeSound)
  rebuildScheduler()
  const from = playbackOriginTick.value
  const p = project.value
  store.transportPlaying = true
  if (p && shouldBlowPitchOnPlay(p, from)) {
    const ok = await runBlowPitchIntro()
    if (!ok || !store.transportPlaying) return
    // Content start already clicked as end of pitch measure if on a downbeat —
    // scheduler primes the start beat when includeStart fires; skip double-click
    // by playing just after the boundary when metronome is on.
    const start = planBlowPitch(p)?.contentStartTick ?? from
    scheduler?.play(start, { metronomePrime: false })
    return
  }
  scheduler?.play(from)
}

/** Pause and leave the playhead where playback stopped. */
function onPauseInPlace(): void {
  cancelBlowPitchIntro()
  scheduler?.pause()
  store.transportPlaying = false
  snapPlayheadToGrid()
}

/** Stop and jump the playhead back to where this play-through began. */
function onStopToOrigin(): void {
  cancelBlowPitchIntro()
  scheduler?.stop({ resetPlayhead: false })
  store.transportPlaying = false
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

function onAuditionColumn(payload: { tick: number; movePlayhead: boolean }): void {
  if (payload.movePlayhead) store.setPlayheadTick(payload.tick)
  void auditionTick(payload.tick)
}

function onExportMidi(mode: MidiExportMode): void {
  if (!project.value) return
  downloadTagRollMidi(project.value, mode)
}

function onExportMusicXml(): void {
  if (!project.value) return
  downloadTagRollMusicXml(project.value)
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
    await downloadTagRollAudio(project.value, {
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

function onResize(payload: { id: string; durationTicks: number }): void {
  store.updateNoteLive(payload.id, { durationTicks: payload.durationTicks })
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
  else harmonizeOpen.value = true
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

/** Arrow-key nudge for the selection; auditions the primary note’s new pitch. */
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

  if (mod && key.toLowerCase() === 'c') {
    if (readOnly) return
    e.preventDefault()
    store.copySelectedNotes()
    return
  }
  if (mod && key.toLowerCase() === 'v') {
    if (readOnly) return
    e.preventDefault()
    store.pasteNotesAtPlayhead()
    return
  }
  if (mod && key.toLowerCase() === 'a') {
    if (readOnly) return
    e.preventDefault()
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
    if (project.value.view.mode === 'lyrics') {
      store.setMode('compose')
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
    store.setMode('lyrics')
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
      @export-midi="onExportMidi"
      @export-music-xml="onExportMusicXml"
      @export-audio="onExportAudio"
      @export-json="onExportJson"
      @save-library="onSaveLibrary"
      @open-harmonize="toggleHarmonize"
      @open-parts="toggleParts"
    />

    <TagRollLyricsInput />

    <p v-if="store.error" class="err" role="alert">{{ store.error }}</p>
    <p v-if="saveBusy" class="hint">Saving to My Library…</p>
    <p v-if="exportBusy" class="hint">{{ exportBusyLabel || 'Exporting…' }}</p>

    <div class="stage">
      <div class="stage-body">
        <div v-if="showPianoTote" class="tote-col">
          <div
            class="ruler-gutter"
            :style="{ height: `${rulerH}px` }"
            aria-hidden="true"
          />
          <TagRollTote
            :project="project"
            :viewport-height="toteViewportH"
            @scroll-y="(y) => project && store.setScroll(project.view.scrollX, y)"
          />
        </div>
        <div class="roll-col">
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
        </div>
      </div>
      <TagRollExpressionLane
        v-if="showPianoTote"
        :project="project"
        :read-only="project.view.mode === 'view'"
        :left-gutter-px="TOTE_W"
      />
    </div>

    <div v-if="selectionSummary && project.view.mode !== 'view'" class="inspect-row">
      <template v-if="selectionSummary.multi">
        <span>{{ selectionSummary.count }} notes</span>
      </template>
      <template v-else>
        <span class="inspect-pitch">{{ selectionSummary.pitch }}</span>
        <span>{{ selectionSummary.start }}</span>
        <span>×{{ selectionSummary.length }}</span>
        <input
          class="lyric-in"
          type="text"
          :value="selectionSummary.lyric"
          :placeholder="tagRollTip('Lyric')"
          :title="tagRollTip('Lyric for selected note')"
          aria-label="Lyric for selected note"
          @change="onLyricInspect"
        />
      </template>
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
  flex: 0 0 72px;
  width: 72px;
  min-height: 0;
}
.ruler-gutter {
  flex: 0 0 auto;
  background: color-mix(in srgb, var(--surface) 92%, transparent);
  border-right: 1px solid #b8b0a4;
  border-bottom: 1px solid var(--border);
}
.inspect-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
  flex: 0 0 auto;
  padding: 0 0.15rem;
  font-size: 0.82rem;
  font-weight: 650;
  color: var(--text);
}
.inspect-pitch {
  color: var(--accent);
}
.lyric-in {
  min-width: 6rem;
  max-width: 10rem;
  min-height: 30px;
  padding: 0.15rem 0.4rem;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 0.82rem;
}
.roll-col {
  position: relative;
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
}
.roll-col :deep(.viewport) {
  flex: 1 1 auto;
}
.roll-hud {
  position: absolute;
  right: 0.55rem;
  bottom: 0.45rem;
  z-index: 6;
  pointer-events: none;
  padding: 0.2rem 0.45rem;
  border-radius: 6px;
  background: color-mix(in srgb, var(--surface) 82%, transparent);
  border: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
  color: var(--text);
  font-size: 0.78rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.01em;
  box-shadow: 0 1px 4px color-mix(in srgb, #000 10%, transparent);
}
.err {
  margin: 0;
  color: var(--danger, #b42318);
}
.hint,
.loading {
  margin: 0;
  color: var(--muted);
  font-size: 0.9rem;
}
</style>
