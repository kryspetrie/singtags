/**
 * @vitest-environment node
 */
import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { createCoachTransportActions } from './useCoachTransportActions'

describe('createCoachTransportActions', () => {
  it('chords step applies best and switches to choose tab', () => {
    const focusTab = ref<'home' | 'now' | 'choose' | 'check' | 'polish'>('now')
    const applyBest = vi.fn()
    const actions = createCoachTransportActions({
      guidedStep: ref('chords'),
      focusTab,
      currentStack: ref(null),
      filteredCandidates: ref([{ rootPc: 0 } as never]),
      stepPillar: vi.fn(),
      stepMelodyNote: vi.fn(),
      stepMoment: vi.fn(),
      stepLint: vi.fn(),
      stepNextGap: vi.fn(),
      stepNextProblem: vi.fn(),
      onProposeNext: vi.fn(),
      onLabelRoles: vi.fn(),
      goChords: vi.fn(),
      applyBest,
      fixAllSafe: vi.fn(),
      onStrengthen: vi.fn(),
      hearPillarRoot: vi.fn(),
      hearCurrentStack: vi.fn(),
      hearCand: vi.fn(),
    })
    actions.primary()
    expect(focusTab.value).toBe('choose')
    expect(applyBest).toHaveBeenCalled()
  })

  it('home step continues to chords', () => {
    const goChords = vi.fn()
    const actions = createCoachTransportActions({
      guidedStep: ref('home'),
      focusTab: ref('home'),
      currentStack: ref(null),
      filteredCandidates: ref([]),
      stepPillar: vi.fn(),
      stepMelodyNote: vi.fn(),
      stepMoment: vi.fn(),
      stepLint: vi.fn(),
      stepNextGap: vi.fn(),
      stepNextProblem: vi.fn(),
      onProposeNext: vi.fn(),
      onLabelRoles: vi.fn(),
      goChords,
      applyBest: vi.fn(),
      fixAllSafe: vi.fn(),
      onStrengthen: vi.fn(),
      hearPillarRoot: vi.fn(),
      hearCurrentStack: vi.fn(),
      hearCand: vi.fn(),
    })
    actions.primary()
    expect(goChords).toHaveBeenCalled()
  })
})
