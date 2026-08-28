<script setup lang="ts">
import { onMounted, onUnmounted, computed, ref, shallowRef, watch } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'
import { useRegisterSW } from 'virtual:pwa-register/vue'
import { useStarsStore } from './stores/stars'
import { useQueueStore } from './stores/queue'
import { useOfflineLibraryStore } from './stores/offlineLibrary'
import { useOfflineModeStore } from './stores/offlineMode'
import { usePreferencesStore } from './stores/preferences'
import { useSnackbarStore } from './stores/snackbar'
import { formatBytes } from './offline/storageEstimate'
import { useReconnectCaches } from './composables/useReconnectCaches'
import { useOfflineBanner } from './composables/useOfflineBanner'

const stars = useStarsStore()
const queue = useQueueStore()
const offlineLib = useOfflineLibraryStore()
const offlineMode = useOfflineModeStore()
const prefs = usePreferencesStore()
const snackbar = useSnackbarStore()
const route = useRoute()
useReconnectCaches()
const { message: offlineBannerMessage } = useOfflineBanner()

function pushStoreError(msg: string | null, clear: () => void): void {
  if (!msg) return
  snackbar.show(msg, { tone: 'error', onDismiss: clear })
}

watch(
  () => offlineLib.error,
  (msg) => pushStoreError(msg, () => offlineLib.clearError()),
)
watch(
  () => queue.error,
  (msg) => pushStoreError(msg, () => queue.clearError()),
)
watch(
  () => stars.error,
  (msg) => pushStoreError(msg, () => stars.clearError()),
)

const onTagPage = computed(() => route.name === 'tag')
const backTarget = computed(() => (route.query.set === 'practice' ? '/starred' : '/'))
const backLabel = computed(() => (route.query.set === 'practice' ? '← Practice set' : '← Back'))

const { needRefresh, updateServiceWorker } = useRegisterSW({
  immediate: true,
})

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const INSTALL_DISMISSED_KEY = 'singtags.installPrompt.dismissed'
const INSTALL_DONE_KEY = 'singtags.pwaInstalled'

const installEvent = shallowRef<BeforeInstallPromptEvent | null>(null)
const showInstall = ref(false)

function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return false
  if (window.matchMedia('(display-mode: standalone)').matches) return true
  if (window.matchMedia('(display-mode: fullscreen)').matches) return true
  if (window.matchMedia('(display-mode: minimal-ui)').matches) return true
  const nav = window.navigator as Navigator & { standalone?: boolean }
  return nav.standalone === true
}

function shouldOfferInstall(): boolean {
  if (isStandaloneDisplay()) return false
  try {
    if (localStorage.getItem(INSTALL_DONE_KEY) === '1') return false
    if (localStorage.getItem(INSTALL_DISMISSED_KEY) === '1') return false
  } catch {
    /* ignore */
  }
  return true
}

function markInstallDone(): void {
  try {
    localStorage.setItem(INSTALL_DONE_KEY, '1')
  } catch {
    /* ignore */
  }
  showInstall.value = false
  installEvent.value = null
}

function onBeforeInstall(e: Event): void {
  e.preventDefault()
  installEvent.value = e as BeforeInstallPromptEvent
  if (shouldOfferInstall()) showInstall.value = true
}

function onAppInstalled(): void {
  markInstallDone()
}

onMounted(() => {
  void stars.ensureLoaded()
  void offlineLib.loadManifests()
  if (isStandaloneDisplay()) markInstallDone()
  window.addEventListener('beforeinstallprompt', onBeforeInstall)
  window.addEventListener('appinstalled', onAppInstalled)
})

onUnmounted(() => {
  window.removeEventListener('beforeinstallprompt', onBeforeInstall)
  window.removeEventListener('appinstalled', onAppInstalled)
})

function dismissUpdate(): void {
  needRefresh.value = false
}

async function applyUpdate(): Promise<void> {
  await updateServiceWorker(true)
}

async function installApp(): Promise<void> {
  const ev = installEvent.value
  if (!ev) return
  await ev.prompt()
  const choice = await ev.userChoice
  if (choice.outcome === 'accepted') {
    markInstallDone()
    return
  }
  showInstall.value = false
  installEvent.value = null
}

