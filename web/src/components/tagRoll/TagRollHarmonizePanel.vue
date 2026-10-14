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
import { createCoachStackHear } from '../../application/arranging/CoachStackHear'
import {
  planTagRollPassingStacks,
  proposalToCandidate,
  type TagRollPassingApply,
} from '../../application/arranging/CoachResolvePassing'
import { getArrangingServices } from '../../composition/arranging'
import { DEFAULT_CONTEST_PROFILE } from '../../domain/arranging/contestProfile'
import { useTagRollAudio } from '../../composables/useTagRollAudio'
import InfoTips from '../InfoTips.vue'
import HarmonyHowToSections from './HarmonyHowToSections.vue'
import {
  BARBERSHOP_CHORDS,
  leadRoleInChord,
  orderVoicingsClosedHighRing,
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
import {
  voicingDisplayLabel,
  voicingRoleStack,
  voicingRoleStackTitle,
} from '../../lib/tagRoll/harmonizer/inversionLabel'
import { HARMONIZE_HOWTO } from '../../lib/tagRoll/harmonyHowTo'
import { useChordPickLabelMode } from '../../composables/useChordPickLabelMode'
import {
  loadHarmonizeApplyMode,
  saveHarmonizeApplyMode,
  loadHarmonizeWorkspace,
  saveHarmonizeWorkspace,
  loadHarmonizeMelodyFilter,
  saveHarmonizeMelodyFilter,
  type HarmonizeApplyMode,
  type HarmonizeWorkspace,
} from '../../lib/tagRoll/harmonizePrefs'
import {
  ensureHarmonizeCoachSession,
  melodyEventFromTagNote,
} from '../../composables/useHarmonizeCoachSession'
import {
  harmonizeSuggestAnchorTick,
  listHarmonizeSuggestMoments,
  resolveHarmonizeSuggestMoment,
  stepHarmonizeSuggestMoment,
  suggestApplyWindow,
  suggestTargetFromMoment,
} from '../../lib/arranging/harmonizeSuggestTarget'
import type { HarmonicMoment } from '../../domain/arranging/harmonicMoments'
import { TAG_ROLL_PPQ } from '../../lib/tagRoll/types'
import type { HarmonyPreviewDraft } from '../../lib/tagRoll/harmonyPreviewDraft'
import { previewDraftDirty } from '../../lib/tagRoll/harmonyPreviewDraft'
import {
  authoritativeSketch,
  isBlankSketchQuality,
  natureToSketchQuality,
  qualityChipLabel,
  resolveSketchApplyTarget,
  stepAuthoritativeSketchSpan,
  type SketchApplyTarget,
} from '../../lib/tagRoll/harmonySketch'
import { measureTicks } from '../../lib/tagRoll/tempoMap'
import { resolveSketchHearMidis } from '../../lib/tagRoll/hearSketchSpan'
import { notesAtTick } from '../../lib/tagRoll/notesAtTick'
import { recoverHarmonizeSelection } from '../../lib/tagRoll/recoverHarmonizeSelection'
import { tagRollTip, tipByShortcutId } from '../../lib/tagRoll/shortcuts'
import {
  coachOpenSeedFromSelection,
  matchSuggestCandidate,
} from '../../lib/tagRoll/harmonizeSuggest'
import type { HarmonySketchQuality, TagRollNote } from '../../lib/tagRoll/types'
import type { HarmonizeCandidate } from '../../domain/arranging/harmonize'
import type { ChordAnalysisSegment } from '../../domain/arranging/chordAnalysisBar'
import { clearCoachHighlight, setCoachHighlight } from '../../lib/arranging/coachHighlight'
import type { CoachOpenChooseSeed } from '../../lib/arranging/coachUiIntent'
import { useArrangementStore } from '../../stores/arrangement'
import { midiFitsPartBands } from '../../domain/arranging/voicingProfile'
import { usePreferencesStore } from '../../stores/preferences'
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
  /** When false, hide Open in Coach (arranging feature flag). */
  arrangingEnabled?: boolean
  /** Detected holes — soft home-root fallback for Suggest. */
  detectSegments?: readonly ChordAnalysisSegment[]
  /** Timeline inspect / chord cursor — Suggest anchors at its start when set. */
  inspectRange?: { startTick: number; endTick: number } | null
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
  /** Switch to Coach Choose for the same melody tick / chord. */
  openInCoach: [seed: CoachOpenChooseSeed]
  /** Sync inspect / chord cursor to a Sketch span (Tab walk). */
  focusRange: [startTick: number, endTick: number]
}>()

const showPopOut = computed(() => props.allowPopOut !== false)
/** Coach handoff only from the main window (pop-out Harmonize has no Coach dock). */
const showOpenInCoach = computed(
  () => props.arrangingEnabled !== false && props.allowPopOut !== false,
)

const store = useTagRollStore()
const prefs = usePreferencesStore()
const arrStore = useArrangementStore()
const rootOffset = ref(0)
const chordId = ref<string | null>(null)
const voicing = ref<string | null>(null)
const spread = ref(false)
const applyMode = ref<HarmonizeApplyMode>(loadHarmonizeApplyMode('stack'))
const workspace = ref<HarmonizeWorkspace>(loadHarmonizeWorkspace('suggest'))
/** Prefer / lock to chords that contain the current melody note (default on). */
const melodyFilter = ref(loadHarmonizeMelodyFilter(true))
const { chordLabelMode, setChordLabelMode } = useChordPickLabelMode()
const suggestBusy = ref(false)
/** Active Suggest harmonic moment (sounding lead under the timeline anchor). */
const suggestMoment = ref<HarmonicMoment | null>(null)
/** Measure / inspect start used for ranking + Apply (not Lead note onset). */
const suggestAnchorTick = ref(0)
const sketchMatchLabel = ref<string | null>(null)
/** When neither Sketch nor a valid TTBB stack is under the cursor. */
const noValidChordMessage = ref<string | null>(null)
/** Baseline sketch under the current melody note (Reset target). */
const baseline = ref<{ rootPc: number; quality: HarmonySketchQuality } | null>(null)
const holding = ref(false)
/** Suppress preview emit while syncing UI from an existing sketch span. */
const syncingFromSketch = ref(false)
/** Suggest hold uses Coach AudioPreview (not pitch-tone stab). */
const holdingCoachStack = ref(false)
/** When set, Stack Apply writes TTBB only (no Sketch mutate) for a passing NCT. */
const passingFocusNoteId = ref<string | null>(null)
/** Melody ids already stack-resolved this session (Sketch membership still fails). */
const passingResolvedIds = ref<Set<string>>(new Set())

const shared = useTagRollAudio()
let localPlayer: PitchTonePlayer | null = null
let stabTimer: ReturnType<typeof setTimeout> | null = null
/** Bumped on each hold-start and hold-stop so async noteOn can detect release. */
let holdSession = 0
/** Bumped to cancel an in-flight Play alternates sequence. */
let alternateSession = 0
const playingAlternates = ref(false)
let coachPreview = getArrangingServices().createAudioPreview()
const stackHear = createCoachStackHear({
  getPreview: () => coachPreview,
  isTransportPlaying: () => !!shared?.isTransportPlaying?.(),
})

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

