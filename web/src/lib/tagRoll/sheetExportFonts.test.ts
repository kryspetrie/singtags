/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createEmptyTagRollProject } from './normalize'
import {
  clearSheetExportFontCache,
  injectSheetExportFonts,
  sheetExportFontNames,
} from './sheetExportFonts'

afterEach(() => {
  clearSheetExportFontCache()
  vi.unstubAllGlobals()
})

describe('sheetExportFonts', () => {
  it('lists music + text + Academico families', () => {
    const p = createEmptyTagRollProject()
    p.view.sheetMusicFont = 'bravura'
    p.view.sheetTextFont = 'academico'
    expect(sheetExportFontNames(p)).toEqual(['Bravura', 'Academico'])
  })

  it('injects @font-face rules with embedded woff2 data URLs', async () => {
    const fakeWoff = new Uint8Array([0x77, 0x4f, 0x46, 0x32])
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        arrayBuffer: async () => fakeWoff.buffer,
      })),
    )
    const p = createEmptyTagRollProject()
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    await injectSheetExportFonts(svg, p)
    const style = svg.querySelector('[data-sheet-export-fonts] style')
    expect(style?.textContent).toContain("@font-face{font-family:'Bravura'")
    expect(style?.textContent).toContain('data:font/woff2')
    expect(style?.textContent).toContain("@font-face{font-family:'Academico'")
  })
})
