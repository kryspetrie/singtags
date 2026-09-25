/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  formatHowToPlain,
  HARMONIZE_HOWTO,
  HARMONY_STRIP_HOWTO,
} from './harmonyHowTo'

describe('harmonyHowTo', () => {
  it('covers Harmonize modes and the declare-then-realize workflow', () => {
    const text = formatHowToPlain(HARMONIZE_HOWTO)
    expect(text).toMatch(/\bChord\b/)
    expect(text).toMatch(/Chord \+ stack/i)
    expect(text).toMatch(/Declare first/i)
    expect(text).toMatch(/Coach/i)
    expect(text).toMatch(/Apply \/ Lock/i)
  })

  it('covers Sketch vs Detected lanes', () => {
    const text = formatHowToPlain(HARMONY_STRIP_HOWTO)
    expect(text).toMatch(/Sketch/i)
    expect(text).toMatch(/Detected/i)
    expect(text).toMatch(/media bar/i)
    expect(text).toMatch(/Lock/i)
    expect(text).toMatch(/Realize/i)
  })
})
