/**
 * Viewport-clamped fixed popover placement (below anchor, flip above if needed).
 * Result is always fully on-screen for the reported maxHeight / width.
 */
export type PopoverPlacement = {
  top: string
  left: string
  minWidth: string
  maxHeightPx: number
  /** True when the panel opens above the anchor. */
  openUp: boolean
}

const PAD = 8
const DEFAULT_MIN_W = 180
const MIN_PANEL_H = 160

export function placePopoverNearAnchor(
  anchor: DOMRect,
  opts?: {
    minWidth?: number
    preferredWidth?: number
    preferBelow?: boolean
    /** Known panel height — clamps top so the box never clips. */
    panelHeightPx?: number
  },
): PopoverPlacement {
  const minW = opts?.minWidth ?? DEFAULT_MIN_W
  const preferredW = Math.max(minW, opts?.preferredWidth ?? minW)
  const vw = window.innerWidth
  const vh = window.innerHeight
  const panelW = Math.min(preferredW, Math.max(minW, vw - PAD * 2))
  const spaceBelow = Math.max(0, vh - anchor.bottom - PAD)
  const spaceAbove = Math.max(0, anchor.top - PAD)
  const preferBelow = opts?.preferBelow !== false
  const openUp =
    preferBelow
      ? spaceBelow < MIN_PANEL_H && spaceAbove > spaceBelow
      : spaceAbove >= spaceBelow
  const avail = Math.floor(openUp ? spaceAbove : spaceBelow)
  const maxHeightPx = Math.max(80, avail)
  const panelH = Math.min(maxHeightPx, opts?.panelHeightPx ?? Math.min(maxHeightPx, 280))
  let topPx = openUp ? anchor.top - panelH - 2 : anchor.bottom + 2
  // Keep the full panel inside the viewport.
  topPx = Math.max(PAD, Math.min(topPx, vh - PAD - panelH))
  const leftPx = Math.min(
    Math.max(PAD, Math.round(anchor.left)),
    Math.max(PAD, vw - panelW - PAD),
  )
  return {
    top: `${Math.round(topPx)}px`,
    left: `${Math.round(leftPx)}px`,
    minWidth: `${Math.max(minW, Math.round(Math.min(panelW, Math.max(anchor.width, minW))))}px`,
    maxHeightPx,
    openUp,
  }
}

/** Clamp a dragged fixed panel so it stays fully on-screen. */
export function clampFixedPanelRect(opts: {
  left: number
  top: number
  width: number
  height: number
}): { left: number; top: number } {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const w = Math.max(40, opts.width)
  const h = Math.max(40, opts.height)
  return {
    left: Math.max(PAD, Math.min(opts.left, vw - PAD - w)),
    top: Math.max(PAD, Math.min(opts.top, vh - PAD - h)),
  }
}
