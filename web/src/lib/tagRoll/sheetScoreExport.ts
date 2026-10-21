/**
 * Export Tag Studio engraved sheet as PNG, WebP, or PDF.
 * Page layout → multi-page PDF / zip of images; continuous → one long strip.
 *
 * Raster PDF: 300 DPI JPEG pages (fonts embedded as @font-face for SVG→bitmap).
 * Vector PDF: SMuFL/lyric <text> outlined to <path>, then svg2pdf (true vectors).
 */
import { jsPDF } from 'jspdf'
import 'svg2pdf.js'
import { buildZip, downloadBlob } from '../../download/zip'
import type { TagRollProject } from './types'
import { renderVexSheetScore, type VexScoreLayoutResult, type VexScorePageGeom } from './sheetScore/renderVexScore'
import { sheetPageHeightPx, sheetPageWidthPx } from './sheetPage'
import {
  paintSheetChordMarks,
  type SheetChordDetectSegment,
} from './sheetChordMarks'
import { injectSheetExportFonts, sheetExportFontNames } from './sheetExportFonts'
import { convertSvgTextToPaths } from './sheetSvgTextToPaths'

export type SheetImageFormat = 'png' | 'webp'
export type SheetPdfKind = 'raster' | 'vector'

export type SheetExportOptions = {
  /** Detected chord segments (required for Detected overlays when that toggle is on). */
  detectSegments?: readonly SheetChordDetectSegment[]
}

/** Screen layout DPI (Tag Studio page geometry default). */
const LAYOUT_DPI_DEFAULT = 96
/** Raster PDF always exports at print resolution. */
export const SHEET_PDF_RASTER_DPI = 300
/** Avoid OOM on very long continuous strips. */
const MAX_EXPORT_CANVAS_PIXELS = 24_000_000

function layoutDpi(project: TagRollProject): number {
  return project.view.sheetPageDpi ?? LAYOUT_DPI_DEFAULT
}

function exportPixelScale(
  targetDpi: number,
  screenDpi: number,
  /** Cap by one page (or full strip for continuous), not a stacked multi-page strip. */
  areaWidth: number,
  areaHeight: number,
): number {
  const raw = Math.max(1, targetDpi / Math.max(1, screenDpi))
  const area = Math.max(1, areaWidth * areaHeight)
  const capped = Math.sqrt(MAX_EXPORT_CANVAS_PIXELS / area)
  return Math.max(1, Math.min(raw, capped))
}

function exportRasterPixelScale(
  project: TagRollProject,
  layout: VexScoreLayoutResult,
): number {
  const screenDpi = layoutDpi(project)
  if (isPageLayout(project)) {
    const w = sheetPageWidthPx(project.view.sheetPageWidthIn ?? 8.5, screenDpi)
    const h = sheetPageHeightPx(project.view.sheetPageHeightIn ?? 11, screenDpi)
    return exportPixelScale(SHEET_PDF_RASTER_DPI, screenDpi, w, h)
  }
  return exportPixelScale(
    SHEET_PDF_RASTER_DPI,
    screenDpi,
    layout.width,
    layout.height,
  )
}

function safeFilename(title: string): string {
  const t = title.trim() || 'sheet'
  return t.replace(/[^\w\-]+/g, '_').slice(0, 80)
}

function estimateTitleBand(project: TagRollProject): number {
  if (project.view.sheetShowEngravedHeader === false) return 0
  const has =
    !!project.title?.trim() ||
    !!project.subtitle?.trim() ||
    !!project.composer?.trim() ||
    !!project.arranger?.trim()
  return has ? 92 : 0
}

function isPageLayout(project: TagRollProject): boolean {
  return project.view.sheetLayout === 'page'
}