/** Next locked Sketch root after the current apply window / melody — V7/V labels. */
const resolvesToRoot = computed((): number | null => {
  const p = project.value
  if (!p) return null
  const target = resolveApplyTarget()
  const afterTick =
    target?.endTick ??
    (melodyNote.value ? melodyNote.value.startTick + melodyNote.value.durationTicks : null)
  if (afterTick == null) return null
  const next = authoritativeSketch(p.harmonySketch ?? []).find(
    (s) => s.startTick >= afterTick,
  )
  return next?.rootPc ?? null
})

const chordPickLists = computed(() =>
  buildHarmonizeChordOptions({
    tonality: project.value?.tonality ?? 0,
    mode: project.value?.tonalityMode ?? 'major',
    preferFlats: preferFlats.value,
    leadMidi: melodyNote.value?.midi ?? null,
    // Melody filter on → only chords containing the lead (diatonic primary, chromatic More).
    // Filter off / no melody → full catalog browse (SAI-11 primary).
    chordOnly: !melodyFilter.value || melodyNote.value == null,
    resolvesToRoot: resolvesToRoot.value,
  }),
)

function setMelodyFilter(on: boolean): void {
  melodyFilter.value = on
  saveHarmonizeMelodyFilter(on)
}

const primaryChordOptions = computed(() => chordPickLists.value.primary)
const moreChordOptions = computed(() => chordPickLists.value.more)

const suggestCandidates = computed(() => {
  const list = arrStore.candidates
  if (!prefs.tagRollVoicingRangeFilter) return list
  const profile = prefs.tagRollPathOptimizePrefs.voicingProfile
  if (!profile) return list
  return list.filter((c) => c.midi && midiFitsPartBands(c.midi, profile))
})

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

