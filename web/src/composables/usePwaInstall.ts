/**
 * Shared PWA install state for welcome, More menu, and About.
 *
 * Captures `beforeinstallprompt` without calling preventDefault (so Chrome’s
 * address-bar / menu install UI stay available), tracks standalone / installed,
 * and exposes {@link promptPwaInstall} for custom Install App buttons.
 */

import { computed, readonly, ref, shallowRef } from 'vue'

export const PWA_INSTALL_DISMISSED_KEY = 'singtags.installPrompt.dismissed'
export const PWA_INSTALL_DONE_KEY = 'singtags.pwaInstalled'

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const installEvent = shallowRef<BeforeInstallPromptEvent | null>(null)
/** Toast offer after welcome is dismissed (App shell). */
const showInstallToast = ref(false)
const installedFlag = ref(false)
let listening = false

function readInstalledFlag(): boolean {
  try {
    return localStorage.getItem(PWA_INSTALL_DONE_KEY) === '1'
  } catch {
    return false
  }
}

function readDismissedFlag(): boolean {
  try {
    return localStorage.getItem(PWA_INSTALL_DISMISSED_KEY) === '1'
  } catch {
    return false
  }
}

/** True when running as an installed app (standalone / fullscreen / iOS standalone). */
export function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return false
  if (window.matchMedia('(display-mode: standalone)').matches) return true
  if (window.matchMedia('(display-mode: fullscreen)').matches) return true
  if (window.matchMedia('(display-mode: minimal-ui)').matches) return true
  const nav = window.navigator as Navigator & { standalone?: boolean }
  return nav.standalone === true
}

function syncInstalledFromEnvironment(): void {
  if (isStandaloneDisplay() || readInstalledFlag()) {
    installedFlag.value = true
  }
}

syncInstalledFromEnvironment()

function onBeforeInstall(e: Event): void {
  // Do not preventDefault — leave Chrome’s address-bar / menu install UI alone.
  // Still capture the event so our Install App buttons can call prompt() when available.
  installEvent.value = e as BeforeInstallPromptEvent
  // Browser is offering install again (e.g. after uninstall) — drop a stale done flag
  // so More / welcome / About keep showing Install App.
  if (installedFlag.value || readInstalledFlag()) {
    installedFlag.value = false
    try {
      localStorage.removeItem(PWA_INSTALL_DONE_KEY)
    } catch {
      /* ignore */
    }
  }
  // No automatic toast — welcome, More, and About own the Install App CTA.
}

function onAppInstalled(): void {
  markPwaInstallDone()
}

/** Reset module state between unit tests (localStorage should be cleared by the test). */
export function resetPwaInstallStateForTests(): void {
  if (listening && typeof window !== 'undefined') {
    window.removeEventListener('beforeinstallprompt', onBeforeInstall)
    window.removeEventListener('appinstalled', onAppInstalled)
  }
  installEvent.value = null
  showInstallToast.value = false
  installedFlag.value = readInstalledFlag()
  listening = false
}

/** Register window listeners once (call from App onMounted, or eagerly below). */
export function startPwaInstallListeners(): void {
  if (typeof window === 'undefined') return
  installedFlag.value = isStandaloneDisplay() || readInstalledFlag()
  if (listening) return
  listening = true
  if (isStandaloneDisplay()) markPwaInstallDone()
  window.addEventListener('beforeinstallprompt', onBeforeInstall)
  window.addEventListener('appinstalled', onAppInstalled)
}

/** Remove listeners (App onUnmounted). */
export function stopPwaInstallListeners(): void {
  if (!listening || typeof window === 'undefined') return
  listening = false
  window.removeEventListener('beforeinstallprompt', onBeforeInstall)
  window.removeEventListener('appinstalled', onAppInstalled)
}

// Capture beforeinstallprompt as early as possible — it often fires before Vue mounts.
if (typeof window !== 'undefined') {
  startPwaInstallListeners()
}

export function shouldOfferInstallToast(): boolean {
  if (isStandaloneDisplay() || installedFlag.value) return false
  if (readInstalledFlag()) return false
  if (readDismissedFlag()) return false
  return true
}

export function markPwaInstallDone(): void {
  installedFlag.value = true
  try {
    localStorage.setItem(PWA_INSTALL_DONE_KEY, '1')
  } catch {
    /* ignore */
  }
  showInstallToast.value = false
  installEvent.value = null
}

export function dismissPwaInstallToast(): void {
  showInstallToast.value = false
  try {
    localStorage.setItem(PWA_INSTALL_DISMISSED_KEY, '1')
  } catch {
    /* ignore */
  }
}

/**
 * Run the browser install prompt when available.
 * @returns `accepted` | `dismissed` | `unavailable` (no deferred event — e.g. iOS / already prompted)
 */
export async function promptPwaInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const ev = installEvent.value
  if (!ev) return 'unavailable'
  await ev.prompt()
  const choice = await ev.userChoice
  if (choice.outcome === 'accepted') {
    markPwaInstallDone()
    return 'accepted'
  }
  showInstallToast.value = false
  installEvent.value = null
  return 'dismissed'
}

/** Manual “how to install” copy when `beforeinstallprompt` is missing. */
export function pwaInstallFallbackMessage(): string {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  if (/iPhone|iPad|iPod/i.test(ua)) {
    return 'On iPhone/iPad: tap Share, then Add to Home Screen.'
  }
  if (/Android/i.test(ua)) {
    return 'Open the browser menu (⋮) and choose Install app or Add to Home screen.'
  }
  return 'Use your browser’s Install app or Add to Home screen option (often in the address bar or menu).'
}

/**
 * Reactive PWA install helpers for Vue components.
 */
export function usePwaInstall() {
  syncInstalledFromEnvironment()

  const canPrompt = computed(() => installEvent.value != null)
  const isInstalled = computed(
    () => installedFlag.value || isStandaloneDisplay() || readInstalledFlag(),
  )
  /**
   * Manual Install App entry (welcome / More / About).
   * Hide only while running as the installed app — do not hide solely because
   * localStorage still has a done flag (uninstall leaves that behind).
   */
  const showInstallEntry = computed(() => !isStandaloneDisplay())

  return {
    installEvent: readonly(installEvent),
    showInstallToast,
    canPrompt,
    isInstalled,
    showInstallEntry,
    promptInstall: promptPwaInstall,
    dismissInstallToast: dismissPwaInstallToast,
    markInstallDone: markPwaInstallDone,
    fallbackMessage: pwaInstallFallbackMessage,
  }
}
