/** Density-weighted scrub helpers (tag-mass axis, landmark + loupe). */

export type ScrubLabelAnchor = {
  /** Display text near this mass center. */
  label: string
  /** Inclusive start index in the sorted list. */
  startIndex: number
  /** Inclusive end index in the sorted list. */
  endIndex: number
  /** Tag count in this bucket (raw mass before axis blend). */
  mass: number
  /**
   * Center of the run as a fraction of [0, 1] along the *display* axis
   * (after soft blend + any axis reversal).
   */
  center: number
  /** Inclusive display-axis start of this bucket's span (left→right). */
  displayStart: number
  /** Inclusive display-axis end of this bucket's span (left→right). */
  displayEnd: number
}

/**
 * 0 = pure tag-mass axis (hard to hit tiny buckets).
 * 1 = equal space per bucket (loses volume distribution).
 * Default ~0.4 is a usable middle ground for loupe selection.
 */
export const DEFAULT_AXIS_BLEND = 0.4

/**
 * Blend raw bucket masses toward equal shares.
 * `blend = 0` keeps tag volume; `blend = 1` gives every bucket the same span.
 */
export function blendBucketWeights(
  masses: number[],
  blend: number = DEFAULT_AXIS_BLEND,
): number[] {
  const n = masses.length
  if (n === 0) return []
  const total = masses.reduce((a, b) => a + b, 0)
  if (total <= 0) return masses.map(() => 1 / n)
  const b = Math.min(1, Math.max(0, blend))
  const equal = total / n
  return masses.map((m) => (1 - b) * m + b * equal)
}

/**
 * Map display-track fraction `t` ∈ [0, 1] to a tag index.
 * When `reverseAxis` is true, left (0) is the last index (oldest when the
 * list is newest-first).
 */
export function indexFromTrackFraction(
  t: number,
  length: number,
  reverseAxis = false,
): number {
  if (length <= 0) return 0
  if (length === 1) return 0
  const clamped = Math.min(1, Math.max(0, t))
  const logical = reverseAxis ? 1 - clamped : clamped
  return Math.min(length - 1, Math.round(logical * (length - 1)))
}

/**
 * Map tag index to display-track fraction.
 * When `reverseAxis` is true, index 0 (newest in a newest-first list) sits at the right.
 */
export function trackFractionFromIndex(
  index: number,
  length: number,
  reverseAxis = false,
): number {
  if (length <= 1) return reverseAxis ? 1 : 0
  const i = Math.min(length - 1, Math.max(0, index))
  const logical = i / (length - 1)
  return reverseAxis ? 1 - logical : logical
}

/**
 * Collapse consecutive equal labels into anchors on a *softened* display axis.
 *
 * Raw span is tag mass; `axisBlend` pulls toward equal-per-bucket so low-mass
 * decades stay hittable with the loupe without erasing overall volume shape.
 */
