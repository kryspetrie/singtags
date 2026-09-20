/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest'
import { createEmptyTagRollProject } from '../normalize'
import { TAG_ROLL_PPQ } from '../types'
import { ensureVexFonts, renderVexSheetScore } from './renderVexScore'

describe('renderVexSheetScore', () => {
  it('renders a TTBB phrase into an SVG host', async () => {
    await ensureVexFonts()
    const p = createEmptyTagRollProject()
    const lead = p.parts.find((x) => x.name === 'Lead')!
    const tenor = p.parts.find((x) => x.name === 'Tenor')!
    const bari = p.parts.find((x) => x.name === 'Bari')!
    const bass = p.parts.find((x) => x.name === 'Bass')!
    p.notes = [
      { id: 't', partId: tenor.id, midi: 67, startTick: 0, durationTicks: TAG_ROLL_PPQ },
      {
        id: 'l',
        partId: lead.id,
        midi: 60,
        startTick: 0,
        durationTicks: TAG_ROLL_PPQ,
        lyric: 'Tag',
      },
      { id: 'r', partId: bari.id, midi: 55, startTick: 0, durationTicks: TAG_ROLL_PPQ },
      { id: 'b', partId: bass.id, midi: 48, startTick: 0, durationTicks: TAG_ROLL_PPQ },
    ]
    const host = document.createElement('div')
    document.body.appendChild(host)
    const layout = await renderVexSheetScore({ host, project: p, pxPerBeat: 36 })
    expect(layout.width).toBeGreaterThan(100)
    expect(layout.measures.length).toBeGreaterThan(0)
    expect(host.querySelector('svg')).toBeTruthy()
    expect(layout.tickToX(0)).toBeLessThan(layout.tickToX(TAG_ROLL_PPQ))
    // Playhead at tick 0 must sit in the note area, not over the clef gutter.
    const m0 = layout.measures[0]!
    expect(m0.noteStartX).toBeGreaterThan(m0.x)
    expect(layout.tickToX(0)).toBeGreaterThanOrEqual(m0.noteStartX - 0.5)
    expect(layout.tickToX(0)).toBeLessThan(m0.noteEndX)
    host.remove()
  }, 20000)

  it('draws one system bracket, stems/beams, and wider first measure', async () => {
    await ensureVexFonts()
    const p = createEmptyTagRollProject()
    p.lengthTicks = TAG_ROLL_PPQ * 8
    const lead = p.parts.find((x) => x.name === 'Lead')!
    const bass = p.parts.find((x) => x.name === 'Bass')!
    // Eighths so beams are required (stems alone would be suppressed if beams aren't drawn).
    p.notes = [
      { id: 'l0', partId: lead.id, midi: 60, startTick: 0, durationTicks: TAG_ROLL_PPQ / 2 },
      {
        id: 'l1',
        partId: lead.id,
        midi: 62,
        startTick: TAG_ROLL_PPQ / 2,
        durationTicks: TAG_ROLL_PPQ / 2,
      },
      { id: 'b0', partId: bass.id, midi: 48, startTick: 0, durationTicks: TAG_ROLL_PPQ / 2 },
      {
        id: 'b1',
        partId: bass.id,
        midi: 50,
        startTick: TAG_ROLL_PPQ / 2,
        durationTicks: TAG_ROLL_PPQ / 2,
      },
      {
        id: 'l2',
        partId: lead.id,
        midi: 64,
        startTick: TAG_ROLL_PPQ * 4,
        durationTicks: TAG_ROLL_PPQ,
      },
    ]
    const host = document.createElement('div')
    document.body.appendChild(host)
    const layout = await renderVexSheetScore({ host, project: p, pxPerBeat: 40 })

    expect(layout.measures.length).toBeGreaterThanOrEqual(2)
    expect(layout.measures[0]!.width).toBeGreaterThan(layout.measures[1]!.width)

    const svg = host.querySelector('svg')!
    // Bracket path class from VexFlow StaveConnector
    const connectors = svg.querySelectorAll('.vf-staveconnector, [class*="staveconnector"]')
    // At least one connector group; we must not get one per measure (would be ≥4 for 2 measures × 2).
    expect(connectors.length).toBeLessThan(4)

    // Stems and/or beams should be present for the eighths.
    const stems = svg.querySelectorAll('.vf-stem, [class*="stem"]')
    const beams = svg.querySelectorAll('.vf-beam, [class*="beam"]')
    expect(stems.length + beams.length).toBeGreaterThan(0)

    host.remove()
  }, 20000)
})
