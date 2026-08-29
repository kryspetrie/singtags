# Density scrub rail (landmark + loupe)

Companion to [HYBRID_YEAR_BINS_PLAN.md](./HYBRID_YEAR_BINS_PLAN.md). Hybrid bins still define **list section headers / groupings**. This plan covers a reusable **scrub control** for fast scanning through the ordered collection.

## Goals

- Scan the library without long scrolling.
- Axis is **tag mass** (equal weight per tag in the sorted result list), not linear calendar time.
- Interaction feels like **sliding a magnifying glass across a ruler**:
  - **Landmarks**: sparse year labels on the base (zoomed-out) track.
  - **Loupe**: a **narrow, constant-width** glass. Inside it, the same axis is shown **magnified** — ticks that are close on the track appear farther apart under the glass. Labels **slide continuously** through the viewport as you drag; they do not snap into slots or grow/shrink like a Dock.
- Year axis: **left = oldest, right = newest** (even when the result list is newest-first).
- No viewport bracket — the loupe is the focus affordance.
- First consumer: **View by Year**. Component stays reusable for **View by Title** later.

## Loupe model (ruler + magnifier)

```
Track (zoomed out):   |---- 1920s ---- 1950s ---- 1990s ---- 2010 ---- 2020 ----|
Loupe over ~2012:                    [ 2010 | 2011 | 2012 | 2013 ]
                                         ←── content slides as loupe moves ──→
```

- Loupe width on the track is small (`radius ≈ 0.08` → ~16% of the strip).
- Side gutters equal that radius so the glass can center on the oldest/newest values.
- `zoom` (default ~1.75 floor) shrinks the content window shown inside the glass. **Adaptive zoom** raises magnification where buckets are packed tightly on the tag-mass axis (e.g. many low-mass early years / decades), so individual labels stay readable instead of blobbing. Sparse / high-mass regions stay near the floor.
- Axis uses a soft blend (`axisBlend` ≈ 0.4) between tag-mass and equal-per-bucket space so low-mass decades stay hittable without erasing volume shape.
- Commit happens on **pointer up** only (drag/hover preview; release to jump).
- Spacing also respects a **pixel floor** (`minLabelGapPx`, default 56): on narrow screens the loupe auto-zooms harder so decade labels like `1920s` stay separable for scrubbing.
- Outside labels stay sparse; inside labels are whatever buckets fall in that magnified window (often finer than the landmarks), capped so only a few distinct names show at once.
- No per-label scale animation. Emphasis is weight/color + a center hairline only.

## Separation of concerns

| Layer | Responsibility |
|-------|----------------|
| Hybrid year bins | List `h2` headers (`<1920`, `1990s`, `2015`, …) |
| Scrub rail | Navigate by tag index; landmark years + magnified loupe |
| Jump chips | Title / Collection only; Year uses scrub |

## Interaction model

1. **Track** — Continuous control over the sorted result set (tag-mass uniform; optional `reverseAxis`).
2. **Landmarks** — `pickLandmarkAnchors` keeps first/last and interior labels with a minimum track gap.
3. **Loupe** — Follows the pointer with fixed width (`loupeGeometry`). `buildLoupeLabels` projects nearby anchors through the zoomed content window so they slide under the glass.
4. **Commit** — Pointer-up emits `scrub(index)`; parent reveals/scrolls.

## Component API

`web/src/components/ScrubRail.vue` + `web/src/lib/scrub.ts`

- Props: `length`, `labelAtIndex`, `ariaLabel`, `reverseAxis`, `landmarkGap`, `loupe` (`radius`, `zoom`, `minLabelGap`, `minLabelGapPx`, `maxZoom`, `maxLabels`); axis blend via `buildLabelAnchors(..., axisBlend)`
- Events: `scrub`, `scrubEnd`
- Year wiring: `labelAtIndex` uses hybrid year section keys so landmarks/loupe/cursor match list bins
- Adaptive zoom: `adaptiveLoupeZoom` / `localBucketGap` raise magnification where neighboring buckets are packed on the tag-mass axis (typical of many low-mass early years), keeping ~2–3 distinct labels in the glass.
## Out of scope

- Linear calendar timeline
- Viewport bracket
- Dock-style per-label magnification
- Wiring Title scrub until requested
- Changing year filter chips
