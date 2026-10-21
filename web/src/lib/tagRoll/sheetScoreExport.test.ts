/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createEmptyTagRollProject } from './normalize'
import { TAG_ROLL_PPQ } from './types'

const downloadBlob = vi.fn()
const buildZip = vi.fn((files: Array<{ name: string; data: Uint8Array }>) => {
  const enc = new TextEncoder()
  return enc.encode(files.map((f) => f.name).join('|'))
})

vi.mock('../../download/zip', () => ({
  downloadBlob: (...args: unknown[]) => downloadBlob(...args),
  buildZip: (...args: unknown[]) => buildZip(...args),
}))

const renderVexSheetScore = vi.fn()

vi.mock('./sheetScore/renderVexScore', () => ({
  renderVexSheetScore: (...args: unknown[]) => renderVexSheetScore(...args),
}))

vi.mock('./sheetExportFonts', () => ({
  injectSheetExportFonts: vi.fn(async () => undefined),
  sheetExportFontNames: () => ['Bravura', 'Academico'],
}))

vi.mock('./sheetSvgTextToPaths', () => ({
  convertSvgTextToPaths: vi.fn(async (svg: SVGSVGElement) => {
    // Simulate outlining: leave a marker so tests can assert the vector path ran.
    svg.setAttribute('data-text-outlined', '1')
  }),
}))

const svgMock = vi.fn(async () => undefined)
const addImageMock = vi.fn()

vi.mock('jspdf', () => {
  class MockJsPDF {
    svg = svgMock
    addPage = vi.fn()
    addImage = addImageMock
    setFillColor = vi.fn()
    rect = vi.fn()
    setTextColor = vi.fn()
    setFont = vi.fn()
    setFontSize = vi.fn()
    text = vi.fn()
    output = vi.fn(() => new ArrayBuffer(8))
  }
  return { jsPDF: MockJsPDF }
})

vi.mock('svg2pdf.js', () => ({}))

function stubLayout(
  host: HTMLElement,
  opts: {
    width: number
    height: number
    pages?: Array<{ index: number; y: number; width: number; height: number }>
  },
) {
  host.replaceChildren()
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('width', String(opts.width))
  svg.setAttribute('height', String(opts.height))
  svg.setAttribute('viewBox', `0 0 ${opts.width} ${opts.height}`)
  host.appendChild(svg)
  return {
    width: opts.width,
    height: opts.height,
    contentOriginX: 0,
    contentOriginY: 0,
    systemBodyHeight: 120,
    sizeScale: 1,
    marginsPx: { left: 28, right: 28, top: 28, bottom: 28 },
    measures: [],
    pages: opts.pages ?? [],
    tickToX: () => 0,
    tickToPoint: () => ({ x: 0, y: 0 }),
    pointToTick: () => 0,
  }
}

beforeEach(() => {
  downloadBlob.mockReset()
  buildZip.mockClear()
  renderVexSheetScore.mockReset()
  svgMock.mockClear()
  addImageMock.mockClear()
  const ctxStub = {
    fillStyle: '',
    fillRect: vi.fn(),
    drawImage: vi.fn(),
    font: '',
    textAlign: 'left' as CanvasTextAlign,
    fillText: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    scale: vi.fn(),
  }
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ctxStub as unknown as CanvasRenderingContext2D)
  HTMLCanvasElement.prototype.toBlob = function (
    cb: BlobCallback,
    type?: string,
  ) {
    const mime = type || 'image/png'
    cb(new Blob([new Uint8Array([1, 2, 3])], { type: mime }))
  }
  Object.defineProperty(globalThis.Image.prototype, 'src', {
    configurable: true,
    set(this: HTMLImageElement) {
      Object.defineProperty(this, 'naturalWidth', { configurable: true, value: 100 })
      Object.defineProperty(this, 'naturalHeight', { configurable: true, value: 100 })
      Object.defineProperty(this, 'width', { configurable: true, value: 100 })
      Object.defineProperty(this, 'height', { configurable: true, value: 100 })
      Promise.resolve().then(() => {
        this.onload?.(new Event('load'))
      })
    },
  })
})

