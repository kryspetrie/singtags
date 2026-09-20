import { describe, expect, it } from 'vitest'
import {
  applyDocumentSnapshot,
  captureDocumentSnapshot,
  pushUndoStack,
  snapshotsEqual,
} from './history'
import { createEmptyTagRollProject } from './normalize'

describe('tagRoll history', () => {
  it('captures and restores document fields without view prefs', () => {
    const p = createEmptyTagRollProject({ title: 'A' })
    p.view.scrollX = 99
    p.notes.push({
      id: 'n1',
      partId: p.parts[0]!.id,
      midi: 60,
      startTick: 0,
      durationTicks: 480,
    })
    const snap = captureDocumentSnapshot(p)
    expect(snap.title).toBe('A')
    expect(snap.notes).toHaveLength(1)

    const other = createEmptyTagRollProject({ title: 'B' })
    other.view.scrollX = 0
    const restored = applyDocumentSnapshot(other, snap)
    expect(restored.title).toBe('A')
    expect(restored.notes).toHaveLength(1)
    expect(restored.view.scrollX).toBe(0)
  })

  it('dedupes identical undo pushes', () => {
    const p = createEmptyTagRollProject()
    const snap = captureDocumentSnapshot(p)
    const once = pushUndoStack([], snap)
    const twice = pushUndoStack(once, snap)
    expect(twice).toHaveLength(1)
    expect(snapshotsEqual(snap, once[0]!)).toBe(true)
  })
})
