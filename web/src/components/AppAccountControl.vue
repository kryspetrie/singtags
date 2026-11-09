<script setup lang="ts">
/**
 * Distinct Google account control: desktop chrome (top-right) + shared dialogs.
 * Mobile keeps entry in More; this chrome control is desktop-only via CSS.
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import ConfirmDialog from './ConfirmDialog.vue'
import GoogleDriveCacheOfferDialog from './GoogleDriveCacheOfferDialog.vue'
import GoogleDriveConnectDialog from './GoogleDriveConnectDialog.vue'
import GoogleDriveDataDialog from './GoogleDriveDataDialog.vue'
import {
  accountUiState,
  closeGoogleAccountMenus,
  openGoogleCacheOffer,
  openGoogleDriveData,
  openGoogleLogin,
  openGoogleLogoutConfirm,
  requestDriveUpdateCheck,
} from '../lib/google/accountUi'
import { driveSyncState } from '../lib/google/driveAppStateSync'
import {
  googleAuthState,
  isDriveSyncEnabled,
  isGoogleConfigured,
  restoreGoogleConnection,
  setDriveSyncEnabled,
  signOut,
} from '../lib/google/googleAuth'
import { useSnackbarStore } from '../stores/snackbar'

const snackbar = useSnackbarStore()
const googleConfigured = isGoogleConfigured()
const loggingOut = ref(false)
const rootRef = ref<HTMLElement | null>(null)
const menuStyle = ref<Record<string, string>>({})

const shortEmail = computed(() => {
  const email = googleAuthState.email
  if (!email) return 'Account'
  const at = email.indexOf('@')
  if (at <= 0) return email
  const user = email.slice(0, at)
  if (user.length <= 12) return email
  return `${user.slice(0, 10)}…@${email.slice(at + 1)}`
})

const chromeLabel = computed(() =>
  googleAuthState.connected ? shortEmail.value : 'Log in',
)

const chromeTitle = computed(() => {
  if (!googleConfigured) return 'Google sync is not configured in this build'
  if (googleAuthState.connected) {
    return googleAuthState.email
      ? `Signed in as ${googleAuthState.email}`
      : 'Google account connected'
  }
  return 'Log in with Google to sync across devices'
})

/** Labs-gated: hide Log in until Drive sync is enabled; keep chrome if already signed in. */
const showAccountChrome = computed(
  () =>
    googleConfigured &&
    (googleAuthState.driveSyncEnabled || googleAuthState.connected || isDriveSyncEnabled()),
)

onMounted(() => {
  restoreGoogleConnection()
  document.addEventListener('pointerdown', onDocPointer, true)
  document.addEventListener('keydown', onDocKey)
})

onUnmounted(() => {
  document.removeEventListener('pointerdown', onDocPointer, true)
  document.removeEventListener('keydown', onDocKey)
})

watch(
  () => googleAuthState.connected,
  () => {
    if (!googleAuthState.connected) accountUiState.chromeMenuOpen = false
  },
)

function positionMenu(): void {
  const btn = rootRef.value?.querySelector('.account-btn') as HTMLElement | null
  if (!btn) {
    menuStyle.value = {}
    return
  }
  const r = btn.getBoundingClientRect()
  menuStyle.value = {
    position: 'fixed',
    top: `${Math.round(r.bottom + 6)}px`,
    right: `${Math.max(8, Math.round(window.innerWidth - r.right))}px`,
    left: 'auto',
  }
}

function onDocPointer(e: PointerEvent): void {
  if (!accountUiState.chromeMenuOpen) return
  const t = e.target as Node | null
  if (t && rootRef.value?.contains(t)) return
  const menu = document.querySelector('.account-menu')
  if (t && menu?.contains(t)) return
  accountUiState.chromeMenuOpen = false
}

function onDocKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') closeGoogleAccountMenus()
}

