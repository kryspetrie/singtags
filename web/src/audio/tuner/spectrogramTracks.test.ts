import { describe, expect, it } from 'vitest'
import {
  advanceSpectrogramTracks,
  createSpectrogramTrackState,
  peaksFromSpectrogramColumn,
  shiftSpectrogramTracks,
} from './spectrogramTracks'
import { createSpectrogramRing } from './spectrogramRing'

describe('spectrogramTracks', () => {
  it('picks local peaks from a column', () => {
    const col = new Float32Array(32)
    col[8] = 0.9
    col[7] = 0.4
    col[9] = 0.4
    col[20] = 0.7
    col[19] = 0.3
    col[21] = 0.3
    const ring = createSpectrogramRing(32, 40, { fMinHz: 80, fMaxHz: 1000, scale: 'log' })
    const peaks = peaksFromSpectrogramColumn(col, ring, { floor: 0.5 })
    expect(peaks.length).toBe(2)
    expect(peaks[0]!.salience).toBeGreaterThanOrEqual(peaks[1]!.salience)
  })

  it('extends a stable track and labels a hold', () => {
    const state = createSpectrogramTrackState()
    const hz = 220
    for (let i = 0; i < 12; i++) {
      advanceSpectrogramTracks(state, i, [{ hz: hz + (i % 2) * 0.2, salience: 0.8 }], {
        holdFrames: 10,
        holdCents: 30,
        a4Hz: 440,
      })
    }
    expect(state.tracks).toHaveLength(1)
    expect(state.tracks[0]!.held).toBe(true)
    expect(state.tracks[0]!.label).toMatch(/^A/)
  })

  it('shifts columns when the ring drops history', () => {
    const state = createSpectrogramTrackState()
    advanceSpectrogramTracks(state, 0, [{ hz: 440, salience: 1 }])
    advanceSpectrogramTracks(state, 1, [{ hz: 440, salience: 1 }])
    shiftSpectrogramTracks(state, 1)
    expect(state.tracks[0]!.points[0]!.col).toBe(0)
  })
})
