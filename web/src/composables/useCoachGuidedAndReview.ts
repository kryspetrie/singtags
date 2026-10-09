/**
 * Guided rail — Coach workflow steps + polish helpers.
 */
import { computed, onUnmounted, ref, watch } from 'vue'
import {
  focusTabForGuidedStep,
  labelForGuidedStep,
  modeForGuidedStep,
  normalizeGuidedStepId,
  resolveGuidedStepWithLints,
  tipForGuidedStep,
  wizardStepForGuided,
  type GuidedStepId,
} from '../application/arranging/GuidedSteps'
import type {
  PathOptimizeMode,
  PathOptimizeReport,
  PathOptimizeScope,
} from '../application/arranging/PathOptimize'
import {
  bindCoachHighlightChannel,
  setCoachHighlight,
} from '../lib/arranging/coachHighlight'
import { subscribeCoachUiIntent } from '../lib/arranging/coachUiIntent'
import type { CoachFocusTab } from '../domain/arranging/nextCoachAction'
import type { CoachUiMode } from '../domain/arranging/coachTips'
import { useArrangementStore } from '../stores/arrangement'
import { usePreferencesStore } from '../stores/preferences'
import { useTagRollStore } from '../stores/tagRoll'
import type { ContestProfile, TuningMode } from '../domain/arranging/types'
import {
  toggleQaGroup,
  type QaCheckGroupId,
} from '../domain/arranging/coachConfig'

