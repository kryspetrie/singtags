<script setup lang="ts">
/**
 * Melody-anchored barbershop chord entry — right-hand dock beside the roll.
 * Pick/hold to preview; Apply commits. Reset restores the sketch chord under the note.
 * UX/algorithm inspired by znarf94/MuseScore_Barbershop_Harmonizer (reimplemented; not QML).
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { midiToNote } from '../../audio/pianoSamples'
import { createPitchTonePlayer, type PitchTonePlayer } from '../../audio/pitchTone'
import { resolvePitchPipeVoiceById } from '../../audio/pitchPipeVoice'
import { useTagRollAudio } from '../../composables/useTagRollAudio'
import InfoTips from '../InfoTips.vue'
import {
  BARBERSHOP_CHORDS,
  leadRoleInChord,
  placeVoicing,
  placeVoicingConcert,
  pcName,
  VOICINGS_BY_CHORD,
  voicingFitsLead,
  type BarbershopChordNature,
  type VoicingPitches,
} from '../../lib/tagRoll/harmonizer/chords'
import {
  buildHarmonizeChordOptions,
  optionKey,
  rankHintsFromCandidates,
  type ChordRankHint,
  type HarmonizeChordOption,
} from '../../lib/tagRoll/harmonizer/chordPickOptions'
import { impliedRankHintsAtMelody } from '../../lib/tagRoll/harmonizer/impliedRankHints'
import { voicingDisplayLabel } from '../../lib/tagRoll/harmonizer/inversionLabel'
import { HARMONIZE_HOWTO } from '../../lib/tagRoll/harmonyHowTo'
import {
  loadHarmonizeApplyMode,
  saveHarmonizeApplyMode,
  loadHarmonizeWorkspace,
  saveHarmonizeWorkspace,
  type HarmonizeApplyMode,
  type HarmonizeWorkspace,
} from '../../lib/tagRoll/harmonizePrefs'
import {
  ensureHarmonizeCoachSession,
  melodyEventFromTagNote,
  pushCoachStacksToRoll,
} from '../../composables/useHarmonizeCoachSession'
import type { HarmonyPreviewDraft } from '../../lib/tagRoll/harmonyPreviewDraft'
import { previewDraftDirty } from '../../lib/tagRoll/harmonyPreviewDraft'
import {
  natureToSketchQuality,
  sketchSpanAtTick,
} from '../../lib/tagRoll/harmonySketch'
import { resolveSketchHearMidis } from '../../lib/tagRoll/hearSketchSpan'
import { notesAtTick } from '../../lib/tagRoll/notesAtTick'
import { tagRollTip, tipByShortcutId } from '../../lib/tagRoll/shortcuts'
import type { HarmonySketchQuality, TagRollNote } from '../../lib/tagRoll/types'
import type { HarmonizeCandidate } from '../../domain/arranging/harmonize'
import type { ChordAnalysisSegment } from '../../domain/arranging/chordAnalysisBar'
import { useArrangementStore } from '../../stores/arrangement'
import { useTagRollStore } from '../../stores/tagRoll'
import TagRollChordPickList from './TagRollChordPickList.vue'

export type TagRollGhostNote = {
  role: 'tenor' | 'bari' | 'bass'
  midi: number
  startTick: number
  durationTicks: number
  color: string
}

const props = defineProps<{
  open: boolean
  /** Hide ↗ when this panel is already the pop-out window. */
  allowPopOut?: boolean
  /** Detected holes — soft home-root fallback for Suggest. */
  detectSegments?: readonly ChordAnalysisSegment[]
}>()

const emit = defineEmits<{
  close: []
  popOut: []
  previewGhost: [ghosts: TagRollGhostNote[]]
  clearGhost: []
  stepMelody: [direction: -1 | 1]
  /** Fired after a successful declare (Sketch or Stack) so editor can sync Coach. */
  declared: []
  /** Live sketch preview for Sketch lane + transport audition. */
  'update:preview': [draft: HarmonyPreviewDraft | null]
}>()

const showPopOut = computed(() => props.allowPopOut !== false)

const store = useTagRollStore()
const arrStore = useArrangementStore()
const rootOffset = ref(0)
const chordId = ref<string | null>(null)
const voicing = ref<string | null>(null)
const spread = ref(false)
const applyMode = ref<HarmonizeApplyMode>(loadHarmonizeApplyMode('stack'))
const workspace = ref<HarmonizeWorkspace>(loadHarmonizeWorkspace('pick'))
const suggestBusy = ref(false)
const sketchMatchLabel = ref<string | null>(null)
/** Baseline sketch under the current melody note (Reset target). */
const baseline = ref<{ rootPc: number; quality: HarmonySketchQuality } | null>(null)
const holding = ref(false)
/** Suppress preview emit while syncing UI from an existing sketch span. */
const syncingFromSketch = ref(false)

const shared = useTagRollAudio()
let localPlayer: PitchTonePlayer | null = null
let stabTimer: ReturnType<typeof setTimeout> | null = null

const project = computed(() => store.current)