export function buildLabelAnchors(
  length: number,
  labelAtIndex: (index: number) => string,
  reverseAxis = false,
  axisBlend: number = DEFAULT_AXIS_BLEND,
  /**
   * Where to place the tick/label within each bucket.
   * - `center` (default): mid-mass — good for year density scrub.
   * - `start`: left edge of the bucket — ruler ticks (0, 100, 200…) so the
   *   loupe can sit on “0” at the left extreme instead of left of it.
   */
  tickAt: 'center' | 'start' = 'center',
): ScrubLabelAnchor[] {
  if (length <= 0) return []
  const runs: { label: string; startIndex: number; endIndex: number; mass: number }[] = []
  let start = 0
  let label = labelAtIndex(0)
  for (let i = 1; i <= length; i++) {
    const next = i < length ? labelAtIndex(i) : null
    if (next === label) continue
    const end = i - 1
    runs.push({ label, startIndex: start, endIndex: end, mass: end - start + 1 })
    if (next == null) break
    start = i
    label = next
  }
  // Display order left→right (oldest→newest when reverseAxis)
  const ordered = reverseAxis ? runs.slice().reverse() : runs
  const weights = blendBucketWeights(
    ordered.map((r) => r.mass),
    axisBlend,
  )
  const weightTotal = weights.reduce((a, b) => a + b, 0) || 1
  const anchors: ScrubLabelAnchor[] = []
  let cursor = 0
  for (let i = 0; i < ordered.length; i++) {
    const r = ordered[i]!
    const span = weights[i]! / weightTotal
    const displayStart = cursor
    const displayEnd = cursor + span
    anchors.push({
      label: r.label,
      startIndex: r.startIndex,
      endIndex: r.endIndex,
      mass: r.mass,
      displayStart,
      displayEnd,
      center: tickAt === 'start' ? displayStart : (displayStart + displayEnd) / 2,
    })
    cursor = displayEnd
  }
  // Snap last end to 1 to avoid float drift
  if (anchors.length > 0) {
    anchors[anchors.length - 1]!.displayEnd = 1
    const last = anchors[anchors.length - 1]!
    last.center =
      tickAt === 'start' ? last.displayStart : (last.displayStart + last.displayEnd) / 2
  }
  return anchors
}

/**
 * Map a display-axis fraction to a tag index using soft bucket spans.
 * Within a bucket, position maps linearly across that bucket's indices in
 * display order (oldest→newest left→right when `reverseAxis` is set).
 */
export function indexFromDisplayFraction(
  t: number,
  anchors: ScrubLabelAnchor[],
  reverseAxis = false,
): number {
  if (anchors.length === 0) return 0
  const x = Math.min(1, Math.max(0, t))
  let bucket = anchors[0]!
  for (const a of anchors) {
    if (x >= a.displayStart) bucket = a
    if (x <= a.displayEnd) {
      bucket = a
      break
    }
  }
  const span = Math.max(1e-9, bucket.displayEnd - bucket.displayStart)
  const local = Math.min(1, Math.max(0, (x - bucket.displayStart) / span))
  // Display left→right: older→newer when reverseAxis (newest-first list)
  const i0 = reverseAxis ? bucket.endIndex : bucket.startIndex
  const i1 = reverseAxis ? bucket.startIndex : bucket.endIndex
  return Math.round(i0 + (i1 - i0) * local)
}

/**
 * Map a tag index onto the soft display axis (bucket-proportional within its span).
 */
export function displayFractionFromIndex(
  index: number,
  anchors: ScrubLabelAnchor[],
  reverseAxis = false,
): number {
  if (anchors.length === 0) return reverseAxis ? 1 : 0
  let bucket = anchors[0]!
  for (const a of anchors) {
    if (index >= Math.min(a.startIndex, a.endIndex) && index <= Math.max(a.startIndex, a.endIndex)) {
      bucket = a
      break
    }
  }
  const lo = Math.min(bucket.startIndex, bucket.endIndex)
  const hi = Math.max(bucket.startIndex, bucket.endIndex)
  if (hi === lo) return bucket.center
  const local = Math.min(1, Math.max(0, (index - lo) / (hi - lo)))
  // reverseAxis: higher index (older) sits toward displayStart
  const along = reverseAxis ? 1 - local : local
  return bucket.displayStart + (bucket.displayEnd - bucket.displayStart) * along
}

/**
 * Sparse landmarks for the base (zoomed-out) timeline: walk left→right and
 * keep a label only when it clears `minGap` from the previous pick.
 * Always keeps first/last.
 */
export function pickLandmarkAnchors(
  anchors: ScrubLabelAnchor[],
  minGap = 0.09,
): ScrubLabelAnchor[] {
  if (anchors.length === 0) return []
  if (anchors.length <= 2) return [...anchors]

  const gap = Math.max(0.02, minGap)
  const picked: ScrubLabelAnchor[] = [anchors[0]!]
  for (let i = 1; i < anchors.length - 1; i++) {
    const a = anchors[i]!
    const prev = picked[picked.length - 1]!
    if (a.center - prev.center >= gap) picked.push(a)
  }
  const last = anchors[anchors.length - 1]!
  const prev = picked[picked.length - 1]!
  if (prev.label === last.label && prev.startIndex === last.startIndex) return picked
  if (last.center - prev.center < gap * 0.65 && picked.length > 1) {
    picked[picked.length - 1] = last
  } else {
    picked.push(last)
  }
  return picked
}

