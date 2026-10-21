/**
 * Embed VexFlow SMuFL / text fonts into an SVG so offscreen rasterization and
 * PDF export keep noteheads, clefs, and lyrics (V5 draws glyphs as <text>).
 */
import { Font } from 'vexflow'
import {
  normalizeSheetMusicFont,
  normalizeSheetTextFont,
  vexMusicFontName,
  vexTextFontName,
} from './sheetFonts'
import { configureSheetFontHost } from './sheetFontAssets'
import type { TagRollProject } from './types'

const SVG_NS = 'http://www.w3.org/2000/svg'
const dataUrlCache = new Map<string, Promise<string | null>>()

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

async function fetchFontDataUrl(fontName: string): Promise<string | null> {
  configureSheetFontHost()
  const url = Font.getURLForFont(fontName)
  if (!url) return null
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Failed to load sheet font “${fontName}” (${res.status})`)
  }
  const buf = await res.arrayBuffer()
  const mime = url.toLowerCase().includes('.otf') ? 'font/otf' : 'font/woff2'
  return `data:${mime};charset=utf-8;base64,${arrayBufferToBase64(buf)}`
}

function fontDataUrl(fontName: string): Promise<string | null> {
  let pending = dataUrlCache.get(fontName)
  if (!pending) {
    pending = fetchFontDataUrl(fontName).catch((err) => {
      dataUrlCache.delete(fontName)
      throw err
    })
    dataUrlCache.set(fontName, pending)
  }
  return pending
}

/** Font families used by the engraved sheet for this project. */
export function sheetExportFontNames(project: TagRollProject): string[] {
  const music = vexMusicFontName(normalizeSheetMusicFont(project.view.sheetMusicFont))
  const text = vexTextFontName(normalizeSheetTextFont(project.view.sheetTextFont))
  // Academico is VexFlow’s default lyric/text face even when music font differs.
  return [...new Set([music, text, 'Academico'])]
}

/**
 * Inject `@font-face` rules (base64 woff2) into the SVG so a serialized
 * SVG→Image rasterization can resolve SMuFL glyphs.
 */
export async function injectSheetExportFonts(
  svg: SVGSVGElement,
  project: TagRollProject,
): Promise<void> {
  svg.querySelector('[data-sheet-export-fonts]')?.remove()
  const rules: string[] = []
  for (const name of sheetExportFontNames(project)) {
    const src = await fontDataUrl(name)
    if (!src) continue
    const family = name.replace(/'/g, "\\'")
    const format = src.includes('font/otf') ? 'opentype' : 'woff2'
    rules.push(
      `@font-face{font-family:'${family}';src:url(${JSON.stringify(src)}) format('${format}');font-style:normal;font-weight:400 700;font-display:block;}`,
    )
  }
  if (!rules.length) return
  const defs = document.createElementNS(SVG_NS, 'defs')
  defs.setAttribute('data-sheet-export-fonts', '1')
  const style = document.createElementNS(SVG_NS, 'style')
  style.setAttribute('type', 'text/css')
  style.textContent = rules.join('\n')
  defs.appendChild(style)
  svg.insertBefore(defs, svg.firstChild)
}

/** Test helper — clear cached font data URLs. */
export function clearSheetExportFontCache(): void {
  dataUrlCache.clear()
}
