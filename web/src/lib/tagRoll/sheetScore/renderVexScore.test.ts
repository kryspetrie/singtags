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

    // Approaching a system wrap must not slide X backwards on the same line (CR-before-LF).
    const wrapTo = layout.measures.find((m) => m.systemIndex > 0)
    expect(wrapTo).toBeTruthy()
    const prev = layout.measures.find((m) => m.endTick === wrapTo!.startTick)
    expect(prev).toBeTruthy()
    expect(prev!.systemIndex).toBe(wrapTo!.systemIndex - 1)
    let prevX = -Infinity
    const span = Math.max(1, prev!.endTick - prev!.startTick)
    for (let i = 0; i < 8; i++) {
      const t = prev!.startTick + Math.floor((span * i) / 8)
      const pt = layout.tickToPoint(t)
      expect(pt.y).toBe(prev!.y)
      expect(pt.x).toBeGreaterThanOrEqual(prevX - 0.5)
      prevX = pt.x
    }
    const after = layout.tickToPoint(wrapTo!.startTick + 1)
    expect(after.y).toBe(wrapTo!.y)
    expect(after.y).toBeGreaterThan(prev!.y)
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
      // Size uses scoreScale (engravingScale ignored when both set — locked in the store).
      engravingScale: 1.4,
      scoreScale: 1.2,
      staveGapFine: 1.6,
      systemGap: 1,
    })
    expect(scaled.systemBodyHeight).toBeGreaterThan(base.systemBodyHeight)
    expect(scaled.width).toBeGreaterThan(base.width)
    expect(scaled.sizeScale).toBeCloseTo(1.2, 5)
    // True Size: SVG display size is viewBox × sizeScale (glyphs scale with staves).
    const svg = host.querySelector('svg')
    expect(svg).toBeTruthy()
    const vb = svg!.getAttribute('viewBox')?.split(/\s+/).map(Number) ?? []
    expect(vb.length).toBe(4)
    expect(Number(svg!.getAttribute('width'))).toBeCloseTo(vb[2]! * 1.2, 0)
    expect(Number(svg!.getAttribute('height'))).toBeCloseTo(vb[3]! * 1.2, 0)

    const withNames = await renderVexSheetScore({
      host,
      project: p,
      pxPerBeat: 40,
      marginLeftIn: 0.25,
      marginTopIn: 0.25,
      scoreScale: 1,
      showPartNames: true,
    })
    expect(withNames.marginsPx.left).toBeGreaterThan(base.marginsPx.left)
    expect(withNames.measures[0]!.x).toBeGreaterThan(base.measures[0]!.x)

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
      showLyrics: false,
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
      showLyrics: false,
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

  it('draws part names only on the first system and keeps them on-canvas', async () => {
    await ensureVexFonts()
    const p = createEmptyTagRollProject()
    p.lengthTicks = TAG_ROLL_PPQ * 32
    const lead = p.parts.find((x) => x.name === 'Lead')!
    const tenor = p.parts.find((x) => x.name === 'Tenor')!
    const bari = p.parts.find((x) => x.name === 'Bari')!
    const bass = p.parts.find((x) => x.name === 'Bass')!
    p.notes = []
    for (let i = 0; i < 16; i++) {
      const t = i * TAG_ROLL_PPQ * 2
      p.notes.push(
        { id: `t${i}`, partId: tenor.id, midi: 67, startTick: t, durationTicks: TAG_ROLL_PPQ },
        { id: `l${i}`, partId: lead.id, midi: 60, startTick: t, durationTicks: TAG_ROLL_PPQ },
        { id: `r${i}`, partId: bari.id, midi: 55, startTick: t, durationTicks: TAG_ROLL_PPQ },
        { id: `b${i}`, partId: bass.id, midi: 48, startTick: t, durationTicks: TAG_ROLL_PPQ },
      )
    }
    const host = document.createElement('div')
    document.body.appendChild(host)
    const layout = await renderVexSheetScore({
      host,
      project: p,
      pxPerBeat: 56,
      sheetLayout: 'page',
      pageWidthIn: 5.5,
      pageHeightIn: 11,
      pageDpi: 96,
      scoreScale: 1,
      showPartNames: true,
      marginLeftIn: 0.3,
    })
    expect(Math.max(...layout.measures.map((m) => m.systemIndex))).toBeGreaterThan(0)

    const labels = [...host.querySelectorAll('text')]
      .map((el) => ({
        text: (el.textContent ?? '').trim(),
        x: Number(el.getAttribute('x') ?? NaN),
      }))
      .filter((t) => /Tenor|Lead|Bari|Bass/.test(t.text))

    // One label per staff on system 0 only (joined "Tenor · Lead" / "Bari · Bass").
    expect(labels.length).toBe(2)
    expect(labels.some((l) => l.text.includes('Tenor'))).toBe(true)
    expect(labels.some((l) => l.text.includes('Bass') || l.text.includes('Bari'))).toBe(true)
    for (const l of labels) {
      expect(Number.isFinite(l.x)).toBe(true)
      expect(l.x).toBeGreaterThanOrEqual(0)
    }
    host.remove()
  }, 30000)

  it('trims trailing empty measures from the engraved score', async () => {
    await ensureVexFonts()
    const p = createEmptyTagRollProject()
    p.lengthTicks = TAG_ROLL_PPQ * 4 * 8
    const lead = p.parts.find((x) => x.name === 'Lead')!
    p.notes = [
      {
        id: 'n0',
        partId: lead.id,
        midi: 60,
        startTick: 0,
        durationTicks: TAG_ROLL_PPQ,
      },
    ]
    const host = document.createElement('div')
    document.body.appendChild(host)
    const layout = await renderVexSheetScore({
      host,
      project: p,
      pxPerBeat: 40,
      sheetLayout: 'continuous',
    })
    expect(layout.measures).toHaveLength(1)
    expect(layout.measures[0]!.endTick).toBe(TAG_ROLL_PPQ * 4)
    host.remove()
  }, 30000)

  it('scales System rows: 0% near-flush, 100% comfortable, 300% much wider', async () => {
    await ensureVexFonts()
    const p = createEmptyTagRollProject()
    p.lengthTicks = TAG_ROLL_PPQ * 32
    const lead = p.parts.find((x) => x.name === 'Lead')!
    const bass = p.parts.find((x) => x.name === 'Bass')!
    p.notes = []
    for (let i = 0; i < 16; i++) {
      const t = i * TAG_ROLL_PPQ * 2
      p.notes.push(
        { id: `l${i}`, partId: lead.id, midi: 60, startTick: t, durationTicks: TAG_ROLL_PPQ },
        { id: `b${i}`, partId: bass.id, midi: 40, startTick: t, durationTicks: TAG_ROLL_PPQ },
      )
    }
    const host = document.createElement('div')
    document.body.appendChild(host)
    const common = {
      host,
      project: p,
      pxPerBeat: 64,
      sheetLayout: 'page' as const,
      pageWidthIn: 4.5,
      pageHeightIn: 14,
      pageDpi: 96,
      staveGapFine: 1,
      showLyrics: false,
    }
    const at100 = await renderVexSheetScore({ ...common, systemGap: 1 })
    const at0 = await renderVexSheetScore({ ...common, systemGap: 0 })
    const at300 = await renderVexSheetScore({ ...common, systemGap: 3 })
    expect(at0.systemBodyHeight).toBeLessThan(at100.systemBodyHeight)
    expect(at300.systemBodyHeight).toBe(at100.systemBodyHeight)
    const y1 = (layout: typeof at100) =>
      layout.measures.find((m) => m.systemIndex === 1)?.y
    expect(y1(at100)).toBeTruthy()
    expect(y1(at0)).toBeTruthy()
    expect(y1(at300)).toBeTruthy()
    const stride = (layout: typeof at100) =>
      y1(layout)! - layout.measures.find((m) => m.systemIndex === 0)!.y
    const s0 = stride(at0)
    const s100 = stride(at100)
    const s300 = stride(at300)
    expect(s100).toBeGreaterThanOrEqual(at100.systemBodyHeight)
    expect(s100).toBeGreaterThan(s0)
    // 300% should open far more than the 0→100 comfort band alone.
    expect(s300 - s100).toBeGreaterThan(s100 - s0)
    host.remove()
  }, 30000)

  it('widens system gaps for stacked sheet chord marks', async () => {
    await ensureVexFonts()
    const p = createEmptyTagRollProject()
    p.lengthTicks = TAG_ROLL_PPQ * 32
    p.view.sheetShowSketchChords = true
    p.view.sheetChordMarkStyle = 'boxed'
    const lead = p.parts.find((x) => x.name === 'Lead')!
    p.notes = []
    for (let i = 0; i < 16; i++) {
      p.notes.push({
        id: `n${i}`,
        partId: lead.id,
        midi: 60,
        startTick: i * TAG_ROLL_PPQ * 2,
        durationTicks: TAG_ROLL_PPQ,
      })
    }
    // Dense overlapping boxed marks on system 0 force extra clearance.
    p.harmonySketch = Array.from({ length: 8 }, (_, i) => ({
      id: `c${i}`,
      startTick: i * 60,
      endTick: i * 60 + 120,
      rootPc: i % 12,
      quality: 'major' as const,
      locked: true,
    }))
    const host = document.createElement('div')
    document.body.appendChild(host)
    const withChords = await renderVexSheetScore({
      host,
      project: p,
      pxPerBeat: 56,
      sheetLayout: 'page',
      pageWidthIn: 5.5,
      pageHeightIn: 11,
      pageDpi: 96,
      systemGap: 0.5,
      showLyrics: false,
    })
    p.view.sheetShowSketchChords = false
    const without = await renderVexSheetScore({
      host,
      project: p,
      pxPerBeat: 56,
      sheetLayout: 'page',
      pageWidthIn: 5.5,
      pageHeightIn: 11,
      pageDpi: 96,
      systemGap: 0.5,
      showLyrics: false,
    })
    const si1With = withChords.measures.find((m) => m.systemIndex === 1)
    const si1Without = without.measures.find((m) => m.systemIndex === 1)
    expect(si1With).toBeTruthy()
    expect(si1Without).toBeTruthy()
    expect(si1With!.y).toBeGreaterThan(si1Without!.y)
    host.remove()
  }, 30000)

  it('full-justifies every page system to the same inner width', async () => {
    await ensureVexFonts()
    const p = createEmptyTagRollProject()
    p.lengthTicks = TAG_ROLL_PPQ * 32
    const lead = p.parts.find((x) => x.name === 'Lead')!
    p.notes = Array.from({ length: 8 }, (_, i) => ({
      id: `n${i}`,
      partId: lead.id,
      midi: 60 + (i % 3),
      startTick: i * TAG_ROLL_PPQ * 4,
      durationTicks: TAG_ROLL_PPQ * 2,
    }))
    const host = document.createElement('div')
    document.body.appendChild(host)
    const pageW = 480
    const layout = await renderVexSheetScore({
      host,
      project: p,
      pxPerBeat: 36,
      sheetLayout: 'page',
      measureSizing: 'dynamic',
      fullJustify: true,
      pageWidthIn: pageW / 96,
      pageHeightIn: 11,
      pageDpi: 96,
      marginLeftIn: 0.25,
      marginRightIn: 0.25,
      viewportWidth: pageW,
    })
    const systems = new Map<number, typeof layout.measures>()
    for (const m of layout.measures) {
      const row = systems.get(m.systemIndex) ?? []
      row.push(m)
      systems.set(m.systemIndex, row)
    }
    expect(systems.size).toBeGreaterThan(1)
    const ends = [...systems.values()].map((row) => {
      const right = Math.max(...row.map((m) => m.x + m.width))
      const left = Math.min(...row.map((m) => m.x))
      return Math.round(right - left)
    })
    const first = ends[0]!
    for (const end of ends) expect(end).toBe(first)
    // Ragged systems would be shorter; justified rows share one filled width.
    expect(first).toBeGreaterThan(300)
    host.remove()
  }, 20000)

  it('prints a new key signature mid-system when the key marker changes', async () => {
    await ensureVexFonts()
    const p = createEmptyTagRollProject()
    p.tonality = 0
    p.preferFlats = false
    p.keyMarkers = [
      { id: 'k0', tick: 0, tonality: 0, tonalityMode: 'major', preferFlats: false },
      {
        id: 'k1',
        tick: TAG_ROLL_PPQ * 4,
        tonality: 7,
        tonalityMode: 'major',
        preferFlats: false,
      },
    ]
    p.lengthTicks = TAG_ROLL_PPQ * 8
    const lead = p.parts.find((x) => x.name === 'Lead')!
    p.notes = [
      { id: 'a', partId: lead.id, midi: 60, startTick: 0, durationTicks: TAG_ROLL_PPQ },
      {
        id: 'b',
        partId: lead.id,
        midi: 67,
        startTick: TAG_ROLL_PPQ * 4,
        durationTicks: TAG_ROLL_PPQ,
      },
    ]
    const host = document.createElement('div')
    document.body.appendChild(host)
    // Wide continuous viewport keeps both measures on one system (mid-system key path).
    await renderVexSheetScore({
      host,
      project: p,
      pxPerBeat: 28,
      sheetLayout: 'continuous',
      viewportWidth: 2400,
    })
    const svg = host.querySelector('svg')
    expect(svg).toBeTruthy()
    host.remove()
  }, 20000)

  it('spells mid-song flat keys with flats even when the opening key prefers sharps', async () => {
    await ensureVexFonts()
    const p = createEmptyTagRollProject()
    p.tonality = 0
    p.preferFlats = false
    p.tonalityMode = 'major'
    p.lengthTicks = TAG_ROLL_PPQ * 8
    p.keyMarkers = [
      { id: 'k0', tick: 0, tonality: 0, tonalityMode: 'major', preferFlats: false },
      {
        id: 'k1',
        tick: TAG_ROLL_PPQ * 4,
        tonality: 1,
        tonalityMode: 'major',
        preferFlats: true,
      },
    ]
    const lead = p.parts.find((x) => x.name === 'Lead')!
    // MIDI 61 = C#/Db. After the Db marker it must be spelled as a flat.
    p.notes = [
      {
        id: 'l',
        partId: lead.id,
        midi: 61,
        startTick: TAG_ROLL_PPQ * 4,
        durationTicks: TAG_ROLL_PPQ,
      },
    ]
    const host = document.createElement('div')
    document.body.appendChild(host)
    await renderVexSheetScore({ host, project: p, pxPerBeat: 40 })
    const texts = [...host.querySelectorAll('svg text')].map((t) => t.textContent ?? '')
    const flatHit = texts.some((t) => /[\uE260♭]/.test(t))
    const sharpHit = texts.some((t) => /[\uE262♯]/.test(t))
    expect(flatHit).toBe(true)
    expect(sharpHit).toBe(false)
    host.remove()
  }, 20000)

  it('draws straight lyric lanes above/below each staff', async () => {
    await ensureVexFonts()
    const p = createEmptyTagRollProject()
    const tenor = p.parts.find((x) => x.name === 'Tenor')!
    const lead = p.parts.find((x) => x.name === 'Lead')!
    const bari = p.parts.find((x) => x.name === 'Bari')!
    const bass = p.parts.find((x) => x.name === 'Bass')!
    p.notes = [
      { id: 't', partId: tenor.id, midi: 67, startTick: 0, durationTicks: TAG_ROLL_PPQ, lyric: 'Ten' },
      { id: 'l', partId: lead.id, midi: 60, startTick: 0, durationTicks: TAG_ROLL_PPQ, lyric: 'Lead' },
      { id: 'r', partId: bari.id, midi: 55, startTick: 0, durationTicks: TAG_ROLL_PPQ, lyric: 'Bar' },
      { id: 'b', partId: bass.id, midi: 48, startTick: 0, durationTicks: TAG_ROLL_PPQ, lyric: 'Bass' },
    ]
    const host = document.createElement('div')
    document.body.appendChild(host)
    await renderVexSheetScore({
      host,
      project: p,
      pxPerBeat: 40,
      showLyrics: true,
      straightLyrics: true,
    })
    const lanes = [...host.querySelectorAll('[data-sheet-lyric-lane]')]
    expect(lanes).toHaveLength(4)
    const above = lanes.filter((el) => el.getAttribute('data-sheet-lyric-lane') === 'above')
    const below = lanes.filter((el) => el.getAttribute('data-sheet-lyric-lane') === 'below')
    expect(above).toHaveLength(2)
    expect(below).toHaveLength(2)
    const ys = (els: Element[]) =>
      els.map((el) => Number((el as SVGTextElement).getAttribute('y'))).sort((a, b) => a - b)
    const a = ys(above)
    const b = ys(below)
    // Vertical order: tenor(above) < lead(below) < bari(above) < bass(below).
    expect(a[0]!).toBeLessThan(b[0]!)
    expect(b[0]!).toBeLessThan(a[1]!)
    expect(a[1]!).toBeLessThan(b[1]!)
    const backs = host.querySelectorAll('.sheet-lyric-backdrop')
    expect(backs.length).toBe(4)
    const svg = host.querySelector('svg')!
    const kids = [...svg.children]
    const lyricIdx = kids.findIndex((el) => el.classList?.contains('sheet-lyric-layer'))
    const noteIdx = kids.findIndex((el) =>
      (el.getAttribute('class') || '').includes('stavenote'),
    )
    expect(lyricIdx).toBeGreaterThanOrEqual(0)
    expect(noteIdx).toBeGreaterThan(lyricIdx)
    host.remove()
  }, 20000)

  it('hides straight lyrics for parts marked not visible', async () => {
    await ensureVexFonts()
    const p = createEmptyTagRollProject()
    const tenor = p.parts.find((x) => x.name === 'Tenor')!
    const lead = p.parts.find((x) => x.name === 'Lead')!
    p.notes = [
      { id: 't', partId: tenor.id, midi: 67, startTick: 0, durationTicks: TAG_ROLL_PPQ, lyric: 'Ten' },
      { id: 'l', partId: lead.id, midi: 60, startTick: 0, durationTicks: TAG_ROLL_PPQ, lyric: 'Lead' },
    ]
    const host = document.createElement('div')
    document.body.appendChild(host)
    await renderVexSheetScore({
      host,
      project: p,
      pxPerBeat: 40,
      showLyrics: true,
      straightLyrics: true,
      lyricPartVisible: { [tenor.id]: false },
    })
    const texts = [...host.querySelectorAll('[data-sheet-lyric-lane]')].map(
      (el) => el.textContent,
    )
    expect(texts).toEqual(['Lead'])
    host.remove()
  }, 20000)

  it('draws crossover × marks when lead is above tenor', async () => {
    await ensureVexFonts()
    const p = createEmptyTagRollProject()
    const tenor = p.parts.find((x) => x.name === 'Tenor')!
    const lead = p.parts.find((x) => x.name === 'Lead')!
    // Stemless whole notes — lead above tenor on the upper staff.
    p.notes = [
      { id: 't', partId: tenor.id, midi: 60, startTick: 0, durationTicks: TAG_ROLL_PPQ * 4 },
      { id: 'l', partId: lead.id, midi: 67, startTick: 0, durationTicks: TAG_ROLL_PPQ * 4 },
    ]
    const host = document.createElement('div')
    document.body.appendChild(host)
    await renderVexSheetScore({ host, project: p, pxPerBeat: 40 })
    expect(host.querySelectorAll('[data-sheet-crossover="1"]').length).toBe(1)
    host.replaceChildren()
    await renderVexSheetScore({
      host,
      project: p,
      pxPerBeat: 40,
      showCrossoverMarks: false,
    })
    expect(host.querySelectorAll('[data-sheet-crossover="1"]').length).toBe(0)
    host.remove()
  }, 20000)

  it('draws augmentation dots on dotted notes', async () => {
    await ensureVexFonts()
    const p = createEmptyTagRollProject()
    const lead = p.parts.find((x) => x.name === 'Lead')!
    p.notes = [
      {
        id: 'dq',
        partId: lead.id,
        midi: 60,
        startTick: 0,
        durationTicks: Math.round(TAG_ROLL_PPQ * 1.5),
      },
    ]
    const host = document.createElement('div')
    document.body.appendChild(host)
    await renderVexSheetScore({ host, project: p, pxPerBeat: 40 })
    // VexFlow paints the SMuFL augmentation dot as a second <text> in the notehead.
    const stemmed = [...host.querySelectorAll('.vf-stavenote')].filter((n) =>
      n.querySelector('.vf-stem, [class*="stem"]'),
    )
    expect(stemmed.some((n) => n.querySelectorAll('text').length >= 2)).toBe(true)
    host.remove()
  }, 20000)

  it('draws ties across barlines', async () => {
    await ensureVexFonts()
    const p = createEmptyTagRollProject()
    const lead = p.parts.find((x) => x.name === 'Lead')!
    p.notes = [
      {
        id: 'long',
        partId: lead.id,
        midi: 60,
        startTick: TAG_ROLL_PPQ * 3,
        durationTicks: TAG_ROLL_PPQ * 2,
      },
    ]
    p.lengthTicks = TAG_ROLL_PPQ * 8
    const host = document.createElement('div')
    document.body.appendChild(host)
    await renderVexSheetScore({ host, project: p, pxPerBeat: 40 })
    const ties = host.querySelectorAll('.vf-stavetie, [class*="stavetie"], [class*="StaveTie"]')
    expect(ties.length).toBeGreaterThan(0)
    host.remove()
  }, 20000)

  it('draws accidental glyphs for notes outside the key signature', async () => {
    await ensureVexFonts()
    const p = createEmptyTagRollProject()
    p.tonality = 0
    p.preferFlats = false
    const lead = p.parts.find((x) => x.name === 'Lead')!
    const bass = p.parts.find((x) => x.name === 'Bass')!
    // F#4 and Bb2 — neither is in C major.
    p.notes = [
      { id: 'l', partId: lead.id, midi: 66, startTick: 0, durationTicks: TAG_ROLL_PPQ },
      { id: 'b', partId: bass.id, midi: 46, startTick: 0, durationTicks: TAG_ROLL_PPQ },
    ]
    const host = document.createElement('div')
    document.body.appendChild(host)
    await renderVexSheetScore({ host, project: p, pxPerBeat: 40 })
    const svg = host.querySelector('svg')!
    const html = svg.outerHTML
    const accidentalNodes = svg.querySelectorAll(
      '.vf-accidental, [class*="accidental"], [class*="Accidental"]',
    )
    // Bravura glyphs may land in <text> without a dedicated class — accept either.
    const glyphHit =
      accidentalNodes.length > 0 ||
      /[\uE260-\uE26F\u266D\u266F♮♯♭]/.test(html) ||
      [...svg.querySelectorAll('text')].some((t) => /[#b♮♯♭]/.test(t.textContent ?? ''))
    expect(glyphHit).toBe(true)
    host.remove()
  }, 20000)

  it('spells the same MIDI as Ab under Ab7 and G# under E7', async () => {
    await ensureVexFonts()
    const midi = 68 // G#4 / Ab4
    const leadOf = () => {
      const p = createEmptyTagRollProject()
      p.tonality = 0
      p.preferFlats = false
      const lead = p.parts.find((x) => x.name === 'Lead')!
      p.notes = [
        { id: 'l', partId: lead.id, midi, startTick: 0, durationTicks: TAG_ROLL_PPQ },
      ]
      return p
    }
    const ab = leadOf()
    ab.harmonySketch = [
      {
        id: 'ab7',
        startTick: 0,
        endTick: TAG_ROLL_PPQ * 4,
        rootPc: 8,
        quality: 'seventh',
        source: 'user',
        locked: true,
      },
    ]
    const e7 = leadOf()
    e7.harmonySketch = [
      {
        id: 'e7',
        startTick: 0,
        endTick: TAG_ROLL_PPQ * 4,
        rootPc: 4,
        quality: 'seventh',
        source: 'user',
        locked: true,
      },
    ]

    const { spellWrittenMidi, spelledPitchToVexKey } = await import('./sheetPitchSpelling')
    expect(spelledPitchToVexKey(spellWrittenMidi(midi, ab, 0))).toBe('ab/4')
    expect(spelledPitchToVexKey(spellWrittenMidi(midi, e7, 0))).toBe('g#/4')

    for (const project of [ab, e7]) {
      const host = document.createElement('div')
      document.body.appendChild(host)
      await renderVexSheetScore({ host, project, pxPerBeat: 40 })
      expect(host.querySelector('svg')).toBeTruthy()
      host.remove()
    }
  }, 20000)
})
