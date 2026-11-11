import { describe, expect, it } from 'vitest'
import {
  createChordPeakTrackState,
  inQuartetF0Band,
  pushChordPeaks,
  QUARTET_F0_MAX_HZ,
  QUARTET_F0_MIN_HZ,
} from './chordPeakTrack'

describe('chordPeakTrack', () => {
  it('rejects out-of-band drones', () => {
    expect(inQuartetF0Band(60)).toBe(false)
    expect(inQuartetF0Band(440)).toBe(true)
    expect(inQuartetF0Band(QUARTET_F0_MIN_HZ)).toBe(true)
    expect(inQuartetF0Band(QUARTET_F0_MAX_HZ)).toBe(true)
    expect(inQuartetF0Band(900)).toBe(false)
  })

  it('requires appearHits before a peak is visible', () => {
    const s = createChordPeakTrackState()
    const opts = { appearHits: 3, holdMisses: 10, matchCents: 40 }
    let out = pushChordPeaks(s, [{ hz: 220, salience: 1 }], opts)
    expect(out.peaks).toHaveLength(0)
    out = pushChordPeaks(s, [{ hz: 221, salience: 1 }], opts)
    expect(out.peaks).toHaveLength(0)
    out = pushChordPeaks(s, [{ hz: 220, salience: 1 }], opts)
    expect(out.peaks).toHaveLength(1)
    expect(out.peaks[0]!.hz).toBeGreaterThan(200)
  })

  it('holds a visible peak across brief misses', () => {
    const s = createChordPeakTrackState()
    const opts = { appearHits: 2, holdMisses: 4, matchCents: 40 }
    pushChordPeaks(s, [{ hz: 260, salience: 1 }], opts)
    pushChordPeaks(s, [{ hz: 260, salience: 1 }], opts)
    expect(pushChordPeaks(s, [], opts).peaks).toHaveLength(1)
    expect(pushChordPeaks(s, [], opts).peaks).toHaveLength(1)
    expect(pushChordPeaks(s, [], opts).peaks).toHaveLength(1)
    expect(pushChordPeaks(s, [], opts).peaks).toHaveLength(1)
    // 5th miss drops (miss counted after filter; 4 holds then drop on next)
    expect(pushChordPeaks(s, [], opts).peaks).toHaveLength(0)
  })

  it('ignores a one-frame out-of-band spike while holding a voice', () => {
    const s = createChordPeakTrackState()
    const opts = { appearHits: 2, holdMisses: 6 }
    pushChordPeaks(s, [{ hz: 196, salience: 1 }], opts)
    pushChordPeaks(s, [{ hz: 196, salience: 1 }], opts)
    const out = pushChordPeaks(
      s,
      [
        { hz: 196, salience: 0.9 },
        { hz: 55, salience: 1 },
        { hz: 1200, salience: 1 },
      ],
      opts,
    )
    expect(out.peaks.every((p) => inQuartetF0Band(p.hz))).toBe(true)
    expect(out.peaks.some((p) => Math.abs(p.hz - 196) < 5)).toBe(true)
  })
})
