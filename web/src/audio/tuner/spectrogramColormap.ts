/**
 * Spectrogram color LUTs — magnitude 0…1 → CSS rgb().
 */

export type SpectrogramColormap = 'viridis' | 'inferno' | 'magma' | 'gray' | 'classic'

export const SPECTROGRAM_COLORMAPS: { id: SpectrogramColormap; label: string }[] = [
  { id: 'viridis', label: 'Viridis' },
  { id: 'inferno', label: 'Inferno' },
  { id: 'magma', label: 'Magma' },
  { id: 'gray', label: 'Gray' },
  { id: 'classic', label: 'Classic' },
]

/** Map normalized magnitude to an opaque CSS color. */
export function spectrogramColor(v: number, map: SpectrogramColormap): string {
  const [r, g, b] = spectrogramColorRgb(v, map)
  return `rgb(${r},${g},${b})`
}

/** RGB bytes for ImageData paints (avoids per-pixel CSS string alloc). */
export function spectrogramColorRgb(
  v: number,
  map: SpectrogramColormap,
): [number, number, number] {
  const t = Math.max(0, Math.min(1, v))
  return lut(map, t)
}

function lut(map: SpectrogramColormap, t: number): [number, number, number] {
  switch (map) {
    case 'gray': {
      const g = Math.round(20 + t * 220)
      return [g, g, g]
    }
    case 'classic': {
      // Dark → amber/yellow (legacy tuner look)
      const r = Math.round(30 + t * 220)
      const g = Math.round(20 + t * 160)
      const b = Math.round(20 + t * 40)
      return [r, g, b]
    }
    case 'inferno':
      return sampleStops(t, [
        [0, 0, 4],
        [40, 11, 84],
        [101, 21, 110],
        [159, 42, 99],
        [212, 72, 66],
        [245, 125, 21],
        [250, 193, 39],
        [252, 255, 164],
      ])
    case 'magma':
      return sampleStops(t, [
        [0, 0, 4],
        [28, 16, 68],
        [79, 18, 123],
        [129, 37, 129],
        [181, 54, 122],
        [229, 80, 100],
        [251, 135, 97],
        [254, 194, 135],
        [252, 253, 191],
      ])
    case 'viridis':
    default:
      return sampleStops(t, [
        [68, 1, 84],
        [59, 82, 139],
        [33, 145, 140],
        [94, 201, 98],
        [253, 231, 37],
      ])
  }
}

function sampleStops(t: number, stops: [number, number, number][]): [number, number, number] {
  if (stops.length === 1) return stops[0]!
  const x = t * (stops.length - 1)
  const i = Math.min(stops.length - 2, Math.floor(x))
  const f = x - i
  const a = stops[i]!
  const b = stops[i + 1]!
  return [
    Math.round(a[0] + (b[0] - a[0]) * f),
    Math.round(a[1] + (b[1] - a[1]) * f),
    Math.round(a[2] + (b[2] - a[2]) * f),
  ]
}
