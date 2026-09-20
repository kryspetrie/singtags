import type { SheetImageSet } from '../sheetAssets'
import { resolveSheetSrc } from './urls'

/** Only the primary sheet pages get automatic WebP→PDF HQ upgrade (not alternate scans). */
export function shouldAutoUpgradePdf(
  hasPdf: boolean,
  imageSets: SheetImageSet[],
  activeImageSet: SheetImageSet | null,
): boolean {
  if (!hasPdf) return false
  if (!imageSets.length) return false
  if (!activeImageSet) return false
  if (imageSets.length === 1) return true
  return activeImageSet.id === 'pages' || activeImageSet.id === imageSets[0]!.id
}

/** Immediate image URLs for the active set (prefetch or raw) — never waits. */
export function imagePreviewUrls(
  activeImageSet: SheetImageSet | null,
  baseUrl: string | undefined,
  prefetchedPages: string[] | null | undefined,
  defaultSetId: string | undefined,
): string[] {
  const paths = activeImageSet?.paths ?? []
  if (!paths.length) return []
  const raw = paths.map((p) => resolveSheetSrc(p, baseUrl))
  const prefetch = prefetchedPages
  const canUsePrefetch =
    !!prefetch?.length &&
    activeImageSet?.id === defaultSetId &&
    prefetch.length === paths.length
  return canUsePrefetch ? prefetch! : raw
}

export function usingPrefetchedPages(
  activeImageSet: SheetImageSet | null,
  prefetchedPages: string[] | null | undefined,
  defaultSetId: string | undefined,
  pathCount: number,
): boolean {
  const prefetch = prefetchedPages
  return (
    !!prefetch?.length &&
    activeImageSet?.id === defaultSetId &&
    prefetch.length === pathCount
  )
}
