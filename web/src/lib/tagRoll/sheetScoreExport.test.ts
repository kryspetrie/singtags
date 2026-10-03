/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createEmptyTagRollProject } from './normalize'
import { TAG_ROLL_PPQ } from './types'

const downloadBlob = vi.fn()
const buildZip = vi.fn((files: Array<{ name: string; data: Uint8Array }>) => {
  // Encode filenames so tests can assert zip contents without parsing zip.
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

const svgMock = vi.fn(async () => undefined)

vi.mock('jspdf', () => {
  class MockJsPDF {
    svg = svgMock
    addPage = vi.fn()
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
  host.appendChild(svg)
  return {
    width: opts.width,
    height: opts.height,
    contentOriginX: 0,
    contentOriginY: 0,
    systemBodyHeight: 120,
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
  const ctxStub = {
    fillStyle: '',
    fillRect: vi.fn(),
    drawImage: vi.fn(),
    font: '',
    textAlign: 'left' as CanvasTextAlign,
    fillText: vi.fn(),
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

  it('exports vector PDF via svg2pdf for continuous layout', async () => {
    const p = createEmptyTagRollProject()
    p.view.sheetLayout = 'continuous'
    p.title = 'Vec'
    renderVexSheetScore.mockImplementation(async (opts: { host: HTMLElement }) =>
      stubLayout(opts.host, { width: 1800, height: 360 }),
    )
    const { exportSheetPdfVector } = await import('./sheetScoreExport')
    await exportSheetPdfVector(p)
    expect(svgMock).toHaveBeenCalled()
    expect(downloadBlob.mock.calls[0]![1]).toBe('Vec-vector.pdf')
    expect(downloadBlob.mock.calls[0]![2]).toBe('application/pdf')
  })

  it('exports raster PDF for page layout', async () => {
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
    const { exportSheetPdfRaster } = await import('./sheetScoreExport')
    await exportSheetPdfRaster(p)
    expect(downloadBlob.mock.calls[0]![1]).toBe('Raster.pdf')
    expect(downloadBlob.mock.calls[0]![2]).toBe('application/pdf')
    const bytes = downloadBlob.mock.calls[0]![0] as Uint8Array
    expect(new TextDecoder().decode(bytes.slice(0, 8))).toContain('%PDF')
  })
})
