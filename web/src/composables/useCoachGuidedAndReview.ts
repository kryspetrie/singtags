/**
 * Guided rail — Coach workflow steps + polish helpers.
 */
import { computed, onUnmounted, ref, watch } from 'vue'
import {
  focusTabForGuidedStep,
  labelForGuidedStep,
  modeForGuidedStep,
  resolveGuidedStepWithLints,
  tipForGuidedStep,
  wizardStepForGuided,
  type GuidedStepId,
} from '../application/arranging/GuidedSteps'
import {
  bindCoachHighlightChannel,
  setCoachHighlight,
} from '../lib/arranging/coachHighlight'
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
}) {
  const arrStore = useArrangementStore()
  const tagStore = useTagRollStore()
  const prefs = usePreferencesStore()
  const guidedStepOverride = ref<GuidedStepId | null>(null)
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
    opts.phase.value = id === 'pillars' || id === 'roles' ? 'pillars' : 'walk'
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
  const musicXmlAvailable = computed(() => true)

  function selectMelodyNote(id: string): void {
    const note = arrStore.current?.melody.find((m) => m.id === id)
    if (!note) return
    arrStore.selectMelody(id)
    arrStore.setCandidateTarget(note)
    // Overlay / playhead only — do not steal Tag Studio edit selection.
    tagStore.selectNotes([])
    tagStore.setPlayheadTick(note.startTick, { snap: false })
    pulseHighlight(note.startTick, 'moment')
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
  }

  function selectGuidedStep(id: GuidedStepId): void {
    guidedStepOverride.value = id
    applyStepChrome(id)
    const p = arrStore.current
    if (p) {
      const wiz = wizardStepForGuided(id)
      if (p.wizardStep !== wiz) arrStore.setWizardStep(wiz)
    }
    if (id === 'roles') {
      prefs.openTagRollBottomLane('coach')
      const mel = p?.melody ?? []
      const pick =
        mel.find((m) => m.role === 'unknown') ??
        mel.find((m) => m.id === arrStore.selectedMelodyId) ??
        mel[0]
      if (pick) selectMelodyNote(pick.id)
    }
    if (id === 'pillars') {
      prefs.openTagRollBottomLane('coach')
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

  function onStrengthen(): void {
    arrStore.strengthen()
    arrStore.runQa()
    opts.pushToRoll()
  }

  function onPolish(): void {
    arrStore.polishVoicing()
    arrStore.runQa()
    opts.pushToRoll()
  }

  function onApplySwipe(): void {
    const seed = arrStore.listEmbellishmentSeeds()[0]
    if (!seed) return
    arrStore.applySwipeSeed(seed.id)
    arrStore.runQa()
    opts.pushToRoll()
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

  function exportMidi(): void {
    arrStore.downloadMidi(arrStore.current?.tuningMode === 'just')
  }

  function exportMusicXml(): void {
    arrStore.downloadMusicXml()
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

  onUnmounted(() => unbindHl?.())

  return {
    guidedStep,
    guidedTip,
    guidedStepLabel,
    checklist,
    howFactors,
    orgTip,
    musicXmlAvailable,
    selectGuidedStep,
    selectMelodyNote,
    stepMelodyNote,
    setMelodyNoteRole,
    onLabelRoles,
    onStrengthen,
    onPolish,
    onApplySwipe,
    setContestProfile,
    setTuningMode,
    setQaGroup,
    exportMidi,
    exportMusicXml,
    pulseHighlight,
  }
}