/**
 * Content-fraction gap between idle scrub landmark labels for a given track width.
 * Fractional-only gaps (~0.1) look fine on wide phones but collide on ~390 CSS-px
 * devices (iPhone 12/13 Pro) where the track is only ~320px after the ↑ control.
 */
export function landmarkMinGapForWidth(
  widthPx: number,
  opts?: { minCenterPx?: number; floor?: number; ceiling?: number },
): number {
  const minCenterPx = opts?.minCenterPx ?? 52
  const floor = opts?.floor ?? 0.1
  const ceiling = opts?.ceiling ?? 0.28
  if (!(widthPx > 0)) return Math.max(floor, 0.12)
  return Math.min(ceiling, Math.max(floor, minCenterPx / widthPx))
}

/** Options for loupe magnification and label spacing on density scrub rails. */
export type LoupeOptions = {
  /**
   * Half-width of the loupe glass as a fraction of the **full** track strip.
   */
  radius: number
  /**
   * Optional end margin (fraction of track). Defaults to `radius`.
   * Prefer a few CSS pixels of padding on the rail for small side gaps.
   */
  edgeGutter?: number
  /**
   * Base magnification of the content axis inside the loupe.
   * Dense bucket clusters raise zoom automatically above this floor so labels
   * stay separable; sparse regions stay near this base.
   */
  zoom: number
  /**
   * Target minimum gap between neighboring label centers inside the loupe
   * (fraction of loupe width). Combined with `minLabelGapPx` via the stricter value.
   */
  minLabelGap?: number
  /**
   * Minimum center-to-center spacing in **CSS pixels** inside the loupe.
   * Keeps decade labels (e.g. "1920s") selectable on narrow screens where a
   * pure fraction-of-loupe gap would collapse to a few pixels.
   */
  minLabelGapPx?: number
  /** Hard cap on adaptive zoom. */
  maxZoom?: number
  /** Prefer at most this many labels visible in the glass (auto-zoom may tighten further). */
  maxLabels?: number
}

/** Default loupe parameters for year/id scrub rails. */
export const DEFAULT_LOUPE: LoupeOptions = {
  /** Glass half-width (~16% of track); also the default end gutter. */
  radius: 0.08,
  /** Floor magnification; rises automatically in dense bucket clusters. */
  zoom: 1.75,
  /** Fraction floor when the loupe is wide. */
  minLabelGap: 0.42,
  /** Tick label width + breathing room inside the glass. */
  minLabelGapPx: 64,
  maxZoom: 96,
  maxLabels: 3,
}

/** One label anchor positioned inside the loupe glass (with fade/active state). */
export type LoupeLabel = ScrubLabelAnchor & {
  /**
   * Horizontal position inside the loupe glass in [0, 1]
   * (0 = left edge, 0.5 = under the cursor, 1 = right edge).
   * Moves continuously as focus scrubs — labels slide through the glass.
   */
  x: number
  /** Soft edge fade as a label enters/leaves the glass (1 at center → 0 at edge). */
  opacity: number
  /** Nearest bucket to the cursor (weight emphasis only — no size change). */
  active: boolean
}

/** Clamp a gutter/radius into a usable range. */
export function clampGutter(gutter: number): number {
  return Math.min(0.35, Math.max(0.03, gutter))
}

/**
 * Half-width of the content window visible through the loupe.
 * Track loupe half-width is `radius`; magnification `zoom` shrinks the
 * content slice so ticks spread out inside the glass.
 */
