/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { addPillarAtTick } from './pillars'
import { nextHomeRootProposal } from './proposePillarAt'
import { createEmptyArrangement } from './types'

describe('guided home-root flow (domain)', () => {
  it('propose then add creates one inferred draft pillar', () => {
    const p = createEmptyArrangement()
    p.melody = [{ id: 'm', midi: 60, startTick: 0, durationTicks: 480, role: 'pmn' }]
    const proposal = nextHomeRootProposal({
      melody: p.melody,
      pillars: p.pillars,
      tonality: p.tonality,
      cursorTick: 0,
    })
    expect(proposal).not.toBeNull()
    const pillars = addPillarAtTick(p.pillars, proposal!.startTick, {
      rootPc: proposal!.rootPc,
      endTick: proposal!.endTick,
      id: 'pil-1',
      source: 'inferred',
    })
    expect(pillars).toHaveLength(1)
    expect(pillars[0]!.confirmed).toBe(false)
    expect(pillars[0]!.source).toBe('inferred')
  })
})
