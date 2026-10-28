/**
 * Fill skips the median-window pass when the switch is off.
 * @vitest-environment node
 */
import { describe, expect, it, vi } from 'vitest'
import { createSequentialIdGenerator } from '../../adapters/system/systemServices'
import { completeFromPartsToNotes } from './completeFromParts'
import { createEmptyTagRollProject } from './normalize'
import { TAG_ROLL_PPQ } from './types'

const state = vi.hoisted(() => ({ on: true, calls: 0 }))

vi.mock('./medianJumpPrefs', () => ({
  medianJumpOnFill: () => state.on,
}))

vi.mock('./medianJumpFill', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./medianJumpFill')>()
  return {
    ...actual,
    smoothFilledMedianWindow: (
      opts: Parameters<typeof actual.smoothFilledMedianWindow>[0],
    ) => {
      state.calls += 1
      return actual.smoothFilledMedianWindow(opts)
    },
  }
})

describe('fill median-jump switch', () => {
  it('runs the pass only while the switch is on', () => {
    const project = createEmptyTagRollProject({ title: 'switch' })
    const lead = project.parts.find((p) => p.name === 'Lead')!
    const bass = project.parts.find((p) => p.name === 'Bass')!
    const q = TAG_ROLL_PPQ
    project.notes = [
      { id: 'm1', partId: lead.id, midi: 64, startTick: 0, durationTicks: q },
      { id: 'b1', partId: bass.id, midi: 48, startTick: 0, durationTicks: q },
    ]
    state.on = false
    state.calls = 0
    completeFromPartsToNotes({
      project,
      profile: 'sai11',
      idGen: createSequentialIdGenerator(1),
    })
    expect(state.calls).toBe(0)

    state.on = true
    completeFromPartsToNotes({
      project,
      profile: 'sai11',
      idGen: createSequentialIdGenerator(1),
    })
    expect(state.calls).toBe(1)
  })
})
