/**
 * Logic for ArrangingCoachDock — session modes, focus tabs, harmonic moments.
 */
import { computed, onUnmounted, ref, watch, type Ref } from 'vue'
import { bindCoachRollNav } from '../../lib/arranging/bindCoachRollNav'
import { midiToNote } from '../../audio/pianoSamples'
import {
  migratePillarsToSketchIfEmpty,
  mergeCoachSessionFromExisting,
} from '../../application/arranging/mergeCoachSession'
import { detectCoachEntryMode } from '../../domain/arranging/coachEntryMode'
import { tipForCoachUi, type CoachUiMode } from '../../domain/arranging/coachTips'
import { cadenceHintForCoachMoment } from '../../domain/arranging/cadenceCoachTip'
import { pcName } from '../../domain/arranging/chords/chords'
import type { HarmonizeCandidate } from '../../domain/arranging/harmonize'
import { voicingDisplayLabel } from '../../lib/tagRoll/harmonizer/inversionLabel'
import {
  buildHarmonicMoments,
  momentToMelodyEvent,
  type HarmonicMoment,
} from '../../domain/arranging/harmonicMoments'
import {
  defaultFocusForMode,
  resolveCoachNextAction,
  type CoachFocusTab,
} from '../../domain/arranging/nextCoachAction'
import { melodyGapsOutsidePillars } from '../../domain/arranging/pillars'
import type { ArrangementLint } from '../../domain/arranging/qa'
import { canApplyFix } from '../../application/arranging/ApplyFix'
import { whyViewForCandidate } from '../../application/arranging/CandidateWhy'
import {
  altChipsForMoment,
  candFilterLabels,
  counterpartForMoment,
  filterCandidates,
  groupCandidatesByChord,
  layerHintForCandidate,
  pickCandidateForAltChip,
  type AltChipDto,
  type CandFilterId,
  type ChordCandidateGroup,
} from '../../application/arranging/CoachAlternates'
import { makeCoachInsightHear } from '../../application/arranging/coachInsightHear'
import { createCoachStackHear } from '../../application/arranging/CoachStackHear'
import {
  planFillEmptyWithBest,
} from '../../application/arranging/CoachFillEmpty'
import { groupIssues } from '../../application/arranging/IssueBoard'
import { explanationForLint } from '../../application/arranging/ExplainCoach'
import {
  mergeArrangementIntoTagRoll,
  tagStudioToArrangement,
} from '../../application/arranging/syncTagRoll'
import { replaceSketchFromPillars } from '../../lib/tagRoll/harmonySketch'
import { contextForSelectedMoment } from '../../application/arranging/CoachContext'
import {
  resolveSuggestHomeRoot,
  type SoftSuggestContext,
  type SuggestHomeRootSource,
} from '../../application/arranging/suggestHomeRoot'
import type { ChordAnalysisSegment } from '../../domain/arranging/chordAnalysisBar'
import {
  coachGhostsForVoicing,
  coachPreviewFromCandidate,
  coachSketchPreviewDraft,
} from '../../lib/arranging/coachChordPreview'
import { setCoachHighlight } from '../../lib/arranging/coachHighlight'
import type { HarmonyPreviewDraft } from '../../lib/tagRoll/harmonyPreviewDraft'
import {
  filterLintsInRange,
  formatLintMeasureBeatRow,
  lintRowParts,
  lintStartTick,
  type LintRowParts,
  type TickRange,
} from '../../lib/arranging/lintsInRange'
import { partOnsetsFromTagRoll } from '../../lib/arranging/partOnsetsFromTagRoll'
import { gapRowLabel } from '../../lib/arranging/gapRowLabel'
import { nextPillarIndex, sortPillarsByTime } from '../../lib/arranging/coachPillarNav'
import { TAG_ROLL_DEFAULT_TIME_SIGNATURE } from '../../lib/tagRoll/types'
import { getArrangingServices } from '../../composition/arranging'
import { useTagRollAudio } from '../../composables/useTagRollAudio'
import { useCoachCadencePlans } from './useCoachCadencePlans'
import type { CadenceSuggestion } from '../../domain/arranging/cadences'
import { useArrangementStore } from '../../stores/arrangement'
import { usePreferencesStore } from '../../stores/preferences'
import { useTagRollStore } from '../../stores/tagRoll'

export type CoachGhostNote = {
  role: 'tenor' | 'bari' | 'bass'
  midi: number
  startTick: number
  durationTicks: number
  color: string
}

export type CoachDockEmit = {
  (e: 'previewGhost', ghosts: CoachGhostNote[]): void
  (e: 'clearGhost'): void
  (e: 'update:preview', draft: HarmonyPreviewDraft | null): void
  /** Drop L/R inspect bounds so Space can play the phrase freely. */
  (e: 'releaseInspect'): void
  (e: 'focusTick', tick: number): void
  (e: 'focusRange', startTick: number, endTick: number, select?: 'pillar' | 'column' | 'range' | 'none'): void
  (e: 'focusPart', tick: number, partName: string): void
  (e: 'close'): void
  (e: 'popOut'): void
}

