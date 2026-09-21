/**
 * Guided rail + review polish helpers for ArrangingCoachDock.
 */
import { computed, onUnmounted, ref, watch } from 'vue'
import {
  focusTabForGuidedStep,
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
import { useTagRollStore } from '../stores/tagRoll'
import type { ContestProfile, TuningMode } from '../domain/arranging/types'

export function useCoachGuidedAndReview(opts: {
  mode: { value: CoachUiMode }
  focusTab: { value: CoachFocusTab }
  phase: { value: 'pillars' | 'walk' }
  pushToRoll: () => void
}) {
  const arrStore = useArrangementStore()
  const tagStore = useTagRollStore()
  const guidedStepOverride = ref<GuidedStepId | null>(null)
  let unbindHl: (() => void) | null = null

  const guidedStep = computed((): GuidedStepId => {
    if (guidedStepOverride.value) return guidedStepOverride.value
    const errors = arrStore.lints.filter((l) => l.severity === 'error').length
    return resolveGuidedStepWithLints(arrStore.current, errors)
  })

  const guidedTip = computed(() => tipForGuidedStep(guidedStep.value))

  const showStepRail = computed(() => opts.mode.value === 'guided')

  const checklist = computed(() => arrStore.finalChecklist())
  const howFactors = computed(() => arrStore.howBarbershopFactors())
  const orgTip = computed(() => {
    const tip = arrStore.orgTips[0]
    return tip ? tip.body : null
  })
  const musicXmlAvailable = computed(() => true)

  function selectGuidedStep(id: GuidedStepId): void {
    guidedStepOverride.value = id
    opts.focusTab.value = focusTabForGuidedStep(id)
    opts.phase.value = id === 'chords' || id === 'review' ? 'walk' : 'pillars'
    const p = arrStore.current
    if (p) {
      // Soft map wizard step without inventing VI–IX chrome.
      const wiz = wizardStepForGuided(id)
      if (p.wizardStep !== wiz) {
        arrStore.setWizardStep(wiz)
      }
    }
  }

  function onLabelRoles(): void {
    arrStore.labelRoles(true)
    arrStore.runQa()
    opts.pushToRoll()
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
    showStepRail,
    checklist,
    howFactors,
    orgTip,
    musicXmlAvailable,
    selectGuidedStep,
    onLabelRoles,
    onStrengthen,
    onPolish,
    onApplySwipe,
    setContestProfile,
    setTuningMode,
    exportMidi,
    exportMusicXml,
    pulseHighlight,
  }
}