const melodyPartId = computed(() => {
  const p = project.value
  if (!p) return null
  return (
    p.view.melodyPartId ??
    p.parts.find((x) => x.name === 'Lead')?.id ??
    p.parts[0]?.id ??
    null
  )
})

const melodyPart = computed(
  () => project.value?.parts.find((p) => p.id === melodyPartId.value) ?? null,
)

const melodyNotesSorted = computed((): TagRollNote[] => {
  const p = project.value
  const mid = melodyPartId.value
  if (!p || !mid) return []
  return p.notes
    .filter((n) => n.partId === mid)
    .slice()
    .sort((a, b) => a.startTick - b.startTick || a.midi - b.midi)
})

const melodyNote = computed((): TagRollNote | null => {
  const p = project.value
  const mid = melodyPartId.value
  if (!p || !mid) return null
  const sel = store.selectedNote
  if (sel && sel.partId === mid) return sel
  const at = notesAtTick(p.notes, p.view.playheadTick).filter((n) => n.partId === mid)
  if (at.length) return at.slice().sort((a, b) => a.midi - b.midi)[0] ?? null
  // Nearest upcoming / previous melody note relative to playhead.
  const sorted = melodyNotesSorted.value
  if (!sorted.length) return null
  const tick = p.view.playheadTick
  const next = sorted.find((n) => n.startTick >= tick)
  if (next) return next
  return sorted[sorted.length - 1] ?? null
})

const melodyIndex = computed(() => {
  const note = melodyNote.value
  if (!note) return -1
  return melodyNotesSorted.value.findIndex((n) => n.id === note.id)
})

const rootPc = computed(() => {
  const tonality = project.value?.tonality ?? 0
  return (((tonality + rootOffset.value) % 12) + 12) % 12
})

const preferFlats = computed(() => project.value?.preferFlats ?? false)

const selectedChord = computed(
  (): BarbershopChordNature | null =>
    BARBERSHOP_CHORDS.find((c) => c.id === chordId.value) ?? null,
)

const chordPickLists = computed(() =>
  buildHarmonizeChordOptions({
    tonality: project.value?.tonality ?? 0,
    mode: project.value?.tonalityMode ?? 'major',
    preferFlats: preferFlats.value,
    leadMidi: melodyNote.value?.midi ?? null,
    chordOnly: applyMode.value === 'sketch',
  }),
)

const primaryChordOptions = computed(() => chordPickLists.value.primary)
const moreChordOptions = computed(() => chordPickLists.value.more)

const suggestCandidates = computed(() => arrStore.candidates)

const coachRankHints = computed((): ChordRankHint[] => {
  const seen = new Set<string>()
  const unique: { rootPc: number; natureId: string; label?: string }[] = []
  for (const c of suggestCandidates.value) {
    const k = `${c.rootPc}:${c.natureId}`
    if (seen.has(k)) continue
    seen.add(k)
    unique.push({ rootPc: c.rootPc, natureId: c.natureId, label: c.label })
  }
  return rankHintsFromCandidates(unique)
})

/** Implied + cadence suggestions (Pick) or Coach ranks (Suggest) for pick-list chrome. */
const chordRankHints = computed((): ChordRankHint[] | null => {
  if (workspace.value === 'suggest') {
    const hints = coachRankHints.value
    return hints.length ? hints : null
  }
  const mel = melodyNote.value
  const p = project.value
  if (!mel || !p) return null
  const idx = melodyIndex.value
  const next = idx >= 0 ? melodyNotesSorted.value[idx + 1] : undefined
  const hints = impliedRankHintsAtMelody({
    melodyMidi: mel.midi,
    nextMelodyMidi: next?.midi ?? null,
    tonality: p.tonality,
    mode: p.tonalityMode ?? 'major',
    preferFlats: preferFlats.value,
  })
  return hints.length ? hints : null
})

const selectedOptionKey = computed(() =>
  chordId.value != null ? optionKey({ rootOffset: rootOffset.value, chordId: chordId.value }) : null,
)

const leadRole = computed(() => {
  const chord = selectedChord.value
  const mel = melodyNote.value
  if (!chord || !mel) return null
  return leadRoleInChord(chord, rootPc.value, mel.midi)
})

const availableVoicings = computed(() => {
  const chord = selectedChord.value
  const role = leadRole.value
  if (!chord || role == null) return []
  const list = VOICINGS_BY_CHORD[chord.id] ?? []
  return list.filter((v) => voicingFitsLead(v, role))
})

function ghostsFromPlaced(pitches: VoicingPitches, mel: TagRollNote): TagRollGhostNote[] {
  const parts = project.value?.parts ?? []
  const colorFor = (name: string, fallback: string) =>
    parts.find((p) => p.name === name)?.color ?? fallback
  const base = { startTick: mel.startTick, durationTicks: mel.durationTicks }
  return [
    { role: 'tenor', midi: pitches.tenor, ...base, color: colorFor('Tenor', '#c45c26') },
    { role: 'bari', midi: pitches.bari, ...base, color: colorFor('Bari', '#2f7d4a') },
    { role: 'bass', midi: pitches.bass, ...base, color: colorFor('Bass', '#5b3d8f') },
  ]
}

