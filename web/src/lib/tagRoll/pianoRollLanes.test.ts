import { describe, expect, it } from 'vitest'
import { parseCssColor, pianoRollLaneColor } from './pianoRollLanes'

const light = { background: '#f7f5f1', accent: '#0f6b5c' }
const dark = { background: '#141618', accent: '#2a8a76' }

function lane(
  theme: { background: string; accent: string },
  isBlack: boolean,
  inScale: boolean,
): string {
  return pianoRollLaneColor({ ...theme, isBlack, inScale }) ?? theme.background
}

function rgb(css: string): [number, number, number] {
  const parsed = parseCssColor(css)
  if (!parsed) throw new Error(css)
  return parsed
}

/** Channel spread. HSL saturation inflates near-white greys, so this is the visible chroma. */
function chroma(css: string): number {
  const [r, g, b] = rgb(css)
  return Math.max(r, g, b) - Math.min(r, g, b)
}

function luma(css: string): number {
  const [r, g, b] = rgb(css).map((c) => {
    const x = c! / 255
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}

function dist(a: string, b: string): number {
  const [ar, ag, ab] = rgb(a)
  const [br, bg, bb] = rgb(b)
  return Math.hypot(ar - br, ag - bg, ab - bb)
}

describe('pianoRollLaneColor', () => {
  it('keeps scale rows chromatic and piano keys neutral on a light roll', () => {
    const whiteOut = lane(light, false, false)
    const whiteIn = lane(light, false, true)
    const blackOut = lane(light, true, false)
    const blackIn = lane(light, true, true)

    expect(whiteOut).toBe(light.background)
    expect(chroma(blackOut)).toBeLessThan(12)
    expect(chroma(whiteIn)).toBeGreaterThan(36)
    expect(chroma(blackIn)).toBeGreaterThan(36)
    expect(luma(whiteIn)).toBeGreaterThan(luma(blackIn) + 0.05)
    expect(luma(whiteOut)).toBeGreaterThan(luma(blackOut) + 0.03)
    expect(dist(whiteIn, blackOut)).toBeGreaterThan(40)
    expect(dist(whiteIn, whiteOut)).toBeGreaterThan(28)
    expect(dist(blackIn, blackOut)).toBeGreaterThan(28)
  })

  it('keeps the same separation on a dark roll', () => {
    const whiteOut = lane(dark, false, false)
    const whiteIn = lane(dark, false, true)
    const blackOut = lane(dark, true, false)
    const blackIn = lane(dark, true, true)

    expect(chroma(blackOut)).toBeLessThan(12)
    expect(chroma(whiteIn)).toBeGreaterThan(30)
    expect(chroma(blackIn)).toBeGreaterThan(30)
    expect(luma(whiteIn)).toBeGreaterThan(luma(blackIn))
    expect(luma(whiteOut)).toBeGreaterThan(luma(blackOut))
    expect(dist(whiteIn, blackOut)).toBeGreaterThan(30)
    expect(dist(blackIn, blackOut)).toBeGreaterThan(20)
  })
})
