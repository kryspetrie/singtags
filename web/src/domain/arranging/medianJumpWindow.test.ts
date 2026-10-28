/**
 * Median-window voice leading: a jump is judged against the part's usual
 * motion, then repaired by revoicing that chord or by moving the chords around it.
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  isUnexpectedJump,
  median,
  smoothMedianJumpWindow,
  type MedianJumpChord,
  type MedianJumpRole,
} from './medianJumpWindow'

function beat(
  id: string,
  pitch: Partial<Record<MedianJumpRole, number>>,
  alternates: Partial<Record<MedianJumpRole, number>>[] = [],
  locked: MedianJumpRole[] = [],
): MedianJumpChord {
  return { id, pitch, alternates, locked }
}

function tenorLine(chords: readonly MedianJumpChord[]): number[] {
  return chords.map((chord) => chord.pitch.tenor ?? -1)
}

describe('median jump window', () => {
  it('treats a leap as ordinary when it matches the part, and as a jump when the part otherwise steps', () => {
    expect(median([1, 1, 1, 7])).toBe(1)
    expect(isUnexpectedJump(7, 1)).toBe(true)
    expect(isUnexpectedJump(5, 5)).toBe(false)
    expect(isUnexpectedJump(5, 1)).toBe(true)
    expect(isUnexpectedJump(3, 0)).toBe(false)
  })

  it('revoices the arrival chord before it moves any neighbor', () => {
    const chords = [
      beat('a', { tenor: 70, bass: 48 }, [], ['bass']),
      beat('b', { tenor: 71, bass: 50 }, [], ['bass']),
      beat('c', { tenor: 72, bass: 52 }, [{ tenor: 76 }], ['bass']),
      beat('d', { tenor: 79, bass: 53 }, [{ tenor: 73 }], ['bass']),
    ]

    const result = smoothMedianJumpWindow(chords)

    expect(tenorLine(result.chords)).toEqual([70, 71, 72, 73])
    expect(result.chords.map((chord) => chord.pitch.bass)).toEqual([48, 50, 52, 53])
    expect(result.repairs.map((repair) => repair.kind)).toEqual(['revoice-jump'])
    expect(result.repairs[0]!.medianBefore - result.repairs[0]!.medianAfter).toBeGreaterThanOrEqual(1)
    expect(tenorLine(chords)).toEqual([70, 71, 72, 79])
  })

  it('keeps a jumpy arrival that has no other voicing and moves the chord before it', () => {
    const chords = [
      beat('a', { tenor: 70 }),
      beat('b', { tenor: 71 }),
      beat('c', { tenor: 72 }, [{ tenor: 76 }]),
      beat('d', { tenor: 79 }),
    ]

    const result = smoothMedianJumpWindow(chords)

    expect(tenorLine(result.chords)).toEqual([70, 71, 76, 79])
    expect(result.repairs.map((repair) => repair.kind)).toEqual(['move-neighbors'])
  })

  it('ramps the approach when one neighbor move would only slide the jump backward', () => {
    const chords = [
      beat('a', { tenor: 64 }),
      beat('b', { tenor: 65 }, [{ tenor: 70 }]),
      beat('c', { tenor: 66 }, [{ tenor: 73 }]),
      beat('d', { tenor: 76 }),
    ]

    const result = smoothMedianJumpWindow(chords)

    expect(tenorLine(result.chords)).toEqual([64, 70, 73, 76])
    expect(result.repairs.every((repair) => repair.kind === 'move-neighbors')).toBe(true)
    expect(result.repairs.length).toBeGreaterThan(0)
  })

  it('flags a fourth in a stepping tenor line, which a fixed leap limit would allow', () => {
    const chords = [
      beat('a', { tenor: 72 }),
      beat('b', { tenor: 72 }),
      beat('c', { tenor: 73 }),
      beat('d', { tenor: 72 }),
      beat('e', { tenor: 77 }, [{ tenor: 73 }]),
    ]

    const result = smoothMedianJumpWindow(chords)

    expect(tenorLine(result.chords)).toEqual([72, 72, 73, 72, 73])
    expect(result.repairs[0]?.kind).toBe('revoice-jump')
  })

  it('leaves a line alone when every leap matches the median motion', () => {
    const chords = [
      beat('a', { tenor: 60 }),
      beat('b', { tenor: 65 }),
      beat('c', { tenor: 70 }),
      beat('d', { tenor: 75 }, [{ tenor: 71 }]),
    ]

    expect(tenorLine(smoothMedianJumpWindow(chords).chords)).toEqual([60, 65, 70, 75])
  })

  it('does not move a sung pitch, and does not yank a neighbor into a new jump when the leap is locked', () => {
    const sung = [
      beat('a', { tenor: 70 }),
      beat('b', { tenor: 71 }),
      beat('c', { tenor: 72 }, [{ tenor: 76 }]),
      beat('d', { tenor: 79 }, [{ tenor: 73 }], ['tenor']),
    ]
    expect(tenorLine(smoothMedianJumpWindow(sung).chords)).toEqual([70, 71, 76, 79])

    const lockedLeap = [
      beat('a', { tenor: 64 }),
      beat('b', { tenor: 66 }, [{ tenor: 74 }]),
      beat('c', { tenor: 69 }, [], ['tenor']),
      beat('d', { tenor: 81 }, [], ['tenor']),
    ]
    expect(tenorLine(smoothMedianJumpWindow(lockedLeap).chords)).toEqual([64, 66, 69, 81])
  })

  it('picks the alternate that smooths both filled parts when bass and lead are fixed', () => {
    const bass = [48, 50, 52, 53]
    const chords = bass.map((midi, index) =>
      beat(
        String(index),
        { tenor: [70, 71, 72, 79][index], bari: [60, 62, 64, 65][index], bass: midi },
        index === 3
          ? [
              { tenor: 73, bari: 76 },
              { tenor: 74, bari: 66 },
            ]
          : [],
        ['bass'],
      ),
    )

    const result = smoothMedianJumpWindow(chords)

    expect(result.chords.map((chord) => chord.pitch.tenor)).toEqual([70, 71, 72, 74])
    expect(result.chords.map((chord) => chord.pitch.bari)).toEqual([60, 62, 64, 66])
    expect(result.chords.map((chord) => chord.pitch.bass)).toEqual(bass)
  })
})