function ensurePlayer(): PitchTonePlayer {
  if (shared) return shared.ensurePlayer()
  if (!localPlayer) {
    const engine = project.value?.soundEngine ?? 'synth'
    localPlayer = createPitchTonePlayer(engine, { polyphony: true })
  }
  if ((project.value?.soundEngine ?? 'synth') === 'synth') {
    localPlayer.setVoice(resolvePitchPipeVoiceById(project.value?.pitchPipeSoundId))
  }
  return localPlayer
}

function stopStab(): void {
  if (stabTimer) {
    clearTimeout(stabTimer)
    stabTimer = null
  }
  holding.value = false
  if (shared?.isTransportPlaying?.()) return
  if (shared) shared.allNotesOff(true)
  else localPlayer?.allNotesOff(true)
}

async function soundPitches(pitches: VoicingPitches, hold = false): Promise<void> {
  if (shared?.isTransportPlaying?.()) return
  stopStab()
  const p = ensurePlayer()
  const notes = [pitches.bass, pitches.bari, pitches.lead, pitches.tenor].map((m) =>
    midiToNote(m),
  )
  await Promise.all(notes.map((n) => p.noteOn(n)))
  if (hold) {
    holding.value = true
    return
  }
  stabTimer = setTimeout(() => {
    stabTimer = null
    if (shared?.isTransportPlaying?.()) return
    if (shared) shared.allNotesOff(true)
    else p.allNotesOff(true)
  }, 700)
}

function clearPreview(): void {
  emit('update:preview', null)
  emit('clearGhost')
}

function publishPreview(): void {
  if (syncingFromSketch.value) return
  const mel = melodyNote.value
  const chord = selectedChord.value
  if (!mel || !chord) {
    clearPreview()
    return
  }
  const quality = natureToSketchQuality(chord.id)
  emit('update:preview', {
    id: `harm:${mel.id}`,
    startTick: mel.startTick,
    endTick: mel.startTick + mel.durationTicks,
    rootPc: rootPc.value,
    quality,
    baseline: baseline.value,
    source: 'harmonize',
  })

  if (applyMode.value === 'stack' && voicing.value) {
    const pitches = placeVoicingConcert({
      chord,
      rootPc: rootPc.value,
      leadMidi: mel.midi,
      voicing: voicing.value,
      spread: spread.value,
      clefFamily: project.value?.clefFamily ?? 'ttbb',
      melodyStaff: melodyPart.value?.midiGroup ?? 'upper',
    })
    if (pitches) emit('previewGhost', ghostsFromPlaced(pitches, mel))
    else emit('clearGhost')
  } else {
    emit('clearGhost')
  }
}

const draftDirty = computed(() => {
  if (!chordId.value || !selectedChord.value) return false
  const quality = natureToSketchQuality(selectedChord.value.id)
  const draft: HarmonyPreviewDraft = {
    id: 'x',
    startTick: 0,
    endTick: 1,
    rootPc: rootPc.value,
    quality,
    baseline: baseline.value,
    source: 'harmonize',
  }
  return previewDraftDirty(draft)
})

const canApply = computed(() => {
  if (workspace.value === 'suggest') {
    return !!matchingSuggestCandidate() || (!!melodyNote.value && !!selectedChord.value)
  }
  if (!melodyNote.value || !selectedChord.value) return false
  if (applyMode.value === 'sketch') return true
  return !!voicing.value
})

function matchingSuggestCandidate(): HarmonizeCandidate | null {
  const id = chordId.value
  if (id == null) return null
  const pc = rootPc.value
  const v = voicing.value
  const list = suggestCandidates.value
  if (!list.length) return null
  if (v) {
    const exact = list.find((c) => c.rootPc === pc && c.natureId === id && c.voicing === v)
    if (exact) return exact
  }
  return list.find((c) => c.rootPc === pc && c.natureId === id) ?? null
}

function applyCandidateToLocalUi(c: HarmonizeCandidate): void {
  const tonality = project.value?.tonality ?? 0
  rootOffset.value = (((c.rootPc - tonality) % 12) + 12) % 12
  chordId.value = c.natureId
  voicing.value = applyMode.value === 'sketch' ? null : c.voicing
  spread.value = c.spread
  sketchMatchLabel.value = null
  publishPreview()
}

function onClose(): void {
  stopStab()
  clearPreview()
  emit('close')
}

function setApplyMode(mode: HarmonizeApplyMode): void {
  applyMode.value = mode
  saveHarmonizeApplyMode(mode)
  if (mode === 'sketch') voicing.value = null
  publishPreview()
}

async function setWorkspace(mode: HarmonizeWorkspace): Promise<void> {
  workspace.value = mode
  saveHarmonizeWorkspace(mode)
  if (mode === 'suggest') await refreshSuggest()
}