export function loupeContentRadius(radius: number, zoom: number): number {
  const g = clampGutter(radius)
  const trackSpanInContent = g / Math.max(1e-6, 1 - 2 * g)
  return trackSpanInContent / Math.max(1, zoom)
}

/**
 * Effective minimum label-center gap as a fraction of loupe width.
 * Takes the stricter of the fractional floor and the pixel floor converted
 * through the current loupe width (so narrow screens auto-zoom harder).
 */
export function effectiveMinLabelGap(
  opts: LoupeOptions,
  loupeWidthPx?: number,
): number {
  const frac = opts.minLabelGap ?? DEFAULT_LOUPE.minLabelGap ?? 0.38
  const px = opts.minLabelGapPx ?? DEFAULT_LOUPE.minLabelGapPx ?? 56
  if (!(loupeWidthPx != null && loupeWidthPx > 1)) return frac
  const fromPx = Math.min(0.92, px / loupeWidthPx)
  return Math.max(frac, fromPx)
}

/**
 * Content-axis gap that characterizes packing at `focus`.
 * Uses the nearer of the immediate left/right neighbor gaps around the
 * closest bucket — so a packed early-year run zooms hard, while a lone
 * high-mass bucket (wide gap to its neighbors) stays near the base zoom.
 */
export function localBucketGap(
  anchors: ScrubLabelAnchor[],
  focus: number,
): number {
  if (anchors.length < 2) return 1
  const sorted = [...anchors].sort((a, b) => a.center - b.center)
  let idx = 0
  let best = Infinity
  for (let i = 0; i < sorted.length; i++) {
    const d = Math.abs(sorted[i]!.center - focus)
    if (d < best) {
      best = d
      idx = i
    }
  }
  const left = idx > 0 ? sorted[idx]!.center - sorted[idx - 1]!.center : Infinity
  const right =
    idx < sorted.length - 1 ? sorted[idx + 1]!.center - sorted[idx]!.center : Infinity
  const gap = Math.min(left, right)
  return Number.isFinite(gap) && gap > 1e-9 ? gap : 1
}

/**
 * Magnification at `focus` so neighboring buckets stay readable in the glass.
 * Dense clusters (many buckets packed on the tag-mass axis) raise zoom above
 * the base; sparse regions stay near `opts.zoom`.
 */
export function adaptiveLoupeZoom(
  anchors: ScrubLabelAnchor[],
  focus: number,
  opts: LoupeOptions = DEFAULT_LOUPE,
  loupeWidthPx?: number,
): number {
  const base = Math.max(1, opts.zoom)
  const maxZoom = Math.max(base, opts.maxZoom ?? 96)
  const minLabelGap = effectiveMinLabelGap(opts, loupeWidthPx)
  // On a very narrow loupe, prefer fewer labels so each stays tappable
  const maxLabels = Math.max(
    1,
    loupeWidthPx != null && loupeWidthPx < 120
      ? Math.min(opts.maxLabels ?? 3, 2)
      : (opts.maxLabels ?? 3),
  )

  const g = clampGutter(opts.radius)
  const trackSpanInContent = g / Math.max(1e-6, 1 - 2 * g)
  const localGap = localBucketGap(anchors, focus)
  // loupeGap ≈ contentGap / (2 * contentRadius) = contentGap * zoom / (2 * trackSpan)
  const gapZoom = (minLabelGap * 2 * trackSpanInContent) / Math.max(1e-9, localGap)
  let zoom = Math.min(maxZoom, Math.max(base, gapZoom))

  // Secondary clamp: keep at most maxLabels in the window
  for (let i = 0; i < 12; i++) {
    const contentRadius = loupeContentRadius(opts.radius, zoom)
    let count = 0
    for (const a of anchors) {
      if (Math.abs(a.center - focus) <= contentRadius) count++
    }
    if (count <= maxLabels) break
    const next = zoom * (count / maxLabels)
    if (next <= zoom + 1e-6) break
    zoom = Math.min(maxZoom, next)
  }
  return zoom
}

