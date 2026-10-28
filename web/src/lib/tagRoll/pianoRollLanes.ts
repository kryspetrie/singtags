/**
 * Piano-roll row fills.
 * Black keys are a neutral shade. In-scale rows are a chromatic accent on that
 * shade, so scale membership does not collapse into the piano-key grey.
 */

type Rgb = [number, number, number]

const PIANO_INK: Rgb = [26, 26, 26]

export function pianoRollLaneColor(opts: {
  background: string
  accent: string
  isBlack: boolean
  inScale: boolean
}): string | null {
  const bg = parseCssColor(opts.background)
  if (!bg) return null
  const light = relLuma(bg) > 0.45
  const piano = opts.isBlack ? mix(bg, light ? PIANO_INK : [0, 0, 0], light ? 0.14 : 0.45) : bg
  if (!opts.inScale) return opts.isBlack ? rgbCss(piano) : null
  const accent = parseCssColor(opts.accent)
  if (!accent) return opts.isBlack ? rgbCss(piano) : null
  if (light) {
    const tint = mix(accent, [255, 255, 255], 0.38)
    return rgbCss(opts.isBlack ? mix(piano, accent, 0.72) : mix(piano, tint, 0.74))
  }
  return rgbCss(mix(piano, accent, opts.isBlack ? 0.34 : 0.55))
}

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ]
}

function rgbCss(rgb: Rgb): string {
  const hex = rgb.map((c) =>
    Math.max(0, Math.min(255, Math.round(c)))
      .toString(16)
      .padStart(2, '0'),
  )
  return `#${hex.join('')}`
}

export function parseCssColor(input: string): Rgb | null {
  const s = input.trim()
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s)
  if (hex) {
    let h = hex[1]!
    if (h.length === 3) h = [...h].map((c) => c + c).join('')
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
  }
  const rgb = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i.exec(s)
  if (!rgb) return null
  return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])]
}

function relLuma(rgb: Rgb): number {
  const f = (c: number) => {
    const x = c / 255
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2])
}
