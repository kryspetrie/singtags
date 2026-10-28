/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest'
import { Factory, Voice } from 'vexflow'
import { createEmptyTagRollProject } from '../normalize'
import { TAG_ROLL_PPQ } from '../types'
import { ensureVexFonts } from './renderVexScore'
import {
  applySheetAccidentals,
  preferFlatsAtTick,
  sheetKeySpecAtTick,
} from './sheetAccidentals'

describe('sheetAccidentals', () => {
  it('reads the key signature at the playhead / marker tick', () => {
    const p = createEmptyTagRollProject()
    p.tonality = 0
    p.preferFlats = false
    expect(sheetKeySpecAtTick(p, 0)).toBe('C')
    p.keyMarkers = [
      { id: 'a', tick: 0, tonality: 7, tonalityMode: 'major', preferFlats: false },
      { id: 'b', tick: TAG_ROLL_PPQ * 4, tonality: 5, tonalityMode: 'major', preferFlats: true },
    ]
    expect(sheetKeySpecAtTick(p, 0)).toBe('G')
    expect(sheetKeySpecAtTick(p, TAG_ROLL_PPQ * 4)).toBe('F')
    expect(preferFlatsAtTick(p, 0)).toBe(false)
    expect(preferFlatsAtTick(p, TAG_ROLL_PPQ * 4)).toBe(true)
  })

  it('adds a sharp glyph when the note is outside C major', async () => {
    await ensureVexFonts()
    const host = document.createElement('div')
    host.id = 'acc-test'
    document.body.appendChild(host)
    const factory = new Factory({
      renderer: { elementId: host.id, width: 200, height: 120 },
    })
    const note = factory.StaveNote({ keys: ['f#/4'], duration: 'q' })
    const voice = factory
      .Voice({ time: { numBeats: 1, beatValue: 4 } })
      .setMode(Voice.Mode.SOFT)
      .addTickables([note])
    applySheetAccidentals([voice], 'C')
    const types = note
      .getModifiers()
      .map((m) => (m as { type?: string }).type)
      .filter(Boolean)
    expect(types).toContain('#')
    host.remove()
  })

  it('skips the sharp when F# is already in the key of G', async () => {
    await ensureVexFonts()
    const host = document.createElement('div')
    host.id = 'acc-test-g'
    document.body.appendChild(host)
    const factory = new Factory({
      renderer: { elementId: host.id, width: 200, height: 120 },
    })
    const note = factory.StaveNote({ keys: ['f#/4'], duration: 'q' })
    const voice = factory
      .Voice({ time: { numBeats: 1, beatValue: 4 } })
      .setMode(Voice.Mode.SOFT)
      .addTickables([note])
    applySheetAccidentals([voice], 'G')
    const types = note
      .getModifiers()
      .map((m) => (m as { type?: string }).type)
      .filter(Boolean)
    expect(types).not.toContain('#')
    host.remove()
  })

  it('cancels a prior key accidental when the signature changes mid-song', async () => {
    await ensureVexFonts()
    const host = document.createElement('div')
    host.id = 'acc-test-cancel'
    document.body.appendChild(host)
    const factory = new Factory({
      renderer: { elementId: host.id, width: 200, height: 120 },
    })
    // After G → C, F natural needs an explicit natural (absolute pitch F).
    const note = factory.StaveNote({ keys: ['f/4'], duration: 'q' })
    const voice = factory
      .Voice({ time: { numBeats: 1, beatValue: 4 } })
      .setMode(Voice.Mode.SOFT)
      .addTickables([note])
    applySheetAccidentals([voice], 'C')
    // In C, F is diatonic — no glyph. Same note under G would need a natural;
    // when the measure key is C the absolute F is unmarked.
    expect(
      note
        .getModifiers()
        .map((m) => (m as { type?: string }).type)
        .filter(Boolean),
    ).not.toContain('n')
    applySheetAccidentals([voice], 'G')
    expect(
      note
        .getModifiers()
        .map((m) => (m as { type?: string }).type)
        .filter(Boolean),
    ).toContain('n')
    host.remove()
  })

  it('adds a natural when the key expects a sharp', async () => {
    await ensureVexFonts()
    const host = document.createElement('div')
    host.id = 'acc-test-n'
    document.body.appendChild(host)
    const factory = new Factory({
      renderer: { elementId: host.id, width: 200, height: 120 },
    })
    const note = factory.StaveNote({ keys: ['f/4'], duration: 'q' })
    const voice = factory
      .Voice({ time: { numBeats: 1, beatValue: 4 } })
      .setMode(Voice.Mode.SOFT)
      .addTickables([note])
    applySheetAccidentals([voice], 'G')
    const types = note
      .getModifiers()
      .map((m) => (m as { type?: string }).type)
      .filter(Boolean)
    expect(types).toContain('n')
    host.remove()
  })

  it('annotates double flats and double sharps', async () => {
    await ensureVexFonts()
    const host = document.createElement('div')
    host.id = 'acc-test-dbl'
    document.body.appendChild(host)
    const factory = new Factory({
      renderer: { elementId: host.id, width: 280, height: 120 },
    })
    const flatFlat = factory.StaveNote({ keys: ['bbb/4'], duration: 'q' })
    const dblSharp = factory.StaveNote({ keys: ['c##/5'], duration: 'q' })
    const voice = factory
      .Voice({ time: { numBeats: 2, beatValue: 4 } })
      .setMode(Voice.Mode.SOFT)
      .addTickables([flatFlat, dblSharp])
    applySheetAccidentals([voice], 'C')
    const flatTypes = flatFlat
      .getModifiers()
      .map((m) => (m as { type?: string }).type)
      .filter(Boolean)
    const sharpTypes = dblSharp
      .getModifiers()
      .map((m) => (m as { type?: string }).type)
      .filter(Boolean)
    expect(flatTypes).toContain('bb')
    expect(sharpTypes).toContain('##')
    host.remove()
  })
})