function dismissInstall(): void {
  try {
    localStorage.setItem(INSTALL_DISMISSED_KEY, '1')
  } catch {
    /* ignore */
  }
  showInstall.value = false
}

async function downloadSheetsFromPrompt(): Promise<void> {
  await offlineLib.dismissSheetsPrompt()
  await offlineLib.startPack('sheets')
}

async function syncPacksFromPrompt(): Promise<void> {
  if (offlineLib.packSyncBusy) return
  await offlineLib.syncMissingPacks()
}
</script>

<template>
  <div class="app">
    <header class="top">
      <div class="top-start">
        <RouterLink v-if="onTagPage" class="top-back" :to="backTarget">{{ backLabel }}</RouterLink>
        <RouterLink class="brand" to="/">
          <span class="brand-lockup">
            <span class="brand-name">SingTags</span>
            <span class="brand-tagline">Barbershop tags… fast.</span>
          </span>
        </RouterLink>
      </div>
      <nav class="topnav" aria-label="Primary">
        <RouterLink to="/">Browse</RouterLink>
        <RouterLink to="/recent">Recent</RouterLink>
        <RouterLink to="/starred">Starred</RouterLink>
        <RouterLink to="/pitch-pipe">Pitch Pipe</RouterLink>
        <RouterLink to="/queue">Downloads<span v-if="queue.count" class="n">{{ queue.count }}</span></RouterLink>
        <RouterLink to="/settings">Offline</RouterLink>
      </nav>
    </header>
    <div
      v-if="offlineMode.manualOffline"
      class="offline-banner offline-banner-manual"
      role="status"
    >
      <span>Offline mode — using cached content only.</span>
      <button
        type="button"
        class="offline-banner-link"
        @click="offlineMode.setManualOffline(false)"
      >
        Go online
      </button>
    </div>
    <div v-else-if="offlineBannerMessage" class="offline-banner" role="status">
      <span>{{ offlineBannerMessage }}</span>
      <RouterLink class="offline-banner-link" to="/settings">Offline settings</RouterLink>
    </div>
    <main id="main">
      <RouterView />
    </main>
    <nav class="bottom" aria-label="Mobile">
      <RouterLink to="/" class="tab">
        <span class="ico" aria-hidden="true">⌕</span>
        Browse
      </RouterLink>
      <RouterLink to="/recent" class="tab">
        <span class="ico" aria-hidden="true">◷</span>
        Recent
      </RouterLink>
      <RouterLink to="/starred" class="tab">
        <span class="ico" aria-hidden="true">★</span>
        Starred
      </RouterLink>
      <RouterLink to="/pitch-pipe" class="tab">
        <span class="ico" aria-hidden="true">♪</span>
        Pitch Pipe
      </RouterLink>
      <RouterLink to="/settings" class="tab">
        <span class="ico" aria-hidden="true">⇩</span>
        Offline
      </RouterLink>
      <RouterLink to="/queue" class="tab">
        <span class="ico" aria-hidden="true">▤</span>
        Queue
        <span v-if="queue.count" class="n tab-n">{{ queue.count }}</span>
      </RouterLink>
    </nav>
    <div v-if="needRefresh" class="toast" role="status">
      <span>Update available</span>
      <button type="button" class="btn btn-primary" @click="applyUpdate">Reload</button>
      <button type="button" class="btn btn-ghost" @click="dismissUpdate">Later</button>
    </div>
    <div
      v-else-if="offlineLib.showPackSyncPrompt && !showInstall && !offlineMode.offline && prefs.browseWelcomeDismissed"
      class="toast toast-wide"
      role="status"
    >
      <span>
        New tags are available. Sync missing offline files? Already-cached sheets and tracks stay on
        this device — only what’s missing is downloaded.
      </span>
      <button
        type="button"
        class="btn btn-primary"
        :disabled="offlineLib.packSyncBusy || offlineLib.sheetsStatus === 'running' || offlineLib.audioStatus === 'running'"
        :aria-busy="offlineLib.packSyncBusy"
        @click="syncPacksFromPrompt"
      >
        {{ offlineLib.packSyncBusy ? 'Syncing…' : 'Sync' }}
      </button>
      <RouterLink class="btn btn-ghost" to="/settings" @click="offlineLib.dismissPackSyncPrompt()">
        Settings
      </RouterLink>
      <button type="button" class="btn btn-ghost" @click="offlineLib.dismissPackSyncPrompt()">
        Not now
      </button>
    </div>
    <div
      v-else-if="offlineLib.showSheetsPrompt && !showInstall && !offlineMode.offline && prefs.browseWelcomeDismissed"
      class="toast toast-wide"
      role="status"
    >
      <span>
        Make SingTags work offline? Download songbook sheets
        ({{ formatBytes(offlineLib.sheetsTotalBytes) }}) and optional lo-fi learning tracks
        (~{{ offlineLib.audioBallparkLabel }}). Star tags for original quality.
      </span>
      <button type="button" class="btn btn-primary" @click="downloadSheetsFromPrompt">
        Download sheets
      </button>
      <RouterLink class="btn btn-ghost" to="/settings" @click="offlineLib.dismissSheetsPrompt()">
        Settings
      </RouterLink>
      <button type="button" class="btn btn-ghost" @click="offlineLib.dismissSheetsPrompt()">
        Not now
      </button>
    </div>
    <div v-else-if="showInstall" class="toast" role="status">
      <span>Install SingTags</span>
      <button type="button" class="btn btn-primary" @click="installApp">Install</button>
      <button type="button" class="btn btn-ghost" @click="dismissInstall">Not now</button>
    </div>
    <div
      v-if="snackbar.message"
      class="toast toast-snack"
      :class="[
        `toast-${snackbar.tone}`,
        {
          'toast-snack-raised':
            needRefresh ||
            offlineLib.showPackSyncPrompt ||
            offlineLib.showSheetsPrompt ||
            showInstall,
        },
      ]"
      role="alert"
    >
      <span>{{ snackbar.message }}</span>
      <button type="button" class="btn btn-ghost" @click="snackbar.dismiss()">Dismiss</button>
    </div>
  </div>
