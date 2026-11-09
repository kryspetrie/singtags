/**
 * Shared open/close signals for Google account dialogs (chrome + More menu).
 */
import { reactive } from 'vue'
import { checkDriveForUpdates } from './driveAppStateSync'

type DriveCheckToast = (
  message: string,
  opts: { title: string; tone: 'ok' | 'error' | 'info'; ms: number; placement: 'center' },
) => void

let driveCheckInFlight: Promise<void> | null = null

export const accountUiState = reactive({
  connectOpen: false,
  logoutConfirmOpen: false,
  cacheOfferOpen: false,
  driveDataOpen: false,
  /** Desktop chrome account dropdown. */
  chromeMenuOpen: false,
})

export function openGoogleLogin(): void {
  accountUiState.chromeMenuOpen = false
  accountUiState.logoutConfirmOpen = false
  accountUiState.connectOpen = true
}

export function openGoogleLogoutConfirm(): void {
  accountUiState.chromeMenuOpen = false
  accountUiState.connectOpen = false
  accountUiState.logoutConfirmOpen = true
}

export function openGoogleDriveData(): void {
  accountUiState.chromeMenuOpen = false
  accountUiState.connectOpen = false
  accountUiState.logoutConfirmOpen = false
  accountUiState.driveDataOpen = true
}

export function openGoogleCacheOffer(): void {
  accountUiState.cacheOfferOpen = true
}

export function closeGoogleAccountMenus(): void {
  accountUiState.chromeMenuOpen = false
}

/** Pull the latest Drive copy. Safe to call from the account menu or More. */
export function requestDriveUpdateCheck(show: DriveCheckToast): void {
  accountUiState.chromeMenuOpen = false
  if (driveCheckInFlight) return
  driveCheckInFlight = (async () => {
    show('Looking through everything saved in Google Drive', {
      title: 'Checking for updates',
      tone: 'info',
      ms: 0,
      placement: 'center',
    })
    try {
      const result = await checkDriveForUpdates()
      const message = result.message === 'Drive synced' ? 'Up to date' : result.message
      show(message, {
        title: 'Google Drive',
        tone: result.ok ? 'ok' : 'error',
        ms: result.ok ? 3500 : 5000,
        placement: 'center',
      })
    } catch (e) {
      show(e instanceof Error ? e.message : 'Could not check Google Drive', {
        title: 'Google Drive',
        tone: 'error',
        ms: 5000,
        placement: 'center',
      })
    } finally {
      driveCheckInFlight = null
    }
  })()
}

/** Test helper — reset dialog/menu flags. */
export function __resetAccountUiForTests(): void {
  accountUiState.connectOpen = false
  accountUiState.logoutConfirmOpen = false
  accountUiState.cacheOfferOpen = false
  accountUiState.driveDataOpen = false
  accountUiState.chromeMenuOpen = false
  driveCheckInFlight = null
}
