/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { createDefaultKeyMarkers, ensureKeyMarkers, keyAtTick, keyMarkerLabel } from './keyMap'

describe('keyMap', () => {
  it('keyAtTick returns last marker at or before tick', () => {
    const markers = [
      { id: 'a', tick: 0, tonality: 0, tonalityMode: 'major' as const, preferFlats: false },
      { id: 'b', tick: 960, tonality: 7, tonalityMode: 'major' as const, preferFlats: false },
    ]
    expect(keyAtTick(0, markers, { tonality: 0, tonalityMode: 'major', preferFlats: false }).tonality).toBe(0)
    expect(keyAtTick(959, markers, { tonality: 0, tonalityMode: 'major', preferFlats: false }).tonality).toBe(0)
    expect(keyAtTick(960, markers, { tonality: 0, tonalityMode: 'major', preferFlats: false }).tonality).toBe(7)
    expect(keyMarkerLabel(markers[1]!)).toBe('G')
  })

  it('ensureKeyMarkers syncs tick 0 to project tonality', () => {
    const base = createDefaultKeyMarkers(0, 'major', false)
    const next = ensureKeyMarkers(base, 5, 'major', true)
    expect(next.find((m) => m.tick === 0)).toMatchObject({
      tonality: 5,
      preferFlats: true,
      tonalityMode: 'major',
    })
  })
})
