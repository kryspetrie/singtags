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

  it('compressed layout shrinks sparse measures vs equal', async () => {
    await ensureVexFonts()
    const p = createEmptyTagRollProject()
    p.lengthTicks = TAG_ROLL_PPQ * 16
    const lead = p.parts.find((x) => x.name === 'Lead')!
    p.notes = [
      { id: 'a', partId: lead.id, midi: 60, startTick: 0, durationTicks: TAG_ROLL_PPQ },
      {
        id: 'b',
        partId: lead.id,
        midi: 62,
        startTick: TAG_ROLL_PPQ / 4,
        durationTicks: TAG_ROLL_PPQ / 4,
      },
      {
        id: 'c',
        partId: lead.id,
        midi: 64,
        startTick: TAG_ROLL_PPQ / 2,
        durationTicks: TAG_ROLL_PPQ / 4,
      },
      {
        id: 'd',
        partId: lead.id,
        midi: 65,
        startTick: (3 * TAG_ROLL_PPQ) / 4,
        durationTicks: TAG_ROLL_PPQ / 4,
      },
      // Measure 2: single long note (sparse)
      {
        id: 'e',
        partId: lead.id,
        midi: 60,
        startTick: TAG_ROLL_PPQ * 4,
        durationTicks: TAG_ROLL_PPQ * 4,
      },
    ]
    const host = document.createElement('div')
    document.body.appendChild(host)
    const equal = await renderVexSheetScore({
      host,
      project: p,
      pxPerBeat: 40,
      sheetLayout: 'continuous',
      measureSizing: 'equal',
    })
    const dynamic = await renderVexSheetScore({
      host,
      project: p,
      pxPerBeat: 40,
      sheetLayout: 'continuous',
      measureSizing: 'dynamic',
    })
    expect(dynamic.measures.length).toBe(equal.measures.length)
    // Sparse measure (index 1) should be narrower when dynamic.
    expect(dynamic.measures[1]!.width).toBeLessThan(equal.measures[1]!.width)
    // Dense measure stays readable and wider than sparse.
    expect(dynamic.measures[0]!.width).toBeGreaterThan(dynamic.measures[1]!.width)
    expect(typeof dynamic.tickToPoint).toBe('function')
    expect(dynamic.tickToPoint(0).y).toBe(dynamic.measures[0]!.y)
    host.remove()
  }, 20000)

  it('dynamic eighth-note run is wider than a sparse bar', async () => {
    await ensureVexFonts()
    const p = createEmptyTagRollProject()
    p.lengthTicks = TAG_ROLL_PPQ * 8
    const lead = p.parts.find((x) => x.name === 'Lead')!
    p.notes = [
      ...Array.from({ length: 8 }, (_, i) => ({
        id: `e${i}`,
        partId: lead.id,
        midi: 60 + (i % 3),
        startTick: (i * TAG_ROLL_PPQ) / 2,
        durationTicks: TAG_ROLL_PPQ / 2,
      })),
      {
        id: 'whole',
        partId: lead.id,
        midi: 62,
        startTick: TAG_ROLL_PPQ * 4,
        durationTicks: TAG_ROLL_PPQ * 4,
      },
    ]
    const host = document.createElement('div')
    document.body.appendChild(host)
    const layout = await renderVexSheetScore({
      host,
      project: p,
      pxPerBeat: 40,
      sheetLayout: 'continuous',
      measureSizing: 'dynamic',
    })
    expect(layout.measures[0]!.width).toBeGreaterThan(layout.measures[1]!.width)
    host.remove()
  }, 20000)

  it('page layout wraps systems within viewport width', async () => {
    await ensureVexFonts()
    const p = createEmptyTagRollProject()
    p.lengthTicks = TAG_ROLL_PPQ * 32
    const lead = p.parts.find((x) => x.name === 'Lead')!
    p.notes = Array.from({ length: 8 }, (_, i) => ({
      id: `n${i}`,
      partId: lead.id,
      midi: 60 + (i % 4),
      startTick: i * TAG_ROLL_PPQ * 4,
      durationTicks: TAG_ROLL_PPQ * 4,
    }))
    const host = document.createElement('div')
    document.body.appendChild(host)
    const layout = await renderVexSheetScore({
      host,
      project: p,
      pxPerBeat: 48,
      sheetLayout: 'page',
      measureSizing: 'dynamic',
      pageWidthIn: 420 / 96,
      pageHeightIn: 11,
      pageDpi: 96,
      viewportWidth: 420,
    })
    const maxSi = Math.max(...layout.measures.map((m) => m.systemIndex))
    expect(maxSi).toBeGreaterThan(0)
    expect(layout.pages.length).toBeGreaterThanOrEqual(1)
    expect(layout.width).toBeLessThanOrEqual(420 + 40)
    const mid = layout.measures[Math.floor(layout.measures.length / 2)]!
    const pt = layout.tickToPoint(mid.startTick + 10)
    expect(pt.y).toBe(mid.y)
    expect(layout.pointToTick(pt.x, pt.y)).toBeGreaterThanOrEqual(mid.startTick - 50)
    // Playhead x on a wrapped system must stay on that row, not use global strip coords.
    const last = layout.measures[layout.measures.length - 1]!
    const lastPt = layout.tickToPoint(last.startTick + 20)
    expect(lastPt.y).toBe(last.y)
    expect(lastPt.x).toBeLessThan(layout.width * 0.85)
    host.remove()
  }, 20000)

  it('margins and scales change packing geometry', async () => {
    await ensureVexFonts()
    const p = createEmptyTagRollProject()
    p.lengthTicks = TAG_ROLL_PPQ * 8
    const lead = p.parts.find((x) => x.name === 'Lead')!
    p.notes = [
      { id: 'a', partId: lead.id, midi: 60, startTick: 0, durationTicks: TAG_ROLL_PPQ * 4 },
      {
        id: 'b',
        partId: lead.id,
        midi: 62,
        startTick: TAG_ROLL_PPQ * 4,
        durationTicks: TAG_ROLL_PPQ * 4,
      },
    ]
    const host = document.createElement('div')
    document.body.appendChild(host)
    const base = await renderVexSheetScore({
      host,
      project: p,
      pxPerBeat: 40,
      marginLeftIn: 0.25,
      marginTopIn: 0.25,
      engravingScale: 1,
      scoreScale: 1,
      staveGapFine: 1,
      systemGap: 1,
    })
    const wideMargins = await renderVexSheetScore({
      host,
      project: p,
      pxPerBeat: 40,
      marginLeftIn: 1.25,
      marginTopIn: 1.25,
      engravingScale: 1,
      scoreScale: 1,
      staveGapFine: 1,
      systemGap: 1,
    })
    expect(wideMargins.measures[0]!.x).toBeGreaterThan(base.measures[0]!.x)
    expect(wideMargins.measures[0]!.y).toBeGreaterThan(base.measures[0]!.y)
    expect(base.marginsPx.left).toBe(Math.round(0.25 * 96))
    expect(wideMargins.marginsPx.left).toBe(Math.round(1.25 * 96))
    expect(wideMargins.height).toBeGreaterThan(base.height)

    const tallBottom = await renderVexSheetScore({
      host,
      project: p,
      pxPerBeat: 40,
      marginLeftIn: 0.25,
      marginTopIn: 0.25,
      marginBottomIn: 1.5,
      engravingScale: 1,
      scoreScale: 1,
    })
    expect(tallBottom.marginsPx.bottom).toBe(Math.round(1.5 * 96))
    expect(tallBottom.height).toBeGreaterThan(base.height)

    const scaled = await renderVexSheetScore({
      host,
      project: p,
      pxPerBeat: 40,
      marginLeftIn: 0.25,
      marginTopIn: 0.25,
      engravingScale: 1.4,
      scoreScale: 1.2,
      staveGapFine: 1.6,
      systemGap: 1,
    })
    expect(scaled.systemBodyHeight).toBeGreaterThan(base.systemBodyHeight)
    expect(scaled.width).toBeGreaterThan(base.width)

    const pageA = await renderVexSheetScore({
      host,
      project: p,
      pxPerBeat: 48,
      sheetLayout: 'page',
      pageWidthIn: 8.5,
      pageHeightIn: 11,
      pageDpi: 96,
      systemGap: 0.5,
      staveGapFine: 1,
    })
    const pageB = await renderVexSheetScore({
      host,
      project: p,
      pxPerBeat: 48,
      sheetLayout: 'page',
      pageWidthIn: 8.5,
      pageHeightIn: 11,
      pageDpi: 96,
      systemGap: 2.5,
      staveGapFine: 1,
    })
    // With only one system these may match; force wrap with narrow page.
    const wrapTight = await renderVexSheetScore({
      host,
      project: p,
      pxPerBeat: 64,
      sheetLayout: 'page',
      pageWidthIn: 4.5,
      pageHeightIn: 11,
      pageDpi: 96,
      systemGap: 0.5,
      staveGapFine: 1,
    })
    const wrapLoose = await renderVexSheetScore({
      host,
      project: p,
      pxPerBeat: 64,
      sheetLayout: 'page',
      pageWidthIn: 4.5,
      pageHeightIn: 11,
      pageDpi: 96,
      systemGap: 2.8,
      staveGapFine: 1,
    })
    const maxSi = Math.max(...wrapTight.measures.map((m) => m.systemIndex))
    if (maxSi > 0) {
      const yTight = wrapTight.measures.find((m) => m.systemIndex === 1)!.y
      const yLoose = wrapLoose.measures.find((m) => m.systemIndex === 1)!.y
      expect(yLoose).toBeGreaterThan(yTight)
    }
    expect(pageA.width).toBe(pageB.width)
    host.remove()
  }, 30000)
})
