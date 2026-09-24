/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { mergeStacksFromRollImport } from './mergeStacksFromRoll'
import type { ChordStack } from './types'

function stack(
  startTick: number,
  midi: ChordStack['midi'],
  natureId: string,
): ChordStack {
  return {
    id: `s${startTick}-${natureId}`,
    startTick,
    durationTicks: 480,
    rootPc: 0,
    natureId,
    voicing: '1513',
    spread: false,
    layer: 'primary',
    scfGroup: null,
    pillarId: null,
    midi,
    ruleTags: [],
  }
}

const maj = { bass: 48, bari: 52, lead: 55, tenor: 60 }
const sev = { bass: 48, bari: 52, lead: 55, tenor: 58 }

describe('mergeStacksFromRollImport', () => {
  it('keeps named Apply when MIDI unchanged', () => {
    const existing = [stack(0, maj, 'major')]
    const fresh = [stack(0, maj, 'unknown')]
    const out = mergeStacksFromRollImport(fresh, existing)
    expect(out).toHaveLength(1)
    expect(out[0]!.natureId).toBe('major')
  })

  it('prefers fresh ID when TBB MIDI changed', () => {
    const existing = [stack(0, maj, 'major')]
    const fresh = [stack(0, sev, 'seventh')]
    const out = mergeStacksFromRollImport(fresh, existing)
    expect(out[0]!.natureId).toBe('seventh')
    expect(out[0]!.midi).toEqual(sev)
  })

  it('drops existing stacks when the live roll no longer has that moment', () => {
    const existing = [stack(480, maj, 'major')]
    const fresh = [stack(0, sev, 'seventh')]
    const out = mergeStacksFromRollImport(fresh, existing)
    expect(out.map((s) => s.startTick)).toEqual([0])
    expect(out[0]!.natureId).toBe('seventh')
  })

  it('does not resurrect unknown existing over fresh ID', () => {
    const existing = [stack(0, maj, 'unknown')]
    const fresh = [stack(0, maj, 'major')]
    const out = mergeStacksFromRollImport(fresh, existing)
    expect(out[0]!.natureId).toBe('major')
  })
})