async function renderOffscreen(
  project: TagRollProject,
  opts?: SheetExportOptions,
): Promise<{ host: HTMLElement; layout: VexScoreLayoutResult; svg: SVGSVGElement }> {
  const host = document.createElement('div')
  host.style.cssText = 'position:fixed;left:-99999px;top:0;visibility:hidden;pointer-events:none'
  document.body.appendChild(host)
  const page = isPageLayout(project)
  const layout = await renderVexSheetScore({
    host,
    project,
    pxPerBeat: project.view.sheetZoom,
    showLyrics: project.view.sheetShowLyrics !== false,
    sheetLayout: page ? 'page' : 'continuous',
    measureSizing: project.view.sheetMeasureSizing ?? 'dynamic',
    pageWidthIn: project.view.sheetPageWidthIn ?? 8.5,
    pageHeightIn: project.view.sheetPageHeightIn ?? 11,
    pageDpi: project.view.sheetPageDpi ?? 96,
    headerBandPx: page ? estimateTitleBand(project) : 0,
    noteColors: project.view.sheetNoteColors === true,
    staveGap: project.view.sheetStaveGap ?? 'normal',
    measureScale: project.view.sheetMeasureScale ?? 1,
    noteSpacing: project.view.sheetNoteSpacing ?? 1,
    beatStretch: project.view.sheetBeatStretch ?? 1,
    staveGapFine: project.view.sheetStaveGapFine ?? 1,
    systemGap: project.view.sheetSystemGap ?? 1,
    topMargin: project.view.sheetTopMargin ?? 1,
    lyricSize: project.view.sheetLyricSize ?? 12,
    lyricOffsets: project.view.sheetLyricOffsets ?? {},
    paddingScale: project.view.sheetPadding ?? 1,
    minBarWidth: project.view.sheetMinBarWidth ?? 1,
    clefGutter: project.view.sheetClefGutter ?? 1,
    timeFactor: project.view.sheetTimeFactor ?? 1,
    bottomMargin: project.view.sheetBottomMargin ?? 1,
    musicFont: project.view.sheetMusicFont,
    textFont: project.view.sheetTextFont,
    staffLineWeight: project.view.sheetStaffLineWeight ?? 1,
    showPartNames: project.view.sheetPartNames === true,
    marginLeftIn: project.view.sheetMarginLeftIn ?? 0.3,
    marginRightIn: project.view.sheetMarginRightIn ?? 0.3,
    marginTopIn: project.view.sheetMarginTopIn ?? 0.3,
    marginBottomIn: project.view.sheetMarginBottomIn ?? 0.3,
    engravingScale: project.view.sheetEngravingScale ?? 1,
    scoreScale: project.view.sheetScoreScale ?? 1,
    chordDetectSegments: opts?.detectSegments,
    chordForceInclude: true,
  })
  const svg = host.querySelector('svg')
  if (!svg) throw new Error('No sheet SVG to export')
  // PDF / image always include available Sketch + Detected labels for theory review.
  paintSheetChordMarks(svg, layout, project, opts?.detectSegments, { forceInclude: true })
  return { host, layout, svg }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to rasterize sheet SVG'))
    img.src = url
  })
}

/** Serialize SVG to a blob URL (avoids huge data: URLs; keeps embedded @font-face). */
function svgToObjectUrl(svg: SVGSVGElement): string {
  const clone = svg.cloneNode(true) as SVGSVGElement
  if (!clone.getAttribute('xmlns')) {
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  }
  // Standalone SVG docs need an XML declaration for some browsers.
  const xml = new XMLSerializer().serializeToString(clone)
  const blob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' })
  return URL.createObjectURL(blob)
}

async function rasterizeSvg(
  svg: SVGSVGElement,
  width: number,
  height: number,
  mime: 'image/png' | 'image/webp' | 'image/jpeg',
  quality = 0.92,
  pixelScale = 1,
): Promise<Blob> {
  const url = svgToObjectUrl(svg)
  try {
    const img = await loadImage(url)
    const canvas = document.createElement('canvas')
    const w = Math.max(1, Math.round(width * pixelScale))
    const h = Math.max(1, Math.round(height * pixelScale))
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas unavailable')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, h)
    ctx.drawImage(img, 0, 0, w, h)
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), mime, quality),
    )
    if (!blob) throw new Error(`Export as ${mime} failed`)
    return blob
  } finally {
    URL.revokeObjectURL(url)
  }
}

