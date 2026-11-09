/**
 * One-time Browse welcome splash — only on a clean root landing, never on
 * tag/deep-link entries (even when the user later opens Browse for the first time
 * after a tag link, the splash is still allowed on that first root visit).
 */

import { browseUrlLooksDefault } from './catalogFirstPaint'
import { isBrowseHomePath } from './browseReloadScroll'

export function shouldOfferBrowseWelcome(opts: {
  dismissed: boolean
  pathname: string
  search?: string
}): boolean {
  if (opts.dismissed) return false
  if (!isBrowseHomePath(opts.pathname)) return false
  return browseUrlLooksDefault(opts.search ?? '')
}