/** Coach ranks when Suggest is open; Pick is a plain catalog (no implied highlights). */
const chordRankHints = computed((): ChordRankHint[] | null => {
  if (workspace.value !== 'suggest') return null
  const hints = coachRankHints.value
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

const useRangeFilter = computed({
  get: () => prefs.tagRollVoicingRangeFilter,
  set: (on: boolean) => prefs.setTagRollVoicingRangeFilter(on),
})

const availableVoicings = computed(() => {
  const chord = selectedChord.value
  const role = leadRole.value
  const mel = melodyNote.value
  if (!chord || role == null || !mel) return []
  const list = VOICINGS_BY_CHORD[chord.id] ?? []
  let out = list.filter((v) => voicingFitsLead(v, role))
  const clefFamily = project.value?.clefFamily ?? 'ttbb'
  const melodyStaff = melodyPart.value?.midiGroup ?? 'upper'
  if (useRangeFilter.value) {
    const profile = prefs.tagRollPathOptimizePrefs.voicingProfile
    if (profile) {
      out = out.filter((v) => {
        const pitches = placeVoicingConcert({
          chord,
          rootPc: rootPc.value,
          leadMidi: mel.midi,
          voicing: v,
          spread: spread.value,
          clefFamily,
          melodyStaff,
        })
        return pitches != null && midiFitsPartBands(pitches, profile)
      })
    }
  }
  // Prefer closed / high-ring shells in the inversion strip and as the default.
  return orderVoicingsClosedHighRing({
    chord,
    rootPc: rootPc.value,
    leadMidi: mel.midi,
    voicings: out,
    spread: spread.value,
    clefFamily,
    melodyStaff,
  })
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
  if (holdingCoachStack.value) {
    holdingCoachStack.value = false
    stackHear.holdStop()
  }
  if (shared?.isTransportPlaying?.()) return
  if (shared) shared.allNotesOff(true)
  else localPlayer?.allNotesOff(true)
}

function pulseSuggestHighlight(tick: number): void {
  setCoachHighlight({
    tick,
    kind: 'moment',
    projectId: project.value?.id,
  })
}

async function soundPitches(pitches: VoicingPitches, hold = false): Promise<void> {
  if (shared?.isTransportPlaying?.()) return
  const session = holdSession
  if (stabTimer) {
    clearTimeout(stabTimer)
    stabTimer = null
  }
  if (holdingCoachStack.value) {
    holdingCoachStack.value = false
    stackHear.holdStop()
  }
  if (!hold) holding.value = false
  if (shared) shared.allNotesOff(true)
  else localPlayer?.allNotesOff(true)

  const p = ensurePlayer()
  const notes = [pitches.bass, pitches.bari, pitches.lead, pitches.tenor].map((m) =>
    midiToNote(m),
  )
  await Promise.all(notes.map((n) => p.noteOn(n)))
  // Pointer may have released while noteOn was awaiting — don't stick the hold.
  if (hold && session !== holdSession) {
    if (shared?.isTransportPlaying?.()) return
    if (shared) shared.allNotesOff(true)
    else p.allNotesOff(true)
    holding.value = false
    return
  }
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
  const chord = selectedChord.value
  const target = resolveApplyTarget()
  if (!chord || !target) {
    clearPreview()
    return
  }
  const mel = melodyNote.value
  const quality = natureToSketchQuality(chord.id)
  // Prefer real Sketch span id so the lane can chrome the cell (incl. blank → filled).
  emit('update:preview', {
    id: target.spanId ?? `harm:${mel?.id ?? 'span'}:${target.startTick}`,
    startTick: target.startTick,
    endTick: target.endTick,
    rootPc: rootPc.value,
    quality,
    baseline: baseline.value,
    source: 'harmonize',
  })

  if (applyMode.value === 'stack' && voicing.value && mel) {
    const pitches = placeVoicingConcert({
      chord,
      rootPc: rootPc.value,
      leadMidi: mel.midi,
      voicing: voicing.value,
      spread: spread.value,
      clefFamily: project.value?.clefFamily ?? 'ttbb',
      melodyStaff: melodyPart.value?.midiGroup ?? 'upper',
    })
    if (pitches) {
      emit(
        'previewGhost',
        ghostsFromPlaced(pitches, {
          ...mel,
          startTick: target.startTick,
          durationTicks: target.durationTicks,
        }),
      )
      if (workspace.value === 'suggest') pulseSuggestHighlight(target.startTick)
    } else emit('clearGhost')
  } else {
    emit('clearGhost')
    if (workspace.value === 'suggest') pulseSuggestHighlight(target.startTick)
  }
}

function resolveApplyTarget(): SketchApplyTarget | null {
  const p = project.value
  if (!p) return null
  const moment =
    workspace.value === 'suggest' && suggestMoment.value != null
      ? suggestApplyWindow(suggestMoment.value, suggestAnchorTick.value)
      : null
  return resolveSketchApplyTarget({
    playheadTick: p.view.playheadTick,
    measureTicks: measureTicks(p.timeSignature, p.ppq || TAG_ROLL_PPQ),
    selectedSpans: store.selectedSketchSpans.map((s) => ({
      id: s.id,
      startTick: s.startTick,
      endTick: s.endTick,
    })),
    inspectRange: props.inspectRange,
    momentWindow: moment,
    melodyNote: melodyNote.value,
  })
}

/** Sketch selection or L/R inspect → Sketch write; otherwise Stack (melody/moment). */
const preferSketchApplyMode = computed(() => {
  if (store.selectedSketchSpanIds.length > 0) return true
  const r = props.inspectRange
  return !!(r && r.endTick > r.startTick)
})

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
  if (!selectedChord.value || !resolveApplyTarget()) return false
  if (applyMode.value === 'sketch') return true
  // Stack needs a melody note + inversion; without melody, Apply writes Sketch only.
  if (!melodyNote.value) return true
  return !!voicing.value
})

const canPlayAlternates = computed(
  () => !!melodyNote.value && !!selectedChord.value && availableVoicings.value.length > 0,
)

function matchingSuggestCandidate(opts?: { exact?: boolean }): HarmonizeCandidate | null {
  const id = chordId.value
  if (id == null) return null
  if (applyMode.value === 'sketch') {
    return matchSuggestCandidate(suggestCandidates.value, {
      rootPc: rootPc.value,
      natureId: id,
    })
  }
  return matchSuggestCandidate(
    suggestCandidates.value,
    {
      rootPc: rootPc.value,
      natureId: id,
      voicing: voicing.value,
      spread: spread.value,
    },
    opts?.exact ? { exact: true } : undefined,
  )
}

const canOpenInCoach = computed(
  () => showOpenInCoach.value && !!melodyNote.value && !!chordId.value,
)

/** Lead under Sketch that is not a chord tone — proposed stack fixes (Sketch stays). */
const passingOps = computed((): TagRollPassingApply[] => {
  if (!props.open) return []
  const p = project.value
  if (!p) return []
  const sketch = authoritativeSketch(p.harmonySketch ?? [])
  if (!sketch.length || !melodyNotesSorted.value.length) return []
  const resolved = passingResolvedIds.value
  return planTagRollPassingStacks({
    sketch,
    melody: melodyNotesSorted.value.map((n) => ({
      id: n.id,
      midi: n.midi,
      startTick: n.startTick,
      durationTicks: n.durationTicks,
      role: n.role === 'pmn' || n.role === 'smn' || n.role === 'unknown' ? n.role : null,
    })),
    tonality: p.tonality ?? 0,
    mode: p.tonalityMode ?? 'major',
    profile: arrStore.current?.contestProfile ?? DEFAULT_CONTEST_PROFILE,
  }).filter((op) => !resolved.has(op.melodyNoteId))
})

watch(
  () => {
    const p = project.value
    if (!p) return ''
    return authoritativeSketch(p.harmonySketch ?? [])
      .map((s) => `${s.id}:${s.startTick}:${s.endTick}:${s.rootPc}:${s.quality}`)
      .join('|')
  },
  () => {
    passingResolvedIds.value = new Set()
    passingFocusNoteId.value = null
  },
)

function passingChordLabel(op: TagRollPassingApply): string {
  const chip = qualityChipLabel(natureToSketchQuality(op.natureId))
  const suf = chip === 'maj' ? '' : chip
  return `${pcName(op.rootPc, preferFlats.value)}${suf}`
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

function selectPassingOp(op: TagRollPassingApply): void {
  setApplyMode('stack')
  passingFocusNoteId.value = op.melodyNoteId
  store.selectNote(op.melodyNoteId)
  store.setPlayheadTick(op.mismatch.startTick)
  applyCandidateToLocalUi(proposalToCandidate(op.mismatch.proposal))
  briefHearSelection()
}

function applyPassingStacks(ops: readonly TagRollPassingApply[]): void {
  if (!ops.length) return
  stopHoldHear()
  const applied = store.applyPassingSketchAndStacks(
    ops.map((op) => ({
      melodyNoteId: op.melodyNoteId,
      pitches: op.pitches,
      rootPc: op.rootPc,
      natureId: op.natureId,
      startTick: op.mismatch.startTick,
      endTick: op.mismatch.endTick,
    })),
  )
  if (!applied) return
  // Sketch carve makes Lead fit the new span; session resolved set is a backup.
  const next = new Set(passingResolvedIds.value)
  for (const op of ops) next.add(op.melodyNoteId)
  passingResolvedIds.value = next
  passingFocusNoteId.value = null
  clearPreview()
  emit('declared')
}

function applyAllPassingStacks(): void {
  applyPassingStacks(passingOps.value)
}

/** Carve Sketch + realize stack for the focused NCT row (or current UI pitches). */
function commitPassingStackOnly(): boolean {
  const id = passingFocusNoteId.value
  const op = id ? passingOps.value.find((o) => o.melodyNoteId === id) : null
  if (op) {
    applyPassingStacks([op])
    return true
  }
  const mel = melodyNote.value
  const chord = selectedChord.value
  const v = voicing.value
  if (!mel || !chord || !v) {
    passingFocusNoteId.value = null
    return false
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
  if (!pitches) {
    passingFocusNoteId.value = null
    return false
  }
  store.applyPassingSketchAndStacks([
    {
      melodyNoteId: mel.id,
      pitches,
      rootPc: rootPc.value,
      natureId: chord.id,
      startTick: mel.startTick,
      endTick: mel.startTick + Math.max(1, mel.durationTicks),
    },
  ])
  const next = new Set(passingResolvedIds.value)
  next.add(mel.id)
  passingResolvedIds.value = next
  passingFocusNoteId.value = null
  clearPreview()
  emit('declared')
  return true
}

function onClose(): void {
  stopHoldHear()
  clearCoachHighlight()
  clearPreview()
  passingFocusNoteId.value = null
  emit('close')
}

function openInCoach(): void {
  const mel = melodyNote.value
  if (!mel || !canOpenInCoach.value) return
  stopStab()
  clearPreview()
  store.selectNote(mel.id)
  const tick = currentEditTick()
  // Keep playhead on the measure/column being edited (not Lead onset).
  store.setPlayheadTick(tick)
  const match = matchingSuggestCandidate()
  emit(
    'openInCoach',
    coachOpenSeedFromSelection({
      tick,
      match,
      rootPc: rootPc.value,
      natureId: chordId.value,
      voicing: voicing.value,
    }),
  )
}

function currentEditTick(): number {
  const p = project.value
  if (!p) return 0
  const inspect = props.inspectRange
  if (inspect && inspect.endTick > inspect.startTick) {
    return Math.max(0, Math.round(inspect.startTick))
  }
  // Note click / ←→ define the edit chord. Playhead alone must not move it.
  const sel = store.selectedNote
  if (sel) return sel.startTick
  if (suggestMoment.value) return suggestAnchorTick.value
  return harmonizeSuggestAnchorTick({
    playheadTick: p.view.playheadTick,
    timeSignature: p.timeSignature,
    ppq: p.ppq || TAG_ROLL_PPQ,
    inspectRange: null,
  })
}

function setApplyMode(mode: HarmonizeApplyMode): void {
  if (applyMode.value === mode) {
    if (mode === 'sketch') voicing.value = null
    publishPreview()
    return
  }
  applyMode.value = mode
  saveHarmonizeApplyMode(mode)
  if (mode === 'sketch') voicing.value = null
  publishPreview()
}

watch(
  preferSketchApplyMode,
  (wantSketch) => {
    setApplyMode(wantSketch ? 'sketch' : 'stack')
  },
  { immediate: true },
)

async function setWorkspace(mode: HarmonizeWorkspace): Promise<void> {
  workspace.value = mode
  saveHarmonizeWorkspace(mode)
  if (mode !== 'suggest') clearCoachHighlight()
  if (mode === 'suggest') await refreshSuggest()
  else publishPreview()
}

async function refreshSuggest(): Promise<void> {
  const mel = melodyNote.value
  const tag = project.value
  if (!mel || !tag) {
    suggestMoment.value = null
    suggestAnchorTick.value = 0
    arrStore.setCandidateTarget(null)
    return
  }
  suggestBusy.value = true
  try {
    const ok = await ensureHarmonizeCoachSession()
    if (!ok) return
    const sketch = tag.harmonySketch ?? []
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
    const tick = currentEditTick()
    suggestAnchorTick.value = tick
    const melody = arrStore.current?.melody ?? []
    const moment =
      resolveHarmonizeSuggestMoment({ tag, melody, tick }) ??
      resolveHarmonizeSuggestMoment({
        tag,
        melody: melody.length ? melody : [melodyEventFromTagNote(mel)],
        tick,
      })
    suggestMoment.value = moment
    const target = moment
      ? suggestTargetFromMoment(moment, tick)
      : {
          ...melodyEventFromTagNote(mel),
          startTick: tick,
          durationTicks: Math.max(1, mel.startTick + mel.durationTicks - tick),
        }
    arrStore.setCandidateTarget(target)
    const top = arrStore.candidates[0]
    if (top) applyCandidateToLocalUi(top)
  } finally {
    suggestBusy.value = false
  }
}

function applySelectedSuggest(): void {
  // Chord Walk Apply (F) — same write path as the Apply button.
  commitHarmony()
}

/** Best closed/high-ring catalog shell for the current chord + melody (Sketch or Stack). */
function bestClosedVoicing(): string | null {
  return availableVoicings.value[0] ?? voicing.value
}

function briefHearSelection(): void {
  const mel = melodyNote.value
  const chord = selectedChord.value
  if (!mel || !chord) return
  if (applyMode.value === 'stack') {
    const match = matchingSuggestCandidate({ exact: true })
    if (match) {
      void stackHear.hearCandidate(match)
      return
    }
  }
  const v = applyMode.value === 'stack' ? voicing.value : bestClosedVoicing()
  if (!v) {
    if (applyMode.value === 'sketch') void soundSketchStab(mel)
    return
  }
  const pitches = placeVoicingConcert({
    chord,
    rootPc: rootPc.value,
    leadMidi: mel.midi,
    voicing: v,
    spread: applyMode.value === 'stack' ? spread.value : false,
    clefFamily: project.value?.clefFamily ?? 'ttbb',
    melodyStaff: melodyPart.value?.midiGroup ?? 'upper',
  })
  if (pitches) void soundPitches(pitches)
  else if (applyMode.value === 'sketch') void soundSketchStab(mel)
}

function stepSuggest(dir: -1 | 1): void {
  const list = suggestCandidates.value
  if (!list.length) return
  const cur = matchingSuggestCandidate()
  let idx = cur ? list.indexOf(cur) : 0
  if (idx < 0) idx = 0
  const next = list[(idx + dir + list.length) % list.length]!
  applyCandidateToLocalUi(next)
  briefHearSelection()
}

function stepVoicing(dir: -1 | 1): void {
  if (applyMode.value === 'sketch') return
  const list = availableVoicings.value
  if (!list.length) return
  const cur = voicing.value
  let idx = cur ? list.indexOf(cur) : -1
  if (idx < 0) idx = dir > 0 ? -1 : 0
  const next = list[(idx + dir + list.length) % list.length]!
  selectVoicing(next)
  briefHearSelection()
}

function toggleSpread(): void {
  if (applyMode.value === 'sketch') return
  setSpread(!spread.value)
  briefHearSelection()
}

function hearSelectedSuggest(): void {
  const c = matchingSuggestCandidate({ exact: true }) ?? suggestCandidates.value[0]
  if (c) void stackHear.hearCandidate(c)
  else briefHearSelection()
}

function stepNextEmpty(): void {
  // Walk moments until one lacks a known stack (or wrap once).
  const tag = project.value
  const mel = melodyNote.value
  if (!tag || !mel) return
  const melody = arrStore.current?.melody ?? []
  const moments = listHarmonizeSuggestMoments({
    tag,
    melody: melody.length ? melody : [melodyEventFromTagNote(mel)],
  })
  if (!moments.length) return
  const start = currentEditTick()
  const startIdx = Math.max(
    0,
    moments.findIndex((m) => m.startTick >= start),
  )
  for (let k = 1; k <= moments.length; k++) {
    const m = moments[(startIdx + k) % moments.length]!
    const has = arrStore.current?.stacks.some(
      (s) => s.startTick === m.startTick && s.natureId && s.natureId !== 'unknown',
    )
    if (!has) {
      if (m.leadNoteId) store.selectNote(m.leadNoteId)
      store.setPlayheadTick(m.startTick)
      chordId.value = null
      voicing.value = null
      void refreshSuggest()
      return
    }
  }
}

function selectChordOption(opt: HarmonizeChordOption): void {
  passingFocusNoteId.value = null
  // Allow empty-range / sketch-only charts: inspect or measure target is enough.
  const mel = melodyNote.value
  const target = resolveApplyTarget()
  if (!mel && !target) return
  if (mel && workspace.value === 'suggest') {
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
  // Empty hole (no prior Sketch) → dirty preview until Apply / Reset.
  if (!baseline.value) {
    const hit = (project.value?.harmonySketch ?? []).find(
      (s) =>
        s.locked &&
        target != null &&
        s.startTick < target.endTick &&
        target.startTick < s.endTick,
    )
    if (!hit) baseline.value = null
  }
  const chord = BARBERSHOP_CHORDS.find((c) => c.id === opt.chordId)
  if (!chord) return
  if (applyMode.value === 'sketch' || !mel) {
    // Sketch mode, or no melody under the range: preview/declare Sketch only.
    voicing.value = null
  } else {
    const role = leadRoleInChord(chord, opt.rootPc, mel.midi)
    const list = (VOICINGS_BY_CHORD[opt.chordId] ?? []).filter((v) =>
      role != null ? voicingFitsLead(v, role) : true,
    )
    const ordered = orderVoicingsClosedHighRing({
      chord,
      rootPc: opt.rootPc,
      leadMidi: mel.midi,
      voicings: list,
      spread: false,
      clefFamily: project.value?.clefFamily ?? 'ttbb',
      melodyStaff: melodyPart.value?.midiGroup ?? 'upper',
    })
    spread.value = false
    voicing.value = ordered[0] ?? null
  }
  noValidChordMessage.value = null
  publishPreview()
}

function selectVoicing(v: string): void {
  if (applyMode.value === 'sketch') return
  voicing.value = v
  publishPreview()
}

/** Harmonize voicing chips — MuseScore-style TTBB role stack (T / L / Br / Bs). */
const voicingChips = computed(() =>
  availableVoicings.value.map((v) => ({
    v,
    stack: voicingRoleStack(v),
    title: voicingRoleStackTitle(v),
    aria: voicingDisplayLabel(v),
  })),
)

function setSpread(on: boolean): void {
  spread.value = on
  publishPreview()
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
  stopHoldHear()
  passingFocusNoteId.value = null
  const mel = melodyNote.value
  const b = baseline.value
  if (!b) {
    // Empty-range preview — back out the uncommitted insert.
    chordId.value = null
    voicing.value = null
    clearPreview()
    sketchMatchLabel.value = null
    noValidChordMessage.value = null
    return
  }
  if (!mel) {
    // Restore Sketch under the inspect range (no melody).
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

function commitHarmony(opts?: { skipAutoAdvance?: boolean }): void {
  // Always release hold audio first — Apply click often steals the pointerup
  // from a chord/voicing chip and left notes hanging.
  stopHoldHear()
  // Passing NCT focus: carve Sketch + realize stack (home remnants kept).
  if (passingFocusNoteId.value && applyMode.value === 'stack') {
    if (commitPassingStackOnly()) return
  }
  // Suggest ranks only the catalog. Apply always writes the panel's selected
  // chord / voicing / spread via placeVoicingConcert — never a different Coach MIDI.
  const chord = selectedChord.value
  const target = resolveApplyTarget()
  if (!chord || !target) {
    emit('clearGhost')
    return
  }
  const mel = melodyNote.value
  const window = {
    startTick: target.startTick,
    durationTicks: target.durationTicks,
  }

  if (applyMode.value === 'sketch') {
    if (mel) {
      store.commitHarmonizeAtMelody({
        melodyNoteId: mel.id,
        rootPc: rootPc.value,
        quality: chord.id,
        mode: 'chord',
        window,
        spanId: target.spanId,
      })
    } else {
      store.declareHarmonySpan({
        startTick: target.startTick,
        endTick: target.endTick,
        rootPc: rootPc.value,
        quality: chord.id,
        id: target.spanId,
        windowKind: 'freeSpan',
      })
    }
    baseline.value = {
      rootPc: rootPc.value,
      quality: natureToSketchQuality(chord.id),
    }
    sketchMatchLabel.value = `${pcName(rootPc.value, preferFlats.value)}${chord.notation || ''}`
    noValidChordMessage.value = null
    clearPreview()
    emit('declared')
    // No audition on Apply — hold-to-hear already covers preview; playing here
    // races stolen pointerups and leaves notes hanging.
    if (workspace.value === 'suggest') void refreshSuggest()
    return
  }

  if (!mel) {
    // Stack mode but no melody in range — declare Sketch for the inspect window.
    store.declareHarmonySpan({
      startTick: target.startTick,
      endTick: target.endTick,
      rootPc: rootPc.value,
      quality: chord.id,
      id: target.spanId,
      windowKind: 'freeSpan',
    })
    baseline.value = {
      rootPc: rootPc.value,
      quality: natureToSketchQuality(chord.id),
    }
    sketchMatchLabel.value = `${pcName(rootPc.value, preferFlats.value)}${chord.notation || ''}`
    noValidChordMessage.value = null
    clearPreview()
    emit('declared')
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
    window,
    spanId: target.spanId,
  })
  baseline.value = {
    rootPc: rootPc.value,
    quality: natureToSketchQuality(chord.id),
  }
  sketchMatchLabel.value = `${pcName(rootPc.value, preferFlats.value)}${chord.notation || ''}`
  noValidChordMessage.value = null
  clearPreview()
  emit('declared')
  // No audition on Apply (see sketch path above).
  if (workspace.value === 'suggest') {
    void refreshSuggest()
    // Tab Sketch walk advances spans itself — skip moment auto-advance.
    if (!opts?.skipAutoAdvance && prefs.tagRollChordWalkAutoAdvance) step(1)
  }
}

async function holdHearChord(opt?: HarmonizeChordOption): Promise<void> {
  // Arm synchronously so a fast pointerup can't race past holding===false.
  alternateSession += 1
  playingAlternates.value = false
  holdSession += 1
  const session = holdSession
  holding.value = true
  if (opt) selectChordOption(opt)
  const mel = melodyNote.value
  if (!mel) {
    stopHoldHear()
    return
  }

  const chord = selectedChord.value
  if (!chord) {
    stopHoldHear()
    return
  }
  // Sketch and Stack: concert closed/high-ring (avoids muddy bass under sung lead).
  const v =
    applyMode.value === 'stack' ? voicing.value : bestClosedVoicing()
  if (v) {
    const hear = placeVoicingConcert({
      chord,
      rootPc: rootPc.value,
      leadMidi: mel.midi,
      voicing: v,
      spread: applyMode.value === 'stack' ? spread.value : false,
      clefFamily: project.value?.clefFamily ?? 'ttbb',
      melodyStaff: melodyPart.value?.midiGroup ?? 'upper',
    })
    if (hear) {
      await soundPitches(hear, true)
      if (session !== holdSession) return
      return
    }
  }
  await soundSketchStab(mel, true)
  if (session !== holdSession) return
}

function stopHoldHear(): void {
  alternateSession += 1
  playingAlternates.value = false
  holdSession += 1
  if (holdingCoachStack.value) {
    stackHear.holdStop()
    holdingCoachStack.value = false
  }
  holding.value = false
  stopStab()
}

/** Cycle closed then spread inversions for the selected chord (preview only). */
async function playAlternates(): Promise<void> {
  stopHoldHear()
  const mel = melodyNote.value
  const chord = selectedChord.value
  if (!mel || !chord) return
  const role = leadRole.value
  if (role == null) return

  const fitting = (VOICINGS_BY_CHORD[chord.id] ?? []).filter((v) =>
    voicingFitsLead(v, role),
  )
  if (!fitting.length) return

  const clefFamily = project.value?.clefFamily ?? 'ttbb'
  const melodyStaff = melodyPart.value?.midiGroup ?? 'upper'
  const closed = orderVoicingsClosedHighRing({
    chord,
    rootPc: rootPc.value,
    leadMidi: mel.midi,
    voicings: fitting,
    spread: false,
    clefFamily,
    melodyStaff,
  }).slice(0, 4)
  const open = orderVoicingsClosedHighRing({
    chord,
    rootPc: rootPc.value,
    leadMidi: mel.midi,
    voicings: fitting,
    spread: true,
    clefFamily,
    melodyStaff,
  }).slice(0, 2)

  const queue: Array<{ voicing: string; spread: boolean }> = [
    ...closed.map((v) => ({ voicing: v, spread: false })),
    ...open.map((v) => ({ voicing: v, spread: true })),
  ]
  if (!queue.length) return

  alternateSession += 1
  const session = alternateSession
  playingAlternates.value = true
  try {
    for (const item of queue) {
      if (session !== alternateSession) return
      const pitches = placeVoicingConcert({
        chord,
        rootPc: rootPc.value,
        leadMidi: mel.midi,
        voicing: item.voicing,
        spread: item.spread,
        clefFamily,
        melodyStaff,
      })
      if (!pitches) continue
      // Reflect the shell being auditioned in Stack mode.
      if (applyMode.value === 'stack') {
        voicing.value = item.voicing
        spread.value = item.spread
        publishPreview()
      }
      await soundPitches(pitches, false)
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 520)
      })
    }
  } finally {
    if (session === alternateSession) playingAlternates.value = false
  }
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
  const session = holdSession
  if (stabTimer) {
    clearTimeout(stabTimer)
    stabTimer = null
  }
  if (holdingCoachStack.value) {
    holdingCoachStack.value = false
    stackHear.holdStop()
  }
  if (!hold) holding.value = false
  if (shared) shared.allNotesOff(true)
  else localPlayer?.allNotesOff(true)

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
  if (hold && session !== holdSession) {
    if (shared?.isTransportPlaying?.()) return
    if (shared) shared.allNotesOff(true)
    else p.allNotesOff(true)
    holding.value = false
    return
  }
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
function sketchQualityToChordId(quality: string): string | null {
  if (isBlankSketchQuality(quality)) return null
  if (BARBERSHOP_CHORDS.some((c) => c.id === quality)) return quality
  if (quality === 'dim') return 'dim'
  if (quality === 'ninth') return 'ninth'
  return 'major'
}

/** Locked Sketch under the apply target — blank placeholders count as empty. */
function sketchHitForTarget(
  target: SketchApplyTarget | null,
): { id: string; rootPc: number; quality: string; blank: boolean } | null {
  if (!target) return null
  const p = project.value
  if (!p) return null
  const hit =
    (target.spanId
      ? (p.harmonySketch ?? []).find((s) => s.id === target.spanId)
      : null) ??
    (p.harmonySketch ?? []).find(
      (s) =>
        s.locked && s.startTick < target.endTick && target.startTick < s.endTick,
    )
  if (!hit?.locked) return null
  return {
    id: hit.id,
    rootPc: hit.rootPc,
    quality: hit.quality,
    blank: isBlankSketchQuality(hit.quality),
  }
}

function armEmptyRangePick(target: SketchApplyTarget | null): void {
  sketchMatchLabel.value = null
  baseline.value = null
  if (!chordId.value) {
    noValidChordMessage.value = target
      ? 'Empty range — pick a chord below, then Apply.'
      : 'Select a range or melody note, then pick a chord.'
    clearPreview()
  }
}

function preselectFromSketch(): void {
  const mel = melodyNote.value
  const p = project.value
  const target = resolveApplyTarget()
  if (!p) {
    sketchMatchLabel.value = null
    noValidChordMessage.value = null
    baseline.value = null
    clearPreview()
    return
  }
  const hit = sketchHitForTarget(target)
  // Blank / missing Sketch under inspect or selection → wait for a chord pick.
  if (hit?.blank || (!mel && !hit)) {
    armEmptyRangePick(target)
    return
  }
  // Empty inspect/measure range with no melody: recover from a sounding Sketch span.
  if (!mel) {
    if (hit) {
      const natureId = sketchQualityToChordId(hit.quality)
      if (!natureId) {
        armEmptyRangePick(target)
        return
      }
      const tonality = p.tonality ?? 0
      baseline.value = {
        rootPc: hit.rootPc,
        quality: natureToSketchQuality(hit.quality),
      }
      syncingFromSketch.value = true
      rootOffset.value = (((hit.rootPc - tonality) % 12) + 12) % 12
      chordId.value = natureId
      voicing.value = null
      sketchMatchLabel.value = `${pcName(hit.rootPc, preferFlats.value)}${BARBERSHOP_CHORDS.find((c) => c.id === chordId.value)?.notation || ''}`
      noValidChordMessage.value = null
      void nextTick(() => {
        syncingFromSketch.value = false
        publishPreview()
      })
      return
    }
    armEmptyRangePick(target)
    return
  }
  const tick =
    workspace.value === 'suggest' ? currentEditTick() : mel.startTick
  const melodyStaff = melodyPart.value?.midiGroup ?? 'upper'
  const recovered = recoverHarmonizeSelection({
    notes: p.notes,
    parts: p.parts,
    sketch: p.harmonySketch ?? [],
    tick,
    leadMidi: mel.midi,
    preferFlats: preferFlats.value,
    clefFamily: p.clefFamily ?? 'ttbb',
    melodyStaff,
    pcName,
  })
  if (!recovered) {
    sketchMatchLabel.value = null
    baseline.value = null
    // Don't wipe an in-progress empty-range pick when the melody moves.
    if (!chordId.value) {
      chordId.value = null
      voicing.value = null
      noValidChordMessage.value =
        'No valid chord at this note — pick a chord below (or lock a Sketch span first).'
      clearPreview()
    }
    return
  }
  const tonality = p.tonality ?? 0
  const offset = (((recovered.rootPc - tonality) % 12) + 12) % 12
  baseline.value = { rootPc: recovered.rootPc, quality: recovered.quality }
  syncingFromSketch.value = true
  rootOffset.value = offset
  chordId.value = recovered.natureId
  voicing.value =
    applyMode.value === 'stack' ? recovered.voicing : null
  spread.value = recovered.spread
  sketchMatchLabel.value = recovered.label
  noValidChordMessage.value = null
  void nextTick(() => {
    syncingFromSketch.value = false
    publishPreview()
  })
}

watch(
  () =>
    [
      store.selectedNoteId,
      store.selectedNote?.startTick ?? null,
      props.open ? (props.inspectRange?.startTick ?? null) : null,
      props.open ? (props.inspectRange?.endTick ?? null) : null,
      // Sketch selection (incl. blank placeholders) retargets Apply / preview.
      props.open ? store.selectedSketchSpanIds.join(',') : '',
    ] as const,
  async ([selId, selTick, inspectStart, inspectEnd, sketchIds], prev) => {
    if (!props.open) return
    const prevSelId = prev?.[0] ?? null
    const prevSelTick = prev?.[1] ?? null
    const prevInspectStart = prev?.[2] ?? null
    const prevInspectEnd = prev?.[3] ?? null
    const prevSketchIds = prev?.[4] ?? ''
    const posChanged = selId !== prevSelId || selTick !== prevSelTick
    const inspectChanged =
      inspectStart !== prevInspectStart || inspectEnd !== prevInspectEnd
    const sketchChanged = sketchIds !== prevSketchIds
    if (posChanged || inspectChanged || sketchChanged) {
      chordId.value = null
      voicing.value = null
      stopStab()
      clearPreview()
      preselectFromSketch()
      if (workspace.value === 'suggest') await refreshSuggest()
    }
  },
)

// Playhead / scrub must not retarget the edit chord — only stop a held hear.
watch(
  () =>
    props.open && workspace.value === 'suggest' ? (project.value?.view.playheadTick ?? null) : null,
  (tick, prev) => {
    if (tick !== prev && (holding.value || holdingCoachStack.value)) stopHoldHear()
  },
)

function step(dir: -1 | 1): void {
  // Suggest walks harmonic moments (stack onsets under held Lead), not Lead note starts.
  if (workspace.value === 'suggest') {
    const tag = project.value
    const mel = melodyNote.value
    if (!tag || !mel) return
    const melody = arrStore.current?.melody ?? []
    const moments = listHarmonizeSuggestMoments({
      tag,
      melody: melody.length ? melody : [melodyEventFromTagNote(mel)],
    })
    const next = stepHarmonizeSuggestMoment(moments, currentEditTick(), dir)
    if (!next) return
    if (next.leadNoteId) store.selectNote(next.leadNoteId)
    // Land on the moment onset, or keep measure grid if stepping within a hold.
    store.setPlayheadTick(next.startTick)
    chordId.value = null
    voicing.value = null
    emit('stepMelody', dir)
    return
  }

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

/**
 * Chord Walk Tab / Shift+Tab: move among locked Sketch spans.
 * Optionally pin the departure span (Apply+next remembers the chord just written).
 */
function stepSketchChord(
  dir: -1 | 1,
  from?: { spanId?: string | null; tick?: number },
): void {
  const p = project.value
  if (!p) return
  const tick = from?.tick ?? currentEditTick()
  const spanId =
    from?.spanId ??
    store.selectedSketchSpanIds[0] ??
    resolveApplyTarget()?.spanId ??
    null
  const next = stepAuthoritativeSketchSpan(
    p.harmonySketch ?? [],
    { spanId, tick },
    dir,
  )
  if (!next) return
  store.selectSketchSpans([next.id])
  store.setPlayheadTick(next.startTick)
  const mel =
    melodyNotesSorted.value.find(
      (n) => n.startTick < next.endTick && n.startTick + n.durationTicks > next.startTick,
    ) ?? melodyNotesSorted.value.find((n) => n.startTick >= next.startTick)
  if (mel) store.selectNote(mel.id)
  else store.selectNote(null)
  chordId.value = null
  voicing.value = null
  emit('focusRange', next.startTick, next.endTick)
  void nextTick(async () => {
    preselectFromSketch()
    if (workspace.value === 'suggest') await refreshSuggest()
  })
}

/** Tab: Apply current panel chord (when possible), then advance to the next Sketch span. */
function applyNextSketch(): void {
  const target = resolveApplyTarget()
  const fromId =
    store.selectedSketchSpanIds[0] ?? target?.spanId ?? null
  const fromTick = target?.startTick ?? currentEditTick()
  if (selectedChord.value && target) commitHarmony({ skipAutoAdvance: true })
  void nextTick(() => {
    stepSketchChord(1, { spanId: fromId, tick: fromTick })
  })
}

/** Shift+Tab: previous Sketch span (never applies). */
function prevSketch(): void {
  stepSketchChord(-1)
}

watch(
  () => props.open,
  async (on) => {
    if (!on) {
      clearPreview()
      clearCoachHighlight()
      suggestMoment.value = null
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
  if (!list.length) {
    voicing.value = null
    return
  }
  if (voicing.value && list.includes(voicing.value)) return
  // New chord / filter: default to the best closed high-ring shell.
  if (applyMode.value === 'stack') voicing.value = list[0] ?? null
})

onMounted(() => {
  if (props.open) preselectFromSketch()
})

onUnmounted(() => {
  stopStab()
  clearCoachHighlight()
  clearPreview()
  localPlayer?.dispose()
  localPlayer = null
})

defineExpose({
  step,
  stepSuggest,
  stepVoicing,
  toggleSpread,
  applySelectedSuggest,
  hearSelectedSuggest,
  stepNextEmpty,
  applyNextSketch,
  prevSketch,
  stepSketchChord,
})
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
          <HarmonyHowToSections :sections="HARMONIZE_HOWTO" />
        </InfoTips>
        <label
          class="hz-ranges"
          :title="
            tagRollTip(
              'When on, Coach ranks and Stack inversions stay inside the Ranges strip bands',
            )
          "
        >
          <input v-model="useRangeFilter" type="checkbox" />
          Use ranges
        </label>
        <label
          class="hz-ranges"
          :title="
            tagRollTip(
              melodyNote
                ? 'When on, list only chords that contain the current melody note'
                : 'When on, list only chords that contain the melody note (select a melody note first)',
            )
          "
        >
          <input
            type="checkbox"
            :checked="melodyFilter"
            @change="setMelodyFilter(($event.target as HTMLInputElement).checked)"
          />
          Melody chords
        </label>
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
        :class="{ dirty: draftDirty }"
        :title="
          tagRollTip(
            applyMode === 'sketch'
              ? 'Apply — declare into Sketch'
              : 'Apply — Sketch + TTBB with the selected inversion/spread',
          )
        "
        @pointerdown="stopHoldHear"
        @click="commitHarmony"
      >Apply</button>
      <button
        type="button"
        class="btn"
        :disabled="!canPlayAlternates"
        :class="{ on: playingAlternates }"
        :title="
          tagRollTip(
            'Play alternates — hear other closed/spread inversions for this chord',
          )
        "
        @pointerdown="stopHoldHear"
        @click="playAlternates"
      >{{ playingAlternates ? 'Playing…' : 'Play alternates' }}</button>
      <button
        v-if="showOpenInCoach"
        type="button"
        class="btn"
        :disabled="!canOpenInCoach"
        :title="
          tagRollTip(
            canOpenInCoach
              ? 'Open in Coach — Choose at this chord'
              : 'Open in Coach — select a chord first',
          )
        "
        @click="openInCoach"
      >Open in Coach</button>
    </div>

    <div class="hz-tabs" role="tablist" aria-label="Harmonize workspace">
      <button
        type="button"
        role="tab"
        class="tab"
        :class="{ on: workspace === 'pick' }"
        :aria-selected="workspace === 'pick'"
        title="Full catalog — no Coach ranking"
        @click="setWorkspace('pick')"
      >Catalog</button>
      <button
        type="button"
        role="tab"
        class="tab"
        :class="{ on: workspace === 'suggest' }"
        :aria-selected="workspace === 'suggest'"
        title="Same catalog with Coach ranking at the playhead moment"
        @click="setWorkspace('suggest')"
      >Coach</button>
    </div>

    <div class="panel-body">
      <div
        class="step-row"
        role="group"
        :aria-label="workspace === 'suggest' ? 'Step harmonic moments' : 'Step melody notes'"
      >
        <button type="button" class="btn sm" :title="tipByShortcutId('harm-prev')" @click="step(-1)">← Prev</button>
        <span class="step-meta">
          <template v-if="melodyNote">
            <template v-if="workspace === 'suggest' && suggestMoment">
              Moment · {{ melodyPart?.name ?? 'Melody' }} {{ midiToNote(melodyNote.midi) }}
              <span v-if="suggestMoment.heldLead"> · post</span>
            </template>
            <template v-else>
              {{ melodyIndex + 1 }}/{{ melodyNotesSorted.length }} ·
              {{ melodyPart?.name ?? 'Melody' }} {{ midiToNote(melodyNote.midi) }}
            </template>
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
        <p v-if="noValidChordMessage" class="warn" role="status">{{ noValidChordMessage }}</p>
        <p class="meta">
          <template v-if="workspace === 'suggest'">
            Coach-ranked chords
            <span v-if="suggestMoment?.heldLead" class="sec-note"> · post (held lead)</span>
            <span v-if="suggestBusy" class="sec-note"> · loading…</span>
            <span v-else-if="suggestCandidates.length" class="sec-note">
              · {{ coachRankHints.length }} highlighted
            </span>
            <span v-else class="sec-note"> · no ranks yet — full catalog still works</span>
          </template>
          <template v-else>
            Catalog (no ranking)
            <span v-if="selectedChord" class="root-chip">
              {{ pcName(rootPc, preferFlats) }}{{ selectedChord.notation || 'maj' }}
            </span>
            <span v-if="sketchMatchLabel" class="sketch-chip" title="Chord under this note">
              Current: {{ sketchMatchLabel }}
            </span>
          </template>
          <span
            v-if="workspace === 'suggest' && sketchMatchLabel"
            class="sketch-chip"
            title="Chord under this note"
          >
            Current: {{ sketchMatchLabel }}
          </span>
        </p>

        <section class="block" aria-label="Chords">
          <div class="sec-row">
            <h3 class="sec">
              Chords
              <span class="sec-note">
                {{
                  melodyFilter && melodyNote
                    ? `(contains ${midiToNote(melodyNote.midi)} · More = chromatic · hold to hear)`
                    : melodyFilter && !melodyNote
                      ? '(melody filter needs a melody note)'
                      : applyMode === 'sketch'
                        ? '(declare any · hold to hear)'
                        : '(full catalog · hold to hear)'
                }}
              </span>
            </h3>
            <div class="seg" role="group" aria-label="Chord label view">
              <button
                type="button"
                class="seg-btn"
                :class="{ on: chordLabelMode === 'name' }"
                :aria-pressed="chordLabelMode === 'name'"
                title="Letter names (G7)"
                @click="setChordLabelMode('name')"
              >
                Chord
              </button>
              <button
                type="button"
                class="seg-btn"
                :class="{ on: chordLabelMode === 'roman' }"
                :aria-pressed="chordLabelMode === 'roman'"
                title="Roman numerals (V7)"
                @click="setChordLabelMode('roman')"
              >
                Number
              </button>
            </div>
          </div>
          <TagRollChordPickList
            :primary="primaryChordOptions"
            :more="moreChordOptions"
            :selected-key="selectedOptionKey"
            :label-mode="chordLabelMode"
            :lead-label="melodyNote ? midiToNote(melodyNote.midi) : null"
            :rank-hints="chordRankHints"
            :tonality="project?.tonality ?? 0"
            interaction="hold"
            :section-by-lead="false"
            :disable-non-melody="false"
            :more-toggle-label="
              melodyFilter && melodyNote
                ? (n, open) => (open ? 'Hide chromatic' : `Chromatic (${n})`)
                : undefined
            "
            :empty-primary-text="
              melodyFilter && melodyNote
                ? 'No chords contain this melody tone.'
                : melodyFilter && !melodyNote
                  ? 'Select a melody note to filter chords.'
                  : 'No matching chords'
            "
            @pick="selectChordOption"
            @hold-start="(o) => void holdHearChord(o)"
            @hold-stop="stopHoldHear"
          />
        </section>

        <section class="block" :class="{ dimmed: applyMode === 'sketch' }" aria-label="Voicing">
          <h3 class="sec">
            Inversion / spread
            <span v-if="applyMode === 'sketch'" class="sec-note">
              — switch to Stack to place TTBB
            </span>
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
          <div class="grid voicing-grid">
            <button
              v-for="chip in voicingChips"
              :key="chip.v"
              type="button"
              class="cell mono inv stack"
              :class="{ on: voicing === chip.v }"
              :disabled="applyMode === 'sketch'"
              :title="tagRollTip(`${chip.title} — hold to hear`)"
              :aria-label="chip.aria"
              @pointerdown="onVoicingPointerDown(chip.v, $event)"
              @pointerup="stopHoldHear"
              @pointercancel="stopHoldHear"
              @lostpointercapture="stopHoldHear"
              @pointerleave="stopHoldHear"
            >
              <template v-if="chip.stack">
                <span class="vr">{{ chip.stack.tenor }}</span>
                <span class="vr lead">{{ chip.stack.lead }}</span>
                <span class="vr">{{ chip.stack.bari }}</span>
                <span class="vr">{{ chip.stack.bass }}</span>
              </template>
              <template v-else>{{ chip.aria }}</template>
            </button>
          </div>
          <p v-if="chordId && applyMode === 'stack' && !availableVoicings.length" class="empty">
            {{
              useRangeFilter
                ? 'No inversions fit this melody within Ranges — widen bands or turn off Use ranges.'
                : 'No voicings for this melody role.'
            }}
          </p>
        </section>
      </template>

      <details
        v-if="passingOps.length"
        class="passing-details"
        aria-label="Lead notes that don’t fit Sketch"
      >
        <summary class="passing-summary">
          Melody mismatches
          <span class="sec-note">· {{ passingOps.length }}</span>
        </summary>
        <div class="passing-block">
          <div class="sec-row">
            <p class="passing-hint">
              Lead tones outside the Sketch chord — Apply carves short Sketch chords + stacks.
            </p>
            <button
              type="button"
              class="btn sm"
              title="Carve Sketch chords and realize TTBB for all proposed passing / color fixes"
              @pointerdown="stopHoldHear"
              @click="applyAllPassingStacks"
            >Apply all</button>
          </div>
          <ul class="passing-list">
            <li v-for="op in passingOps" :key="op.melodyNoteId + '-' + op.mismatch.startTick">
              <button
                type="button"
                class="passing-row"
                :class="{ on: passingFocusNoteId === op.melodyNoteId }"
                :title="
                  op.kind === 'sameRootColor'
                    ? 'Same-root color that contains the Lead'
                    : 'Passing / SCF chord that contains the Lead'
                "
                @click="selectPassingOp(op)"
              >
                <span class="passing-note">{{ midiToNote(op.pitches.lead) }}</span>
                <span class="passing-arrow">→</span>
                <span class="passing-chord">{{ passingChordLabel(op) }}</span>
                <span class="passing-kind">{{ op.kind === 'sameRootColor' ? 'color' : 'passing' }}</span>
              </button>
            </li>
          </ul>
        </div>
      </details>

      <p class="credit">
        Catalog = plain chord list · Coach = same list ranked for this moment · Sketch = map only ·
        Stack = map + TTBB · Open in Coach = full Choose dock.
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
  flex-wrap: wrap;
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
.hz-ranges {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.72rem;
  font-weight: 650;
  color: var(--muted);
  cursor: pointer;
  white-space: nowrap;
}
.hz-ranges:has(input:checked) {
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
.sec-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.35rem 0.55rem;
}
.passing-details {
  margin-top: 0.25rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: color-mix(in srgb, var(--surface) 88%, var(--bg));
}
.passing-summary {
  cursor: pointer;
  list-style: none;
  padding: 0.35rem 0.5rem;
  font-size: 0.78rem;
  font-weight: 650;
  color: var(--muted);
  user-select: none;
}
.passing-summary::-webkit-details-marker { display: none; }
.passing-summary::before {
  content: '▸ ';
  color: var(--muted);
}
.passing-details[open] > .passing-summary {
  color: var(--text);
  border-bottom: 1px solid var(--border);
}
.passing-details[open] > .passing-summary::before {
  content: '▾ ';
}
.passing-block {
  padding: 0.4rem 0.5rem 0.5rem;
  display: grid;
  gap: 0.35rem;
}
.passing-hint {
  margin: 0;
  flex: 1 1 auto;
  font-size: 0.72rem;
  color: var(--muted);
  line-height: 1.35;
}
.passing-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.2rem;
  max-height: 7.5rem;
  overflow: auto;
}
.passing-row {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  width: 100%;
  min-height: 1.75rem;
  padding: 0.2rem 0.4rem;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: 0.78rem;
  font-weight: 650;
  cursor: pointer;
  text-align: left;
}
.passing-row:hover {
  background: color-mix(in srgb, var(--surface) 70%, var(--bg));
}
.passing-row.on {
  border-color: color-mix(in srgb, var(--accent, #1d6a9f) 55%, var(--border));
  background: color-mix(in srgb, var(--accent, #1d6a9f) 14%, var(--surface));
}
.passing-note {
  min-width: 1.6rem;
  font-variant-numeric: tabular-nums;
}
.passing-arrow {
  color: var(--muted);
}
.passing-chord {
  flex: 1 1 auto;
}
.passing-kind {
  font-size: 0.68rem;
  font-weight: 600;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.03em;
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
.voicing-grid {
  gap: 0.28rem;
}
.cell.inv.stack {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.02rem;
  min-width: 1.85rem;
  min-height: 4.1rem;
  padding: 0.28rem 0.35rem;
  font-size: 0.78rem;
  font-weight: 650;
  line-height: 1.05;
  letter-spacing: 0;
}
.cell.inv.stack .vr {
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}
.cell.inv.stack .vr.lead {
  color: var(--text);
  font-weight: 800;
  font-size: 0.88rem;
}
.cell.inv.stack.on .vr {
  color: inherit;
  opacity: 0.8;
}
.cell.inv.stack.on .vr.lead {
  opacity: 1;
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