async function refreshSuggest(): Promise<void> {
  const mel = melodyNote.value
  if (!mel) {
    arrStore.setCandidateTarget(null)
    return
  }
  suggestBusy.value = true
  try {
    const ok = await ensureHarmonizeCoachSession()
    if (!ok) return
    const sketch = project.value?.harmonySketch ?? []
    arrStore.setSoftSuggestContext({
      sketchSpans: sketch.map((s) => ({
        startTick: s.startTick,
        endTick: s.endTick,
        rootPc: s.rootPc,
        locked: s.locked,
        natureId: s.quality || undefined,
      })),
      detectedSpans: (props.detectSegments ?? [])
        .filter((s): s is ChordAnalysisSegment & { rootPc: number } => s.rootPc != null)
        .map((s) => ({
          startTick: s.startTick,
          endTick: s.endTick,
          rootPc: s.rootPc,
          natureId: s.quality || undefined,
        })),
    })
    arrStore.setCandidateTarget(melodyEventFromTagNote(mel))
    const top = arrStore.candidates[0]
    if (top) applyCandidateToLocalUi(top)
  } finally {
    suggestBusy.value = false
  }
}

function applySelectedSuggest(): void {
  const c = matchingSuggestCandidate() ?? suggestCandidates.value[0] ?? null
  if (!c) return
  arrStore.applyCandidate(c)
  pushCoachStacksToRoll()
  emit('declared')
  void refreshSuggest()
}

function selectChordOption(opt: HarmonizeChordOption): void {
  const mel = melodyNote.value
  if (!mel) return
  if (workspace.value === 'suggest') {
    const match = suggestCandidates.value.find(
      (c) => c.rootPc === opt.rootPc && c.natureId === opt.chordId,
    )
    if (match) {
      applyCandidateToLocalUi(match)
      return
    }
  }
  rootOffset.value = opt.rootOffset
  chordId.value = opt.chordId
  sketchMatchLabel.value = null
  const chord = BARBERSHOP_CHORDS.find((c) => c.id === opt.chordId)
  if (!chord) return
  if (applyMode.value === 'sketch') {
    voicing.value = null
  } else {
    const role = leadRoleInChord(chord, opt.rootPc, mel.midi)
    const list = (VOICINGS_BY_CHORD[opt.chordId] ?? []).filter((v) =>
      role != null ? voicingFitsLead(v, role) : true,
    )
    voicing.value = list[0] ?? null
  }
  publishPreview()
}

function selectVoicing(v: string): void {
  if (applyMode.value === 'sketch') return
  voicing.value = v
  publishPreview()
}

function setSpread(on: boolean): void {
  spread.value = on
  if (applyMode.value === 'stack' && voicing.value) publishPreview()
}

function onSpreadPointerDown(on: boolean, e: PointerEvent): void {
  if (e.button !== 0 || applyMode.value === 'sketch') return
  e.preventDefault()
  ;(e.currentTarget as HTMLElement | null)?.setPointerCapture?.(e.pointerId)
  setSpread(on)
  void holdHearChord()
}

function onVoicingPointerDown(v: string, e: PointerEvent): void {
  if (e.button !== 0 || applyMode.value === 'sketch') return
  e.preventDefault()
  ;(e.currentTarget as HTMLElement | null)?.setPointerCapture?.(e.pointerId)
  selectVoicing(v)
  void holdHearChord()
}

function onReset(): void {
  stopStab()
  const mel = melodyNote.value
  const b = baseline.value
  if (!mel || !b) {
    chordId.value = null
    voicing.value = null
    clearPreview()
    sketchMatchLabel.value = null
    return
  }
  const tonality = project.value?.tonality ?? 0
  syncingFromSketch.value = true
  rootOffset.value = (((b.rootPc - tonality) % 12) + 12) % 12
  chordId.value = sketchQualityToChordId(b.quality)
  voicing.value = null
  sketchMatchLabel.value = `${pcName(b.rootPc, preferFlats.value)}${BARBERSHOP_CHORDS.find((c) => c.id === chordId.value)?.notation || ''}`
  void nextTick(() => {
    syncingFromSketch.value = false
    publishPreview()
  })
}

function commitHarmony(): void {
  if (workspace.value === 'suggest' && matchingSuggestCandidate()) {
    applySelectedSuggest()
    return
  }
  const mel = melodyNote.value
  const chord = selectedChord.value
  if (!mel || !chord) {
    emit('clearGhost')
    return
  }

  if (applyMode.value === 'sketch') {
    store.commitHarmonizeAtMelody({
      melodyNoteId: mel.id,
      rootPc: rootPc.value,
      quality: chord.id,
      mode: 'chord',
    })
    baseline.value = {
      rootPc: rootPc.value,
      quality: natureToSketchQuality(chord.id),
    }
    sketchMatchLabel.value = `${pcName(rootPc.value, preferFlats.value)}${chord.notation || ''}`
    clearPreview()
    emit('declared')
    void soundSketchStab(mel)
    return
  }

  const v = voicing.value
  if (!v) {
    emit('clearGhost')
    return
  }
  const pitches = placeVoicingConcert({
    chord,
    rootPc: rootPc.value,
    leadMidi: mel.midi,
    voicing: v,
    spread: spread.value,
    clefFamily: project.value?.clefFamily ?? 'ttbb',
    melodyStaff: melodyPart.value?.midiGroup ?? 'upper',
  })
  if (!pitches) return
  store.commitHarmonizeAtMelody({
    melodyNoteId: mel.id,
    rootPc: rootPc.value,
    quality: chord.id,
    mode: 'chord+stack',
    pitches,
  })
  baseline.value = {
    rootPc: rootPc.value,
    quality: natureToSketchQuality(chord.id),
  }
  sketchMatchLabel.value = `${pcName(rootPc.value, preferFlats.value)}${chord.notation || ''}`
  clearPreview()
  emit('declared')
  const hear =
    placeVoicing({
      chord,
      rootPc: rootPc.value,
      leadMidi: mel.midi,
      voicing: v,
      spread: spread.value,
    }) ?? pitches
  void soundPitches(hear)
}

