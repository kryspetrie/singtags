/**
 * @vitest-environment node
 */
import { computed, ref } from 'vue'
import { describe, expect, it } from 'vitest'
import { useCoachTransport } from './useCoachTransport'

const base = {
  guidedStepLabel: computed(() => 'Pillars'),
  pillarStatus: computed(() => '2/3 locked'),
  momentStatus: computed(() => ''),
  rolesStatus: computed(() => ''),
  checkStatus: computed(() => ''),
  pillarsLen: computed(() => 2),
  melodyLen: computed(() => 4),
  momentsLen: computed(() => 4),
  lintCount: computed(() => 0),
  emptyMomentCount: computed(() => 0),
  canApplyChord: computed(() => false),
  hasStackMidi: computed(() => false),
}

describe('useCoachTransport', () => {
  it('pillars step exposes propose + hear + lock', () => {
    const view = useCoachTransport({
      ...base,
      guidedStep: computed(() => 'pillars' as const),
      repairTour: computed(() => false),
      selectedPil: computed(() => ({ confirmed: false })),
    })
    expect(view.value.primaryLabel).toMatch(/Propose next/)
    expect(view.value.showLock).toBe(true)
    expect(view.value.showSkip).toBe(true)
  })

  it('repair tour uses review label on pillars', () => {
    const repair = ref(true)
    const view = useCoachTransport({
      ...base,
      guidedStep: computed(() => 'pillars' as const),
      repairTour: computed(() => repair.value),
      pillarsLen: computed(() => 0),
      melodyLen: computed(() => 1),
      momentsLen: computed(() => 1),
      selectedPil: computed(() => null),
    })
    expect(view.value.primaryLabel).toBe('Review home roots')
  })

  it('chords step offers Next empty secondary', () => {
    const view = useCoachTransport({
      ...base,
      guidedStep: computed(() => 'chords' as const),
      guidedStepLabel: computed(() => 'Chords'),
      repairTour: computed(() => false),
      emptyMomentCount: computed(() => 2),
      selectedPil: computed(() => null),
      canApplyChord: computed(() => true),
    })
    expect(view.value.secondaryLabel).toBe('Next empty')
    expect(view.value.secondaryDisabled).toBe(false)
  })
})
