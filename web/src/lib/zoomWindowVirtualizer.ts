/**
 * TanStack window-virtualizer adapters that keep scroll math in layout CSS px
 * when `<html>` uses CSS `zoom` (Display size).
 *
 * Chrome reports window.scrollY / innerHeight / GBR in *visual* px, while
 * offsetHeight / offsetTop / style heights stay in *layout* px. Mixing them
 * makes measured rows drift so fewer cards appear the further you scroll.
 */
import {
  observeWindowOffset,
  observeWindowRect,
  type Virtualizer,
} from '@tanstack/vue-virtual'
import { layoutPxToVisualPx, visualPxToLayoutPx } from './uiScale'

type Win = Window
type WinVirtualizer = Virtualizer<Win, Element>

/** Viewport size in layout px (innerWidth/Height are visual under zoom). */
export function observeZoomAwareWindowRect(
  instance: WinVirtualizer,
  cb: (rect: { width: number; height: number }) => void,
): (() => void) | undefined {
  return observeWindowRect(instance, ({ width, height }) => {
    cb({
      width: visualPxToLayoutPx(width),
      height: visualPxToLayoutPx(height),
    })
  })
}

/** Scroll offset in layout px (scrollY is visual under zoom). */
export function observeZoomAwareWindowOffset(
  instance: WinVirtualizer,
  cb: (offset: number, isScrolling: boolean) => void,
): (() => void) | undefined {
  return observeWindowOffset(instance, (offset, isScrolling) => {
    cb(visualPxToLayoutPx(offset), isScrolling)
  })
}

/** Programmatic scroll: virtualizer passes layout px; window.scrollTo wants visual. */
export function zoomAwareWindowScroll(
  offset: number,
  {
    adjustments = 0,
    behavior,
  }: { adjustments?: number; behavior?: ScrollBehavior },
  instance: WinVirtualizer,
): void {
  const layout = offset + adjustments
  instance.scrollElement?.scrollTo?.({
    top: layoutPxToVisualPx(layout),
    behavior,
  })
}

/** initialOffset for useWindowVirtualizer — layout px. */
export function zoomAwareInitialOffset(): number {
  return visualPxToLayoutPx(typeof window !== 'undefined' ? window.scrollY : 0)
}
