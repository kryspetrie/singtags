/**
 * Fill's median-window pass revoices a tenor that steps and then leaps,
 * without moving the sung bass.
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { bindMedianJumpPenalty, isUnexpectedJump, median, medianJumpRankPenalty } from '../../domain/arranging/medianJumpWindow'
import { medianJumpOnFill } from './medianJumpPrefs'
import { selectionSmoothRange, smoothFilledMedianWindow, smoothJumpsInProject } from './medianJumpFill'
import type { HarmonySketchSpan, TagRollNote } from './types'

function note(id: string, partId: string, midi: number, startTick: number): TagRollNote {
  return { id, partId, midi, startTick, durationTicks: 480 }
}

describe('smoothFilledMedianWindow', () => {
  it('pulls a stepping tenor off a leap when bass and lead were sung', () => {
    const ticks = [0, 480, 960, 1440]
    const tenor = ticks.map((tick, i) => note(`t${i}`, 'tenor', [72, 72, 72, 79][i]!, tick))
    const bass = ticks.map((tick, i) => note(`b${i}`, 'bass', 48, tick))
    const lead = ticks.map((tick, i) => note(`l${i}`, 'lead', 64, tick))
    const sketch: HarmonySketchSpan[] = ticks.map((tick) => ({
      id: `s${tick}`,
      startTick: tick,
      endTick: tick + 480,
      rootPc: 0,
      quality: 'major',
      source: 'user',
      locked: true,
      pillar: true,
    }))

    const result = smoothFilledMedianWindow({
      notes: [...tenor, ...bass, ...lead],
      originalNotes: [...bass, ...lead],
      sketch,
      melodyAt: () => 'lead',
      tenorId: 'tenor',
      bariId: 'bari',
      bassId: 'bass',
      profile: 'sai11',
    })

    const line = result.notes
      .filter((n) => n.partId === 'tenor')
      .sort((a, b) => a.startTick - b.startTick)
      .map((n) => n.midi)
    const steps = line.slice(1).map((midi, i) => Math.abs(midi - line[i]!))
    const before = [0, 0, 7]
    expect(Math.max(...steps)).toBeLessThan(Math.max(...before))
    expect(isUnexpectedJump(Math.max(...steps), median(steps))).toBe(false)
    expect(result.notes.filter((n) => n.partId === 'bass').map((n) => n.midi)).toEqual([48, 48, 48, 48])
    expect(result.notes.filter((n) => n.partId === 'lead').map((n) => n.midi)).toEqual([64, 64, 64, 64])
  })

  it('holds a part and leaves notes outside the range alone', () => {
    const ticks = [0, 480, 960, 1440]
    const tenor = ticks.map((tick, i) => note(`t${i}`, 'tenor', [72, 72, 72, 79][i]!, tick))
    tenor.push(note('t-out', 'tenor', 80, 2401))
    const bass = ticks.map((tick) => note(`b${tick}`, 'bass', 48, tick))
    const lead = ticks.map((tick) => note(`l${tick}`, 'lead', 64, tick))
    const sketch: HarmonySketchSpan[] = ticks.map((tick) => ({
      id: `s${tick}`,
      startTick: tick,
      endTick: tick + 480,
      rootPc: 0,
      quality: 'major',
      source: 'user',
      locked: true,
    }))
    const parts = [
      { id: 'tenor', name: 'Tenor' },
      { id: 'lead', name: 'Lead' },
      { id: 'bari', name: 'Bari' },
      { id: 'bass', name: 'Bass' },
    ]
    const notes = [...tenor, ...bass, ...lead]
    const held = smoothJumpsInProject({
      notes,
      parts,
      sketch,
      melodyAt: () => 'lead',
      range: null,
      holdPartIds: new Set(['tenor', 'lead', 'bass']),
      profile: 'sai11',
      tonality: 0,
      mode: 'major',
    })
    expect(held.changed).toBe(0)
    expect(held.notes.find((n) => n.id === 't3')?.midi).toBe(79)

    const ranged = smoothJumpsInProject({
      notes,
      parts,
      sketch,
      melodyAt: () => 'lead',
      range: { startTick: 0, endTick: 2401 },
      holdPartIds: new Set(['lead', 'bass']),
      profile: 'sai11',
      tonality: 0,
      mode: 'major',
    })
    const line = ranged.notes
      .filter((n) => n.partId === 'tenor' && n.startTick < 1920)
      .sort((a, b) => a.startTick - b.startTick)
      .map((n) => n.midi)
    const steps = line.slice(1).map((midi, i) => Math.abs(midi - line[i]!))
    expect(Math.max(...steps)).toBeLessThan(7)
    expect(ranged.notes.find((n) => n.id === 't-out')?.midi).toBe(80)
    expect(ranged.notes.filter((n) => n.partId === 'bass').every((n) => n.midi === 48)).toBe(true)
    expect(ranged.notes.filter((n) => n.partId === 'lead').every((n) => n.midi === 64)).toBe(true)
  })

  it('locks the melody note after a handoff and still smooths the rest of that part', () => {
    const ticks = [0, 480, 960, 1440]
    const tenor = ticks.map((tick, i) => note(`t${i}`, 'tenor', [72, 72, 72, 79][i]!, tick))
    const bass = ticks.map((tick) => note(`b${tick}`, 'bass', 48, tick))
    const lead = ticks.map((tick) => note(`l${tick}`, 'lead', 64, tick))
    const sketch: HarmonySketchSpan[] = ticks.map((tick) => ({
      id: `s${tick}`,
      startTick: tick,
      endTick: tick + 480,
      rootPc: 0,
      quality: 'major',
      source: 'user',
      locked: true,
    }))
    const result = smoothJumpsInProject({
      notes: [...tenor, ...bass, ...lead],
      parts: [
        { id: 'tenor', name: 'Tenor' },
        { id: 'lead', name: 'Lead' },
        { id: 'bari', name: 'Bari' },
        { id: 'bass', name: 'Bass' },
      ],
      sketch,
      melodyAt: (tick) => (tick >= 1440 ? 'tenor' : 'lead'),
      range: null,
      holdPartIds: new Set(['bass']),
      lockMelody: true,
      profile: 'sai11',
      tonality: 0,
      mode: 'major',
    })
    expect(result.notes.find((n) => n.id === 't3')?.midi).toBe(79)
    expect(result.notes.filter((n) => n.partId === 'lead').every((n) => n.midi === 64)).toBe(true)
    const line = result.notes
      .filter((n) => n.partId === 'tenor')
      .sort((a, b) => a.startTick - b.startTick)
      .map((n) => n.midi)
    const steps = line.slice(1).map((midi, i) => Math.abs(midi - line[i]!))
    expect(Math.max(...steps)).toBeLessThan(7)
  })

  it('uses the note selection, then sketch spans, as the range', () => {
    const notes = [note('a', 'tenor', 60, 0), note('b', 'tenor', 62, 960)]
    expect(selectionSmoothRange(notes, ['b'], [], [])).toEqual({ startTick: 960, endTick: 1440 })
    expect(
      selectionSmoothRange(notes, [], [{ id: 's', startTick: 480, endTick: 960 }], ['s']),
    ).toEqual({ startTick: 480, endTick: 960 })
    expect(selectionSmoothRange(notes, [], [], [])).toBeNull()
  })

  it('coach penalty follows the fill switch', () => {
    const prevPrev = { bass: 48, bari: 47, lead: 60, tenor: 66 }
    const prev = { bass: 48, bari: 48, lead: 60, tenor: 67 }
    const next = { bass: 48, bari: 52, lead: 60, tenor: 74 }
    expect(medianJumpRankPenalty(prevPrev, prev, next)).toBeGreaterThan(0)
    bindMedianJumpPenalty(() => false)
    expect(medianJumpRankPenalty(prevPrev, prev, next)).toBe(0)
    bindMedianJumpPenalty(medianJumpOnFill)
  })
})