</template>

<style scoped>
.app {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  padding-bottom: calc(var(--bottom-nav-h) + env(safe-area-inset-bottom));
  min-width: 0;
  max-width: 100%;
  overflow-x: clip;
}
.offline-banner {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 0.35rem 0.75rem;
  padding: 0.45rem 0.75rem;
  font-size: 0.88rem;
  font-weight: 500;
  line-height: 1.35;
  text-align: center;
  background: color-mix(in srgb, var(--danger) 10%, var(--surface));
  color: var(--danger);
  border-bottom: 1px solid color-mix(in srgb, var(--danger) 24%, var(--border));
}
.offline-banner-link {
  color: var(--accent);
  font-weight: 600;
  text-decoration: none;
  white-space: nowrap;
}
.offline-banner-link:hover {
  color: var(--accent-hover);
  text-decoration: underline;
}
.offline-banner-manual {
  background: color-mix(in srgb, var(--accent) 14%, var(--surface));
  color: var(--accent-hover);
  border-bottom-color: color-mix(in srgb, var(--accent) 35%, var(--border));
}
.offline-banner-manual .offline-banner-link {
  background: none;
  border: none;
  cursor: pointer;
  font: inherit;
  padding: 0;
}
.top {
  --header-h: 3.5rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: calc(0.65rem + env(safe-area-inset-top)) 0.75rem 0.65rem;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
  position: sticky;
  top: 0;
  z-index: 10;
  min-width: 0;
}
.top-start {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  min-width: 0;
}
.top-back {
  display: none;
  flex-shrink: 0;
  min-height: 40px;
  padding: 0.25rem 0.55rem;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--text);
  text-decoration: none;
  font-size: 0.9rem;
  font-weight: 600;
  align-items: center;
}
.top-back:hover {
  color: var(--accent-hover);
  text-decoration: none;
}
.brand {
  display: flex;
  align-items: center;
  min-width: 0;
  text-decoration: none;
  color: var(--text);
}
.brand:hover {
  text-decoration: none;
  color: var(--text);
}
.brand-lockup {
  display: flex;
  align-items: baseline;
  gap: 0.45rem;
  min-width: 0;
  overflow: hidden;
}
.brand-name {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 1.15rem;
  line-height: 1.15;
}
.brand-tagline {
  display: none;
  font-family: var(--font);
  font-size: 0.78rem;
  font-weight: 500;
  color: var(--muted);
  line-height: 1.2;
  letter-spacing: 0.01em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
@media (min-width: 560px) {
  .brand-tagline {
    display: inline;
  }
}
@media (max-width: 767px) {
  .top-back ~ .brand .brand-tagline {
    display: none;
  }
}
.topnav {
  display: none;
  gap: 0.85rem;
  flex-wrap: wrap;
  align-items: center;
}
.topnav a {
  color: var(--muted);
  text-decoration: none;
  font-size: 0.95rem;
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}
.topnav a.router-link-active {
  color: var(--accent);
  font-weight: 600;
}
.n {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.25rem;
  height: 1.25rem;
  padding: 0 0.3rem;
  border-radius: 999px;
  background: var(--accent);
  color: #fff;
  font-size: 0.7rem;
  font-weight: 700;
}
main {
  width: min(960px, 100%);
  margin: 0 auto;
  padding: 0.85rem 0.75rem 1.25rem;
  flex: 1;
  min-width: 0;
  max-width: 100%;
}
.bottom {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 20;
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 0;
  padding: 0.25rem 0.35rem calc(0.25rem + env(safe-area-inset-bottom));
  background: color-mix(in srgb, var(--surface) 94%, transparent);
  border-top: 1px solid var(--border);
  backdrop-filter: blur(10px);
}
.tab {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.1rem;
  min-height: 52px;
  color: var(--muted);
  text-decoration: none;
  font-size: 0.68rem;
  font-weight: 600;
}
.tab .ico {
  font-size: 1.15rem;
  line-height: 1;
}
.tab.router-link-active {
  color: var(--accent);
}
.tab-n {
  position: absolute;
  top: 0.15rem;
  right: calc(50% - 1.6rem);
  min-width: 1.1rem;
  height: 1.1rem;
  font-size: 0.65rem;
}
.toast {
  position: fixed;
  left: 50%;
  bottom: calc(var(--bottom-nav-h) + env(safe-area-inset-bottom) + 0.75rem);
  transform: translateX(-50%);
  z-index: 40;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
  padding: 0.65rem 0.85rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  max-width: min(96vw, 36rem);
  width: max-content;
}
.toast > span {
  flex: 1 1 auto;
  min-width: 0;
  overflow-wrap: anywhere;
}
.toast-wide {
  width: min(96vw, 36rem);
}
.toast-wide span {
  flex: 1 1 100%;
  font-size: 0.9rem;
  line-height: 1.35;
}
.toast-snack {
  z-index: 50;
  width: min(96vw, 36rem);
}
.toast-snack-raised {
  bottom: calc(var(--bottom-nav-h) + env(safe-area-inset-bottom) + 5.5rem);
}
.toast-error {
  border-color: color-mix(in srgb, var(--danger) 45%, var(--border));
  background: color-mix(in srgb, var(--danger) 10%, var(--surface));
  color: var(--text);
}
.toast-ok {
  border-color: color-mix(in srgb, var(--accent) 40%, var(--border));
  background: color-mix(in srgb, var(--accent) 10%, var(--surface));
}
.toast-info {
  /* default toast surface */
}
@media (min-width: 768px) {
  .app {
    padding-bottom: 0;
  }
  .topnav {
    display: flex;
  }
  .top-back {
    display: none !important;
  }
  .bottom {
    display: none;
  }
  main {
    padding: 1.25rem;
  }
  .toast {
    bottom: 1.25rem;
  }
  .toast-snack-raised {
    bottom: 5.75rem;
  }
}
@media (max-width: 767px) {
  .top-back {
    display: inline-flex;
  }
}
</style>
