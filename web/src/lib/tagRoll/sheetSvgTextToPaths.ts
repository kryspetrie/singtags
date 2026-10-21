/**
 * Convert VexFlow SVG <text> glyphs to <path> outlines for true vector PDF.
 * jsPDF/svg2pdf cannot embed woff2 SMuFL faces; path outlines need no fonts.
 */
import opentype from 'opentype.js'
import { configureSheetFontHost, sheetFontOtfUrl } from './sheetFontAssets'

const SVG_NS = 'http://www.w3.org/2000/svg'

const otfCache = new Map<string, Promise<opentype.Font | null>>()

async function loadOtfFont(family: string): Promise<opentype.Font | null> {
  let pending = otfCache.get(family)
  if (!pending) {
    pending = (async () => {
      configureSheetFontHost()
      const url = sheetFontOtfUrl(family)
      if (!url) return null
      const res = await fetch(url)
      if (!res.ok) {
        throw new Error(`Failed to load OTF “${family}” (${res.status})`)
      }
      const buf = await res.arrayBuffer()
      return opentype.parse(buf)
    })().catch((err) => {
      otfCache.delete(family)
      throw err
    })
    otfCache.set(family, pending)
  }
  return pending
}

function parseFontSizePx(raw: string | null): number {
  if (!raw) return 13.333
  const v = parseFloat(raw)
  if (!Number.isFinite(v)) return 13.333
  if (/pt\s*$/i.test(raw)) return v * (4 / 3)
  return v
}

/** CSS font-family list → family names (VexFlow lyrics use `Bravura,Academico`). */
export function parseFontFamilies(fontFamily: string | null): string[] {
  if (!fontFamily) return []
  return fontFamily
    .split(',')
    .map((part) => part.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean)
}

/** True when every non-whitespace character has a real glyph (not `.notdef`). */
export function fontCoversText(font: opentype.Font, content: string): boolean {
  if (typeof font.charToGlyph !== 'function') return true
  for (const ch of content) {
    if (/\s/u.test(ch)) continue
    const g = font.charToGlyph(ch)
    if (!g || g.name === '.notdef') return false
  }
  return true
}

/**
 * Pick a loaded face for this `<text>` content.
 * Walk the CSS family list (then Academico / Bravura) and skip faces that lack glyphs —
 * otherwise lyric text (`Bravura,Academico`) is outlined with Bravura → empty path → deleted.
 */
export function resolveFontForContent(
  fontFamily: string | null,
  content: string,
  loaded: Map<string, opentype.Font>,
): opentype.Font | null {
  const candidates = [
    ...parseFontFamilies(fontFamily),
    'Academico',
    'Bravura',
  ]
  const seen = new Set<string>()
  for (const family of candidates) {
    if (seen.has(family)) continue
    seen.add(family)
    const font = loaded.get(family)
    if (font && fontCoversText(font, content)) return font
  }
  // Last resort (chord-mark Georgia / unknown stacks): any loaded face.
  return loaded.get('Academico') ?? loaded.get('Bravura') ?? loaded.values().next().value ?? null
}

/**
 * Replace every <text> in `svg` with outline <path>s using OTF faces.
 * Mutates the SVG in place (clone first if you need the original).
 */
export async function convertSvgTextToPaths(
  svg: SVGSVGElement,
  fontFamilies: readonly string[],
): Promise<void> {
  const families = [...new Set([...fontFamilies, 'Academico', 'Bravura'])]
  const loaded = new Map<string, opentype.Font>()
  await Promise.all(
    families.map(async (name) => {
      const font = await loadOtfFont(name)
      if (font) loaded.set(name, font)
    }),
  )
  if (!loaded.size) {
    throw new Error('No OTF fonts available for vector PDF text outlines')
  }

  const texts = [...svg.querySelectorAll('text')]
  for (const textEl of texts) {
    const content = textEl.textContent ?? ''
    if (!content) {
      textEl.remove()
      continue
    }
    const familyAttr =
      textEl.getAttribute('font-family') ||
      (textEl as SVGTextElement).style.fontFamily ||
      null
    const font = resolveFontForContent(familyAttr, content, loaded)
    if (!font) continue

    const sizePx = parseFontSizePx(
      textEl.getAttribute('font-size') ||
        (textEl as SVGTextElement).style.fontSize ||
        null,
    )
    const x = Number(textEl.getAttribute('x') ?? 0)
    const y = Number(textEl.getAttribute('y') ?? 0)
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue

    const fill =
      textEl.getAttribute('fill') ||
      (textEl as SVGTextElement).style.fill ||
      '#000000'
    const anchor = textEl.getAttribute('text-anchor') || 'start'
    let drawX = x
    if (anchor === 'middle' || anchor === 'center') {
      const w = font.getAdvanceWidth(content, sizePx)
      drawX = x - w / 2
    } else if (anchor === 'end') {
      const w = font.getAdvanceWidth(content, sizePx)
      drawX = x - w
    }

    const path = font.getPath(content, drawX, y, sizePx)
    const d = path.toPathData(3)
    if (!d) {
      // Empty outline (e.g. wrong face) — keep <text> rather than deleting lyrics.
      continue
    }
    const pathEl = document.createElementNS(SVG_NS, 'path')
    pathEl.setAttribute('d', d)
    pathEl.setAttribute('fill', fill === 'none' ? '#000000' : fill)
    pathEl.setAttribute('stroke', 'none')
    // Preserve transforms that VexFlow sometimes puts on the text node.
    const transform = textEl.getAttribute('transform')
    if (transform) pathEl.setAttribute('transform', transform)
    textEl.replaceWith(pathEl)
  }
}

/** Test helper. */
export function clearSheetOtfFontCache(): void {
  otfCache.clear()
}
