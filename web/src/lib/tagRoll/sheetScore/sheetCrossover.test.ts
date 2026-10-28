import { describe, expect, it } from 'vitest'
import { staffCrossoverNoteIds } from './sheetCrossover'

const parts = [
  { id: 't', name: 'Tenor' },
  { id: 'l', name: 'Lead' },
  { id: 'r', name: 'Bari' },
  { id: 'b', name: 'Bass' },
]

describe('staffCrossoverNoteIds', () => {
  it('marks lead when above overlapping tenor', () => {
    const ids = staffCrossoverNoteIds(
      [
        { id: 'ten1', partId: 't', midi: 60, startTick: 0, durationTicks: 480 },
        { id: 'lead1', partId: 'l', midi: 64, startTick: 0, durationTicks: 480 },
      ],
      parts,
    )
    expect([...ids]).toEqual(['lead1'])
  })

  it('marks bass when above overlapping bari', () => {
    const ids = staffCrossoverNoteIds(
      [
        { id: 'bari1', partId: 'r', midi: 48, startTick: 0, durationTicks: 480 },
        { id: 'bass1', partId: 'b', midi: 55, startTick: 0, durationTicks: 480 },
      ],
      parts,
    )
    expect([...ids]).toEqual(['bass1'])
  })

  it('ignores normal stack (tenor≥lead, bari≥bass)', () => {
    const ids = staffCrossoverNoteIds(
      [
        { id: 'ten1', partId: 't', midi: 72, startTick: 0, durationTicks: 480 },
        { id: 'lead1', partId: 'l', midi: 67, startTick: 0, durationTicks: 480 },
        { id: 'bari1', partId: 'r', midi: 55, startTick: 0, durationTicks: 480 },
        { id: 'bass1', partId: 'b', midi: 48, startTick: 0, durationTicks: 480 },
      ],
      parts,
    )
    expect(ids.size).toBe(0)
  })

  it('does not mark bari above lead (cross-staff)', () => {
    const ids = staffCrossoverNoteIds(
      [
        { id: 'lead1', partId: 'l', midi: 60, startTick: 0, durationTicks: 480 },
        { id: 'bari1', partId: 'r', midi: 64, startTick: 0, durationTicks: 480 },
      ],
      parts,
    )
    expect(ids.size).toBe(0)
  })

  it('requires time overlap', () => {
    const ids = staffCrossoverNoteIds(
      [
        { id: 'ten1', partId: 't', midi: 60, startTick: 0, durationTicks: 240 },
        { id: 'lead1', partId: 'l', midi: 72, startTick: 240, durationTicks: 240 },
      ],
      parts,
    )
    expect(ids.size).toBe(0)
  })

  it('accepts baritone part name for bass-over-bari', () => {
    const ids = staffCrossoverNoteIds(
      [
        { id: 'bari1', partId: 'r', midi: 50, startTick: 0, durationTicks: 100 },
        { id: 'bass1', partId: 'b', midi: 55, startTick: 0, durationTicks: 100 },
      ],
      [
        { id: 'r', name: 'Baritone' },
        { id: 'b', name: 'Bass' },
      ],
    )
    expect([...ids]).toEqual(['bass1'])
  })
})
