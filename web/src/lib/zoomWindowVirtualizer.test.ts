/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { applyUiScale, layoutPxToVisualPx, visualPxToLayoutPx } from './uiScale'
import {
  bindVirtualizerScrollAdjustGate,
  pinWindowVirtualizerToSearchTop,
  shouldAllowVirtualizerScrollAdjust,
  zoomAwareWindowScroll,
} from './zoomWindowVirtualizer'

/** Display-size steps users can pick (matches Settings ladder). */
const UI_SCALES = [70, 85, 90, 100, 110, 115, 130] as const

describe('shouldAllowVirtualizerScrollAdjust', () => {
  const base = {
    blocked: false,
    itemStart: 100,
    itemSize: 140,
    itemSizeCacheHas: false,
    scrollOffset: 400,
    scrollAdjustments: 0,
    scrollDirection: null as 'forward' | 'backward' | null,
  }

  it('blocks all adjustments while search-top pin is armed', () => {
    expect(shouldAllowVirtualizerScrollAdjust({ ...base, blocked: true })).toBe(false)
  })

  it('allows first measure only when the row starts above the fold', () => {
    expect(shouldAllowVirtualizerScrollAdjust(base)).toBe(true)
    expect(
      shouldAllowVirtualizerScrollAdjust({
        ...base,
        itemStart: 500,
        scrollOffset: 400,
      }),
    ).toBe(false)
  })

  it('does not yank scroll for below-fold first measures while scrolling down', () => {
    // Virgin rows enter from the bottom — correcting them was the mobile jump.
    expect(
      shouldAllowVirtualizerScrollAdjust({
        ...base,
        itemStart: 2200,
        scrollOffset: 2000,
        scrollDirection: 'forward',
        itemSizeCacheHas: false,
      }),
    ).toBe(false)
  })

  it('allows remasure only when the row is entirely above and not scrolling up', () => {
    expect(
      shouldAllowVirtualizerScrollAdjust({
        ...base,
        itemSizeCacheHas: true,
        itemStart: 100,
        itemSize: 140,
        scrollOffset: 400,
        scrollDirection: 'forward',
      }),
    ).toBe(true)
    expect(
      shouldAllowVirtualizerScrollAdjust({
        ...base,
        itemSizeCacheHas: true,
        itemStart: 100,
        itemSize: 140,
        scrollOffset: 400,
        scrollDirection: 'backward',
      }),
    ).toBe(false)
    expect(
      shouldAllowVirtualizerScrollAdjust({
        ...base,
        itemSizeCacheHas: true,
        itemStart: 350,
        itemSize: 140,
        scrollOffset: 400,
        scrollDirection: 'forward',
      }),
    ).toBe(false)
  })
})

describe('zoomWindowVirtualizer search-top pin', () => {
  it('binds a gate that restores above-fold-only adjust (not bare true)', () => {
    const itemSizeCache = new Map<unknown, number>()
    const instance = {
      shouldAdjustScrollPositionOnItemSizeChange: undefined as
        | undefined
        | ((
            item: { start: number; size: number; key: unknown },
            delta: number,
            inst: typeof instance,
          ) => boolean),
      itemSizeCache,
      scrollOffset: 2000,
      scrollAdjustments: 0,
      scrollDirection: 'forward' as 'forward' | 'backward' | null,
    }
    let block = false
    bindVirtualizerScrollAdjustGate(instance as never, () => block)

    const belowFold = { start: 2200, size: 140, key: 'below' }
    expect(
      instance.shouldAdjustScrollPositionOnItemSizeChange?.(belowFold, 12, instance),
    ).toBe(false)

    const aboveFold = { start: 100, size: 140, key: 'above' }
    expect(
      instance.shouldAdjustScrollPositionOnItemSizeChange?.(aboveFold, -8, instance),
    ).toBe(true)

    block = true
    expect(
      instance.shouldAdjustScrollPositionOnItemSizeChange?.(aboveFold, -8, instance),
    ).toBe(false)
  })

  it('clears eager scrollOffset/adjustments when pinning search-top', () => {
    const scrollTo = vi.fn()
    const instance = {
      scrollOffset: 640,
      scrollAdjustments: 48,
      _intendedScrollOffset: 688,
      scrollElement: { scrollTo },
    }
    pinWindowVirtualizerToSearchTop(instance as never)
    expect(instance.scrollOffset).toBe(0)
    expect(instance.scrollAdjustments).toBe(0)
    expect(instance._intendedScrollOffset).toBeNull()
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'auto' })
  })
})