describe('sheetScoreExport', () => {
  it('exports continuous PNG as a single long image', async () => {
    const p = createEmptyTagRollProject()
    p.view.sheetLayout = 'continuous'
    p.title = 'Long Tag'
    renderVexSheetScore.mockImplementation(async (opts: { host: HTMLElement }) =>
      stubLayout(opts.host, { width: 2400, height: 400 }),
    )
    const { exportSheetImage } = await import('./sheetScoreExport')
    await exportSheetImage(p, 'png')
    expect(buildZip).not.toHaveBeenCalled()
    expect(downloadBlob).toHaveBeenCalledOnce()
    expect(downloadBlob.mock.calls[0]![1]).toBe('Long_Tag.png')
    expect(downloadBlob.mock.calls[0]![2]).toBe('image/png')
  })

  it('zips multi-page PNG for page layout', async () => {
    const p = createEmptyTagRollProject()
    p.view.sheetLayout = 'page'
    p.view.sheetPageWidthIn = 8.5
    p.view.sheetPageHeightIn = 11
    p.view.sheetPageDpi = 96
    p.title = 'Paged'
    p.lengthTicks = TAG_ROLL_PPQ * 64
    renderVexSheetScore.mockImplementation(async (opts: { host: HTMLElement }) =>
      stubLayout(opts.host, {
        width: 816,
        height: 2200,
        pages: [
          { index: 0, y: 0, width: 816, height: 1056 },
          { index: 1, y: 1084, width: 816, height: 1056 },
        ],
      }),
    )
    const { exportSheetImage } = await import('./sheetScoreExport')
    await exportSheetImage(p, 'png')
    expect(buildZip).toHaveBeenCalledOnce()
    const files = buildZip.mock.calls[0]![0] as Array<{ name: string }>
    expect(files.map((f) => f.name)).toEqual(['Paged-p1.png', 'Paged-p2.png'])
    expect(downloadBlob.mock.calls[0]![1]).toBe('Paged-pages.zip')
    expect(downloadBlob.mock.calls[0]![2]).toBe('application/zip')
  })

  it('exports vector PDF via svg2pdf after outlining text', async () => {
    const p = createEmptyTagRollProject()
    p.view.sheetLayout = 'continuous'
    p.title = 'Vec'
    renderVexSheetScore.mockImplementation(async (opts: { host: HTMLElement }) =>
      stubLayout(opts.host, { width: 1800, height: 360 }),
    )
    const { exportSheetPdfVector } = await import('./sheetScoreExport')
    const { convertSvgTextToPaths } = await import('./sheetSvgTextToPaths')
    await exportSheetPdfVector(p)
    expect(convertSvgTextToPaths).toHaveBeenCalled()
    expect(svgMock).toHaveBeenCalled()
    const svgEl = svgMock.mock.calls[0]![0] as SVGSVGElement
    // svg2pdf skips visibility:hidden — must stay visible while off-screen.
    expect(svgEl.style.visibility).not.toBe('hidden')
    expect(svgEl.style.display).not.toBe('none')
    expect(addImageMock).not.toHaveBeenCalled()
    expect(downloadBlob.mock.calls[0]![1]).toBe('Vec-vector.pdf')
    expect(downloadBlob.mock.calls[0]![2]).toBe('application/pdf')
  })

  it('paints chord marks before vector PDF export', async () => {
    const p = createEmptyTagRollProject()
    p.view.sheetLayout = 'continuous'
    p.view.sheetShowSketchChords = false
    p.title = 'Chords'
    p.harmonySketch = [
      {
        id: 's1',
        startTick: 0,
        endTick: TAG_ROLL_PPQ * 4,
        rootPc: 0,
        quality: 'seventh',
        source: 'user',
        locked: true,
      },
    ]
    let exportedSvg: SVGSVGElement | null = null
    renderVexSheetScore.mockImplementation(async (opts: { host: HTMLElement }) => {
      const lay = stubLayout(opts.host, { width: 800, height: 300 })
      exportedSvg = opts.host.querySelector('svg')
      return {
        ...lay,
        measures: [
          {
            measureIndex: 0,
            startTick: 0,
            endTick: TAG_ROLL_PPQ * 4,
            x: 20,
            y: 100,
            width: 200,
            systemIndex: 0,
            noteStartX: 40,
            noteEndX: 200,
          },
        ],
        tickToPoint: (t: number) => ({
          x: 40 + (t / (TAG_ROLL_PPQ * 4)) * 160,
          y: 100,
        }),
      }
    })
    const { exportSheetPdfVector } = await import('./sheetScoreExport')
    await exportSheetPdfVector(p)
    expect(exportedSvg?.querySelector('[data-sheet-chord-marks]')).toBeTruthy()
    expect(downloadBlob.mock.calls[0]![1]).toBe('Chords-vector.pdf')
  })

  it('exports 300 DPI raster PDF for page layout', async () => {
    const p = createEmptyTagRollProject()
    p.view.sheetLayout = 'page'
    p.title = 'Raster'
    renderVexSheetScore.mockImplementation(async (opts: { host: HTMLElement }) =>
      stubLayout(opts.host, {
        width: 816,
        height: 1100,
        pages: [{ index: 0, y: 0, width: 816, height: 1056 }],
      }),
    )
    const { exportSheetPdfRaster, SHEET_PDF_RASTER_DPI } = await import('./sheetScoreExport')
    expect(SHEET_PDF_RASTER_DPI).toBe(300)
    await exportSheetPdfRaster(p)
    expect(downloadBlob.mock.calls[0]![1]).toBe('Raster.pdf')
    expect(downloadBlob.mock.calls[0]![2]).toBe('application/pdf')
    const bytes = downloadBlob.mock.calls[0]![0] as Uint8Array
    expect(new TextDecoder().decode(bytes.slice(0, 8))).toContain('%PDF')
  })
})
