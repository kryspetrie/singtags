/**
 * Mobile Browse: detect whether meta detail chips already wrap to a second line
 * so lyrics can continue on that wrap line instead of adding a third.
 */

/** Baseline-aligned chips on one flex line can differ by a few px in offsetTop. */
export const META_WRAP_TOP_EPS_PX = 10

/** Key / arranger / year / rating / downloads / cache / sheet+audio icons. */
export const META_DETAIL_SEL = '.meta-item'

/** True when `.meta-item` chips occupy more than one flex line. */
export function metaDetailsWrapToSecondLine(
  root: ParentNode | null | undefined,
  epsPx: number = META_WRAP_TOP_EPS_PX,
): boolean {
  if (!root) return false
  const chips = root.querySelectorAll<HTMLElement>(META_DETAIL_SEL)
  if (chips.length < 2) return false
  let minTop = Infinity
  let maxTop = -Infinity
  for (const chip of chips) {
    const top = chip.offsetTop
    if (top < minTop) minTop = top
    if (top > maxTop) maxTop = top
  }
  return maxTop - minTop >= epsPx
}