async function holdHearChord(opt?: HarmonizeChordOption): Promise<void> {
  if (opt) selectChordOption(opt)
  const mel = melodyNote.value
  const chord = selectedChord.value
  if (!mel || !chord) return
  if (applyMode.value === 'stack' && voicing.value) {
    const hear =
      placeVoicing({
        chord,
        rootPc: rootPc.value,
        leadMidi: mel.midi,
        voicing: voicing.value,
        spread: spread.value,
      }) ??
      placeVoicingConcert({
        chord,
        rootPc: rootPc.value,
        leadMidi: mel.midi,
        voicing: voicing.value,
        spread: spread.value,
        clefFamily: project.value?.clefFamily ?? 'ttbb',
        melodyStaff: melodyPart.value?.midiGroup ?? 'upper',
      })
    if (hear) await soundPitches(hear, true)
    return
  }
  await soundSketchStab(mel, true)
}

function stopHoldHear(): void {
  if (!holding.value) return
  stopStab()
}

function harmonyLeadMidiAt(tick: number): number | null {
  const p = project.value
  const mid = melodyPartId.value
  if (!p || !mid) return null
  const hit = p.notes.find(
    (n) =>
      n.partId === mid &&
      n.startTick <= tick &&
      tick < n.startTick + n.durationTicks,
  )
  return hit?.midi ?? null
}

async function soundSketchStab(mel: TagRollNote, hold = false): Promise<void> {
  if (shared?.isTransportPlaying?.()) return
  const chord = selectedChord.value
  if (!chord) return
  stopStab()
  const sketch = [...(project.value?.harmonySketch ?? [])]
    .filter((s) => s.locked)
    .sort((a, b) => a.startTick - b.startTick)
  const sequence = sketch.map((s) => ({
    startTick: s.startTick,
    rootPc: s.rootPc,
    quality: s.quality,
    leadMidi: harmonyLeadMidiAt(s.startTick),
  }))
  const midis = resolveSketchHearMidis({
    startTick: mel.startTick,
    rootPc: rootPc.value,
    quality: natureToSketchQuality(chord.id),
    leadMidi: mel.midi,
    mode: hold ? 'hold' : 'oneshot',
    sequence: sequence.length ? sequence : undefined,
    tonality: project.value?.tonality ?? 0,
  })
  const p = ensurePlayer()
  await Promise.all(midis.map((m) => p.noteOn(midiToNote(m))))
  if (hold) {
    holding.value = true
    return
  }
  stabTimer = setTimeout(() => {
    stabTimer = null
    if (shared?.isTransportPlaying?.()) return
    if (shared) shared.allNotesOff(true)
    else p.allNotesOff(true)
  }, 700)
}

/** Map sketch quality to a harmonizer chord id present in BARBERSHOP_CHORDS. */
function sketchQualityToChordId(quality: string): string {
  if (BARBERSHOP_CHORDS.some((c) => c.id === quality)) return quality
  if (quality === 'dim') return 'dim'
  if (quality === 'ninth') return 'ninth'
  return 'major'
}

function preselectFromSketch(): void {
  const mel = melodyNote.value
  const p = project.value
  if (!mel || !p) {
    sketchMatchLabel.value = null
    baseline.value = null
    clearPreview()
    return
  }
  const span = sketchSpanAtTick(p.harmonySketch ?? [], mel.startTick)
  if (!span || !span.locked) {
    sketchMatchLabel.value = null
    baseline.value = null
    chordId.value = null
    voicing.value = null
    clearPreview()
    return
  }
  const tonality = p.tonality ?? 0
  const offset = (((span.rootPc - tonality) % 12) + 12) % 12
  const qId = sketchQualityToChordId(span.quality)
  baseline.value = { rootPc: span.rootPc, quality: span.quality }
  syncingFromSketch.value = true
  rootOffset.value = offset
  chordId.value = qId
  voicing.value = null
  sketchMatchLabel.value = `${pcName(span.rootPc, preferFlats.value)}${BARBERSHOP_CHORDS.find((c) => c.id === qId)?.notation || ''}`
  void nextTick(() => {
    syncingFromSketch.value = false
    publishPreview()
  })
}

watch(
  () => melodyNote.value?.id,
  async () => {
    chordId.value = null
    voicing.value = null
    stopStab()
    preselectFromSketch()
    if (props.open && workspace.value === 'suggest') await refreshSuggest()
  },
)