function drawTitleOntoCanvas(
  ctx: CanvasRenderingContext2D,
  project: TagRollProject,
  pageW: number,
  bandH: number,
  marginLeft: number,
  marginRight: number,
): void {
  if (bandH <= 0) return
  ctx.fillStyle = '#1a1a1a'
  ctx.textAlign = 'center'
  let y = 28
  const cx = pageW / 2
  if (project.title?.trim()) {
    ctx.font = '700 22px Georgia, "Times New Roman", serif'
    ctx.fillText(project.title.trim(), cx, y)
    y += 26
  }
  if (project.subtitle?.trim()) {
    ctx.font = 'italic 15px Georgia, "Times New Roman", serif'
    ctx.fillStyle = '#3d3a34'
    ctx.fillText(project.subtitle.trim(), cx, y)
    y += 22
  }
  if (project.composer?.trim() || project.arranger?.trim()) {
    ctx.font = '13px system-ui, sans-serif'
    ctx.fillStyle = '#3d3a34'
    ctx.textAlign = 'left'
    if (project.composer?.trim()) {
      ctx.fillText(project.composer.trim(), Math.max(16, marginLeft), y)
    }
    ctx.textAlign = 'right'
    if (project.arranger?.trim()) {
      ctx.fillText(project.arranger.trim(), pageW - Math.max(16, marginRight), y)
    }
  }
}

function drawFooterOntoCanvas(
  ctx: CanvasRenderingContext2D,
  project: TagRollProject,
  pageW: number,
  pageH: number,
  marginBottom: number,
): void {
  if (project.view.sheetShowEngravedFooter === false) return
  const note = project.sheetNote?.trim()
  if (!note) return
  ctx.fillStyle = '#5a564e'
  ctx.font = 'italic 12px system-ui, sans-serif'
  ctx.textAlign = 'center'
  const y = pageH - Math.max(12, Math.min(marginBottom * 0.45, 28))
  ctx.fillText(note, pageW / 2, y)
}

function drawTitleOntoPdf(
  doc: jsPDF,
  project: TagRollProject,
  pageWPt: number,
  bandHPt: number,
  marginLeftPt: number,
  marginRightPt: number,
): void {
  if (bandHPt <= 0) return
  let y = 22
  doc.setTextColor(26, 26, 26)
  if (project.title?.trim()) {
    doc.setFont('times', 'bold')
    doc.setFontSize(16)
    doc.text(project.title.trim(), pageWPt / 2, y, { align: 'center' })
    y += 18
  }
  if (project.subtitle?.trim()) {
    doc.setFont('times', 'italic')
    doc.setFontSize(11)
    doc.setTextColor(61, 58, 52)
    doc.text(project.subtitle.trim(), pageWPt / 2, y, { align: 'center' })
    y += 14
  }
  if (project.composer?.trim() || project.arranger?.trim()) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(61, 58, 52)
    if (project.composer?.trim()) {
      doc.text(project.composer.trim(), Math.max(12, marginLeftPt), y, { align: 'left' })
    }
    if (project.arranger?.trim()) {
      doc.text(project.arranger.trim(), pageWPt - Math.max(12, marginRightPt), y, {
        align: 'right',
      })
    }
  }
}

function drawFooterOntoPdf(
  doc: jsPDF,
  project: TagRollProject,
  pageWPt: number,
  pageHPt: number,
  marginBottomPt: number,
): void {
  if (project.view.sheetShowEngravedFooter === false) return
  const note = project.sheetNote?.trim()
  if (!note) return
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(9)
  doc.setTextColor(90, 86, 78)
  const y = pageHPt - Math.max(10, Math.min(marginBottomPt * 0.4, 22))
  doc.text(note, pageWPt / 2, y, { align: 'center' })
}

