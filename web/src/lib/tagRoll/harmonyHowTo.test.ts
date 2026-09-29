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
  it('covers Harmonize modes and the declare-then-realize workflow', () => {
    const text = formatHowToPlain(HARMONIZE_HOWTO)
    expect(text).toMatch(/\bSketch\b/)
    expect(text).toMatch(/\bStack\b/)
    expect(text).toMatch(/Suggest/i)
    expect(text).toMatch(/Declare first/i)
    expect(text).toMatch(/Apply/)
    expect(text).toMatch(/pillars? when present|implied/i)
  })

  it('covers Sketch vs Detected lanes', () => {
    const text = formatHowToPlain(HARMONY_STRIP_HOWTO)
    expect(text).toMatch(/Sketch/i)
    expect(text).toMatch(/Detected/i)
    expect(text).toMatch(/media bar/i)
    expect(text).toMatch(/Lock/i)
    expect(text).toMatch(/Realize/i)
  })

  it('teaches Sketch and Detected pillar marking', () => {
    const text = formatHowToPlain(HARMONY_STRIP_HOWTO)
    expect(text).toMatch(/Pillars on Sketch/i)
    expect(text).toMatch(/Alt\+click/i)
    expect(text).toMatch(/◆/)
    expect(text).toMatch(/Detected/i)
  })

  it('covers empty Sketch lane tips', () => {
    const text = formatHowToPlain(SKETCH_LANE_HOWTO)
    expect(text).toMatch(/paint/i)
    expect(text).toMatch(/pillar/i)
    expect(text).toMatch(/Realize/)
  })
})
