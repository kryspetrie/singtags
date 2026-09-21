import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { getArrangingServices } from '../composition/arranging'
import {
  applyAllSafeFixes,
  applyCandidateToProject,
  applyCounterpart,
  applyFix,
  assessFinal,
  assessHowBarbershop,
  autoHarmonize,
  autoLabelMelodyRoles,
  canApplyFix,
  confirmAllPillars as confirmAllPillarsUc,
  exportMidi,
  exportMusicXml,
  inferPillars as inferPillarsUc,
  listCandidatesForNote,
  lintSummary,
  polishArrangementVoicing,
  runQa,
  strengthenArrangement,
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
import { syncStackAfterMelodyEdit } from '../domain/arranging/syncStacks'
import {
  applyEmbellishmentSeed,
  findEmbellishmentSeeds,
  melodyWithLyric,
} from '../domain/arranging/embellishments'
import { tipsForProfile } from '../domain/arranging/orgTips'
import { DEFAULT_LENGTH, DEFAULT_SNAP, snapTick } from '../domain/arranging/snap'
import { getHistory, putHistory } from '../offline/arrangingDb'
import {
  createEmptyArrangement,
  WIZARD_ORDER,
  WIZARD_STEP_LABELS,
  type ArrangementProject,
  type ChordStack,
  type ContestProfile,
  type MelodyEvent,
  type Pillar,
  type TuningMode,
  type WizardStep,
} from '../domain/arranging/types'
import {
  addPillarAtTick,
  deletePillar,
  extendPillarToCover,
  lockPillar,
  lockRemainingPillars,
  trimPillarEnd,
} from '../domain/arranging/pillars'
import { downloadMidiBytes } from '../adapters/arranging/midi/arrangementMidiExporter'

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
  /** When set, candidates/apply use this event (harmonic moment) instead of selected melody onset. */
  const candidateTarget = ref<MelodyEvent | null>(null)
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
    lints.value = p ? runQa(p) : []
  }

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

  function setTonality(pc: number): void {
    mutate((p) => {
      p.tonality = ((pc % 12) + 12) % 12
    })
  }

  function addMelodyNote(partial: {
    midi: number
    startTick: number
    durationTicks?: number
    role?: MelodyEvent['role']
    lyric?: string
  }): MelodyEvent | null {
    const p = current.value
    if (!p) return null
    snapshotBeforeChange()
    const startTick = snapTick(partial.startTick, snapTicks.value)
    const durationTicks = partial.durationTicks ?? addDurationTicks.value
    const note: MelodyEvent = {
      id: services.idGen.next('mel'),
      midi: partial.midi,
      startTick,
      durationTicks,
      role: partial.role ?? 'unknown',
      lyric: partial.lyric,
    }
    p.melody.push(note)
    const end = startTick + durationTicks
    if (end + 480 * 4 > lengthTicks.value) {
      lengthTicks.value = Math.ceil((end + 480 * 4) / (480 * 4)) * (480 * 4)
    }
    selectedMelodyId.value = note.id
    touch(p)
    void persist()
    refreshQa()
    return note
  }

  function updateMelodyNote(
    id: string,
    patch: Partial<Pick<MelodyEvent, 'midi' | 'startTick' | 'durationTicks' | 'role' | 'lyric'>>,
    opts?: { recordHistory?: boolean },
  ): void {
    const p = current.value
    if (!p) return
    const prev = p.melody.find((x) => x.id === id)
    if (!prev) return
    if (opts?.recordHistory !== false) snapshotBeforeChange()
    const next = { ...prev }
    if (patch.midi != null) next.midi = patch.midi
    if (patch.startTick != null) next.startTick = snapTick(patch.startTick, snapTicks.value)
    if (patch.durationTicks != null) {
      next.durationTicks = Math.max(snapTicks.value, patch.durationTicks)
    }
    if (patch.role != null) next.role = patch.role
    if (patch.lyric != null) next.lyric = patch.lyric
    p.melody = p.melody.map((n) => (n.id === id ? next : n))
    p.stacks = syncStackAfterMelodyEdit(
      { ...p, melody: p.melody },
      prev,
      next,
      { idGen: services.idGen, rankerDeps: services.rankerDeps },
    )
    touch(p)
    void persist()
    refreshQa()
  }

  function setLyric(noteId: string, lyric: string): void {
    mutate((p) => {
      p.melody = melodyWithLyric(p.melody, noteId, lyric)
    })
  }

  function listEmbellishmentSeeds() {
    const p = current.value
    return p ? findEmbellishmentSeeds(p) : []
  }

  function applySwipeSeed(seedId: string): boolean {
    const p = current.value
    if (!p) return false
    const seed = findEmbellishmentSeeds(p).find((s) => s.id === seedId)
    if (!seed?.suggestedStack) return false
    replaceCurrent(applyEmbellishmentSeed(p, seed))
    return true
  }

  const orgTips = computed(() => {
    const profile = current.value?.contestProfile ?? 'sai11'
    return tipsForProfile(profile, 'ttbb')
  })

  function deleteMelodyNote(id: string): void {
    mutate((p) => {
      p.melody = p.melody.filter((n) => n.id !== id)
      p.stacks = p.stacks.filter((s) => p.melody.some((n) => n.startTick === s.startTick))
    })
    if (selectedMelodyId.value === id) {
      selectedMelodyId.value = null
      candidates.value = []
    }
  }

  function clearMelody(): void {
    mutate((p) => {
      p.melody = []
      p.pillars = []
      p.stacks = []
    })
    selectedMelodyId.value = null
    selectedPillarId.value = null
    candidates.value = []
  }

  function inferPillars(): void {
    const p = current.value
    if (!p) return
    const pillars = inferPillarsUc(p, { idGen: services.idGen })
    replaceCurrent({ ...p, pillars, wizardStep: 'step1_roots' })
    selectedPillarId.value = pillars.find((x) => !x.confirmed)?.id ?? pillars[0]?.id ?? null
  }

  function setPillars(pillars: Pillar[]): void {
    mutate((p) => {
      p.pillars = pillars
    })
  }

  function updatePillar(id: string, patch: Partial<Pillar>): void {
    mutate((p) => {
      const pil = p.pillars.find((x) => x.id === id)
      if (!pil) return
      Object.assign(pil, patch)
    })
  }

  function confirmAllPillars(): void {
    const p = current.value
    if (!p) return
    replaceCurrent(confirmAllPillarsUc(p))
  }

  function selectPillar(id: string | null): void {
    selectedPillarId.value = id
  }

  function addPillarAt(tick: number, rootPc?: number): void {
    const p = current.value
    if (!p) return
    const root = rootPc ?? ((p.tonality % 12) + 12) % 12
    const pillars = addPillarAtTick(p.pillars, tick, {
      rootPc: root,
      id: services.idGen.next('pil'),
    })
    replaceCurrent({ ...p, pillars, wizardStep: p.wizardStep === 'melody' ? 'step1_roots' : p.wizardStep })
    const hit = pillars.find((x) => x.startTick <= tick && tick < x.endTick)
    selectedPillarId.value = hit?.id ?? null
  }

  function extendSelectedPillarTo(tick: number): void {
    const p = current.value
    const id = selectedPillarId.value
    if (!p || !id) return
    replaceCurrent({ ...p, pillars: extendPillarToCover(p.pillars, id, tick) })
  }

  function trimSelectedPillarEnd(endTick: number): void {
    const p = current.value
    const id = selectedPillarId.value
    if (!p || !id) return
    replaceCurrent({ ...p, pillars: trimPillarEnd(p.pillars, id, endTick) })
  }

  function removePillar(id: string): void {
    const p = current.value
    if (!p) return
    replaceCurrent({ ...p, pillars: deletePillar(p.pillars, id) })
    if (selectedPillarId.value === id) selectedPillarId.value = null
  }

  function lockSelectedPillar(): void {
    const p = current.value
    const id = selectedPillarId.value
    if (!p || !id) return
    const pillars = lockPillar(p.pillars, id)
    const step = pillars.some((x) => x.confirmed) ? 'step2_confirm' : p.wizardStep
    replaceCurrent({ ...p, pillars, wizardStep: step })
  }

  function lockRemaining(): void {
    const p = current.value
    if (!p) return
    replaceCurrent({ ...p, pillars: lockRemainingPillars(p.pillars), wizardStep: 'step2_confirm' })
  }

  function refreshCandidates(): void {
    const p = current.value
    const note = candidateTarget.value ?? selectedMelody.value
    if (!p || !note) {
      candidates.value = []
      return
    }
    candidates.value = listCandidatesForNote(
      p,
      note,
      {
        preferScf: p.wizardStep === 'step5_smn_scf' || note.role === 'smn',
        limit: 16,
      },
      { rankerDeps: services.rankerDeps, idGen: services.idGen },
    )
  }

  function setCandidateTarget(note: MelodyEvent | null): void {
    candidateTarget.value = note
    refreshCandidates()
  }

  function applyCandidate(c: HarmonizeCandidate): void {
    const p = current.value
    const note = candidateTarget.value ?? selectedMelody.value
    if (!p || !note) return
    replaceCurrent(
      applyCandidateToProject(p, note, c, {
        idGen: services.idGen,
        rankerDeps: services.rankerDeps,
      }),
    )
  }

  function applyCounterpartStack(stackId: string): boolean {
    const p = current.value
    if (!p) return false
    const next = applyCounterpart(p, stackId)
    if (!next) return false
    replaceCurrent(next)
    return true
  }

  function autoFillStacks(preferScfForSmn = false): void {
    const p = current.value
    if (!p) return
    const stacks = autoHarmonize(
      p,
      { preferScfForSmn },
      { idGen: services.idGen, rankerDeps: services.rankerDeps },
    )
    replaceCurrent({ ...p, stacks })
  }

  function setStacks(stacks: ChordStack[]): void {
    mutate((p) => {
      p.stacks = stacks
    })
  }

  function runQaNow(): ArrangementLint[] {
    refreshQa()
    return lints.value
  }

  function fixLint(lint: ArrangementLint, opts?: { confirmDestructive?: boolean }): boolean {
    const p = current.value
    if (!p || !canApplyFix(p, lint, services.fixRegistry)) return false
    const next = applyFix(p, lint, services.fixRegistry, {
      idGen: services.idGen,
      rankerDeps: services.rankerDeps,
      confirmDestructive:
        opts?.confirmDestructive ??
        (lint.ruleId === 'key-suggestion' || lint.ruleId === 'lead-range'),
    })
    if (!next) return false
    replaceCurrent(next)
    refreshCandidates()
    return true
  }

  function fixAllSafe(): number {
    const p = current.value
    if (!p) return 0
    const { project, applied } = applyAllSafeFixes(p, lints.value, services.fixRegistry, {
      idGen: services.idGen,
      rankerDeps: services.rankerDeps,
    })
    if (applied.length) replaceCurrent(project)
    refreshCandidates()
    return applied.length
  }

  function labelRoles(force = false): void {
    const p = current.value
    if (!p) return
    replaceCurrent(autoLabelMelodyRoles(p, { force }))
    refreshCandidates()
  }

  function strengthen(): void {
    const p = current.value
    if (!p) return
    replaceCurrent(
      strengthenArrangement(p, {
        idGen: services.idGen,
        rankerDeps: services.rankerDeps,
      }),
    )
    refreshCandidates()
  }

  function polishVoicing(): number {
    const p = current.value
    if (!p) return 0
    const { project, applied } = polishArrangementVoicing(p, { registry: services.fixRegistry })
    if (applied.length) replaceCurrent(project)
    refreshCandidates()
    return applied.length
  }
  function finalChecklist() {
    return current.value ? assessFinal(current.value) : { ready: false, items: [] }
  }
  function howBarbershopFactors() {
    return current.value ? assessHowBarbershop(current.value).factors : []
  }

  function downloadMidi(justIntonation = false): boolean {
    const p = current.value
    if (!p) return false
    const result = exportMidi(p, services.midiExporter, { justIntonation, blockOnErrors: true })
    if (!result.ok) return false
    downloadMidiBytes(result.bytes, p.title)
    return true
  }

  function downloadMusicXml(): boolean {
    const p = current.value
    if (!p || !services.musicXmlExporter) return false
    const result = exportMusicXml(p, services.musicXmlExporter, { blockOnErrors: true })
    if (!result.ok) return false
    const blob = new Blob([result.xml], { type: 'application/vnd.recordare.musicxml+xml' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${(p.title || 'arrangement').replace(/[^\w.-]+/g, '_')}.musicxml`
    a.click()
    URL.revokeObjectURL(a.href)
    return true
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

  const stepLabel = computed(() =>
    current.value ? WIZARD_STEP_LABELS[current.value.wizardStep] : '',
  )

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
    setTonality,
    addMelodyNote,
    updateMelodyNote,
    deleteMelodyNote,
    clearMelody,
    inferPillars,
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