export function useArrangingCoachDock(
  emit: CoachDockEmit,
  opts?: {
    inspectRange?: Ref<TickRange | null | undefined>
    /** Detected lane spans — soft home-root ranking (same as Harmonize Suggest). */
    detectSegments?: Ref<readonly ChordAnalysisSegment[] | undefined>
  },
) {
  const tagStore = useTagRollStore()
  const arrStore = useArrangementStore()
  const prefs = usePreferencesStore()
  const services = getArrangingServices()
  const audio = useTagRollAudio()
  let coachPreview = services.createAudioPreview()
  const stackHear = createCoachStackHear({
    getPreview: () => coachPreview,
    isTransportPlaying: () => !!audio?.isTransportPlaying?.(),
  })
  const syncing = ref(false)
  const phase = ref<'pillars' | 'walk'>('pillars')
  const mode = ref<CoachUiMode>('arrange')
  const focusTab = ref<CoachFocusTab>('now')
  const whyIndex = ref<number | null>(null)
  const whyShowNumbers = ref(false)
  /** Selected row in the Harmonize-style suggest list (Choose). */
  const suggestIndex = ref(0)
  const candFilter = ref<CandFilterId>('all')
  const altsOpen = ref(false)
  const pillarTouched = ref(false)
  const selectedMomentId = ref<string | null>(null)

  const preferFlats = computed(() => !!arrStore.current?.preferFlats)
  const melody = computed(() => arrStore.current?.melody ?? [])
  const pillars = computed(() => arrStore.current?.pillars ?? [])
  const selectedMel = computed(() => arrStore.selectedMelody)
  const selectedPil = computed(() => arrStore.selectedPillar)
  const candidates = computed(() => arrStore.candidates)
  const filteredCandidates = computed(() => filterCandidates(candidates.value, candFilter.value))
  const candidateGroups = computed((): ChordCandidateGroup[] =>
    groupCandidatesByChord(filteredCandidates.value, preferFlats.value),
  )
  const maxScore = computed(() => Math.max(1, ...filteredCandidates.value.map((c) => c.score), 1))
  const filterOptions = candFilterLabels()

  const moments = computed((): HarmonicMoment[] => {
    const p = arrStore.current
    const tag = tagStore.current
    if (!p?.melody.length) return []
    if (!tag) {
      return buildHarmonicMoments(
        p.melody,
        p.melody.map((m) => ({
          startTick: m.startTick,
          durationTicks: m.durationTicks,
          midi: m.midi,
          isLead: true,
        })),
      )
    }
    // All TTBB starts/ends become split points (held lead + moving TBB → many moments).
    return buildHarmonicMoments(p.melody, partOnsetsFromTagRoll(tag))
  })

  const selectedMoment = computed(
    () => moments.value.find((m) => m.id === selectedMomentId.value) ?? null,
  )

  const tip = computed(() => {
    const p = arrStore.current
    const cadenceHint = p
      ? cadenceHintForCoachMoment({
          moment: selectedMoment.value,
          moments: moments.value,
          tonality: p.tonality,
          mode: p.tonalityMode ?? 'major',
        })
      : null
    return tipForCoachUi({
      mode: mode.value,
      phase: phase.value,
      hasMelody: melody.value.length > 0,
      hasPillars: pillars.value.length > 0 || hasSoftHarmonyMap.value,
      wizardStep: arrStore.current?.wizardStep,
      cadenceHint,
    })
  })

  function buildSoftSuggestContext(): SoftSuggestContext {
    const sketch = tagStore.current?.harmonySketch ?? []
    const detected = opts?.detectSegments?.value ?? []
    return {
      sketchSpans: sketch.map((s) => ({
        startTick: s.startTick,
        endTick: s.endTick,
        rootPc: s.rootPc,
        locked: s.locked,
        natureId: s.quality || undefined,
      })),
      detectedSpans: detected
        .filter((s): s is ChordAnalysisSegment & { rootPc: number } => s.rootPc != null)
        .map((s) => ({
          startTick: s.startTick,
          endTick: s.endTick,
          rootPc: s.rootPc,
          natureId: s.quality || undefined,
        })),
    }
  }

  // softChordAtTick / pickFillCandidate → application/CoachFillEmpty

  const hasSoftHarmonyMap = computed(() => {
    const sketch = tagStore.current?.harmonySketch ?? []
    // Locked Sketch or any Detected root is enough to skip the “mark pillars” nag.
    if (sketch.some((s) => s.locked)) return true
    return (opts?.detectSegments?.value ?? []).some((s) => s.rootPc != null)
  })

  function syncSoftSuggestContext(): void {
    arrStore.setSoftSuggestContext(buildSoftSuggestContext())
  }

  const nextAction = computed(() =>
    resolveCoachNextAction({
      project: arrStore.current,
      mode: mode.value,
      lints: arrStore.lints,
      momentsLen: moments.value.length,
      hasSoftHarmonyMap: hasSoftHarmonyMap.value,
    }),
  )

  const momIndex = computed(() => {
    const id = selectedMomentId.value
    if (!id) return -1
    return moments.value.findIndex((m) => m.id === id)
  })

  const pilIndex = computed(() => {
    const id = arrStore.selectedPillarId
    if (!id) return -1
    return pillars.value.findIndex((p) => p.id === id)
  })

  const pillarProgressLabel = computed(() => {
    const n = pillars.value.length
    if (!n) {
      return hasSoftHarmonyMap.value
        ? 'Sketch/Detected map ready - choose voicings on Chords'
        : 'Propose next home root under the melody'
    }
    const i = pilIndex.value
    const locked = pillars.value.filter((p) => p.confirmed).length
    const at = i >= 0 ? `${i + 1}/${n}` : `-/${n}`
    const root =
      selectedPil.value != null ? pcName(selectedPil.value.rootPc, preferFlats.value) : '-'
    const skipped = arrStore.skippedHomeRootCount
    const skipBit = skipped > 0 ? ` | ${skipped} skipped` : ''
    return `Pillar ${at} | ${root} | ${locked}/${n} locked${skipBit}`
  })

  /** Roll-bar status for Chords — cadence cue only (no Moment X/Y counts). */
  const momentProgressLabel = computed(() => {
    const h = tip.value
    if (h?.lessonId !== 'L-classic-cadences') return ''
    return h.title.replace(/^Cadence:\s*/i, '').trim()
  })

  const coverageGaps = computed(() =>
    melodyGapsOutsidePillars(melody.value, pillars.value),
  )

  function priorPillarForTick(tick: number) {
    return (
      [...pillars.value]
        .filter((p) => p.endTick <= tick || p.startTick < tick)
        .sort((a, b) => b.startTick - a.startTick)[0] ?? null
    )
  }

  function formatGapRow(g: { startTick: number; midi: number }): string {
    const ts = tagStore.current?.timeSignature ?? TAG_ROLL_DEFAULT_TIME_SIGNATURE
    return gapRowLabel(g.startTick, g.midi, ts)
  }

  function canExtendPreviousAtGap(noteId: string): boolean {
    const note = melody.value.find((m) => m.id === noteId)
    if (!note) return false
    return priorPillarForTick(note.startTick) != null
  }

  const activeInspectRange = computed((): TickRange | null => {
    const r = opts?.inspectRange?.value
    if (r && r.endTick > r.startTick) return { startTick: r.startTick, endTick: r.endTick }
    const m = selectedMoment.value
    if (m) return { startTick: m.startTick, endTick: m.startTick + m.durationTicks }
    return null
  })

  const rangedLints = computed(() => {
    const p = arrStore.current
    const r = activeInspectRange.value
    if (!p || !r) return [] as ArrangementLint[]
    return filterLintsInRange(arrStore.lints, p, r)
  })

  const noteLints = computed(() => rangedLints.value)

  const pillarsUnconfirmed = computed(
    () => pillars.value.filter((p) => !p.confirmed).length,
  )

  const canWalkArrange = computed(
    () => mode.value === 'review' || pillars.value.length > 0 || hasSoftHarmonyMap.value,
  )

  const currentStack = computed(() => {
    const tick = selectedMoment.value?.startTick ?? selectedMel.value?.startTick
    const p = arrStore.current
    if (tick == null || !p) return null
    return p.stacks.find((s) => s.startTick === tick) ?? null
  })

  const softHomeAtSelection = computed(() => {
    const p = arrStore.current
    const m = selectedMoment.value
    const note = m ? momentToMelodyEvent(m) : selectedMel.value
    if (!p || !note) return null
    return resolveSuggestHomeRoot({
      note,
      pillars: p.pillars,
      soft: buildSoftSuggestContext(),
      tonality: p.tonality,
      mode: p.tonalityMode ?? 'major',
      melodyRole: note.role === 'pmn' || note.role === 'smn' ? note.role : null,
    })
  })

  const softHomeSource = computed(
    (): SuggestHomeRootSource | null => softHomeAtSelection.value?.source ?? null,
  )

  const softHomeLabel = computed(() => {
    const s = softHomeSource.value
    if (s === 'sketch') return 'Sketch'
    if (s === 'detected') return 'Detected'
    if (s === 'implied') return 'melody'
    if (s === 'pillar') return 'pillar'
    return null
  })

  /** True only when ranking has no Sketch/Detected/implied home at all. */
  const uncoveredSelected = computed(() => softHomeAtSelection.value == null)

  const momentContext = computed(() => {
    const p = arrStore.current
    const m = selectedMoment.value
    if (!p || !m) return null
    const soft = softHomeSource.value
    return contextForSelectedMoment(p, m, candidates.value, {
      softHomeSource:
        soft === 'sketch' || soft === 'detected' || soft === 'implied' ? soft : null,
    })
  })

  const altChips = computed((): AltChipDto[] => {
    const p = arrStore.current
    const m = selectedMoment.value
    if (!p || !m) return []
    return altChipsForMoment(p, m, candidates.value, preferFlats.value)
  })

  const counterpart = computed(() => {
    const p = arrStore.current
    const m = selectedMoment.value
    if (!p || !m) return null
    return counterpartForMoment(p, m, preferFlats.value)
  })

  const issueGroups = computed(() => groupIssues(rangedLints.value))
  const learnHint = ref<string | null>(null)
  const expandedLintId = ref<string | null>(null)
  const lintDetail = ref<ReturnType<typeof explanationForLint> | null>(null)
  const pendingKeySuggestionLint = ref<ArrangementLint | null>(null)
  const pendingKeySuggestionMessage = computed(() => {
    const lint = pendingKeySuggestionLint.value
    return lint ? `${lint.message}\n\nApply transpose now?` : ''
  })

  function lintRowLabel(lint: ArrangementLint): string {
    const p = arrStore.current
    const tag = tagStore.current
    if (!p || !tag) return lint.message
    return formatLintMeasureBeatRow(lint, p, tag.timeSignature, tag.ppq)
  }

  function lintParts(lint: ArrangementLint): LintRowParts {
    const p = arrStore.current
    const tag = tagStore.current
    if (!p || !tag) return { loc: '-:-', message: lint.message }
    return lintRowParts(lint, p, tag.timeSignature, tag.ppq)
  }

  const canLockRemaining = computed(
    () => pillars.value.some((p) => p.confirmed) && pillarsUnconfirmed.value > 0,
  )

  function setMode(next: CoachUiMode): void {
    mode.value = next
    focusTab.value = defaultFocusForMode(next)
    altsOpen.value = next === 'arrange'
    if (next === 'review') phase.value = 'walk'
  }

  function partColor(name: string, fallback: string): string {
    return tagStore.current?.parts.find((p) => p.name === name)?.color ?? fallback
  }

  /** Persist Coach chord as ghost + sketch preview (Play hears it; playhead stays free). */
  function syncCoachChordPreview(): void {
    const m = selectedMoment.value
    if (!m) {
      emit('clearGhost')
      emit('update:preview', null)
      return
    }
    const list = filteredCandidates.value
    const cand = list[suggestIndex.value] ?? list[0]
    if (cand) {
      const { draft, ghosts } = coachPreviewFromCandidate(
        cand,
        m.startTick,
        m.durationTicks,
        partColor,
      )
      emit('previewGhost', ghosts as CoachGhostNote[])
      emit('update:preview', draft)
      return
    }
    const stack = currentStack.value
    if (stack?.midi && stack.natureId && stack.natureId !== 'unknown') {
      emit(
        'previewGhost',
        coachGhostsForVoicing(
          { rootPc: stack.rootPc, natureId: stack.natureId, midi: stack.midi },
          m.startTick,
          m.durationTicks,
          partColor,
        ) as CoachGhostNote[],
      )
      emit(
        'update:preview',
        coachSketchPreviewDraft(m.startTick, m.durationTicks, stack.rootPc, stack.natureId),
      )
      return
    }
    emit('clearGhost')
    emit('update:preview', null)
  }

  function selectMoment(
    m: HarmonicMoment,
    _optsExtra?: { syncRoll?: boolean; select?: 'pillar' | 'column' | 'range' | 'none' },
  ): void {
    selectedMomentId.value = m.id
    whyIndex.value = null
    suggestIndex.value = 0
    clearCadencePlanPreview()
    if (m.leadNoteId) arrStore.selectMelody(m.leadNoteId)
    syncSoftSuggestContext()
    arrStore.setCandidateTarget(momentToMelodyEvent(m))
    setCoachHighlight({
      tick: m.startTick,
      kind: m.heldLead ? 'gap' : 'moment',
      projectId: tagStore.current?.id,
    })
    // Highlight + preview only — do not own L/R inspect bounds or the playhead.
    emit('releaseInspect')
    syncCoachChordPreview()
  }

  function selectMomentIndex(i: number): void {
    const m = moments.value[i]
    if (m) selectMoment(m)
  }

  function stepMoment(dir: -1 | 1): void {
    const n = moments.value.length
    if (!n) return
    const cur = momIndex.value
    const next = cur < 0 ? (dir > 0 ? 0 : n - 1) : Math.min(n - 1, Math.max(0, cur + dir))
    selectMomentIndex(next)
  }

  async function ensureLinked(): Promise<void> {
    const tag = tagStore.current
    if (!tag) return
    syncing.value = true
    try {
      await arrStore.hydrate()
      const linkId = `arr_${tag.id}`
      const existing = arrStore.projects.find((p) => p.id === linkId)
      // Migrate legacy pillars-only sessions into sketch once.
      if (!(tag.harmonySketch ?? []).some((s) => s.locked) && existing?.pillars.length) {
        tagStore.setHarmonySketch(migratePillarsToSketchIfEmpty(tag.harmonySketch ?? [], existing.pillars))
      }
      const live = tagStore.current!
      const fresh = tagStudioToArrangement(live, services.idGen)
      fresh.id = linkId
      if (existing) {
        mergeCoachSessionFromExisting(fresh, existing, {
          harmonySketch: live.harmonySketch ?? [],
          nextId: (prefix) => services.idGen.next(prefix),
        })
      }
      await arrStore.adoptProject(fresh)
      arrStore.runQa()
      const p = arrStore.current
      if (p?.pillars.some((x) => x.confirmed) || hasSoftHarmonyMap.value) phase.value = 'walk'
      if (phase.value === 'pillars' && pillars.value.length) {
        focusPillar(arrStore.selectedPillarId ?? pillars.value[0]!.id)
      } else {
        syncSoftSuggestContext()
        syncSelectionFromTagStudio()
        if (!selectedMomentId.value && moments.value[0]) selectMoment(moments.value[0]!)
      }
    } finally {
      syncing.value = false
    }
  }

  function pushToRoll(): void {
    const tag = tagStore.current
    const arr = arrStore.current
    if (!tag || !arr) return
    const merged = mergeArrangementIntoTagRoll(tag, arr, services.idGen)
    tagStore.replaceNotesFromExternal(merged.notes, {
      title: merged.title,
      bpm: merged.bpm,
      tonality: merged.tonality,
      preferFlats: merged.preferFlats,
      lengthTicks: merged.lengthTicks,
    })
    if (merged.harmonySketch) tagStore.setHarmonySketch(merged.harmonySketch)
    const tick = selectedMoment.value?.startTick ?? selectedMel.value?.startTick
    if (tick != null) emit('focusTick', tick)
  }

  /** Keep Tag Studio sketch in sync when pillars change without a stack push. */
  function syncPillarsToSketch(): void {
    const tag = tagStore.current
    const arr = arrStore.current
    if (!tag || !arr) return
    tagStore.setHarmonySketch(replaceSketchFromPillars(tag.harmonySketch ?? [], arr.pillars))
  }

  function syncSelectionFromTagStudio(): void {
    if (phase.value === 'pillars' && arrStore.selectedPillarId) return
    if (!tagStore.current || !arrStore.current) return
    const tick = tagStore.selectedNote?.startTick ?? selectedMel.value?.startTick
    if (tick == null) return
    const hit = moments.value.find(
      (m) => m.startTick === tick || (tick >= m.startTick && tick < m.startTick + m.durationTicks),
    )
    if (hit && hit.id !== selectedMomentId.value) selectMoment(hit, { syncRoll: false })
  }

  function momentHasKnownStack(startTick: number): boolean {
    return !!arrStore.current?.stacks.some(
      (s) => s.startTick === startTick && s.natureId && s.natureId !== 'unknown',
    )
  }

  function stepNextGap(): void {
    if (!arrStore.current) return
    const curTick = selectedMoment.value?.startTick ?? -1
    const gap =
      moments.value.find((m) => m.startTick > curTick && !momentHasKnownStack(m.startTick)) ??
      moments.value.find((m) => !momentHasKnownStack(m.startTick))
    if (gap) selectMoment(gap)
  }

  function stepNextIssue(): void {
    stepLint(1)
  }

  function stepLint(dir: -1 | 1): void {
    const list = rangedLints.value
    if (!list.length) return
    const curId = expandedLintId.value
    let idx = curId ? list.findIndex((l) => l.id === curId) : -1
    if (idx < 0) idx = dir > 0 ? 0 : list.length - 1
    else idx = (idx + dir + list.length) % list.length
    jumpToLint(list[idx]!)
  }

  function stepNextProblem(): void {
    const p = arrStore.current
    if (!p) return
    const curTick = selectedMoment.value?.startTick ?? -1

    // Repair tour order: issue → unrecognized → empty
    if (rangedLints.value.length) {
      stepNextIssue()
      return
    }

    const unrec = p.stacks
      .filter((s) => s.midi && (!s.natureId || s.natureId === 'unknown'))
      .sort((a, b) => a.startTick - b.startTick)
    const nextUnrec = unrec.find((s) => s.startTick > curTick) ?? unrec[0]
    if (nextUnrec) {
      const m =
        moments.value.find((x) => x.startTick === nextUnrec.startTick) ??
        moments.value.find(
          (x) =>
            nextUnrec.startTick >= x.startTick &&
            nextUnrec.startTick < x.startTick + x.durationTicks,
        )
      if (m) {
        selectMoment(m)
        return
      }
    }

    const empty =
      moments.value.find((m) => m.startTick > curTick && !momentHasKnownStack(m.startTick)) ??
      moments.value.find((m) => !momentHasKnownStack(m.startTick))
    if (empty) selectMoment(empty)
  }

  const emptyMomentCount = computed(
    () => moments.value.filter((m) => !momentHasKnownStack(m.startTick)).length,
  )
  const unrecognizedCount = computed(
    () =>
      arrStore.current?.stacks.filter((s) => s.midi && (!s.natureId || s.natureId === 'unknown'))
        .length ?? 0,
  )

  const repairTour = computed(
    () => detectCoachEntryMode(arrStore.current, moments.value.length) === 'repair',
  )

  const unregisterRollNav = bindCoachRollNav({
    focusTab,
    momIndex,
    moments,
    momentContext,
    noteLints,
    emptyCount: emptyMomentCount,
    unrecognizedCount,
    repairTour,
    stepMoment,
    stepNextGap,
    stepNextIssue,
    stepNextProblem,
  })

  function focusPillar(id: string): void {
    const pil = sortPillarsByTime(pillars.value).find((p) => p.id === id)
    if (!pil) return
    arrStore.selectPillar(id)
    focusTab.value = 'now'
    phase.value = 'pillars'
    emit('releaseInspect')
    setCoachHighlight({
      tick: pil.startTick,
      kind: 'pillar',
      projectId: tagStore.current?.id,
    })
  }

  function stepPillar(dir: -1 | 1): void {
    const sorted = sortPillarsByTime(pillars.value)
    const next = nextPillarIndex(
      sorted,
      arrStore.selectedPillarId,
      dir,
      tagStore.current?.view.playheadTick ?? 0,
    )
    if (next < 0) return
    focusPillar(sorted[next]!.id)
  }

  function onInfer(): void {
    arrStore.inferPillars()
    arrStore.runQa()
    phase.value = 'pillars'
    if (mode.value === 'review') setMode('arrange')
    focusTab.value = 'now'
    pillarTouched.value = false
    prefs.openTagRollBottomLane('coach')
    const first =
      arrStore.current?.pillars.find((p) => !p.confirmed) ?? arrStore.current?.pillars[0]
    if (first) focusPillar(first.id)
  }

  /** Guided propose — one draft home root at/after playhead (overlay only). */
  function onProposeNext(): void {
    ensureLinked()
    const cursor =
      tagStore.current?.view.playheadTick ??
      selectedPil.value?.endTick ??
      selectedMoment.value?.startTick ??
      0
    const ok = arrStore.proposeNextHomeRoot(cursor)
    phase.value = 'pillars'
    if (mode.value === 'review') setMode('arrange')
    focusTab.value = 'now'
    pillarTouched.value = true
    prefs.openTagRollBottomLane('coach')
    if (ok) {
      // Drafts stay Coach-only until Lock — do not rebuild Chords from pillars here.
    }
    if (ok && arrStore.selectedPillarId) focusPillar(arrStore.selectedPillarId)
  }

  function onSkipProposed(): void {
    arrStore.skipProposedPillar()
    onProposeNext()
  }

  function onAddPillarAtPlayhead(): void {
    const tick =
      tagStore.current?.view.playheadTick ?? selectedMoment.value?.startTick ?? 0
    arrStore.addPillarAt(tick)
    pillarTouched.value = true
    phase.value = 'pillars'
    focusTab.value = 'now'
    syncPillarsToSketch()
    if (arrStore.selectedPillarId) focusPillar(arrStore.selectedPillarId)
  }

  function autoLabelRolesIfRepair(): void {
    if (detectCoachEntryMode(arrStore.current, moments.value.length) !== 'repair') return
    arrStore.labelRoles(false)
    arrStore.runQa()
  }

  function onLockPillar(): void {
    arrStore.lockSelectedPillar()
    pillarTouched.value = true
    syncPillarsToSketch()
    autoLabelRolesIfRepair()
    // Approach Two: confirm destination → next.
    onProposeNext()
  }

  function onLockRemaining(): void {
    if (!canLockRemaining.value) return
    arrStore.lockRemaining()
    syncPillarsToSketch()
    autoLabelRolesIfRepair()
  }

  function onDeletePillar(): void {
    const id = arrStore.selectedPillarId
    if (!id) return
    arrStore.removePillar(id)
    syncPillarsToSketch()
  }

  function updatePillarRoot(rootPc: number): void {
    const id = arrStore.selectedPillarId
    if (!id) return
    arrStore.updatePillar(id, { rootPc, source: 'user' })
    pillarTouched.value = true
    syncPillarsToSketch()
  }

  function enterWalk(): void {
    if (!canWalkArrange.value) return
    phase.value = 'walk'
    focusTab.value = 'choose'
    if (mode.value !== 'review' && arrStore.current) {
      arrStore.setWizardStep('step3_pmn_pcf')
    }
    if (moments.value.length) selectMomentIndex(Math.max(0, momIndex.value))
  }

  function addPillarHere(): void {
    const tick = selectedMoment.value?.startTick ?? selectedMel.value?.startTick
    if (tick == null) return
    arrStore.addPillarAt(tick)
    pillarTouched.value = true
    phase.value = 'pillars'
    focusTab.value = 'now'
    syncPillarsToSketch()
    if (arrStore.selectedPillarId) focusPillar(arrStore.selectedPillarId)
  }

  /** Jump to an uncovered Lead note — highlight only (no L/R inspect bounds). */
  function jumpToUncovered(noteId: string): void {
    const note = melody.value.find((m) => m.id === noteId)
    if (!note) return
    arrStore.selectMelody(note.id)
    phase.value = 'pillars'
    focusTab.value = 'now'
    emit('releaseInspect')
    setCoachHighlight({
      tick: note.startTick,
      kind: 'gap',
      projectId: tagStore.current?.id,
    })
  }

  /** Add a home-root pillar at an uncovered note, then overlay that pillar. */
  function addPillarAtUncovered(noteId: string): void {
    const note = melody.value.find((m) => m.id === noteId)
    if (!note) return
    arrStore.selectMelody(note.id)
    arrStore.addPillarAt(note.startTick)
    pillarTouched.value = true
    phase.value = 'pillars'
    focusTab.value = 'now'
    syncPillarsToSketch()
    if (arrStore.selectedPillarId) focusPillar(arrStore.selectedPillarId)
  }

  function extendPreviousToHere(): void {
    const tick = selectedMoment.value?.startTick ?? selectedMel.value?.startTick
    if (tick == null) return
    const prev = priorPillarForTick(tick)
    if (!prev) {
      addPillarHere()
      return
    }
    arrStore.selectPillar(prev.id)
    arrStore.extendSelectedPillarTo(tick)
    pillarTouched.value = true
    syncPillarsToSketch()
    focusPillar(prev.id)
  }

  /** Stretch the previous home-root span to cover an uncovered note (overlay after). */
  function extendPreviousToUncovered(noteId: string): void {
    const note = melody.value.find((m) => m.id === noteId)
    if (!note) return
    const prev = priorPillarForTick(note.startTick)
    if (!prev) {
      addPillarAtUncovered(noteId)
      return
    }
    arrStore.selectMelody(note.id)
    arrStore.selectPillar(prev.id)
    arrStore.extendSelectedPillarTo(note.startTick + Math.max(1, note.durationTicks))
    pillarTouched.value = true
    phase.value = 'pillars'
    focusTab.value = 'now'
    syncPillarsToSketch()
    focusPillar(prev.id)
  }

  function previewCand(c: HarmonizeCandidate): void {
    const moment = selectedMoment.value
    if (!moment) return
    const { draft, ghosts } = coachPreviewFromCandidate(
      c,
      moment.startTick,
      moment.durationTicks,
      partColor,
    )
    emit('previewGhost', ghosts as CoachGhostNote[])
    emit('update:preview', draft)
  }

  async function hearCand(c: HarmonizeCandidate): Promise<void> {
    previewCand(c)
    await stackHear.hearCandidate(c, 700)
  }

  /** Hold-to-hear — sustain until holdStopHear (ports AudioPreview). */
  async function holdStartHear(c: HarmonizeCandidate): Promise<void> {
    previewCand(c)
    await stackHear.holdStart(c.midi)
  }

  function holdStopHear(): void {
    stackHear.holdStop()
    syncCoachChordPreview()
  }

  async function hearCurrentStack(): Promise<void> {
    const stack = currentStack.value
    if (!stack?.midi) return
    await hearCand({
      rootPc: stack.rootPc,
      natureId: stack.natureId,
      voicing: stack.voicing,
      spread: !!stack.spread,
      layer: stack.layer === 'passing' ? 'passing' : 'primary',
      scfGroup: stack.scfGroup,
      midi: stack.midi,
      score: 0,
      ruleTags: stack.ruleTags ?? [],
      label: 'current',
    })
  }

  async function hearPillarRoot(): Promise<void> {
    const pil = selectedPil.value
    if (!pil || audio?.isTransportPlaying?.()) return
    const p = audio?.ensurePlayer()
    if (!p) return
    pillarTouched.value = true
    // C3 + pitch class — audible root, not the C2 sample floor.
    const midi = 48 + ((pil.rootPc % 12) + 12) % 12
    p.allNotesOff(true)
    await p.noteOn(midiToNote(midi))
    window.setTimeout(() => {
      if (audio?.isTransportPlaying?.()) return
      p.allNotesOff(true)
    }, 600)
  }

  function applyCand(c: HarmonizeCandidate): void {
    arrStore.applyCandidate(c)
    arrStore.runQa()
    pushToRoll()
    syncCoachChordPreview()
  }

  function applyBest(): void {
    applySelectedSuggest()
  }

  function applySelectedSuggest(): void {
    const list = filteredCandidates.value
    const c = list[suggestIndex.value] ?? list[0] ?? candidates.value[0]
    if (c) applyCand(c)
  }

  function hearSelectedSuggest(): void {
    const list = filteredCandidates.value
    const c = list[suggestIndex.value] ?? list[0]
    if (c) void hearCand(c)
    else void hearCurrentStack()
  }

  function applyAltChip(chip: AltChipDto): void {
    const hit = pickCandidateForAltChip(candidates.value, chip)
    if (hit) applyCand(hit)
  }

  const {
    previewAltChip,
    holdStartAltChip,
    previewCounterpartCand,
    holdStartCounterpartCand,
  } = makeCoachInsightHear({
    getCandidates: () => candidates.value,
    getCounterpart: () => counterpart.value,
    preview: previewCand,
    holdStart: (c) => void holdStartHear(c),
  })

  function applyCounterpartNow(): void {
    const cp = counterpart.value
    if (!cp) return
    if (!arrStore.applyCounterpartStack(cp.stackId)) return
    arrStore.runQa()
    pushToRoll()
    syncCoachChordPreview()
  }

  function fillEmptyWithBest(): void {
    const soft = buildSoftSuggestContext()
    arrStore.setSoftSuggestContext(soft)
    const cur = arrStore.current
    if (!cur) return
    const ops = planFillEmptyWithBest({
      project: cur,
      moments: moments.value,
      soft,
      rankerDeps: services.rankerDeps,
      idGen: services.idGen,
    })
    for (const op of ops) {
      arrStore.setCandidateTarget(op.note)
      arrStore.applyCandidate(op.candidate)
    }
    arrStore.runQa()
    pushToRoll()
    if (selectedMoment.value) selectMoment(selectedMoment.value)
  }

  function fixAllSafe(): void {
    arrStore.fixAllSafe()
    pushToRoll()
  }

  function fixItem(lint: ArrangementLint): void {
    if (!arrStore.current) return
    if (lint.ruleId === 'key-suggestion') {
      pendingKeySuggestionLint.value = lint
      return
    }
    arrStore.fixLint(lint)
    pushToRoll()
  }

  function cancelPendingKeySuggestion(): void {
    pendingKeySuggestionLint.value = null
  }

  function confirmPendingKeySuggestion(): void {
    const lint = pendingKeySuggestionLint.value
    pendingKeySuggestionLint.value = null
    if (!lint || !arrStore.current) return
    arrStore.fixLint(lint, { confirmDestructive: true })
    pushToRoll()
  }

  function canFix(lint: ArrangementLint): boolean {
    const p = arrStore.current
    if (!p) return false
    return canApplyFix(p, lint, services.fixRegistry)
  }

  function learnLint(lint: ArrangementLint): void {
    jumpToLint(lint)
  }

  function jumpToLint(lint: ArrangementLint): void {
    const p = arrStore.current
    if (!p) return
    arrStore.selectLintTarget(lint)
    phase.value = 'walk'
    // Stay on Chords so the moment + ranked suggestions are visible.
    focusTab.value = 'choose'
    expandedLintId.value = lint.id
    lintDetail.value = explanationForLint(lint)
    learnHint.value = null

    const tick =
      selectedMel.value?.startTick ??
      (lint.stackId ? p.stacks.find((s) => s.id === lint.stackId)?.startTick : undefined) ??
      lintStartTick(lint, p)
    if (tick == null || !Number.isFinite(tick)) return

    const moment = moments.value.find((m) => m.startTick === tick)
    if (moment) selectMoment(moment, { syncRoll: false })
    else emit('releaseInspect')
    setCoachHighlight({
      tick,
      kind: 'issue',
      projectId: tagStore.current?.id,
      lintId: lint.id,
    })
  }

  function clearLintDetail(): void {
    expandedLintId.value = null
    lintDetail.value = null
  }

  function candLabel(c: HarmonizeCandidate): string {
    const root = pcName(c.rootPc, preferFlats.value)
    const nat = c.natureId === 'major' ? '' : c.natureId === 'seventh' ? '7' : c.natureId
    return `${root}${nat}`
  }

  function candIdentity(c: HarmonizeCandidate): string {
    const v = c.voicing?.trim()
    const base = v ? `${candLabel(c)} · ${voicingDisplayLabel(v)}` : candLabel(c)
    return c.spread ? `${base} · spread` : base
  }

  function whyFor(i: number) {
    return whyViewForCandidate(filteredCandidates.value[i] ?? candidates.value[i]!)
  }

  function layerHint(c: HarmonizeCandidate): string {
    return layerHintForCandidate(c)
  }

  function openSketchForPillars(): void {
    prefs.setTagRollChordsLaneCollapsed(false)
    focusTab.value = 'home'
    phase.value = 'walk'
  }

  function runNextAction(): void {
    const a = nextAction.value
    if (a.focus) focusTab.value = a.focus
    switch (a.kind) {
      case 'enter_melody':
        emit('close')
        break
      case 'suggest_pillars':
      case 'lock_pillars':
        openSketchForPillars()
        break
      case 'cover_gaps': {
        openSketchForPillars()
        const g = coverageGaps.value[0]
        if (g) jumpToUncovered(g.id)
        break
      }
      case 'walk_choose':
        enterWalk()
        break
      case 'fix_issues':
        focusTab.value = 'check'
        phase.value = 'walk'
        break
      case 'done':
        focusTab.value = a.focus ?? 'polish'
        phase.value = 'walk'
        break
    }
  }

  function goCloseForMelody(): void {
    emit('close')
  }

  watch(
    () => filteredCandidates.value.length,
    (n) => {
      if (suggestIndex.value >= n) suggestIndex.value = Math.max(0, n - 1)
    },
  )

  watch([suggestIndex, filteredCandidates, selectedMomentId, currentStack], () => {
    syncCoachChordPreview()
  })

  watch(
    () => [tagStore.selectedNoteIds.slice(), arrStore.selectedMelodyId] as const,
    () => syncSelectionFromTagStudio(),
  )

  watch(
    () => {
      const sketch = tagStore.current?.harmonySketch ?? []
      const detect = opts?.detectSegments?.value ?? []
      return [
        sketch.map((s) => `${s.startTick}:${s.endTick}:${s.rootPc}:${s.locked ? 1 : 0}`).join('|'),
        detect.map((s) => `${s.startTick}:${s.endTick}:${s.rootPc ?? ''}`).join('|'),
      ].join('::')
    },
    () => {
      if (!arrStore.current) return
      syncSoftSuggestContext()
    },
  )

  watch(
    () => {
      const notes = tagStore.current?.notes
      if (!notes) return 0
      let h = notes.length
      for (const n of notes) {
        h = (Math.imul(h, 33) + n.midi + n.startTick + n.durationTicks) | 0
      }
      return h
    },
    async () => {
      const tag = tagStore.current
      if (!tag || !arrStore.current) return
      const keepTick = selectedMoment.value?.startTick
      const keepPil = arrStore.selectedPillarId
      const keepPillarPhase = phase.value === 'pillars'
      const next = mergeCoachSessionFromExisting(
        tagStudioToArrangement(tag, services.idGen),
        arrStore.current,
        {
          harmonySketch: tag.harmonySketch ?? [],
          nextId: (prefix) => services.idGen.next(prefix),
        },
      )
      next.id = arrStore.current.id
      await arrStore.adoptProject(next)
      arrStore.runQa()
      if (keepPil && next.pillars.some((p) => p.id === keepPil)) {
        arrStore.selectPillar(keepPil)
        if (keepPillarPhase) {
          focusPillar(keepPil)
          return
        }
      }
      if (keepTick != null) {
        const hit = moments.value.find((m) => m.startTick === keepTick)
        if (hit) selectMoment(hit)
      } else {
        syncSelectionFromTagStudio()
      }
    },
  )

  onUnmounted(() => {
    unregisterRollNav()
    emit('clearGhost')
    emit('update:preview', null)
    emit('releaseInspect')
    arrStore.setCandidateTarget(null)
    coachPreview.dispose()
  })

  const {
    cadencePlans,
    applyCadencePlan,
    applyCadencePlanStep,
    hearCadencePlan,
    stopHearCadencePlan,
    hearingPlanId,
    previewPlanId,
    buildCadencePlanPreview,
    clearCadencePlanPreview,
    markCadencePlanPreview,
  } = useCoachCadencePlans({
    moments,
    selectedMomentId,
  })

  function previewCadencePlan(plan: CadenceSuggestion): void {
    if (previewPlanId.value === plan.id) {
      clearCadencePlanPreview()
      emit('clearGhost')
      emit('update:preview', null)
      emit('releaseInspect')
      const m = selectedMoment.value
      if (m) {
        setCoachHighlight({
          tick: m.startTick,
          kind: m.heldLead ? 'gap' : 'moment',
          projectId: tagStore.current?.id,
        })
      }
      return
    }
    const built = buildCadencePlanPreview(plan, partColor)
    if (!built) return
    markCadencePlanPreview(plan.id)
    emit('previewGhost', built.ghosts as CoachGhostNote[])
    emit('update:preview', built.draft)
    emit('focusRange', built.range.startTick, built.range.endTick, 'none')
    setCoachHighlight({
      tick: built.range.startTick,
      endTick: built.range.endTick,
      kind: 'moment',
      projectId: tagStore.current?.id,
    })
  }

  return {
    arrStore,
    syncing,
    phase,
    mode,
    focusTab,
    whyIndex,
    whyShowNumbers,
    suggestIndex,
    tip,
    nextAction,
    preferFlats,
    melody,
    moments,
    pillars,
    selectedMel,
    selectedMoment,
    selectedPil,
    candidates,
    filteredCandidates,
    candidateGroups,
    maxScore,
    filterOptions,
    candFilter,
    altsOpen,
    altChips,
    counterpart,
    issueGroups,
    learnHint,
    expandedLintId,
    lintDetail,
    lintRowLabel,
    lintParts,
    clearLintDetail,
    pillarProgressLabel,
    momentProgressLabel,
    coverageGaps,
    formatGapRow,
    canExtendPreviousAtGap,
    repairTour,
    noteLints,
    pillarsUnconfirmed,
    canWalkArrange,
    canLockRemaining,
    emptyMomentCount,
    currentStack,
    uncoveredSelected,
    softHomeLabel,
    softHomeSource,
    momentContext,
    ensureLinked,
    setMode,
    selectMoment,
    stepMoment,
    stepNextGap,
    stepNextIssue,
    stepNextProblem,
    stepLint,
    focusPillar,
    stepPillar,
    onInfer,
    onProposeNext,
    onSkipProposed,
    onAddPillarAtPlayhead,
    onLockPillar,
    onLockRemaining,
    onDeletePillar,
    updatePillarRoot,
    enterWalk,
    addPillarHere,
    jumpToUncovered,
    addPillarAtUncovered,
    extendPreviousToUncovered,
    extendPreviousToHere,
    previewCand,
    hearCand,
    holdStartHear,
    holdStopHear,
    hearCurrentStack,
    hearPillarRoot,
    applyCand,
    applyBest,
    applySelectedSuggest,
    hearSelectedSuggest,
    applyAltChip,
    previewAltChip,
    holdStartAltChip,
    previewCounterpartCand,
    holdStartCounterpartCand,
    applyCounterpartNow,
    fillEmptyWithBest,
    fixAllSafe,
    fixItem,
    cadencePlans,
    applyCadencePlan,
    applyCadencePlanStep,
    hearCadencePlan,
    stopHearCadencePlan,
    hearingPlanId,
    previewPlanId,
    previewCadencePlan,
    pendingKeySuggestionLint,
    pendingKeySuggestionMessage,
    cancelPendingKeySuggestion,
    confirmPendingKeySuggestion,
    canFix,
    learnLint,
    jumpToLint,
    candLabel,
    candIdentity,
    layerHint,
    whyFor,
    runNextAction,
    goCloseForMelody,
    pcName,
    midiToNote,
    pushToRoll,
  }
}
