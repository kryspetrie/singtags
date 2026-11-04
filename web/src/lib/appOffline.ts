/**
 * App offline detection without Pinia — for google sync and other non-Vue modules.
 * Matches {@link useOfflineModeStore}: manual Settings toggle or browser offline.
 */

const MANUAL_OFFLINE_KEY = 'singtags.manualOffline'
const LEGACY_OFFLINE_KEY = 'singtags.simulatedOffline'

/** True when Settings “Offline” is on or the browser reports no network. */
export function isSingTagsOffline(): boolean {
  try {
    if (localStorage.getItem(MANUAL_OFFLINE_KEY) === '1') return true
    if (localStorage.getItem(LEGACY_OFFLINE_KEY) === '1') return true
  } catch {
    /* ignore */
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  return false
}