function step(dir: -1 | 1): void {
  const sorted = melodyNotesSorted.value
  if (!sorted.length) return
  const idx = melodyIndex.value
  const nextIdx =
    idx < 0
      ? dir > 0
        ? 0
        : sorted.length - 1
      : Math.max(0, Math.min(sorted.length - 1, idx + dir))
  const note = sorted[nextIdx]!
  store.selectNote(note.id)
  store.setPlayheadTick(note.startTick)
  chordId.value = null
  voicing.value = null
  emit('stepMelody', dir)
}

watch(
  () => props.open,
  async (on) => {
    if (!on) {
      clearPreview()
      stopStab()
      return
    }
    if (
      applyMode.value === 'stack' &&
      chordId.value &&
      !primaryChordOptions.value.some(
        (o) => o.chordId === chordId.value && o.rootOffset === rootOffset.value,
      )
    ) {
      voicing.value = null
    }
    await nextTick()
    preselectFromSketch()
    if (workspace.value === 'suggest') await refreshSuggest()
  },
)

watch(primaryChordOptions, (list) => {
  if (applyMode.value === 'sketch') return
  if (
    chordId.value &&
    !list.some((o) => o.chordId === chordId.value && o.rootOffset === rootOffset.value)
  ) {
    // Stack mode: lead ∉ chord — keep declaration id for chip; clear voicing only.
    voicing.value = null
  }
})

watch(availableVoicings, (list) => {
  if (voicing.value && !list.includes(voicing.value)) {
    voicing.value = null
  }
})

onMounted(() => {
  if (props.open) preselectFromSketch()
})

onUnmounted(() => {
  stopStab()
  clearPreview()
  localPlayer?.dispose()
  localPlayer = null
})

defineExpose({ step })
</script>

