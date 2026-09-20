export type Size2 = { width: number; height: number }

export type ViewportMeasureInput = {
  sheetClientWidth: number
  sheetClientHeight: number
  stageOffsetWidth: number
  stageScrollHeight: number
  /** When paging in fullscreen, prefer the visible page box. */
  pagingPage?: { width: number; height: number } | null
}

export function measureViewportAndContentFromDom(input: ViewportMeasureInput): {
  viewport: Size2
  content: Size2
} | null {
  const vw = input.sheetClientWidth
  const vh = input.sheetClientHeight
  if (vw <= 0 || vh <= 0) return null

  let width = input.stageOffsetWidth
  let height = input.stageScrollHeight

  const page = input.pagingPage
  if (page && page.width > 0 && page.height > 0) {
    width = page.width
    height = page.height
  }

  if (width <= 0 || height <= 0) return null
  return {
    viewport: { width: vw, height: vh },
    content: { width, height },
  }
}

/** Reserve space for top/bottom overlay chrome so the sheet isn't covered on load. */
export function measureChromeInsetsFromDom(
  sheet: HTMLElement,
  overlay: HTMLElement | null,
): { top: number; bottom: number } {
  if (!overlay) return { top: 0, bottom: 0 }
  const sheetR = sheet.getBoundingClientRect()
  const or = overlay.getBoundingClientRect()
  if (or.width <= 0 || or.height <= 0 || sheetR.height <= 0) return { top: 0, bottom: 0 }
  const toLayoutY = sheet.clientHeight / sheetR.height
  const gap = 8
  const mid = (or.top + or.bottom) / 2
  const sheetMid = (sheetR.top + sheetR.bottom) / 2
  if (mid <= sheetMid) {
    return { top: Math.max(0, (or.bottom - sheetR.top + gap) * toLayoutY), bottom: 0 }
  }
  return { top: 0, bottom: Math.max(0, (sheetR.bottom - or.top + gap) * toLayoutY) }
}

export function flexContentWidth(el: HTMLElement | null, gap: number): number {
  if (!el) return 0
  const kids = [...el.children] as HTMLElement[]
  if (!kids.length) return 0
  return kids.reduce((sum, child) => sum + child.offsetWidth, 0) + gap * (kids.length - 1)
}

export type ChromeLayoutInput = {
  width: number
  multipage: boolean
  chromeCompact: boolean
  playbackOpen: boolean
  pitchWidth: number
  trailingWidth: number
  gap: number
  playContentWidth: number
  moreContentWidth: number
}

export type ChromeLayoutFlags = {
  pitchCompact: boolean
  playbackBelow: boolean
  moreInline: boolean
}

export function computeChromeLayout(input: ChromeLayoutInput): ChromeLayoutFlags {
  const {
    width,
    multipage,
    chromeCompact,
    playbackOpen,
    pitchWidth,
    trailingWidth,
    gap,
    playContentWidth,
    moreContentWidth,
  } = input

  if (width <= 0) {
    return { pitchCompact: false, playbackBelow: false, moreInline: true }
  }

  // Multipage pager eats trailing space — collapse pitch label sooner.
  const pitchCompact = width < (multipage ? 820 : 560)
  const available = Math.max(0, width - pitchWidth - trailingWidth - gap * 2)

  if (playbackOpen) {
    return {
      pitchCompact,
      playbackBelow: playContentWidth > available + 1,
      moreInline: true,
    }
  }

  if (!chromeCompact) {
    return {
      pitchCompact,
      playbackBelow: false,
      moreInline: moreContentWidth <= available + 1,
    }
  }

  return { pitchCompact, playbackBelow: false, moreInline: true }
}