function onChromeClick(): void {
  if (!googleConfigured) {
    snackbar.show('Google sync is not configured in this build', {
      title: 'Unavailable',
      tone: 'error',
      ms: 3500,
      placement: 'center',
    })
    return
  }
  if (!googleAuthState.connected) {
    if (!isDriveSyncEnabled() && !googleAuthState.driveSyncEnabled) {
      snackbar.show(
        'Turn on Google Drive sync in Labs first. Your email must be added by Krys as a beta tester.',
        {
          title: 'Labs beta',
          tone: 'error',
          ms: 4500,
          placement: 'center',
        },
      )
      return
    }
    openGoogleLogin()
    return
  }
  const next = !accountUiState.chromeMenuOpen
  if (next) positionMenu()
  accountUiState.chromeMenuOpen = next
}

function onCheckForUpdates(): void {
  requestDriveUpdateCheck((message, opts) => snackbar.show(message, opts))
}

function onConnected(): void {
  snackbar.show('Favorites and settings will sync to your Google Drive', {
    title: 'Connected',
    tone: 'ok',
    ms: 3000,
    placement: 'center',
  })
  openGoogleCacheOffer()
}

function onCacheDecided(opts: { sheets: boolean; audio: boolean }): void {
  if (!opts.sheets && !opts.audio) {
    snackbar.show('You can enable a song cache later from Labs', {
      title: 'Song cache skipped',
      tone: 'ok',
      ms: 3500,
      placement: 'center',
    })
    return
  }
  const bits = [opts.sheets ? 'sheets' : null, opts.audio ? 'tracks' : null].filter(Boolean)
  snackbar.show(`${bits.join(' & ')} will sync in the background`, {
    title: 'Song cache enabled',
    tone: 'ok',
    ms: 4000,
    placement: 'center',
  })
}

async function confirmLogout(): Promise<void> {
  if (loggingOut.value) return
  loggingOut.value = true
  try {
    await signOut()
    setDriveSyncEnabled(false)
    driveSyncState.message = ''
    accountUiState.logoutConfirmOpen = false
    snackbar.show('Sync stopped. Your data stays in Google Drive and on this device.', {
      title: 'Logged out',
      tone: 'ok',
      ms: 3500,
      placement: 'center',
    })
  } finally {
    loggingOut.value = false
  }
}
</script>

<template>
  <div v-if="showAccountChrome" ref="rootRef" class="account-chrome">
    <button
      type="button"
      class="account-btn"
      :class="{
        connected: googleAuthState.connected,
        open: accountUiState.chromeMenuOpen,
      }"
      :aria-haspopup="googleAuthState.connected ? 'menu' : 'dialog'"
      :aria-expanded="googleAuthState.connected ? accountUiState.chromeMenuOpen : undefined"
      :aria-label="googleAuthState.connected ? 'Account menu' : 'Log in with Google'"
      :title="chromeTitle"
      :disabled="loggingOut"
      @click="onChromeClick"
    >
      <span class="account-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="18" height="18" focusable="false">
          <path
            fill="currentColor"
            d="M12 12a4.5 4.5 0 1 0-4.5-4.5A4.5 4.5 0 0 0 12 12Zm0 2.25c-3.6 0-6.75 1.8-6.75 4v.75h13.5V18.25c0-2.2-3.15-4-6.75-4Z"
          />
          <path
            fill="currentColor"
            opacity="0.85"
            d="M18.75 8.5a.75.75 0 0 0-.75.75V11h-1.75a.75.75 0 0 0 0 1.5H18v1.75a.75.75 0 0 0 1.5 0V12.5h1.75a.75.75 0 0 0 0-1.5H19.5V9.25a.75.75 0 0 0-.75-.75Z"
          />
        </svg>
      </span>
      <span class="account-label">{{ chromeLabel }}</span>
      <span v-if="googleAuthState.connected" class="account-caret" aria-hidden="true">▾</span>
    </button>

    <Teleport to="body">
      <div
        v-if="accountUiState.chromeMenuOpen && googleAuthState.connected"
        class="account-menu"
        role="menu"
        aria-label="Account"
        :style="menuStyle"
      >
        <p class="account-menu-email">
          {{ googleAuthState.email || 'Signed in with Google' }}
        </p>
        <p class="account-menu-hint">Your SingTags data syncs to Google Drive</p>
        <button
          type="button"
          class="account-menu-item"
          role="menuitem"
          @click="onCheckForUpdates"
        >
          Check for updates
        </button>
        <button
          type="button"
          class="account-menu-item"
          role="menuitem"
          @click="openGoogleDriveData"
        >
          Your Drive data
        </button>
        <button
          type="button"
          class="account-menu-item"
          role="menuitem"
          :disabled="loggingOut"
          @click="openGoogleLogoutConfirm"
        >
          Log out
        </button>
      </div>
    </Teleport>
  </div>

  <GoogleDriveConnectDialog
    :open="accountUiState.connectOpen"
    @close="accountUiState.connectOpen = false"
    @connected="onConnected"
  />
  <GoogleDriveCacheOfferDialog
    :open="accountUiState.cacheOfferOpen"
    @close="accountUiState.cacheOfferOpen = false"
    @decided="onCacheDecided"
  />
  <GoogleDriveDataDialog
    :open="accountUiState.driveDataOpen"
    @close="accountUiState.driveDataOpen = false"
  />
  <ConfirmDialog
    :open="accountUiState.logoutConfirmOpen"
    title="Log out of Google?"
    message="SingTags will stop syncing with your Drive. Favorites and settings stay on this device and in your Google Account — we never store them on SingTags servers."
    confirm-label="Log out"
    cancel-label="Cancel"
    :danger="false"
    wide
    @close="accountUiState.logoutConfirmOpen = false"
    @confirm="confirmLogout"
  />
