/**
 * @vitest-environment node
 */
import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { createCoachTransportActions } from './useCoachTransportActions'

function baseCtx(overrides: Record<string, unknown> = {}) {
  return {
    guidedStep: ref('home' as const),
    focusTab: ref<'home' | 'now' | 'choose' | 'check' | 'auto' | 'polish'>('home'),
    currentStack: ref(null),
    filteredCandidates: ref([] as never[]),
    stepPillar: vi.fn(),
    stepMelodyNote: vi.fn(),
    stepMoment: vi.fn(),
    stepLint: vi.fn(),
    stepNextGap: vi.fn(),
    stepNextProblem: vi.fn(),
    onProposeNext: vi.fn(),
    onLabelRoles: vi.fn(),
    goChords: vi.fn(),
    applyBest: vi.fn(),
    fixAllSafe: vi.fn(),
    onStrengthen: vi.fn(),
    onPolish: vi.fn(),
    hearPillarRoot: vi.fn(),
    hearCurrentStack: vi.fn(),
    hearCand: vi.fn(),
    ...overrides,
  }
}

describe('createCoachTransportActions', () => {
  it('chords step applies best and switches to choose tab', () => {
    const focusTab = ref<'home' | 'now' | 'choose' | 'check' | 'auto' | 'polish'>('now')
    const applyBest = vi.fn()
    const actions = createCoachTransportActions(
      baseCtx({
        guidedStep: ref('chords'),
        focusTab,
        filteredCandidates: ref([{ rootPc: 0 } as never]),
        applyBest,
      }),
    )
    actions.primary()
    expect(focusTab.value).toBe('choose')
    expect(applyBest).toHaveBeenCalled()
  })

  it('home step continues to chords', () => {
    const goChords = vi.fn()
    const actions = createCoachTransportActions(baseCtx({ goChords }))
    actions.primary()
    expect(goChords).toHaveBeenCalled()
  })

  it('auto step primary runs Polish inversions', () => {
    const onPolish = vi.fn()
    const actions = createCoachTransportActions(
      baseCtx({
        guidedStep: ref('auto'),
        focusTab: ref('auto'),
        onPolish,
      }),
    )
    actions.primary()
    expect(onPolish).toHaveBeenCalled()
  })
})
