import { prefersReducedMotion } from './media'

export const PAGE_CROSSFADE_MS = 300

export function canCrossfadePageUrls(
  from: string[],
  urls: string[],
  fade: boolean,
): boolean {
  return (
    fade &&
    !prefersReducedMotion() &&
    from.length > 0 &&
    from.length === urls.length &&
    from.some((u, i) => u !== urls[i])
  )
}

export function isOwnedPagesLoadStale(
  signal: AbortSignal | undefined,
  seq: number | undefined,
  loadSeq: number,
  token: number,
  fadeGen: number,
): boolean {
  return !!(signal?.aborted || (seq != null && seq !== loadSeq) || token !== fadeGen)
}

export async function waitDoubleAnimationFrame(): Promise<void> {
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  })
}

export function waitPageCrossfadeMs(ms = PAGE_CROSSFADE_MS): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function revokeObjectUrls(urls: string[]): void {
  for (const u of urls) {
    try {
      URL.revokeObjectURL(u)
    } catch {
      /* ignore */
    }
  }
}
