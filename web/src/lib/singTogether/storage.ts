/**
 * Compatibility path. Persistence lives in the browser storage adapter.
 */
export {
  loadQrNudgeSeen,
  loadStoredProfile,
  QR_NUDGE_SEEN_KEY,
  saveQrNudgeSeen,
  saveStoredProfile,
} from '../../adapters/singTogether/browserStorage'
