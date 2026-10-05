/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  formatHowToPlain,
  HARMONIZE_HOWTO,
  HARMONY_STRIP_HOWTO,
  SKETCH_LANE_HOWTO,
} from './harmonyHowTo'

describe('harmonyHowTo', () => {
  it('covers Harmonize modes briefly', () => {
    const text = formatHowToPlain(HARMONIZE_HOWTO)
    expect(text).toMatch(/\bSketch\b/)
    expect(text).toMatch(/\bStack\b/)
    expect(text).toMatch(/Suggest/i)
    expect(text).toMatch(/Roles/)
  })

  it('gives short overviews for each bottom lane', () => {
    const text = formatHowToPlain(HARMONY_STRIP_HOWTO)
    expect(text).toMatch(/^Sketch\n/m)
    expect(text).toMatch(/^Detected\n/m)
    expect(text).toMatch(/^Coach\n/m)
    expect(text).toMatch(/^Lyrics\n/m)
    expect(text).toMatch(/^Mods\n/m)
    // Keep hover tips short — no long procedure dumps.
    expect(text.length).toBeLessThan(900)
  })

  it('covers empty Sketch lane tips', () => {
    const text = formatHowToPlain(SKETCH_LANE_HOWTO)
    expect(text).toMatch(/paint|map/i)
    expect(text).toMatch(/Realize/)
  })
})