<template>
  <aside
    v-if="open"
    class="tr-hz"
    role="complementary"
    aria-label="Harmonize"
  >
    <header class="hz-top">
      <div class="hz-top-left">
        <h2 class="title">Harmonize</h2>
        <div class="seg" role="group" aria-label="Write depth">
          <button
            type="button"
            class="seg-btn"
            :class="{ on: applyMode === 'sketch' }"
            title="Write chord to Sketch only"
            @click="setApplyMode('sketch')"
          >Sketch</button>
          <button
            type="button"
            class="seg-btn"
            :class="{ on: applyMode === 'stack' }"
            title="Write Sketch and realize TTBB"
            @click="setApplyMode('stack')"
          >Stack</button>
        </div>
        <InfoTips
          label="How to use Harmonize"
          title="How to use Harmonize — flows and philosophy"
          @pointerdown.stop
        >
          <section v-for="sec in HARMONIZE_HOWTO" :key="sec.title" class="howto-sec">
            <p><strong>{{ sec.title }}</strong></p>
            <p>{{ sec.body }}</p>
            <ol v-if="sec.steps?.length">
              <li v-for="(s, i) in sec.steps" :key="i">{{ s }}</li>
            </ol>
          </section>
        </InfoTips>
      </div>
      <div class="hz-top-right">
        <button v-if="showPopOut" type="button" class="btn ghost" title="Pop out" aria-label="Pop out" @click="emit('popOut')">↗</button>
        <button type="button" class="btn ghost" :aria-label="tagRollTip('Close', 'Esc')" :title="tagRollTip('Close', 'Esc')" @click="onClose">✕</button>
      </div>
    </header>

    <div class="hz-actions">
      <button
        type="button"
        class="btn"
        :disabled="!draftDirty"
        :title="tagRollTip('Reset — restore the Sketch chord under this note')"
        @click="onReset"
      >Reset</button>
      <button
        type="button"
        class="btn primary"
        :disabled="!canApply"
        :class="{ dirty: draftDirty && workspace === 'pick' }"
        :title="
          tagRollTip(
            workspace === 'suggest'
              ? 'Apply — write Coach-ranked chord (and stack when in Stack mode)'
              : applyMode === 'sketch'
                ? 'Apply — declare into Sketch'
                : 'Apply — Sketch + TTBB',
          )
        "
        @click="commitHarmony"
      >Apply</button>
    </div>

    <div class="hz-tabs" role="tablist" aria-label="Harmonize workspace">
      <button
        type="button"
        role="tab"
        class="tab"
        :class="{ on: workspace === 'pick' }"
        :aria-selected="workspace === 'pick'"
        @click="setWorkspace('pick')"
      >Pick</button>
      <button
        type="button"
        role="tab"
        class="tab"
        :class="{ on: workspace === 'suggest' }"
        :aria-selected="workspace === 'suggest'"
        @click="setWorkspace('suggest')"
      >Suggest</button>
    </div>

    <div class="panel-body">
      <div class="step-row" role="group" aria-label="Step melody notes">
        <button type="button" class="btn sm" :title="tipByShortcutId('harm-prev')" @click="step(-1)">← Prev</button>
        <span class="step-meta">
          <template v-if="melodyNote">
            {{ melodyIndex + 1 }}/{{ melodyNotesSorted.length }} ·
            {{ melodyPart?.name ?? 'Melody' }} {{ midiToNote(melodyNote.midi) }}
          </template>
          <template v-else>No {{ melodyPart?.name ?? 'melody' }} notes</template>
        </span>
        <button type="button" class="btn sm" :title="tipByShortcutId('harm-next')" @click="step(1)">Next →</button>
      </div>

      <p v-if="!melodyNote" class="warn">
        Add a {{ melodyPart?.name ?? 'melody' }} note or move the playhead onto one.
        Melody part is set under Toolbar → Roles.
      </p>

      <template v-else>
        <p class="meta">
          <template v-if="workspace === 'suggest'">
            Coach-ranked chords
            <span v-if="suggestBusy" class="sec-note"> · loading…</span>
            <span v-else-if="suggestCandidates.length" class="sec-note">
              · {{ coachRankHints.length }} highlighted
            </span>
            <span v-else class="sec-note"> · no ranks yet — catalog still works</span>
          </template>
          <template v-else>
            <span v-if="selectedChord" class="root-chip">
              {{ pcName(rootPc, preferFlats) }}{{ selectedChord.notation || 'maj' }}
            </span>
            <span v-if="sketchMatchLabel" class="sketch-chip" title="Locked sketch under this note">
              Sketch: {{ sketchMatchLabel }}
            </span>
          </template>
        </p>

        <section class="block" aria-label="Chords">
          <h3 class="sec">
            {{
              workspace === 'suggest'
                ? 'Suggested chords'
                : applyMode === 'sketch'
                  ? 'Chords'
                  : 'Valid chords'
            }}
            <span class="sec-note">(hold to hear)</span>
          </h3>
          <TagRollChordPickList
            :primary="primaryChordOptions"
            :more="moreChordOptions"
            :selected-key="selectedOptionKey"
            label-mode="both"
            :lead-label="melodyNote ? midiToNote(melodyNote.midi) : null"
            :rank-hints="chordRankHints"
            :tonality="project?.tonality ?? 0"
            interaction="hold"
            :empty-primary-text="
              applyMode === 'sketch'
                ? 'No matching chords'
                : 'No chords contain this melody tone.'
            "
            @pick="selectChordOption"
            @hold-start="(o) => void holdHearChord(o)"
            @hold-stop="stopHoldHear"
          />
        </section>

        <section class="block" :class="{ dimmed: applyMode === 'sketch' }" aria-label="Voicing">
          <h3 class="sec">
            Stack / inversion
            <span v-if="applyMode === 'sketch'" class="sec-note"> (Stack mode only)</span>
            <span v-else class="sec-note">(hold to hear)</span>
          </h3>
          <div class="spread-row">
            <button
              type="button"
              class="btn sm"
              :class="{ on: !spread }"
              :disabled="applyMode === 'sketch'"
              title="Closed voicing — hold to hear"
              @pointerdown="onSpreadPointerDown(false, $event)"
              @pointerup="stopHoldHear"
              @pointercancel="stopHoldHear"
              @lostpointercapture="stopHoldHear"
              @pointerleave="stopHoldHear"
            >
              Closed
            </button>
            <button
              type="button"
              class="btn sm"
              :class="{ on: spread }"
              :disabled="applyMode === 'sketch'"
              title="Spread voicing — hold to hear"
              @pointerdown="onSpreadPointerDown(true, $event)"
              @pointerup="stopHoldHear"
              @pointercancel="stopHoldHear"
              @lostpointercapture="stopHoldHear"
              @pointerleave="stopHoldHear"
            >
              Spread
            </button>
          </div>
          <div class="grid">
            <button
              v-for="v in availableVoicings"
              :key="v"
              type="button"
              class="cell mono inv"
              :class="{ on: voicing === v }"
              :disabled="applyMode === 'sketch'"
              :title="tagRollTip(`${voicingDisplayLabel(v)} — hold to hear`)"
              @pointerdown="onVoicingPointerDown(v, $event)"
              @pointerup="stopHoldHear"
              @pointercancel="stopHoldHear"
              @lostpointercapture="stopHoldHear"
              @pointerleave="stopHoldHear"
            >{{ voicingDisplayLabel(v) }}</button>
          </div>
          <p v-if="chordId && applyMode === 'stack' && !availableVoicings.length" class="empty">
            No voicings for this melody role.
          </p>
        </section>
      </template>

      <p class="credit">
        Pick = catalog · Suggest = same chips, Coach ranks · Sketch = map only · Stack = map + TTBB.
        Undo is global (Ctrl+Z).
      </p>
    </div>
  </aside>
</template>