/** Minimal PDF 1.4 with one JPEG image per page (raster export). */
function buildPdfFromJpegPages(
  pages: { jpeg: Uint8Array; widthPx: number; heightPx: number }[],
  dpi: number,
): Uint8Array {
  const enc = new TextEncoder()
  const chunks: Uint8Array[] = []
  let size = 0
  const write = (data: string | Uint8Array) => {
    const u8 = typeof data === 'string' ? enc.encode(data) : data
    chunks.push(u8)
    size += u8.length
  }

  write('%PDF-1.4\n')
  const offsets: number[] = [0]
  const obj = (n: number, body: () => void) => {
    offsets[n] = size
    write(`${n} 0 obj\n`)
    body()
    write('\nendobj\n')
  }

  const catalogId = 1
  const pagesId = 2
  let next = 3
  const imageIds: number[] = []
  const contentIds: number[] = []
  const pageIds: number[] = []
  for (let i = 0; i < pages.length; i++) {
    imageIds.push(next++)
    contentIds.push(next++)
    pageIds.push(next++)
  }

  obj(catalogId, () => write(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`))
  obj(pagesId, () =>
    write(
      `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`,
    ),
  )

  for (let i = 0; i < pages.length; i++) {
    const pg = pages[i]!
    const wPt = (pg.widthPx / dpi) * 72
    const hPt = (pg.heightPx / dpi) * 72
    const imgId = imageIds[i]!
    const contentId = contentIds[i]!
    const pageId = pageIds[i]!

    obj(imgId, () => {
      write(
        `<< /Type /XObject /Subtype /Image /Width ${pg.widthPx} /Height ${pg.heightPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${pg.jpeg.length} >>\nstream\n`,
      )
      write(pg.jpeg)
      write('\nendstream')
    })

    const content = `q\n${wPt.toFixed(2)} 0 0 ${hPt.toFixed(2)} 0 0 cm\n/Im${i} Do\nQ\n`
    const contentBytes = enc.encode(content)
    obj(contentId, () => {
      write(`<< /Length ${contentBytes.length} >>\nstream\n`)
      write(contentBytes)
      write('\nendstream')
    })

    obj(pageId, () =>
      write(
        `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${wPt.toFixed(2)} ${hPt.toFixed(2)}] /Resources << /XObject << /Im${i} ${imgId} 0 R >> >> /Contents ${contentId} 0 R >>`,
      ),
    )
  }

  const xrefAt = size
  write(`xref\n0 ${next}\n`)
  write('0000000000 65535 f \n')
  for (let i = 1; i < next; i++) {
    write(`${String(offsets[i] ?? 0).padStart(10, '0')} 00000 n \n`)
  }
  write(`trailer\n<< /Size ${next} /Root ${catalogId} 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`)

  const out = new Uint8Array(size)
  let o = 0
  for (const c of chunks) {
    out.set(c, o)
    o += c.length
  }
  return out
}

function exportPageGeoms(
  _project: TagRollProject,
  layout: VexScoreLayoutResult,
): VexScorePageGeom[] {
  if (layout.pages.length > 0) return layout.pages
  return [{ index: 0, y: 0, width: layout.width, height: layout.height }]
}

function pagePixelSize(
  project: TagRollProject,
  pg: VexScorePageGeom,
): { width: number; height: number } {
  const dpi = project.view.sheetPageDpi ?? 96
  if (isPageLayout(project)) {
    return {
      width: sheetPageWidthPx(project.view.sheetPageWidthIn ?? 8.5, dpi),
      height: sheetPageHeightPx(project.view.sheetPageHeightIn ?? 11, dpi),
    }
  }
  return { width: pg.width, height: pg.height }
}

async function pageCanvases(
  project: TagRollProject,
  layout: VexScoreLayoutResult,
  svg: SVGSVGElement,
  opts?: { pixelScale?: number; mime?: 'image/png' | 'image/jpeg' },
): Promise<{ canvas: HTMLCanvasElement; width: number; height: number }[]> {
  const pages = exportPageGeoms(project, layout)
  const scale = Math.max(1, opts?.pixelScale ?? 1)
  const mime = opts?.mime ?? 'image/png'
  const margins = layout.marginsPx
  const band = isPageLayout(project) ? estimateTitleBand(project) : 0
  const out: { canvas: HTMLCanvasElement; width: number; height: number }[] = []

  // Rasterize each page alone at full DPI — avoids soft capping a tall multi-page strip.
  for (const pg of pages) {
    const { width: wCss, height: hCss } = pagePixelSize(project, pg)
    const regionH = Math.min(hCss, Math.max(1, layout.height - pg.y))
    const region = cloneSvgPageRegion(svg, layout, 0, pg.y, wCss, regionH)
    const pageBlob = await rasterizeSvg(region, wCss, regionH, mime, 0.95, scale)
    const pageUrl = URL.createObjectURL(pageBlob)
    try {
      const pageImg = await loadImage(pageUrl)
      const w = Math.max(1, Math.round(wCss * scale))
      const h = Math.max(1, Math.round(hCss * scale))
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Canvas unavailable')
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, w, h)
      if (pg.index === 0 && band > 0) {
        ctx.save()
        ctx.scale(scale, scale)
        drawTitleOntoCanvas(ctx, project, wCss, band, margins.left, margins.right)
        ctx.restore()
      }
      const srcH = Math.round(regionH * scale)
      ctx.drawImage(pageImg, 0, 0, w, srcH, 0, 0, w, srcH)
      if (pg.index === pages.length - 1) {
        ctx.save()
        ctx.scale(scale, scale)
        drawFooterOntoCanvas(ctx, project, wCss, hCss, margins.bottom)
        ctx.restore()
      }
      out.push({ canvas, width: w, height: h })
    } finally {
      URL.revokeObjectURL(pageUrl)
    }
  }
  return out
}

function pxToPt(px: number, dpi: number): number {
  return (px / dpi) * 72
}

async function canvasToBytes(
  canvas: HTMLCanvasElement,
  mime: 'image/png' | 'image/webp',
): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), mime, 0.92),
  )
  if (!blob) throw new Error('Image encode failed')
  return new Uint8Array(await blob.arrayBuffer())
}

/**
 * PNG / WebP export:
 * - continuous → one long strip image
 * - page, 1 page → one image
 * - page, N pages → zip of page images
 */
export async function exportSheetImage(
  project: TagRollProject,
  format: SheetImageFormat,
  opts?: SheetExportOptions,
): Promise<void> {
  const { host, layout, svg } = await renderOffscreen(project, opts)
  try {
    await injectSheetExportFonts(svg, project)
    const mime = format === 'webp' ? 'image/webp' : 'image/png'
    const base = safeFilename(project.title)
    // Match raster PDF sharpness for stills.
    const pixelScale = exportRasterPixelScale(project, layout)

    if (!isPageLayout(project) || layout.pages.length <= 1) {
      if (!isPageLayout(project)) {
        const blob = await rasterizeSvg(
          svg,
          layout.width,
          layout.height,
          mime,
          0.92,
          pixelScale,
        )
        downloadBlob(new Uint8Array(await blob.arrayBuffer()), `${base}.${format}`, mime)
        return
      }
      const pages = await pageCanvases(project, layout, svg, { pixelScale })
      const bytes = await canvasToBytes(pages[0]!.canvas, mime)
      downloadBlob(bytes, `${base}.${format}`, mime)
      return
    }

    const pages = await pageCanvases(project, layout, svg, { pixelScale })
    const files: Array<{ name: string; data: Uint8Array }> = []
    for (let i = 0; i < pages.length; i++) {
      files.push({
        name: `${base}-p${i + 1}.${format}`,
        data: await canvasToBytes(pages[i]!.canvas, mime),
      })
    }
    const zip = buildZip(files)
    downloadBlob(zip, `${base}-pages.zip`, 'application/zip')
  } finally {
    host.remove()
  }
}

/** @deprecated Prefer exportSheetImage (handles zip for multi-page). */
export async function exportSheetPageImages(
  project: TagRollProject,
  format: SheetImageFormat,
  opts?: SheetExportOptions,
): Promise<void> {
  await exportSheetImage(project, format, opts)
}

/**
 * Clone SVG clipped to one page. Layout geometry is screen px; VexFlow viewBox
 * is unit space — convert with sizeScale so svg2pdf sees the engraved content.
 */
function cloneSvgPageRegion(
  svg: SVGSVGElement,
  layout: VexScoreLayoutResult,
  screenX: number,
  screenY: number,
  screenW: number,
  screenH: number,
): SVGSVGElement {
  const s = Math.max(1e-6, layout.sizeScale || 1)
  const clone = svg.cloneNode(true) as SVGSVGElement
  if (!clone.getAttribute('xmlns')) {
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  }
  clone.setAttribute('width', String(Math.max(1, Math.round(screenW))))
  clone.setAttribute('height', String(Math.max(1, Math.round(screenH))))
  clone.setAttribute(
    'viewBox',
    `${screenX / s} ${screenY / s} ${screenW / s} ${screenH / s}`,
  )
  return clone
}

/** Raster PDF — always 300 DPI JPEG pages. */
export async function exportSheetPdfRaster(
  project: TagRollProject,
  opts?: SheetExportOptions,
): Promise<void> {
  const { host, layout, svg } = await renderOffscreen(project, opts)
  try {
    await injectSheetExportFonts(svg, project)
    const exportDpi = SHEET_PDF_RASTER_DPI
    const pixelScale = exportRasterPixelScale(project, layout)
    const pages = await pageCanvases(project, layout, svg, {
      pixelScale,
      mime: 'image/jpeg',
    })
    const jpegPages: { jpeg: Uint8Array; widthPx: number; heightPx: number }[] = []
    for (const pg of pages) {
      const jpegBlob = await new Promise<Blob | null>((resolve) =>
        pg.canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.95),
      )
      if (!jpegBlob) throw new Error('JPEG encode failed')
      jpegPages.push({
        jpeg: new Uint8Array(await jpegBlob.arrayBuffer()),
        widthPx: pg.width,
        heightPx: pg.height,
      })
    }
    const pdf = buildPdfFromJpegPages(jpegPages, exportDpi)
    downloadBlob(pdf, `${safeFilename(project.title)}.pdf`, 'application/pdf')
  } finally {
    host.remove()
  }
}

/** Alias for raster PDF (backward compatible). */
export async function exportSheetPdf(
  project: TagRollProject,
  opts?: SheetExportOptions,
): Promise<void> {
  await exportSheetPdfRaster(project, opts)
}

/**
 * True vector PDF: outline SMuFL/lyric text to paths, then svg2pdf.
 */
export async function exportSheetPdfVector(
  project: TagRollProject,
  opts?: SheetExportOptions,
): Promise<void> {
  const { host, layout, svg } = await renderOffscreen(project, opts)
  try {
    await convertSvgTextToPaths(svg, sheetExportFontNames(project))
    const dpi = layoutDpi(project)
    const pages = exportPageGeoms(project, layout)
    const margins = layout.marginsPx
    const band = isPageLayout(project) ? estimateTitleBand(project) : 0

    let doc: jsPDF | null = null
    for (let i = 0; i < pages.length; i++) {
      const pg = pages[i]!
      const { width: wPx, height: hPx } = pagePixelSize(project, pg)
      const wPt = pxToPt(wPx, dpi)
      const hPt = pxToPt(hPx, dpi)
      const orient = wPt > hPt ? 'l' : 'p'

      if (!doc) {
        doc = new jsPDF({ orientation: orient, unit: 'pt', format: [wPt, hPt] })
      } else {
        doc.addPage([wPt, hPt], orient)
      }

      doc.setFillColor(255, 255, 255)
      doc.rect(0, 0, wPt, hPt, 'F')

      if (pg.index === 0 && band > 0) {
        drawTitleOntoPdf(
          doc,
          project,
          wPt,
          pxToPt(band, dpi),
          pxToPt(margins.left, dpi),
          pxToPt(margins.right, dpi),
        )
      }

      const region = cloneSvgPageRegion(
        svg,
        layout,
        0,
        pg.y,
        wPx,
        Math.min(hPx, layout.height - pg.y),
      )
      // Off-screen only — svg2pdf skips elements with visibility:hidden / display:none.
      region.style.cssText =
        'position:fixed;left:-99999px;top:0;pointer-events:none;visibility:visible'
      document.body.appendChild(region)
      try {
        await doc.svg(region, { x: 0, y: 0, width: wPt, height: hPt })
      } finally {
        region.remove()
      }

      if (pg.index === pages.length - 1) {
        drawFooterOntoPdf(doc, project, wPt, hPt, pxToPt(margins.bottom, dpi))
      }
    }

    if (!doc) throw new Error('PDF has no pages')
    const buf = doc.output('arraybuffer')
    downloadBlob(
      new Uint8Array(buf),
      `${safeFilename(project.title)}-vector.pdf`,
      'application/pdf',
    )
  } finally {
    host.remove()
  }
}

export async function exportSheetPdfKind(
  project: TagRollProject,
  kind: SheetPdfKind,
  opts?: SheetExportOptions,
): Promise<void> {
  if (kind === 'vector') await exportSheetPdfVector(project, opts)
  else await exportSheetPdfRaster(project, opts)
}
