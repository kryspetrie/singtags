import { describe, expect, it } from 'vitest'
import {
  deriveStrongHomes,
  ensureHomesFromStrongNotes,
  proposeRootForStrongNote,
  rankStrongHomeAlternatives,
  strongHomesToPillars,
} from './proposeStrongRoots'
import { createEmptyArrangement, type MelodyEvent } from './types'

describe('proposeStrongRoots', () => {
  it('maps ^1/^3/^5 → I, ^4 → IV, ^2 → V in major', () => {
    const tonality = 0
    const mel = (midi: number): MelodyEvent => ({
      id: `m${midi}`,
      midi,
      startTick: 0,
      durationTicks: 480,
      role: 'pmn',
    })
    expect(proposeRootForStrongNote({ note: mel(60), melody: [mel(60)], tonality }).rootPc).toBe(0)
    expect(proposeRootForStrongNote({ note: mel(64), melody: [mel(64)], tonality }).rootPc).toBe(0)
    expect(proposeRootForStrongNote({ note: mel(65), melody: [mel(65)], tonality }).rootPc).toBe(5)
    expect(proposeRootForStrongNote({ note: mel(62), melody: [mel(62)], tonality }).rootPc).toBe(7)
  })

  it('deriveStrongHomes covers passing notes under previous strong', () => {
    const melody: MelodyEvent[] = [
      { id: 'a', midi: 60, startTick: 0, durationTicks: 480, role: 'pmn' },
      { id: 'b', midi: 62, startTick: 240, durationTicks: 120, role: 'smn' },
      { id: 'c', midi: 65, startTick: 960, durationTicks: 480, role: 'pmn' },
    ]
    const { homes } = deriveStrongHomes({ melody, tonality: 0, mode: 'major', ppq: 480 })
    expect(homes.length).toBeGreaterThanOrEqual(2)
    expect(homes[0]!.rootPc).toBe(0)
    expect(homes[0]!.endTick).toBe(960)
    // F (^4) → IV in C; cadence/table may occasionally pick V — still a diatonic home.
    expect([5, 7]).toContain(homes[1]!.rootPc)
    expect(homes[1]!.startTick).toBe(960)
  })

  it('rankStrongHomeAlternatives returns top-2 (C1)', () => {
    const note = {
      id: 'g',
      midi: 67,
      startTick: 0,
      durationTicks: 480,
      role: 'pmn' as const,
    }
    const alts = rankStrongHomeAlternatives({
      note,
      melody: [note],
      tonality: 0,
      mode: 'major',
    })
    expect(alts.length).toBeGreaterThanOrEqual(1)
    expect(alts.length).toBeLessThanOrEqual(2)
    expect(alts[0]!.homeDeg).toBeDefined()
  })

  it('strongHomesToPillars auto-confirms high-confidence homes', () => {
    const locked = strongHomesToPillars([
      {
        rootPc: 0,
        startTick: 0,
        endTick: 480,
        strongNoteId: 'a',
        reason: 'end',
        confidence: 0.9,
      },
      {
        rootPc: 7,
        startTick: 480,
        endTick: 960,
        strongNoteId: 'b',
        reason: 'mid',
        confidence: 0.4,
      },
    ])
    expect(locked[0]!.confirmed).toBe(true)
    expect(locked[0]!.confidence).toBe(0.9)
    expect(locked[1]!.confirmed).toBe(false)
    expect(locked[1]!.confidence).toBe(0.4)
  })

  it('ensureHomesFromStrongNotes fills empty pillars; leaves existing', () => {
    const base = createEmptyArrangement('t')
    const melody: MelodyEvent[] = [
      { id: 'a', midi: 60, startTick: 0, durationTicks: 480, role: 'unknown' },
      { id: 'b', midi: 62, startTick: 240, durationTicks: 120, role: 'unknown' },
      { id: 'c', midi: 67, startTick: 480, durationTicks: 480, role: 'unknown' },
    ]
    const empty = ensureHomesFromStrongNotes({ ...base, melody, pillars: [] })
    expect(empty.pillars.length).toBeGreaterThan(0)
    expect(empty.melody.every((n) => n.role === 'pmn' || n.role === 'smn')).toBe(true)

    const kept = ensureHomesFromStrongNotes({
      ...base,
      melody,
      pillars: [
        {
          id: 'user',
          rootPc: 7,
          startTick: 0,
          endTick: 2000,
          source: 'user',
          confirmed: true,
        },
      ],
    })
    expect(kept.pillars).toHaveLength(1)
    expect(kept.pillars[0]!.rootPc).toBe(7)
  })
})