describe('scroll-adjust gate under Display size ≠ 100%', () => {
  beforeEach(() => {
    document.documentElement.style.zoom = ''
    document.documentElement.style.removeProperty('--ui-scale')
    delete document.documentElement.dataset.uiScale
  })

  it('classifies above/below fold in layout px after visual→layout scroll conversion', () => {
    // Row positions are layout (offsetHeight / virtualizer translates). window.scrollY
    // is visual under html zoom — HomeView feeds the converted layout offset into
    // the gate. Mixing spaces at 115% would mis-classify rows near the fold.
    for (const scale of UI_SCALES) {
      applyUiScale(scale)
      const visualScrollY = 2000
      const layoutScroll = visualPxToLayoutPx(visualScrollY)
      const rowH = 140

      const belowStart = layoutScroll + 40
      expect(
        shouldAllowVirtualizerScrollAdjust({
          blocked: false,
          itemStart: belowStart,
          itemSize: rowH,
          itemSizeCacheHas: false,
          scrollOffset: layoutScroll,
          scrollAdjustments: 0,
          scrollDirection: 'forward',
        }),
        `scale ${scale}%: below-fold first measure must not adjust`,
      ).toBe(false)

      const aboveStart = Math.max(0, layoutScroll - rowH * 3)
      expect(
        shouldAllowVirtualizerScrollAdjust({
          blocked: false,
          itemStart: aboveStart,
          itemSize: rowH,
          itemSizeCacheHas: false,
          scrollOffset: layoutScroll,
          scrollAdjustments: 0,
          scrollDirection: 'forward',
        }),
        `scale ${scale}%: above-fold first measure may adjust`,
      ).toBe(true)

      // Mixed-space trap: a row between visual scrollY and layout scrollY flips
      // the fold decision if you skip visual→layout conversion.
      if (scale > 100) {
        const trap = (layoutScroll + visualScrollY) / 2
        expect(trap > layoutScroll && trap < visualScrollY).toBe(true)
        expect(
          shouldAllowVirtualizerScrollAdjust({
            blocked: false,
            itemStart: trap,
            itemSize: rowH,
            itemSizeCacheHas: false,
            scrollOffset: layoutScroll,
            scrollAdjustments: 0,
            scrollDirection: 'forward',
          }),
        ).toBe(false)
        // Same trap compared to raw visual Y would wrongly allow adjust.
        expect(trap < visualScrollY).toBe(true)
      } else if (scale < 100) {
        const trap = (layoutScroll + visualScrollY) / 2
        expect(trap < layoutScroll && trap > visualScrollY).toBe(true)
        expect(
          shouldAllowVirtualizerScrollAdjust({
            blocked: false,
            itemStart: trap,
            itemSize: rowH,
            itemSizeCacheHas: false,
            scrollOffset: layoutScroll,
            scrollAdjustments: 0,
            scrollDirection: 'forward',
          }),
        ).toBe(true)
        // Same trap compared to raw visual Y would wrongly deny adjust.
        expect(trap < visualScrollY).toBe(false)
      }
    }
  })

  it('writes scroll adjustments in visual px and round-trips within TanStack snap tolerance', () => {
    // applyScrollAdjustment → zoomAwareWindowScroll(layout) → browser scrollY (visual)
    // → observeZoomAwareWindowOffset → layout. Intended layout must land within the
    // 1.5px snap window TanStack uses for _intendedScrollOffset.
    for (const scale of UI_SCALES) {
      applyUiScale(scale)
      const visualScrollY = 2400
      const layoutOffset = visualPxToLayoutPx(visualScrollY)
      const deltaLayout = -18 // typical estimate→actual shrink above the fold
      const scrollTo = vi.fn()
      const instance = { scrollElement: { scrollTo } }

      zoomAwareWindowScroll(layoutOffset, { adjustments: deltaLayout }, instance as never)

      const writtenVisual = scrollTo.mock.calls[0]![0].top as number
      expect(writtenVisual).toBeCloseTo(layoutPxToVisualPx(layoutOffset + deltaLayout), 8)

      // Integer-quantized scrollY (common on mobile) still re-reads close enough.
      const layoutReadExact = visualPxToLayoutPx(writtenVisual)
      const layoutReadRounded = visualPxToLayoutPx(Math.round(writtenVisual))
      const intended = layoutOffset + deltaLayout
      expect(Math.abs(layoutReadExact - intended)).toBeLessThan(1e-9)
      expect(
        Math.abs(layoutReadRounded - intended),
        `scale ${scale}%: rounded visual scrollY must stay within 1.5 layout px`,
      ).toBeLessThan(1.5)
    }
  })

  it('keeps bound gate decisions stable when scrollOffset is layout-converted at mid-list', () => {
    for (const scale of [85, 115, 130] as const) {
      applyUiScale(scale)
      const visualScrollY = 2800
      const layoutScroll = visualPxToLayoutPx(visualScrollY)
      const itemSizeCache = new Map<unknown, number>()
      const instance = {
        shouldAdjustScrollPositionOnItemSizeChange: undefined as
          | undefined
          | ((
              item: { start: number; size: number; key: unknown },
              delta: number,
              inst: typeof instance,
            ) => boolean),
        itemSizeCache,
        scrollOffset: layoutScroll,
        scrollAdjustments: 0,
        scrollDirection: 'forward' as const,
      }
      bindVirtualizerScrollAdjustGate(instance as never, () => false)

      expect(
        instance.shouldAdjustScrollPositionOnItemSizeChange?.(
          { start: layoutScroll + 80, size: 148, key: `new-${scale}` },
          20,
          instance,
        ),
      ).toBe(false)

      expect(
        instance.shouldAdjustScrollPositionOnItemSizeChange?.(
          { start: layoutScroll - 400, size: 148, key: `old-${scale}` },
          -12,
          instance,
        ),
      ).toBe(true)
    }
  })
})
