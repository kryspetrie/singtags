/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Glyph = { name: string }

function makeFont(opts: {
  id: string
  covers: (ch: string) => boolean
  pathData?: string
}) {
  const getPath = vi.fn((content: string) => ({
    toPathData: () => {
      if (![...content].some((ch) => !/\s/u.test(ch) && opts.covers(ch))) return ''
      return opts.pathData ?? `M0 0 L10 0 ${opts.id}`
    },
  }))
  const getAdvanceWidth = vi.fn(() => 40)
  const charToGlyph = vi.fn((ch: string): Glyph =>
    opts.covers(ch) ? { name: ch === ' ' ? 'space' : 'glyph' } : { name: '.notdef' },
  )
  return { getPath, getAdvanceWidth, charToGlyph, id: opts.id }
}

const bravura = makeFont({
  id: 'bravura',
  covers: (ch) => ch === '𝄞' || /[\uE000-\uF8FF]/u.test(ch),
  pathData: 'M0 0 L1 0 bravura',
})
const academico = makeFont({
  id: 'academico',
  covers: (ch) => /[A-Za-z0-9',.]/u.test(ch),
  pathData: 'M0 0 L1 0 academico',
})

vi.mock('opentype.js', () => ({
  default: {
    parse: vi.fn((buf: ArrayBuffer) => {
      // Distinguish loads by a marker byte we set in fetch stubs per URL… simpler: alternate.
      const view = new Uint8Array(buf)
      if (view[0] === 1) return bravura
      if (view[0] === 2) return academico
      return bravura
    }),
  },
}))

vi.mock('./sheetFontAssets', async () => {
  const actual = await vi.importActual<typeof import('./sheetFontAssets')>('./sheetFontAssets')
  return {
    ...actual,
    sheetFontOtfUrl: (family: string) => {
      if (family === 'Bravura') return '/fonts/bravura.otf'
      if (family === 'Academico') return '/fonts/academico.otf'
      return null
    },
    configureSheetFontHost: () => {},
  }
})

describe('convertSvgTextToPaths', () => {
  beforeEach(() => {
    bravura.getPath.mockClear()
    academico.getPath.mockClear()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const buf = new ArrayBuffer(8)
        const view = new Uint8Array(buf)
        if (String(url).includes('bravura')) view[0] = 1
        else if (String(url).includes('academico')) view[0] = 2
        return { ok: true, arrayBuffer: async () => buf }
      }),
    )
  })

  afterEach(async () => {
    const { clearSheetOtfFontCache } = await import('./sheetSvgTextToPaths')
    clearSheetOtfFontCache()
    vi.unstubAllGlobals()
  })

  it('replaces <text> with outline <path>', async () => {
    const { convertSvgTextToPaths } = await import('./sheetSvgTextToPaths')
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text')
    text.setAttribute('x', '40')
    text.setAttribute('y', '80')
    text.setAttribute('font-family', 'Bravura')
    text.setAttribute('font-size', '10pt')
    text.setAttribute('fill', '#111')
    text.textContent = '𝄞'
    svg.appendChild(text)

    await convertSvgTextToPaths(svg, ['Bravura'])
    expect(svg.querySelector('text')).toBeNull()
    const path = svg.querySelector('path')
    expect(path?.getAttribute('d')).toBe('M0 0 L1 0 bravura')
    expect(path?.getAttribute('fill')).toBe('#111')
    expect(bravura.getPath).toHaveBeenCalled()
  })

  it('outlines lyric text with Academico when family is Bravura,Academico', async () => {
    const { convertSvgTextToPaths } = await import('./sheetSvgTextToPaths')
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text')
    text.setAttribute('x', '10')
    text.setAttribute('y', '20')
    text.setAttribute('font-family', 'Bravura,Academico')
    text.setAttribute('font-size', '12')
    text.textContent = 'Love'
    svg.appendChild(text)

    await convertSvgTextToPaths(svg, ['Bravura', 'Academico'])
    expect(svg.querySelector('text')).toBeNull()
    expect(svg.querySelector('path')?.getAttribute('d')).toBe('M0 0 L1 0 academico')
    expect(academico.getPath).toHaveBeenCalled()
    expect(bravura.getPath).not.toHaveBeenCalled()
  })
})

describe('font family helpers', () => {
  it('parseFontFamilies splits CSS lists', async () => {
    const { parseFontFamilies } = await import('./sheetSvgTextToPaths')
    expect(parseFontFamilies('Bravura,Academico')).toEqual(['Bravura', 'Academico'])
    expect(parseFontFamilies('"Academico", Georgia')).toEqual(['Academico', 'Georgia'])
  })
})
