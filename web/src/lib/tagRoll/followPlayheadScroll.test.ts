import { describe, expect, it } from 'vitest'
import { followPlayheadScrollX } from './followPlayheadScroll'
import { TAG_ROLL_PPQ } from './types'

describe('followPlayheadScrollX', () => {
  const cellW = 40 // 1 beat = 40px at PPQ
  const beat = TAG_ROLL_PPQ

  it('returns null when playhead is already visible', () => {
    // playhead at 2 beats, scroll 0 → x = 80; viewport 400, margin 48 → ok
    expect(
      followPlayheadScrollX({
        playheadTick: beat * 2,
        scrollX: 0,
        cellW,
        viewportW: 400,
        lengthTicks: beat * 32,
        marginPx: 48,
      }),
    ).toBeNull()
  })

  it('jumps when playhead passes the right edge', () => {
    // playhead at 12 beats = 480px; scroll 0; viewport 400 → off right
    const next = followPlayheadScrollX({
      playheadTick: beat * 12,
      scrollX: 0,
      cellW,
      viewportW: 400,
      lengthTicks: beat * 64,
      marginPx: 48,
    })
    expect(next).not.toBeNull()
    expect(next!).toBeGreaterThan(0)
    // Playhead should land near left margin after jump
    const phX = beat * 12 * (cellW / TAG_ROLL_PPQ) - next!
    expect(phX).toBeCloseTo(48, 0)
  })

  it('jumps left when playhead is before the left margin', () => {
    const next = followPlayheadScrollX({
      playheadTick: beat * 2,
      scrollX: 400,
      cellW,
      viewportW: 400,
      lengthTicks: beat * 64,
      marginPx: 48,
    })
    expect(next).not.toBeNull()
    expect(next!).toBeLessThan(400)
  })
})