/**
 * Soft edge falloff for labels sliding through the glass.
 * Fully opaque near the center, transparent at the loupe edge.
 */
export function loupeEdgeOpacity(loupeX: number): number {
  const u = Math.min(1, Math.abs(loupeX - 0.5) * 2)
  if (u >= 1) return 0
  // Cosine ease — readable through most of the glass, fades only near the rim
  const fall = Math.cos(u * (Math.PI / 2))
  return fall * fall
}

/**
 * Labels visible through the loupe: a magnified viewport over the content axis.
 *
 * Zoom adapts to local bucket density so packed low-mass years stay separable.
 * Every anchor whose center falls inside the zoomed content window is shown,
 * positioned by projecting content → glass coordinates. As `focus` moves,
 * labels slide continuously through the glass — they do not snap into slots.
 */
export function buildLoupeLabels(
  anchors: ScrubLabelAnchor[],
  focus: number,
  opts: LoupeOptions = DEFAULT_LOUPE,
  loupeWidthPx?: number,
): LoupeLabel[] {
  if (anchors.length === 0) return []
  const zoom = adaptiveLoupeZoom(anchors, focus, opts, loupeWidthPx)
  const contentRadius = loupeContentRadius(opts.radius, zoom)
  const lo = focus - contentRadius
  const hi = focus + contentRadius

  const pool = anchors.filter((a) => a.center >= lo && a.center <= hi)
  if (pool.length === 0) {
    // Sparse gap: show the nearest neighbor so the glass isn't empty
    let nearest = anchors[0]!
    let best = Math.abs(nearest.center - focus)
    for (let i = 1; i < anchors.length; i++) {
      const d = Math.abs(anchors[i]!.center - focus)
      if (d < best) {
        best = d
        nearest = anchors[i]!
      }
    }
    const x = 0.5 + (nearest.center - focus) / (2 * contentRadius)
    return [
      {
        ...nearest,
        x: Math.min(1, Math.max(0, x)),
        opacity: 1,
        active: true,
      },
    ]
  }

  let best = 0
  let bestDist = Infinity
  for (let i = 0; i < pool.length; i++) {
    const d = Math.abs(pool[i]!.center - focus)
    if (d < bestDist) {
      bestDist = d
      best = i
    }
  }

  return pool
    .map((a, i) => {
      const x = 0.5 + (a.center - focus) / (2 * contentRadius)
      return {
        ...a,
        x,
        opacity: loupeEdgeOpacity(x),
        active: i === best,
      }
    })
    .filter((l) => l.x >= -0.02 && l.x <= 1.02)
    .sort((a, b) => a.x - b.x)
}

/**
 * Map a content-axis value `t` ∈ [0, 1] onto the full track,
 * leaving `gutter` empty on each side for the loupe overhang.
 */
export function contentToTrack(t: number, gutter: number): number {
  const g = clampGutter(gutter)
  const clamped = Math.min(1, Math.max(0, t))
  return g + clamped * (1 - 2 * g)
}

/**
 * Inverse of `contentToTrack`: pointer x on the full track → content [0, 1].
 * Positions in the gutters clamp to 0 or 1.
 */
export function trackToContent(x: number, gutter: number): number {
  const g = clampGutter(gutter)
  const inner = 1 - 2 * g
  if (inner <= 1e-9) return 0.5
  return Math.min(1, Math.max(0, (x - g) / inner))
}

/**
 * Loupe geometry on the full track: constant width `2 * gutter`, centered on
 * the content value `focus` so extremes sit under the glass center.
 */
export function loupeGeometry(
  focus: number,
  radius: number,
  edgeGutter?: number,
): { left: number; width: number; center: number } {
  const r = clampGutter(radius)
  const gutter = clampGutter(edgeGutter ?? radius)
  const center = contentToTrack(focus, gutter)
  const width = 2 * r
  return { left: center - r, width, center }
}
