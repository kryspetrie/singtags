/**
 * @vitest-environment node
 */
import { computed, ref } from 'vue'
import { describe, expect, it } from 'vitest'
import { useCoachTransport } from './useCoachTransport'

const base = {
  guidedStepLabel: computed(() => 'Home'),
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
  it('home step offers Start Chords', () => {
    const view = useCoachTransport({
      ...base,
      guidedStep: computed(() => 'home' as const),
      repairTour: computed(() => false),
      selectedPil: computed(() => null),
    })
    expect(view.value.primaryLabel).toBe('Start Chords')
    expect(view.value.showNav).toBe(false)
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

  it('auto step primaries Polish inversions; polish has no primary CTA', () => {
    const auto = useCoachTransport({
      ...base,
      guidedStep: computed(() => 'auto' as const),
      guidedStepLabel: computed(() => 'Auto'),
      repairTour: computed(() => false),
      selectedPil: computed(() => null),
    })
    expect(auto.value.primaryLabel).toBe('Polish inversions')

    const polish = useCoachTransport({
      ...base,
      guidedStep: computed(() => 'polish' as const),
      guidedStepLabel: computed(() => 'Polish'),
      repairTour: computed(() => false),
      selectedPil: computed(() => null),
    })
    expect(polish.value.primaryLabel).toBe('')
    expect(polish.value.primaryDisabled).toBe(true)
  })
})