export function useCoachGuidedAndReview(opts: {
  mode: { value: CoachUiMode }
  focusTab: { value: CoachFocusTab }
  phase: { value: 'pillars' | 'walk' }
  pushToRoll: () => void
  /** Prefer harmonic-moment count when available (held-post aware). */
  momentsLen?: { value: number }
  /** Selected Tag Studio notes → Optimize selection scope. */
  selectionTickRange?: { value: { startTick: number; endTick: number } | null }
  /** Active Coach / Harmonize moment tick. */
  currentMomentTick?: { value: number | null }
}) {
  const arrStore = useArrangementStore()
  const tagStore = useTagRollStore()
  const prefs = usePreferencesStore()
  const guidedStepOverride = ref<GuidedStepId | null>(
    normalizeGuidedStepId(prefs.tagRollCoachGuidedStep),
  )
  let unbindHl: (() => void) | null = null

  const guidedStep = computed((): GuidedStepId => {
    if (guidedStepOverride.value) return guidedStepOverride.value
    const errors = arrStore.lints.filter((l) => l.severity === 'error').length
    return resolveGuidedStepWithLints(arrStore.current, errors, {
      momentsLen: opts.momentsLen?.value,
    })
  })

  const guidedTip = computed(() => tipForGuidedStep(guidedStep.value))
  const guidedStepLabel = computed(() => labelForGuidedStep(guidedStep.value))

  function applyStepChrome(id: GuidedStepId): void {
    opts.focusTab.value = focusTabForGuidedStep(id)
    opts.mode.value = modeForGuidedStep(id)
    // Pillar propose/lock still uses dock phase; rail no longer has a Pillars page.
    opts.phase.value = 'walk'
  }

  watch(
    guidedStep,
    (id) => {
      applyStepChrome(id)
    },
    { immediate: true },
  )

  const checklist = computed(() => arrStore.finalChecklist())
  const howFactors = computed(() => arrStore.howBarbershopFactors())
  const orgTip = computed(() => {
    const tip = arrStore.orgTips[0]
    return tip ? tip.body : null
  })
  const autoStatus = ref<string | null>(null)
  const lastPathReport = ref<PathOptimizeReport | null>(null)
  const optimizeBusy = ref(false)
  const optimizeProgressFraction = ref(0)
  const optimizeProgressLabel = ref<string | null>(null)
  const lastOptimizeArgs = ref<{
    mode: PathOptimizeMode
    risk: number
    cadenceBias: 'off' | 'moderate' | 'strong'
    taste: 'classic' | 'circle' | 'busy'
    maxPasses: number
    stopEarly: boolean
    allowWorsen: boolean
  }>({
    mode: 'full',
    risk: 0.2,
    cadenceBias: 'moderate',
    taste: 'classic',
    maxPasses: 12,
    stopEarly: true,
    allowWorsen: false,
  })
  const canRunPathOptimize = computed(() => {
    const p = arrStore.current
    if (!p) return false
    return p.melody.length > 0 && p.pillars.length > 0
  })
  const hasOptimizeSelection = computed(() => !!opts.selectionTickRange?.value)

  function resolveOptimizeScope(): PathOptimizeScope {
    const r = opts.selectionTickRange?.value
    if (r) return { kind: 'range', startTick: r.startTick, endTick: r.endTick }
    return { kind: 'whole' }
  }

  function stageTitle(stage: string): string {
    if (stage === 'fill') return 'Fill'
    if (stage === 'rechord') return 'Rechord'
    if (stage === 'revoice') return 'Revoice'
    if (stage === 'probe') return 'Checking alternates'
    return stage
  }

  function selectMelodyNote(id: string): void {
    const note = arrStore.current?.melody.find((m) => m.id === id)
    if (!note) return
    arrStore.selectMelody(id)
    arrStore.setCandidateTarget(note)
    tagStore.setPlayheadTick(note.startTick, { snap: false })
    pulseHighlight(note.startTick, 'moment')
    if (tagStore.assignNoteRolesActive) {
      const tag = tagStore.current
      const mid =
        tag?.view.melodyPartId ??
        tag?.parts.find((p) => p.name === 'Lead')?.id ??
        null
      const hit = tag?.notes.find(
        (n) =>
          (!mid || n.partId === mid) &&
          n.startTick === note.startTick &&
          n.midi === note.midi,
      )
      if (hit) tagStore.selectNotes([hit.id])
      else tagStore.selectNotes([])
    } else {
      // Overlay / playhead only — do not steal Tag Studio edit selection.
      tagStore.selectNotes([])
    }
  }

  function stepMelodyNote(dir: -1 | 1): void {
    const list = arrStore.current?.melody ?? []
    const n = list.length
    if (!n) return
    const cur = list.findIndex((m) => m.id === arrStore.selectedMelodyId)
    const next = cur < 0 ? (dir > 0 ? 0 : n - 1) : (cur + dir + n) % n
    selectMelodyNote(list[next]!.id)
  }

  function setMelodyNoteRole(id: string, role: 'pmn' | 'smn' | 'unknown'): void {
    arrStore.updateMelodyNote(id, { role })
    arrStore.runQa()
    const tag = tagStore.current
    const mel = arrStore.current?.melody.find((m) => m.id === id)
    if (!tag || !mel) return
    const mid =
      tag.view.melodyPartId ?? tag.parts.find((p) => p.name === 'Lead')?.id ?? null
    const note = tag.notes.find(
      (n) =>
        (!mid || n.partId === mid) &&
        n.startTick === mel.startTick &&
        n.midi === mel.midi,
    )
    if (note) tagStore.setNoteRole(note.id, role)
  }

  function selectGuidedStep(id: GuidedStepId, optsExtra?: { persist?: boolean }): void {
    guidedStepOverride.value = id
    if (optsExtra?.persist !== false) prefs.setTagRollCoachGuidedStep(id)
    applyStepChrome(id)
    const p = arrStore.current
    if (p) {
      const wiz = wizardStepForGuided(id)
      if (p.wizardStep !== wiz) arrStore.setWizardStep(wiz)
    }
  }

  function onLabelRoles(): void {
    arrStore.labelRoles(true)
    arrStore.runQa()
    opts.pushToRoll()
    prefs.openTagRollBottomLane('coach')
    const mel = arrStore.current?.melody ?? []
    const pick = mel.find((m) => m.id === arrStore.selectedMelodyId) ?? mel[0]
    if (pick) selectMelodyNote(pick.id)
  }

  async function onPathOptimize(args: {
    mode: PathOptimizeMode
    risk: number
    cadenceBias: 'off' | 'moderate' | 'strong'
    taste?: 'classic' | 'circle' | 'busy'
    maxPasses?: number
    stopEarly?: boolean
    allowWorsen?: boolean
    explore?: boolean
  }): Promise<void> {
    if (optimizeBusy.value) return
    if (!canRunPathOptimize.value) {
      autoStatus.value = 'Optimize needs melody and Sketch pillars first.'
      return
    }
    // Transport / repeat same mode → Run again (reseed). Explicit explore from panel wins.
    const runAgain =
      args.explore === true ||
      (args.explore !== false &&
        !!lastPathReport.value &&
        lastPathReport.value.mode === args.mode)
    const taste = args.taste ?? 'classic'
    lastOptimizeArgs.value = {
      mode: args.mode,
      risk: args.risk,
      cadenceBias: args.cadenceBias,
      taste,
      maxPasses: args.maxPasses ?? 12,
      stopEarly: args.stopEarly !== false,
      allowWorsen: args.allowWorsen === true,
    }
    const scope = resolveOptimizeScope()
    optimizeBusy.value = true
    optimizeProgressFraction.value = 0
    optimizeProgressLabel.value = 'Starting…'
    autoStatus.value = scope.kind === 'range' ? 'Optimizing selection…' : 'Optimizing whole song…'
    try {
      const report = await arrStore.pathOptimize({
        mode: args.mode,
        scope,
        weights: {
          risk: args.risk,
          cadenceBias: args.cadenceBias,
          taste,
        },
        maxPasses: args.maxPasses ?? 12,
        stopEarly: args.stopEarly !== false,
        allowWorsen: args.allowWorsen === true,
        explore: runAgain,
        seed: runAgain ? Date.now() : undefined,
        onProgress: (p) => {
          const within = p.maxPasses > 0 ? p.pass / p.maxPasses : 1
          optimizeProgressFraction.value = Math.min(
            1,
            (p.stageIndex + within) / Math.max(1, p.stageCount),
          )
          optimizeProgressLabel.value =
            p.stage === 'probe'
              ? 'Checking alternates…'
              : p.stage === 'revoice'
                ? 'Revoice'
                : `${stageTitle(p.stage)} · pass ${p.pass}/${p.maxPasses}`
        },
      })
      if (!report) {
        autoStatus.value = 'No arrangement loaded.'
        return
      }
      lastPathReport.value = report
      arrStore.runQa()
      if (report.applied) opts.pushToRoll()
      autoStatus.value = runAgain ? `Run again: ${report.message}` : report.message
    } finally {
      optimizeBusy.value = false
      optimizeProgressFraction.value = 0
      optimizeProgressLabel.value = null
    }
  }

  /** Transport primary — reuse last panel settings (Run again if same mode). */
  function onPathOptimizeTransport(): void {
    onPathOptimize({ ...lastOptimizeArgs.value })
  }

  function setContestProfile(profile: ContestProfile): void {
    arrStore.setContestProfile(profile)
    arrStore.runQa()
  }

  function setTuningMode(mode: TuningMode): void {
    arrStore.setTuningMode(mode)
  }

  function setQaGroup(groupId: QaCheckGroupId, enabled: boolean): void {
    const p = arrStore.current
    if (!p) return
    arrStore.setQaConfig(toggleQaGroup(p.qaConfig, groupId, enabled))
    arrStore.runQa()
  }

  function pulseHighlight(tick: number, kind: 'moment' | 'issue' | 'pillar' | 'gap'): void {
    setCoachHighlight({
      tick,
      kind,
      projectId: tagStore.current?.id,
    })
  }

  watch(
    () => tagStore.current?.id,
    (id) => {
      unbindHl?.()
      unbindHl = id ? bindCoachHighlightChannel(id) : null
    },
    { immediate: true },
  )

  const unbindUiIntent = subscribeCoachUiIntent((intent) => {
    if (intent.type === 'openCheck') selectGuidedStep('check')
    else if (intent.type === 'openChoose') selectGuidedStep('chords', { persist: false })
  })

  onUnmounted(() => {
    unbindHl?.()
    unbindUiIntent()
  })

  return {
    guidedStep,
    guidedTip,
    guidedStepLabel,
    checklist,
    howFactors,
    orgTip,
    autoStatus,
    lastPathReport,
    canRunPathOptimize,
    hasOptimizeSelection,
    optimizeBusy,
    optimizeProgressFraction,
    optimizeProgressLabel,
    selectGuidedStep,
    selectMelodyNote,
    stepMelodyNote,
    setMelodyNoteRole,
    onLabelRoles,
    onPathOptimize,
    onPathOptimizeTransport,
    setContestProfile,
    setTuningMode,
    setQaGroup,
    pulseHighlight,
  }
}
