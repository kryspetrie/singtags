import { describe, expect, it } from 'vitest'
import { createEmptyArrangement } from './types'
import {
  applyDocumentSnapshot,
  captureDocumentSnapshot,
  pushUndo,
  redoOnce,
  undoOnce,
} from './history'

describe('arrangement history', () => {
  it('undo/redo restores melody', () => {
    let p = createEmptyArrangement('t', { id: 'a1', now: 1 })
    p.melody.push({
      id: 'm1',
      midi: 60,
      startTick: 0,
      durationTicks: 480,
      role: 'pmn',
    })
    let stacks = pushUndo({ undo: [], redo: [] }, p)
    p = {
      ...p,
      melody: [
        ...p.melody,
        { id: 'm2', midi: 64, startTick: 480, durationTicks: 480, role: 'pmn' },
      ],
    }
    const undone = undoOnce(p, stacks)
    expect(undone).toBeTruthy()
    expect(undone!.project.melody).toHaveLength(1)
    stacks = undone!.stacks
    p = undone!.project
    const redone = redoOnce(p, stacks)
    expect(redone!.project.melody).toHaveLength(2)
  })

  it('snapshot round-trips stacks midi', () => {
    const p = createEmptyArrangement()
    p.stacks = [
      {
        id: 's1',
        startTick: 0,
        durationTicks: 480,
        rootPc: 0,
        natureId: 'seventh',
        voicing: '1735',
        spread: false,
        layer: 'primary',
        scfGroup: null,
        pillarId: null,
        midi: { bass: 48, bari: 58, lead: 64, tenor: 67 },
        ruleTags: ['R1_p5'],
      },
    ]
    const snap = captureDocumentSnapshot(p)
    const next = applyDocumentSnapshot(createEmptyArrangement(), snap)
    expect(next.stacks[0]!.midi?.lead).toBe(64)
    expect(next.stacks[0]!.ruleTags).toEqual(['R1_p5'])
  })
})
