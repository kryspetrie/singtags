import { describe, expect, it } from 'vitest'
import {
  adaptiveLoupeZoom,
  blendBucketWeights,
  DEFAULT_AXIS_BLEND,
  displayFractionFromIndex,
  indexFromDisplayFraction,
  effectiveMinLabelGap,
  buildLabelAnchors,
  buildLoupeLabels,
  contentToTrack,
  DEFAULT_LOUPE,
  indexFromTrackFraction,
  loupeContentRadius,
  loupeGeometry,
  pickLandmarkAnchors,
  landmarkMinGapForWidth,
  trackFractionFromIndex,
  trackToContent,
} from './scrub'

describe('scrub helpers', () => {
  it('maps track fraction to index with equal tag mass', () => {
    expect(indexFromTrackFraction(0, 10)).toBe(0)
    expect(indexFromTrackFraction(1, 10)).toBe(9)
    expect(indexFromTrackFraction(0.5, 11)).toBe(5)
  })

  it('reverses axis so left is last index (oldest when list is newest-first)', () => {
    expect(indexFromTrackFraction(0, 10, true)).toBe(9)
    expect(indexFromTrackFraction(1, 10, true)).toBe(0)
    expect(trackFractionFromIndex(0, 10, true)).toBe(1)
    expect(trackFractionFromIndex(9, 10, true)).toBe(0)
  })

  it('builds reversed anchors oldest→newest left→right', () => {
    const labels = ['2024', '2024', '2009', '2009', '2009']
    const anchors = buildLabelAnchors(labels.length, (i) => labels[i]!, true)
    expect(anchors.map((a) => a.label)).toEqual(['2009', '2024'])
    expect(anchors[0]!.center).toBeLessThan(anchors[1]!.center)
  })

  it('picks sparse landmarks with a minimum gap', () => {
    const anchors = buildLabelAnchors(20, (i) => String(2000 + i))
    const marks = pickLandmarkAnchors(anchors, 0.2)
    expect(marks.length).toBeLessThan(anchors.length)
    for (let i = 1; i < marks.length; i++) {
      expect(marks[i]!.center - marks[i - 1]!.center).toBeGreaterThanOrEqual(0.15)
    }
  })

  it('widens landmark gap on narrow scrub tracks (iPhone 12 Pro class)', () => {
    const narrow = landmarkMinGapForWidth(320)
    const wide = landmarkMinGapForWidth(800)
    expect(narrow).toBeGreaterThan(wide)
    expect(narrow).toBeGreaterThanOrEqual(0.15)
    expect(wide).toBeCloseTo(0.1, 2)

    const anchors = buildLabelAnchors(40, (i) => String(1985 + i))
    const dense = pickLandmarkAnchors(anchors, wide)
    const sparse = pickLandmarkAnchors(anchors, narrow)
    expect(sparse.length).toBeLessThanOrEqual(dense.length)
  })

  it('shrinks the content window as zoom increases', () => {
    const r = 0.07
    const z1 = loupeContentRadius(r, 1)
    const z4 = loupeContentRadius(r, 4)
    expect(z4).toBeCloseTo(z1 / 4)
    expect(z4).toBeLessThan(z1)
  })

  it('slides labels continuously through the loupe as focus moves', () => {
    // Dense enough that several year ticks sit inside a narrow magnified window
    const anchors = buildLabelAnchors(61, (i) => String(1980 + i), false)
    const a2000 = anchors.find((a) => a.label === '2000')!
    const a2001 = anchors.find((a) => a.label === '2001')!
    const opts = { radius: 0.08, zoom: 2 }

    const at2000 = buildLoupeLabels(anchors, a2000.center, opts)
    const mid = (a2000.center + a2001.center) / 2
    const atMid = buildLoupeLabels(anchors, mid, opts)
    const at2001 = buildLoupeLabels(anchors, a2001.center, opts)

    const x = (pack: typeof at2000, label: string) => {
      const hit = pack.find((l) => l.label === label)
      expect(hit, `expected ${label} in loupe`).toBeTruthy()
      return hit!.x
    }

    expect(x(at2000, '2000')).toBeCloseTo(0.5, 2)
    expect(x(at2001, '2001')).toBeCloseTo(0.5, 2)

    expect(x(atMid, '2000')).toBeLessThan(0.5)
    expect(x(atMid, '2001')).toBeGreaterThan(0.5)

    // As focus moves right, both labels slide left through the glass
    expect(x(atMid, '2000')).toBeLessThan(x(at2000, '2000'))
    expect(x(atMid, '2001')).toBeLessThan(x(at2000, '2001'))
  })

  it('spreads neighboring ticks farther apart when zoomed', () => {
    const anchors = buildLabelAnchors(81, (i) => String(1970 + i), false)
    const focus = anchors.find((a) => a.label === '2010')!.center
    const low = buildLoupeLabels(anchors, focus, {
      radius: 0.08,
      zoom: 1.5,
      minLabelGap: 0,
      maxLabels: 20,
      maxZoom: 1.5,
    })
    const high = buildLoupeLabels(anchors, focus, {
      radius: 0.08,
      zoom: 3,
      minLabelGap: 0,
      maxLabels: 20,
      maxZoom: 3,
    })

    expect(low.length).toBeGreaterThanOrEqual(2)
    expect(high.length).toBeGreaterThanOrEqual(2)

    const gap = (pack: typeof low) => {
      const sorted = [...pack].sort((a, b) => a.x - b.x)
      return sorted[1]!.x - sorted[0]!.x
    }
    expect(gap(high)).toBeGreaterThan(gap(low))
  })

  it('auto-zooms denser where many low-mass buckets are packed together', () => {
    // 40 singleton early years packed on the left, then one huge recent bucket
    const labels: string[] = []
    for (let y = 1980; y < 2020; y++) labels.push(String(y))
    for (let i = 0; i < 160; i++) labels.push('2024')
    const anchors = buildLabelAnchors(labels.length, (i) => labels[i]!, false)

    const packedFocus = anchors.find((a) => a.label === '1990')!.center
    const sparseFocus = anchors.find((a) => a.label === '2024')!.center

    const packedZoom = adaptiveLoupeZoom(anchors, packedFocus, DEFAULT_LOUPE)
    const sparseZoom = adaptiveLoupeZoom(anchors, sparseFocus, DEFAULT_LOUPE)
    expect(packedZoom).toBeGreaterThan(sparseZoom)
    expect(packedZoom).toBeGreaterThan(DEFAULT_LOUPE.zoom)

    const packed = buildLoupeLabels(anchors, packedFocus, DEFAULT_LOUPE)
    expect(packed.length).toBeGreaterThan(0)
    expect(packed.length).toBeLessThanOrEqual(DEFAULT_LOUPE.maxLabels!)
    const xs = packed.map((l) => l.x).sort((a, b) => a - b)
    for (let i = 1; i < xs.length; i++) {
      expect(xs[i]! - xs[i - 1]!).toBeGreaterThanOrEqual(
        (DEFAULT_LOUPE.minLabelGap ?? 0.34) - 0.02,
      )
    }
  })

  it('raises the min label gap from pixel floor on a narrow loupe', () => {
    const wide = effectiveMinLabelGap(DEFAULT_LOUPE, 400)
    const narrow = effectiveMinLabelGap(DEFAULT_LOUPE, 64)
    expect(narrow).toBeGreaterThan(wide)
    // Pixel floor is capped so labels cannot demand more than ~92% of the glass.
    expect(narrow).toBeCloseTo(0.92, 5)
  })

  it('auto-zooms harder on a narrow loupe so decade labels stay spaced', () => {
    const labels: string[] = []
    for (let y = 1920; y < 1960; y += 10) {
      // decade buckets with tiny mass
      labels.push(`${y}s`)
    }
    for (let i = 0; i < 80; i++) labels.push('2020')
    const anchors = buildLabelAnchors(labels.length, (i) => labels[i]!, false)
    const focus = anchors.find((a) => a.label === '1930s')!.center

    const wideZoom = adaptiveLoupeZoom(anchors, focus, DEFAULT_LOUPE, 320)
    const narrowZoom = adaptiveLoupeZoom(anchors, focus, DEFAULT_LOUPE, 56)
    expect(narrowZoom).toBeGreaterThan(wideZoom)

    const narrow = buildLoupeLabels(anchors, focus, DEFAULT_LOUPE, 56)
    expect(narrow.length).toBeGreaterThan(0)
    expect(narrow.length).toBeLessThanOrEqual(2)
    const xs = narrow.map((l) => l.x).sort((a, b) => a - b)
    const minGap = effectiveMinLabelGap(DEFAULT_LOUPE, 56)
    for (let i = 1; i < xs.length; i++) {
      expect(xs[i]! - xs[i - 1]!).toBeGreaterThanOrEqual(minGap - 0.03)
    }
  })

  it('centers the loupe on extremes using side gutters', () => {
    const r = 0.07
    const mid = loupeGeometry(0.5, r)
    expect(mid.width).toBeCloseTo(2 * r)
    expect(mid.center).toBeCloseTo(0.5)

    const left = loupeGeometry(0, r)
    expect(left.width).toBeCloseTo(2 * r)
    expect(left.center).toBeCloseTo(r)
    expect(left.left).toBeCloseTo(0)

    const right = loupeGeometry(1, r)
    expect(right.width).toBeCloseTo(2 * r)
    expect(right.center).toBeCloseTo(1 - r)
    expect(right.left + right.width).toBeCloseTo(1)
  })

  it('places ruler ticks at bucket starts so 0 sits under the loupe at the left', () => {
    const labels = [...Array(50).fill('0'), ...Array(50).fill('100')]
    const mid = buildLabelAnchors(labels.length, (i) => labels[i]!, false, 1, 'center')
    const start = buildLabelAnchors(labels.length, (i) => labels[i]!, false, 1, 'start')
    expect(mid[0]!.center).toBeGreaterThan(0)
    expect(start[0]!.center).toBe(0)
    expect(start[0]!.label).toBe('0')
  })

  it('keeps extra left/right margin when edgeGutter exceeds radius', () => {
    const r = 0.08
    const g = 0.16
    const left = loupeGeometry(0, r, g)
    expect(left.width).toBeCloseTo(2 * r)
    expect(left.center).toBeCloseTo(g)
    expect(left.left).toBeCloseTo(g - r)
    expect(left.left).toBeGreaterThan(0)

    const right = loupeGeometry(1, r, g)
    expect(right.center).toBeCloseTo(1 - g)
    expect(right.left + right.width).toBeCloseTo(1 - g + r)
    expect(right.left + right.width).toBeLessThan(1)
  })

  it('maps content↔track through gutters', () => {
    const g = 0.07
    expect(contentToTrack(0, g)).toBeCloseTo(g)
    expect(contentToTrack(1, g)).toBeCloseTo(1 - g)
    expect(trackToContent(0, g)).toBe(0)
    expect(trackToContent(1, g)).toBe(1)
    expect(trackToContent(g, g)).toBeCloseTo(0)
    expect(trackToContent(1 - g, g)).toBeCloseTo(1)
    expect(trackToContent(0.5, g)).toBeCloseTo(0.5)
  })

  it('blends bucket masses toward equal shares', () => {
    const masses = [1, 1, 1, 97]
    const pure = blendBucketWeights(masses, 0)
    const equal = blendBucketWeights(masses, 1)
    const mid = blendBucketWeights(masses, 0.4)
    expect(pure[0]).toBeCloseTo(1)
    expect(equal[0]).toBeCloseTo(25)
    expect(mid[0]!).toBeGreaterThan(pure[0]!)
    expect(mid[0]!).toBeLessThan(equal[0]!)
    expect(mid[3]!).toBeLessThan(pure[3]!)
    expect(mid[3]!).toBeGreaterThan(equal[3]!)
  })

  it('gives low-mass buckets more display span than pure tag-mass', () => {
    const labels: string[] = []
    for (let y = 1920; y < 1960; y += 10) labels.push(`${y}s`) // 4 tiny decades
    for (let i = 0; i < 96; i++) labels.push('2020')
    const massAnchors = buildLabelAnchors(labels.length, (i) => labels[i]!, false, 0)
    const softAnchors = buildLabelAnchors(labels.length, (i) => labels[i]!, false, 0.4)
    const mass1920 = massAnchors.find((a) => a.label === '1920s')!
    const soft1920 = softAnchors.find((a) => a.label === '1920s')!
    const massSpan = mass1920.displayEnd - mass1920.displayStart
    const softSpan = soft1920.displayEnd - soft1920.displayStart
    expect(softSpan).toBeGreaterThan(massSpan)

    const mass2020 = massAnchors.find((a) => a.label === '2020')!
    const soft2020 = softAnchors.find((a) => a.label === '2020')!
    // Large bucket still dominates after blend
    expect(soft2020.displayEnd - soft2020.displayStart).toBeGreaterThan(
      soft1920.displayEnd - soft1920.displayStart,
    )
    expect(soft2020.displayEnd - soft2020.displayStart).toBeLessThan(
      mass2020.displayEnd - mass2020.displayStart,
    )
  })

  it('maps soft display fractions back to the correct bucket', () => {
    const labels: string[] = []
    for (let y = 1920; y < 1960; y += 10) labels.push(`${y}s`)
    for (let i = 0; i < 80; i++) labels.push('2020')
    const anchors = buildLabelAnchors(labels.length, (i) => labels[i]!, true, DEFAULT_AXIS_BLEND)
    const thirties = anchors.find((a) => a.label === '1930s')!
    const idx = indexFromDisplayFraction(thirties.center, anchors, true)
    expect(labels[idx]).toBe('1930s')
    const back = displayFractionFromIndex(idx, anchors, true)
    expect(back).toBeCloseTo(thirties.center, 5)
  })


  it('axisBlend 1 gives equal-width buckets (linear hundred ticks)', () => {
    const labels = [
      ...Array(10).fill('0'),
      ...Array(90).fill('100'),
      ...Array(5).fill('200'),
    ]
    const anchors = buildLabelAnchors(labels.length, (i) => labels[i]!, false, 1)
    expect(anchors).toHaveLength(3)
    const spans = anchors.map((a) => a.displayEnd - a.displayStart)
    expect(spans[0]).toBeCloseTo(1 / 3, 5)
    expect(spans[1]).toBeCloseTo(1 / 3, 5)
    expect(spans[2]).toBeCloseTo(1 / 3, 5)
  })

})