<style scoped>
.tr-hz {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  width: min(28rem, 40vw);
  min-width: min(18rem, 100%);
  max-width: min(36rem, 92vw);
  height: 100%;
  padding: 0.55rem 0.7rem 0.75rem;
  border-left: 1px solid var(--border);
  background: color-mix(in srgb, var(--surface) 94%, var(--bg));
  overflow: hidden;
  flex: 0 0 auto;
}
.hz-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  flex: 0 0 auto;
}
.hz-top-left {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  min-width: 0;
  flex-wrap: wrap;
}
.hz-top-right {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  flex: none;
}
.hz-actions {
  display: flex;
  gap: 0.4rem;
  flex: 0 0 auto;
}
.hz-actions .btn {
  flex: 1 1 auto;
  min-height: 2rem;
}
.hz-actions .btn.primary {
  flex: 1.4 1 auto;
}
.hz-tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.25rem;
  flex: 0 0 auto;
  padding: 0.15rem;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: color-mix(in srgb, var(--bg) 70%, var(--surface));
}
.tab {
  min-height: 1.85rem;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: var(--muted);
  font: inherit;
  font-size: 0.8rem;
  font-weight: 650;
  cursor: pointer;
}
.tab.on {
  background: var(--surface);
  color: var(--text);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--border) 80%, transparent);
}
.seg {
  display: inline-flex;
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
  flex: none;
}
.seg-btn {
  min-height: 1.7rem;
  padding: 0 0.55rem;
  border: none;
  border-right: 1px solid var(--border);
  background: var(--surface);
  color: var(--muted);
  font: inherit;
  font-size: 0.72rem;
  font-weight: 650;
  cursor: pointer;
}
.seg-btn:last-child { border-right: none; }
.seg-btn.on {
  background: color-mix(in srgb, var(--accent, #1d6a9f) 16%, var(--surface));
  color: var(--text);
}

.panel-body {
  display: grid;
  gap: 0.55rem;
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  align-content: start;
}



.howto-sec + .howto-sec {
  margin-top: 0.65rem;
  padding-top: 0.55rem;
  border-top: 1px solid var(--border);
}
.howto-sec ol {
  margin: 0.35rem 0 0;
  padding-left: 1.15rem;
}



.sketch-chip {
  display: inline-block;
  margin-left: 0.35rem;
  padding: 0.05rem 0.35rem;
  border-radius: 999px;
  border: 1px solid var(--border);
  font-size: 0.68rem;
  font-weight: 650;
  color: var(--text);
  background: color-mix(in srgb, var(--accent, #1d6a9f) 12%, var(--surface));
}
.block.dimmed {
  opacity: 0.45;
}
.sec-note {
  font-weight: 500;
  text-transform: none;
  letter-spacing: 0;
  color: var(--muted);
  font-size: 0.7rem;
}
.title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 700;
}
.field {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
}
.lbl {
  font-size: 0.72rem;
  font-weight: 650;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.sel {
  min-height: 34px;
  padding: 0.2rem 0.4rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg, var(--surface));
  color: var(--text);
  font: inherit;
  font-size: 0.9rem;
}
.step-row {
  display: flex;
  align-items: center;
  gap: 0.45rem;
}
.step-meta {
  flex: 1;
  font-size: 0.85rem;
  font-weight: 600;
  text-align: center;
}
.meta,
.warn,
.empty,
.credit {
  margin: 0;
  font-size: 0.82rem;
  color: var(--muted);
}
.warn {
  color: var(--danger, #b42318);
}
.block {
  display: grid;
  gap: 0.35rem;
}
.sec {
  margin: 0;
  font-size: 0.72rem;
  font-weight: 650;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.grid {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}
.cell {
  min-height: 34px;
  min-width: 2.4rem;
  padding: 0.2rem 0.45rem;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg, var(--surface));
  color: var(--text);
  font: inherit;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
}
.cell.mono {
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.04em;
}
.cell.inv {
  font-size: 0.72rem;
  min-width: 4.8rem;
  letter-spacing: 0.02em;
}
.chord-opt {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.05rem;
  min-width: 2.8rem;
  padding: 0.25rem 0.4rem;
  line-height: 1.1;
}
.chord-opt .cn {
  font-weight: 700;
  font-size: 0.85rem;
}
.chord-opt .cr {
  font-size: 0.65rem;
  font-weight: 600;
  color: var(--muted);
}
.chord-opt.on .cr {
  color: inherit;
  opacity: 0.85;
}
.more-chords {
  justify-self: start;
}
.grid.chord-pick.more {
  opacity: 0.92;
}
.root-chip {
  font-weight: 650;
}
.cell.on,
.btn.on {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 16%, var(--surface));
  color: var(--accent);
}
.spread-row {
  display: flex;
  gap: 0.3rem;
}

.btn {
  min-height: 36px;
  padding: 0.25rem 0.7rem;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-weight: 650;
  font-size: 0.9rem;
  cursor: pointer;
}
.btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.btn.primary {
  border-color: color-mix(in srgb, var(--accent) 50%, var(--border));
  background: color-mix(in srgb, var(--accent) 16%, var(--surface));
  font-weight: 750;
}
.btn.primary.dirty {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 28%, var(--surface));
  color: var(--accent);
  font-weight: 800;
}
.btn.sm {
  min-height: 32px;
  padding: 0.15rem 0.55rem;
  font-size: 0.85rem;
}
.btn.ghost {
  border-color: transparent;
  background: transparent;
  color: var(--muted);
}
.credit {
  font-size: 0.72rem;
  line-height: 1.35;
}
</style>
