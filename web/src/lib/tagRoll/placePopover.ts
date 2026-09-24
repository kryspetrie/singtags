/**
 * Viewport-clamped fixed popover placement (below anchor, flip above if needed).
 */
export type PopoverPlacement = {
  top: string
  left: string
  minWidth: string
  maxHeightPx: number
}

const PAD = 8
const DEFAULT_MIN_W = 180
const MIN_PANEL_H = 160

export function placePopoverNearAnchor(
  anchor: DOMRect,
  opts?: { minWidth?: number; preferredWidth?: number; preferBelow?: boolean },
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
  const maxHeightPx = Math.max(
    MIN_PANEL_H,
    Math.floor(openUp ? spaceAbove : spaceBelow),
  )
  const topPx = openUp
    ? Math.max(PAD, anchor.top - maxHeightPx)
    : Math.min(anchor.bottom + 2, vh - PAD - MIN_PANEL_H)
  // Prefer aligning to anchor left; if that would clip, shift left to fit panelW.
  const leftPx = Math.min(
    Math.max(PAD, Math.round(anchor.left)),
    Math.max(PAD, vw - panelW - PAD),
  )
  return {
    top: `${Math.round(topPx)}px`,
    left: `${Math.round(leftPx)}px`,
    minWidth: `${Math.max(minW, Math.round(Math.min(panelW, Math.max(anchor.width, minW))))}px`,
    maxHeightPx,
  }
}
