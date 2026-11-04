/**
 * Shared open/close signals for Google account dialogs (chrome + More menu).
 */
import { reactive } from 'vue'

export const accountUiState = reactive({
  connectOpen: false,
  logoutConfirmOpen: false,
  cacheOfferOpen: false,
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

export function openGoogleCacheOffer(): void {
  accountUiState.cacheOfferOpen = true
}

export function closeGoogleAccountMenus(): void {
  accountUiState.chromeMenuOpen = false
}

/** Test helper — reset dialog/menu flags. */
export function __resetAccountUiForTests(): void {
  accountUiState.connectOpen = false
  accountUiState.logoutConfirmOpen = false
  accountUiState.cacheOfferOpen = false
  accountUiState.chromeMenuOpen = false
}
