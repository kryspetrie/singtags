import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { getArrangingServices } from '../composition/arranging'
import { usePreferencesStore } from './preferences'
import {
  lintSummary,
  runQa,
  type SoftSuggestContext,
} from '../application/arranging'
import type { HarmonizeCandidate } from '../domain/arranging/harmonize'
import type { ArrangementLint } from '../domain/arranging/qa'
import { explainCandidate } from '../domain/arranging/coachCopy'
import {
  pushUndo,
  redoOnce,
  undoOnce,
  type HistoryStacks,
} from '../domain/arranging/history'
import { tipsForProfile } from '../domain/arranging/orgTips'
import { DEFAULT_CONTEST_PROFILE } from '../domain/arranging/contestProfile'
import { DEFAULT_LENGTH, DEFAULT_SNAP } from '../domain/arranging/snap'
import { getHistory, putHistory } from '../offline/arrangingDb'
import {
  createEmptyArrangement,
  WIZARD_ORDER,
  WIZARD_STEP_LABELS,
  type ArrangementProject,
  type ContestProfile,
  type MelodyEvent,
  type TuningMode,
  type WizardStep,
} from '../domain/arranging/types'
import {
  normalizeQaConfig,
  type ArrangementQaConfig,
} from '../domain/arranging/coachConfig'
import { type StoreDeps } from './arrangement/deps'
import { createArrangementMelodyActions } from './arrangement/melody'
import { createArrangementPillarActions } from './arrangement/pillars'
import { createArrangementHarmonizeActions } from './arrangement/harmonize'

/**
 * Thin Pinia façade — mirrors SingTags tagRoll store shape (document + selection + history).
 * Algorithms live in domain/application via composition root.
 */