</template>

<style scoped>
/* Desktop chrome only — mobile uses More → account. */
.account-chrome {
  display: none;
  position: relative;
  flex: 0 0 auto;
  align-self: center;
  margin-left: 0.35rem;
}
@media (min-width: 768px) {
  .account-chrome {
    display: block;
  }
}
.account-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  max-width: 14rem;
  min-height: 40px;
  padding: 0.35rem 0.7rem 0.35rem 0.55rem;
  border-radius: 999px;
  border: 1.5px solid color-mix(in srgb, var(--accent) 55%, var(--border));
  background: color-mix(in srgb, var(--accent) 10%, var(--surface));
  color: var(--accent-hover);
  font: inherit;
  font-size: 0.88rem;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
}
.account-btn:hover {
  border-color: var(--accent-hover);
  background: color-mix(in srgb, var(--accent) 18%, var(--surface));
}
.account-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.account-btn.connected {
  border-color: var(--border);
  background: var(--surface);
  color: var(--text);
  font-weight: 650;
}
.account-btn.connected.open {
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
}
.account-icon {
  display: inline-flex;
  flex: 0 0 auto;
  color: var(--accent-hover);
}
.account-btn.connected .account-icon {
  color: var(--accent);
}
.account-label {
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}
.account-caret {
  font-size: 0.7rem;
  opacity: 0.7;
  margin-left: -0.1rem;
}
</style>

<!-- Teleported menu is outside the component root — needs unscoped rules. -->
<style>
.account-menu {
  z-index: 40;
  width: min(18rem, calc(100vw - 1.5rem));
  display: grid;
  gap: 0.35rem;
  padding: 0.65rem 0.7rem 0.7rem;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: var(--surface);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.14);
  box-sizing: border-box;
}
.account-menu-email {
  margin: 0;
  font-size: 0.86rem;
  font-weight: 650;
  color: var(--text);
  word-break: break-all;
  line-height: 1.35;
}
.account-menu-hint {
  margin: 0 0 0.25rem;
  font-size: 0.76rem;
  color: var(--muted);
  line-height: 1.35;
}
.account-menu-item {
  display: block;
  width: 100%;
  margin: 0;
  padding: 0.55rem 0.6rem;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: color-mix(in srgb, var(--surface) 88%, var(--border));
  color: var(--text);
  font: inherit;
  font-size: 0.88rem;
  font-weight: 650;
  text-align: left;
  cursor: pointer;
}
.account-menu-item:hover {
  border-color: color-mix(in srgb, var(--accent) 35%, var(--border));
}
.account-menu-item:disabled {
  opacity: 0.6;
  cursor: default;
}
</style>