export const useArrangementStore = defineStore('arrangement', () => {

  const services = getArrangingServices()

  const projects = ref<ArrangementProject[]>([])
  const hydrated = ref(false)
  const currentId = ref<string | null>(null)
  const selectedMelodyId = ref<string | null>(null)
  const selectedPillarId = ref<string | null>(null)
  /** Session-only skipped propose windows (`spanKey`); cleared on project switch. */
  const skippedHomeRootSpans = ref<string[]>([])
  /** When set, candidates/apply use this event (harmonic moment) instead of selected melody onset. */
  const candidateTarget = ref<MelodyEvent | null>(null)
  /** Sketch / Detected fallbacks for Harmonize Suggest (cleared when target cleared). */
  const softSuggestContext = ref<SoftSuggestContext | null>(null)
  const addDurationTicks = ref(480)
  const snapTicks = ref(DEFAULT_SNAP)
  const lengthTicks = ref(DEFAULT_LENGTH)
  const cellW = ref(28)
  const cellH = ref(14)
  const candidates = ref<HarmonizeCandidate[]>([])
  const lints = ref<ArrangementLint[]>([])
  const playheadTick = ref(0)
  const isPlaying = ref(false)
  const history = ref<HistoryStacks>({ undo: [], redo: [] })
  const whyOpen = ref(false)

  const current = computed(() => projects.value.find((p) => p.id === currentId.value) ?? null)

  const selectedMelody = computed(() => {
    const p = current.value
    const id = selectedMelodyId.value
    if (!p || !id) return null
    return p.melody.find((n) => n.id === id) ?? null
  })

  const selectedPillar = computed(() => {
    const p = current.value
    const id = selectedPillarId.value
    if (!p || !id) return null
    return p.pillars.find((x) => x.id === id) ?? null
  })

  const qaBadge = computed(() => lintSummary(lints.value))
  const canUndo = computed(() => history.value.undo.length > 0)
  const canRedo = computed(() => history.value.redo.length > 0)

  const selectedWhy = computed(() => {
    const c = candidates.value[0]
    return c ? explainCandidate(c) : null
  })

  const orgTips = computed(() => {
    const profile = current.value?.contestProfile ?? DEFAULT_CONTEST_PROFILE
    return tipsForProfile(profile, 'ttbb')
  })

  const skippedHomeRootCount = computed(() => skippedHomeRootSpans.value.length)

  const stepLabel = computed(() =>
    current.value ? WIZARD_STEP_LABELS[current.value.wizardStep] : '',
  )
  const deps: StoreDeps = {
    services,
    projects,
    hydrated,
    currentId,
    selectedMelodyId,
    selectedPillarId,
    skippedHomeRootSpans,
    candidateTarget,
    softSuggestContext,
    addDurationTicks,
    snapTicks,
    lengthTicks,
    cellW,
    cellH,
    candidates,
    lints,
    playheadTick,
    isPlaying,
    history,
    whyOpen,
    current,
    selectedMelody,
    selectedPillar,
    qaBadge,
    canUndo,
    canRedo,
    selectedWhy,
    orgTips,
    skippedHomeRootCount,
    stepLabel,
    hydrate,
    persist,
    touch,
    snapshotBeforeChange,
    saveHistory,
    loadHistory,
    replaceCurrent,
    mutate,
    refreshQa,
    list,
    create,
    adoptProject,
    open,
    remove,
    setTitle,
    setWizardStep,
    nextStep,
    prevStep,
    setTuningMode,
    setContestProfile,
    setQaConfig,
    setTonality,
    selectMelody,
    selectLintTarget,
    undo,
    redo,
    severityForMelody,
    severityForStack,
    explainAt,
    pushHistoryCheckpoint,
  }
  const melodyActions = createArrangementMelodyActions(deps)
  const pillarActions = createArrangementPillarActions(deps)
  const harmonizeActions = createArrangementHarmonizeActions(deps)
  melodyActions.bindWatches()
  pillarActions.bindWatches()
  harmonizeActions.bindWatches()
  const {
    addMelodyNote,
    updateMelodyNote,
    setLyric,
    listEmbellishmentSeeds,
    applySwipeSeed,
    deleteMelodyNote,
    clearMelody,
    inferPillars,
    proposeNextHomeRoot,
    skipProposedPillar,
    clearSkippedHomeRoots,
    setPillars,
    updatePillar,
    confirmAllPillars,
    selectPillar,
    addPillarAt,
    extendSelectedPillarTo,
    trimSelectedPillarEnd,
    removePillar,
    lockSelectedPillar,
    lockRemaining,
    refreshCandidates,
    setSoftSuggestContext,
    setCandidateTarget,
    applyCandidate,
    applyCounterpartStack,
    autoFillStacks,
    setStacks,
    runQaNow,
    fixLint,
    fixAllSafe,
    labelRoles,
    strengthen,
    polishVoicing,
    pathOptimize,
    finalChecklist,
    howBarbershopFactors,
    downloadMidi,
    downloadMusicXml,
  } = {
    ...melodyActions.actions,
    ...pillarActions.actions,
    ...harmonizeActions.actions,
  }

  async function hydrate(): Promise<void> {
    if (hydrated.value) return
    projects.value = await services.repository.loadAll()
    hydrated.value = true
  }

  async function persist(): Promise<void> {
    await services.repository.saveAll(projects.value)
  }

  function touch(p: ArrangementProject): void {
    p.updatedAt = services.clock.now()
  }

  function snapshotBeforeChange(): void {
    const p = current.value
    if (!p) return
    history.value = pushUndo(history.value, p)
    void saveHistory()
  }

  async function saveHistory(): Promise<void> {
    const id = currentId.value
    if (!id) return
    try {
      await putHistory({
        projectId: id,
        undo: history.value.undo,
        redo: history.value.redo,
      })
    } catch {
      /* history is best-effort */
    }
  }

  async function loadHistory(id: string): Promise<void> {
    try {
      const h = await getHistory(id)
      history.value = { undo: h.undo, redo: h.redo }
    } catch {
      history.value = { undo: [], redo: [] }
    }
  }

  function replaceCurrent(next: ArrangementProject, opts?: { recordHistory?: boolean }): void {
    if (opts?.recordHistory !== false) snapshotBeforeChange()
    const i = projects.value.findIndex((x) => x.id === next.id)
    if (i < 0) return
    next.updatedAt = services.clock.now()
    projects.value[i] = next
    void persist()
    refreshQa()
  }

  function mutate(fn: (p: ArrangementProject) => void, opts?: { recordHistory?: boolean }): void {
    const p = current.value
    if (!p) return
    if (opts?.recordHistory !== false) snapshotBeforeChange()
    fn(p)
    touch(p)
    void persist()
    refreshQa()
  }

  function refreshQa(): void {
    const p = current.value
    if (!p) {
      lints.value = []
      return
    }
    const prefs = usePreferencesStore()
    lints.value = runQa(p, {
      voicingProfile: prefs.tagRollPathOptimizePrefs.voicingProfile ?? null,
    })
  }

  watch(
    () => usePreferencesStore().tagRollPathOptimizePrefs.voicingProfile,
    () => {
      if (current.value) refreshQa()
    },
    { deep: true },
  )

  function list(): ArrangementProject[] {
    return [...projects.value].sort((a, b) => b.updatedAt - a.updatedAt)
  }

  async function create(title?: string): Promise<ArrangementProject> {
    await hydrate()
    const now = services.clock.now()
    const p = createEmptyArrangement(title, {
      id: services.idGen.next('arr'),
      now,
    })
    projects.value.push(p)
    currentId.value = p.id
    selectedMelodyId.value = null
    candidates.value = []
    lengthTicks.value = DEFAULT_LENGTH
    history.value = { undo: [], redo: [] }
    await persist()
    refreshQa()
    return p
  }

  /** Load or replace an arrangement document (used by Tag Studio bridge). */
  async function adoptProject(p: ArrangementProject): Promise<ArrangementProject> {
    await hydrate()
    const i = projects.value.findIndex((x) => x.id === p.id)
    if (i >= 0) projects.value[i] = p
    else projects.value.push(p)
    currentId.value = p.id
    selectedMelodyId.value = null
    selectedPillarId.value = null
    skippedHomeRootSpans.value = []
    candidates.value = []
    playheadTick.value = 0
    const maxEnd = Math.max(
      p.melody.reduce((m, n) => Math.max(m, n.startTick + n.durationTicks), 0),
      p.stacks.reduce((m, s) => Math.max(m, s.startTick + s.durationTicks), 0),
    )
    lengthTicks.value = Math.max(DEFAULT_LENGTH, maxEnd + 480 * 4)
    history.value = { undo: [], redo: [] }
    await persist()
    await loadHistory(p.id)
    refreshQa()
    return p
  }

  async function open(id: string): Promise<ArrangementProject | null> {
    await hydrate()
    const p = projects.value.find((x) => x.id === id)
    if (!p) return null
    currentId.value = id
    selectedMelodyId.value = null
    candidates.value = []
    playheadTick.value = 0
    const maxEnd = p.melody.reduce((m, n) => Math.max(m, n.startTick + n.durationTicks), 0)
    lengthTicks.value = Math.max(DEFAULT_LENGTH, maxEnd + 480 * 4)
    await loadHistory(id)
    refreshQa()
    return p
  }

  async function remove(id: string): Promise<void> {
    await hydrate()
    projects.value = projects.value.filter((p) => p.id !== id)
    if (currentId.value === id) currentId.value = null
    if (services.repository.remove) await services.repository.remove(id)
    await persist()
  }

  function setTitle(title: string): void {
    mutate((p) => {
      p.title = title
    })
  }

  function setWizardStep(step: WizardStep): void {
    mutate((p) => {
      p.wizardStep = step
    })
  }

  function nextStep(): void {
    const p = current.value
    if (!p) return
    const i = WIZARD_ORDER.indexOf(p.wizardStep)
    if (i < 0 || i >= WIZARD_ORDER.length - 1) return
    setWizardStep(WIZARD_ORDER[i + 1]!)
  }

  function prevStep(): void {
    const p = current.value
    if (!p) return
    const i = WIZARD_ORDER.indexOf(p.wizardStep)
    if (i <= 0) return
    setWizardStep(WIZARD_ORDER[i - 1]!)
  }

  function setTuningMode(mode: TuningMode): void {
    mutate((p) => {
      p.tuningMode = mode
    })
  }

  function setContestProfile(profile: ContestProfile): void {
    mutate((p) => {
      p.contestProfile = profile
    })
  }
  function setQaConfig(next: ArrangementQaConfig): void {
    mutate((p) => {
      p.qaConfig = normalizeQaConfig(next)
    })
  }
  function setTonality(pc: number): void {
    mutate((p) => {
      p.tonality = ((pc % 12) + 12) % 12
    })
  }

  function selectMelody(id: string | null): void {
    selectedMelodyId.value = id
    refreshCandidates()
  }

  function selectLintTarget(lint: ArrangementLint): void {
    if (lint.noteId) {
      selectedMelodyId.value = lint.noteId
      refreshCandidates()
      return
    }
    if (lint.stackId) {
      const p = current.value
      const stack = p?.stacks.find((s) => s.id === lint.stackId)
      if (!stack || !p) return
      const note = p.melody.find((n) => n.startTick === stack.startTick)
      if (note) {
        selectedMelodyId.value = note.id
        refreshCandidates()
      }
    }
  }

  function undo(): void {
    const p = current.value
    if (!p) return
    const result = undoOnce(p, history.value)
    if (!result) return
    history.value = result.stacks
    const i = projects.value.findIndex((x) => x.id === result.project.id)
    if (i >= 0) projects.value[i] = { ...result.project, updatedAt: services.clock.now() }
    void persist()
    void saveHistory()
    refreshQa()
    refreshCandidates()
  }

  function redo(): void {
    const p = current.value
    if (!p) return
    const result = redoOnce(p, history.value)
    if (!result) return
    history.value = result.stacks
    const i = projects.value.findIndex((x) => x.id === result.project.id)
    if (i >= 0) projects.value[i] = { ...result.project, updatedAt: services.clock.now() }
    void persist()
    void saveHistory()
    refreshQa()
    refreshCandidates()
  }

  function severityForMelody(noteId: string): ArrangementLint['severity'] | null {
    const hits = lints.value.filter((l) => l.noteId === noteId)
    if (hits.some((h) => h.severity === 'error')) return 'error'
    if (hits.some((h) => h.severity === 'warn')) return 'warn'
    if (hits.some((h) => h.severity === 'info')) return 'info'
    return null
  }

  function severityForStack(stackId: string): ArrangementLint['severity'] | null {
    const hits = lints.value.filter((l) => l.stackId === stackId)
    if (hits.some((h) => h.severity === 'error')) return 'error'
    if (hits.some((h) => h.severity === 'warn')) return 'warn'
    if (hits.some((h) => h.severity === 'info')) return 'info'
    return null
  }

  function explainAt(index: number) {
    const c = candidates.value[index]
    return c ? explainCandidate(c) : null
  }

  function pushHistoryCheckpoint(): void {
    snapshotBeforeChange()
  }

  return {
    projects,
    hydrated,
    currentId,
    current,
    selectedMelodyId,
    selectedMelody,
    selectedPillarId,
    selectedPillar,
    candidateTarget,
    softSuggestContext,
    addDurationTicks,
    snapTicks,
    lengthTicks,
    cellW,
    cellH,
    candidates,
    lints,
    qaBadge,
    playheadTick,
    isPlaying,
    stepLabel,
    canUndo,
    canRedo,
    whyOpen,
    selectedWhy,
    orgTips,
    hydrate,
    list,
    create,
    adoptProject,
    open,
    remove,
    setTitle,
    setWizardStep,
    nextStep,
    prevStep,
    setTuningMode,
    setContestProfile,
    setQaConfig,
    setTonality,
    addMelodyNote,
    updateMelodyNote,
    deleteMelodyNote,
    clearMelody,
    inferPillars,
    proposeNextHomeRoot,
    skipProposedPillar,
    clearSkippedHomeRoots,
    skippedHomeRootCount,
    setPillars,
    updatePillar,
    confirmAllPillars,
    selectPillar,
    addPillarAt,
    extendSelectedPillarTo,
    trimSelectedPillarEnd,
    removePillar,
    lockSelectedPillar,
    lockRemaining,
    refreshCandidates,
    setSoftSuggestContext,
    setCandidateTarget,
    applyCandidate,
    applyCounterpartStack,
    autoFillStacks,
    setStacks,
    runQa: runQaNow,
    refreshQa,
    fixLint,
    fixAllSafe,
    labelRoles,
    strengthen,
    polishVoicing,
    pathOptimize,
    finalChecklist,
    howBarbershopFactors,
    setLyric,
    listEmbellishmentSeeds,
    applySwipeSeed,
    downloadMidi,
    downloadMusicXml,
    selectMelody,
    selectLintTarget,
    severityForMelody,
    severityForStack,
    undo,
    redo,
    explainAt,
    pushHistoryCheckpoint,
    persist,
  }
})
