<script setup lang="ts">
/**
 * Root shell: primary navigation, offline ribbon, PWA install/update toasts,
 * global snackbar, and routed main content.
 */
import { onMounted, onUnmounted, computed, ref, shallowRef, watch } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { useRegisterSW } from 'virtual:pwa-register/vue'
import { useFavoritesStore } from './stores/favorites'
import { useQueueStore } from './stores/queue'
import { useOfflineLibraryStore } from './stores/offlineLibrary'
import { useOfflineModeStore } from './stores/offlineMode'
import { usePreferencesStore } from './stores/preferences'
import { useSnackbarStore } from './stores/snackbar'
import { formatBytes } from './offline/storageEstimate'
import { goTagBack, tagBackLabel } from './lib/tagReturn'
import {
  useReconnectCaches,
  reconnectMediaPromptVisible,
  reconnectMediaPlan,
  reconnectMediaBusy,
  reconnectMediaPromptMessage,
  reconnectMediaPromptActionLabel,
  acceptReconnectMediaPrompt,
  dismissReconnectMediaPrompt,
} from './composables/useReconnectCaches'
import { useOfflineBanner } from './composables/useOfflineBanner'
import AboutDialog from './components/AboutDialog.vue'
import AppMoreMenu from './components/AppMoreMenu.vue'
import CollectionPickerSheet from './components/CollectionPickerSheet.vue'
import OfflineOpticalTransferPrompt from './components/OfflineOpticalTransferPrompt.vue'

const favorites = useFavoritesStore()
const queue = useQueueStore()
const offlineLib = useOfflineLibraryStore()
const offlineMode = useOfflineModeStore()
const prefs = usePreferencesStore()
const snackbar = useSnackbarStore()
const route = useRoute()
const router = useRouter()
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
  () => favorites.error,
  (msg) => pushStoreError(msg, () => favorites.clearError()),
)

const onTagPage = computed(() => route.name === 'tag')
const backLabel = computed(() => tagBackLabel(route))
const aboutOpen = ref(false)
const moreOpen = ref(false)

const DESKTOP_NAV_MQ = '(min-width: 768px)'
const desktopNav = ref(
  typeof window !== 'undefined' && window.matchMedia(DESKTOP_NAV_MQ).matches,
)
let desktopNavMq: MediaQueryList | null = null

function onDesktopNavMq(ev: MediaQueryListEvent): void {
  desktopNav.value = ev.matches
}

const moreNavActive = computed(
  () =>
    route.name === 'settings' ||
    route.name === 'optical-transfer' ||
    (route.name === 'queue' && !desktopNav.value),
)

function openMore(): void {
  moreOpen.value = true
}

function closeMore(): void {
  moreOpen.value = false
}

/** Return to Browse/Favorites/… (not a previous tag from Prev/Next). */
function goBack(): void {
  goTagBack(router, route)
}

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

const topEl = ref<HTMLElement | null>(null)
let headerResizeObserver: ResizeObserver | null = null

function publishHeaderHeight(): void {
  const el = topEl.value
  if (!el) return
  const h = Math.ceil(el.getBoundingClientRect().height)
  document.documentElement.style.setProperty('--header-h', `${h}px`)
}

onMounted(() => {
  void favorites.ensureLoaded()
  void offlineLib.loadManifests()
  if (isStandaloneDisplay()) markInstallDone()
  window.addEventListener('beforeinstallprompt', onBeforeInstall)
  window.addEventListener('appinstalled', onAppInstalled)
  publishHeaderHeight()
  if (typeof ResizeObserver !== 'undefined' && topEl.value) {
    headerResizeObserver = new ResizeObserver(() => publishHeaderHeight())
    headerResizeObserver.observe(topEl.value)
  }
  if (typeof window.matchMedia === 'function') {
    desktopNavMq = window.matchMedia(DESKTOP_NAV_MQ)
    desktopNav.value = desktopNavMq.matches
    desktopNavMq.addEventListener('change', onDesktopNavMq)
  }
})

onUnmounted(() => {
  window.removeEventListener('beforeinstallprompt', onBeforeInstall)
  window.removeEventListener('appinstalled', onAppInstalled)
  headerResizeObserver?.disconnect()
  headerResizeObserver = null
  desktopNavMq?.removeEventListener('change', onDesktopNavMq)
  desktopNavMq = null
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

/** User hid the pack download progress snack; download keeps running. */
const packProgressSnackHidden = ref(false)

const packDownloadActive = computed(
  () =>
    offlineLib.sheetsStatus === 'running' ||
    offlineLib.audioStatus === 'running' ||
    offlineLib.packSyncBusy,
)

const showPackProgressSnack = computed(
  () => packDownloadActive.value && !packProgressSnackHidden.value,
)

const packProgressSnackPct = computed(() => {
  const sheetsOn = offlineLib.sheetsStatus === 'running'
  const audioOn = offlineLib.audioStatus === 'running'
  const sheetsRatio = offlineLib.sheetsProgress?.ratio ?? 0
  const audioRatio = offlineLib.audioProgress?.ratio ?? 0
  if (sheetsOn && audioOn) return Math.round(((sheetsRatio + audioRatio) / 2) * 100)
  if (sheetsOn) return Math.round(sheetsRatio * 100)
  if (audioOn) return Math.round(audioRatio * 100)
  return 0
})

const packProgressSnackLabel = computed(() => {
  const sheetsOn = offlineLib.sheetsStatus === 'running'
  const audioOn = offlineLib.audioStatus === 'running'
  if (offlineLib.packSyncBusy && !sheetsOn && !audioOn) return 'Syncing offline library…'
  if (sheetsOn && audioOn) {
    return `Downloading offline library… ${packProgressSnackPct.value}%`
  }
  if (sheetsOn) {
    return offlineLib.sheetsProgress?.label || `Downloading sheets… ${packProgressSnackPct.value}%`
  }
  if (audioOn) {
    return offlineLib.audioProgress?.label || `Downloading learning tracks… ${packProgressSnackPct.value}%`
  }
  return 'Downloading…'
})

function dismissPackProgressSnack(): void {
  packProgressSnackHidden.value = true
}

function revealPackProgressSnack(): void {
  packProgressSnackHidden.value = false
}

watch(
  [
    () => offlineLib.sheetsStatus,
    () => offlineLib.audioStatus,
    () => offlineLib.packSyncBusy,
  ],
  ([sheets, audio, busy], prev) => {
    const [prevSheets, prevAudio, prevBusy] = prev ?? [sheets, audio, busy]
    const wasActive = prevSheets === 'running' || prevAudio === 'running' || Boolean(prevBusy)
    const isActive = sheets === 'running' || audio === 'running' || Boolean(busy)
    if (isActive && !wasActive) {
      // New download/sync — show the snack even if the previous run was dismissed.
      packProgressSnackHidden.value = false
      return
    }
    if (!isActive && wasActive) {
      packProgressSnackHidden.value = true
      const finishedOk =
        (prevSheets === 'running' && sheets === 'done') ||
        (prevAudio === 'running' && audio === 'done') ||
        (Boolean(prevBusy) && !busy && (sheets === 'done' || audio === 'done'))
      if (finishedOk) {
        snackbar.show('Offline library updated — browse Settings for details.', {
          tone: 'ok',
          ms: 6_000,
        })
      }
    }
  },
)

async function downloadSheetsFromPrompt(): Promise<void> {
  revealPackProgressSnack()
  await offlineLib.dismissSheetsPrompt()
  await offlineLib.startPack('sheets')
}

async function syncPacksFromPrompt(): Promise<void> {
  if (offlineLib.packSyncBusy) return
  revealPackProgressSnack()
  await offlineLib.syncMissingPacks()
}

async function acceptReconnectPrompt(): Promise<void> {
  if (reconnectMediaBusy.value) return
  revealPackProgressSnack()
  await acceptReconnectMediaPrompt()
}
</script>

<template>
  <div class="app">
    <header ref="topEl" class="top">
      <button
        v-if="onTagPage"
        type="button"
        class="top-back"
        :title="backLabel"
        @click="goBack"
      >{{ backLabel }}</button>
      <div class="brand-cluster">
        <RouterLink class="brand" to="/">
          <span class="brand-lockup">
            <span class="brand-name">SingTags</span>
            <span class="brand-tagline">Barbershop tags… fast.</span>
          </span>
        </RouterLink>
        <button
          type="button"
          class="about-btn"
          aria-label="About SingTags"
          title="About SingTags"
          @click="aboutOpen = true"
        >
          i
        </button>
      </div>
      <div class="top-mid">
        <div
          v-if="offlineMode.manualOffline"
          class="offline-ribbon"
          role="status"
        >
          <span
            class="offline-ribbon-label offline-ribbon-label-static"
            title="Offline mode — using cached content only. Click × to go back online."
          >Offline</span>
          <button
            type="button"
            class="offline-ribbon-label offline-ribbon-go-online"
            title="Offline mode — using cached content only. Click to go back online."
            aria-label="Go online"
            @click="offlineMode.setManualOffline(false)"
          >
            Offline
          </button>
          <button
            type="button"
            class="offline-ribbon-dismiss"
            aria-label="Go online"
            title="Go online"
            @click="offlineMode.setManualOffline(false)"
          >
            ×
          </button>
        </div>
      </div>
      <nav class="topnav" aria-label="Primary">
        <RouterLink class="btn btn-ghost" to="/">Browse</RouterLink>
        <RouterLink class="btn btn-ghost" to="/recent">Recent</RouterLink>
        <RouterLink class="btn btn-ghost" to="/favorites">Favorites</RouterLink>
        <RouterLink class="btn btn-ghost" to="/pitch-pipe">Pitch Pipe</RouterLink>
        <RouterLink class="btn btn-ghost topnav-downloads" to="/queue">
          Downloads
          <span v-if="queue.count" class="n">{{ queue.count }}</span>
        </RouterLink>
        <button
          type="button"
          class="btn btn-ghost more-btn"
          :class="{ on: moreOpen || moreNavActive }"
          aria-haspopup="dialog"
          :aria-expanded="moreOpen"
          aria-label="More"
          title="More"
          @click="openMore"
        >
          <span class="more-icon" aria-hidden="true">☰</span>
        </button>
      </nav>
    </header>
    <div v-if="!offlineMode.manualOffline && offlineBannerMessage" class="offline-banner" role="status">
      <div class="offline-banner-copy">
        <span>{{ offlineBannerMessage }}</span>
        <OfflineOpticalTransferPrompt
          v-if="!offlineLib.catalogCachedAt"
          compact
        />
      </div>
      <RouterLink class="btn btn-ghost" to="/settings">Offline settings</RouterLink>
    </div>
    <AboutDialog :open="aboutOpen" @close="aboutOpen = false" />
    <AppMoreMenu :open="moreOpen" @close="closeMore" />
    <CollectionPickerSheet
      :open="!!favorites.collectionPickerTagIds?.length"
      :tag-ids="favorites.collectionPickerTagIds ?? []"
      title="Add to collection"
      @close="favorites.clearCollectionPicker()"
      @done="favorites.onCollectionPickerDone"
    />
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
      <RouterLink to="/favorites" class="tab">
        <span class="ico" aria-hidden="true">♥</span>
        Favorites
      </RouterLink>
      <RouterLink to="/pitch-pipe" class="tab">
        <span class="ico" aria-hidden="true">♪</span>
        Pitch Pipe
      </RouterLink>
      <button
        type="button"
        class="tab more-tab"
        :class="{ on: moreOpen || moreNavActive }"
        aria-haspopup="dialog"
        :aria-expanded="moreOpen"
        aria-label="More"
        @click="openMore"
      >
        <span class="ico" aria-hidden="true">☰</span>
        More
        <span v-if="queue.count" class="n tab-n">{{ queue.count }}</span>
      </button>
    </nav>
    <div v-if="needRefresh" class="toast" role="status">
      <span>Update available</span>
      <button type="button" class="btn btn-primary" @click="applyUpdate">Reload</button>
      <button type="button" class="btn btn-ghost" @click="dismissUpdate">Later</button>
    </div>
    <div
      v-else-if="reconnectMediaPromptVisible && reconnectMediaPlan && !showInstall && !offlineMode.offline && prefs.browseWelcomeDismissed"
      class="toast toast-wide"
      role="status"
    >
      <span>{{ reconnectMediaPromptMessage(reconnectMediaPlan) }}</span>
      <button
        type="button"
        class="btn btn-primary"
        :disabled="reconnectMediaBusy"
        :aria-busy="reconnectMediaBusy"
        @click="acceptReconnectPrompt"
      >
        {{ reconnectMediaBusy ? 'Downloading…' : reconnectMediaPromptActionLabel }}
      </button>
      <RouterLink class="btn btn-ghost" to="/settings" @click="dismissReconnectMediaPrompt()">
        Offline
      </RouterLink>
      <button type="button" class="btn btn-ghost" @click="dismissReconnectMediaPrompt()">
        Not now
      </button>
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
        (~{{ offlineLib.audioBallparkLabel }}). Favorite tags for original quality.
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
    <div v-else-if="showInstall && prefs.browseWelcomeDismissed" class="toast" role="status">
      <span>Install SingTags</span>
      <button type="button" class="btn btn-primary" @click="installApp">Install</button>
      <button type="button" class="btn btn-ghost" @click="dismissInstall">Not now</button>
    </div>
    <div
      v-if="showPackProgressSnack"
      class="toast toast-wide toast-progress"
      :class="{
        'toast-snack-raised':
          needRefresh ||
          reconnectMediaPromptVisible ||
          offlineLib.showPackSyncPrompt ||
          offlineLib.showSheetsPrompt ||
          showInstall,
      }"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div class="toast-progress-main">
        <span>{{ packProgressSnackLabel }}</span>
        <div
          class="toast-progress-bar"
          role="progressbar"
          :aria-valuenow="packProgressSnackPct"
          aria-valuemin="0"
          aria-valuemax="100"
          :aria-label="packProgressSnackLabel"
        >
          <div class="toast-progress-fill" :style="{ width: `${packProgressSnackPct}%` }" />
        </div>
      </div>
      <RouterLink class="btn btn-ghost" to="/settings">Details</RouterLink>
      <button type="button" class="btn btn-ghost" @click="dismissPackProgressSnack">Dismiss</button>
    </div>
    <Teleport to="body">
      <Transition name="snack-center">
        <div
          v-if="(snackbar.message || snackbar.title) && snackbar.placement === 'center'"
          class="snack-center-root"
        >
          <button
            type="button"
            class="snack-center-backdrop"
            aria-label="Dismiss notification"
            @click="snackbar.dismiss()"
          />
          <div
            class="toast toast-snack toast-center toast-has-title"
            :class="`toast-${snackbar.tone}`"
            :role="snackbar.tone === 'error' ? 'alert' : 'status'"
          >
            <div class="snack-stack">
              <p class="snack-title">{{ snackbar.title }}</p>
              <p v-if="snackbar.message" class="snack-detail">{{ snackbar.message }}</p>
            </div>
            <button
              v-if="snackbar.actionLabel"
              type="button"
              class="btn"
              @click="snackbar.runAction()"
            >
              {{ snackbar.actionLabel }}
            </button>
            <button type="button" class="btn btn-ghost" @click="snackbar.dismiss()">Dismiss</button>
            <div
              v-if="snackbar.autoDismissMs > 0"
              :key="snackbar.showToken"
              class="snack-countdown"
              aria-hidden="true"
            >
              <div
                class="snack-countdown-fill"
                :style="{ animationDuration: `${snackbar.autoDismissMs}ms` }"
              />
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
    <div
      v-if="(snackbar.message || snackbar.title) && snackbar.placement !== 'center'"
      class="toast toast-snack"
      :class="[
        `toast-${snackbar.tone}`,
        {
          'toast-has-title': snackbar.title,
          'toast-snack-raised':
            needRefresh ||
            reconnectMediaPromptVisible ||
            offlineLib.showPackSyncPrompt ||
            offlineLib.showSheetsPrompt ||
            showInstall ||
            showPackProgressSnack,
        },
      ]"
      :role="snackbar.tone === 'error' ? 'alert' : 'status'"
    >
      <div v-if="snackbar.title" class="snack-stack">
        <p class="snack-title">{{ snackbar.title }}</p>
        <p v-if="snackbar.message" class="snack-detail">{{ snackbar.message }}</p>
      </div>
      <span v-else>{{ snackbar.message }}</span>
      <button
        v-if="snackbar.actionLabel"
        type="button"
        class="btn"
        @click="snackbar.runAction()"
      >
        {{ snackbar.actionLabel }}
      </button>
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
  align-items: flex-start;
  justify-content: center;
  gap: 0.45rem 0.75rem;
  padding: 0.55rem 0.75rem;
  font-size: 0.88rem;
  font-weight: 500;
  line-height: 1.35;
  text-align: center;
  background: color-mix(in srgb, var(--danger) 10%, var(--surface));
  color: var(--danger);
  border-bottom: 1px solid color-mix(in srgb, var(--danger) 24%, var(--border));
}
.offline-banner-copy {
  display: grid;
  gap: 0.35rem;
  flex: 1 1 16rem;
  max-width: 42rem;
  text-align: left;
}
.offline-banner .btn {
  min-height: 36px;
  padding: 0.3rem 0.65rem;
  font-size: 0.85rem;
}
.top {
  display: flex;
  flex-wrap: nowrap;
  align-items: stretch;
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
.top-mid {
  flex: 1 1 auto;
  display: flex;
  align-items: stretch;
  justify-content: center;
  align-self: stretch;
  min-width: 0;
  overflow: visible;
  /* Nearly fill the header band (leave a slim edge above/below). */
  margin-top: -0.5rem;
  margin-bottom: -0.5rem;
}
.offline-ribbon {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  flex: 1 1 auto;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  min-height: 100%;
  padding: 0;
  border: none;
  border-radius: 0;
  overflow: visible;
  font-size: 0.88rem;
  font-weight: 700;
  line-height: 1.2;
  letter-spacing: 0.01em;
  color: var(--accent-hover);
  white-space: nowrap;
  /* Soft ribbon: tinted band that dissolves into the topbar on both sides. */
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--surface) 100%, transparent) 0%,
    color-mix(in srgb, var(--accent) 18%, var(--surface)) 18%,
    color-mix(in srgb, var(--accent) 18%, var(--surface)) 82%,
    color-mix(in srgb, var(--surface) 100%, transparent) 100%
  );
}
.offline-ribbon-label {
  grid-column: 2;
  grid-row: 1;
  justify-self: center;
  min-width: 0;
  /* May spill into the side fades when the mid gap is narrow. */
  overflow: visible;
  text-align: center;
}
.offline-ribbon-go-online {
  display: none;
  margin: 0;
  padding: 0.2rem 0.55rem;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: inherit;
  font-weight: inherit;
  letter-spacing: inherit;
  line-height: inherit;
  cursor: pointer;
}
.offline-ribbon-go-online:hover {
  background: color-mix(in srgb, var(--accent) 16%, transparent);
}
.offline-ribbon-go-online:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.offline-ribbon-dismiss {
  grid-column: 3;
  grid-row: 1;
  justify-self: start;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.75rem;
  height: 2.75rem;
  margin: 0 0 0 0.35rem;
  padding: 0;
  border: none;
  border-radius: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 1.35rem;
  line-height: 1;
  cursor: pointer;
}
.offline-ribbon-dismiss:hover {
  background: color-mix(in srgb, var(--accent) 16%, transparent);
}
.offline-ribbon-dismiss:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
/* Cramped desktop header (topnav still visible): one Offline control, no × wrap.
 * Mobile (<768px, bottom nav) keeps Offline + × — mid column has room again. */
@media (min-width: 768px) and (max-width: 1099px) {
  .offline-ribbon {
    grid-template-columns: 1fr;
    justify-items: center;
  }
  .offline-ribbon-label-static,
  .offline-ribbon-dismiss {
    display: none;
  }
  .offline-ribbon-go-online {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    grid-column: 1;
    min-height: 2.5rem;
  }
}
.brand-cluster {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex: 0 0 auto;
  align-self: center;
  min-width: max-content;
}
.top-back {
  display: none;
  flex-shrink: 0;
  align-self: center;
  min-height: 40px;
  padding: 0.25rem 0.55rem;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--text);
  text-decoration: none;
  font: inherit;
  font-size: 0.9rem;
  font-weight: 600;
  align-items: center;
  cursor: pointer;
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
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 0.18rem;
  min-width: 0;
  /* Keep the two-line lockup ≈ about-btn height so the header doesn’t grow. */
  min-height: 1.7rem;
}
.brand-name {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 1.4rem;
  line-height: 1;
  flex-shrink: 0;
}
.brand-tagline {
  display: block;
  font-family: var(--font);
  font-size: 0.62rem;
  font-weight: 500;
  color: var(--muted);
  line-height: 1.1;
  letter-spacing: 0.01em;
  white-space: nowrap;
}
.about-btn {
  flex-shrink: 0;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.7rem;
  height: 1.7rem;
  min-width: 1.7rem;
  min-height: 1.7rem;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: transparent;
  color: var(--muted);
  font-family: Georgia, 'Times New Roman', serif;
  font-style: italic;
  font-size: 0.92rem;
  line-height: 1;
  cursor: pointer;
}
.about-btn:hover {
  color: var(--text);
  border-color: color-mix(in srgb, var(--text) 22%, var(--border));
  background: color-mix(in srgb, var(--border) 28%, transparent);
}
.about-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.topnav {
  display: none;
  flex: 0 0 auto;
  align-self: center;
  gap: 0.4rem;
  flex-wrap: wrap;
  align-items: center;
}
.topnav .btn {
  min-height: 40px;
  padding: 0.35rem 0.7rem;
  font-size: 0.9rem;
  font-weight: 600;
}
.topnav .btn.router-link-active {
  border-color: var(--accent);
  color: var(--accent-hover);
  background: color-mix(in srgb, var(--accent) 12%, var(--surface));
}
.more-btn.on,
.more-tab.on {
  color: var(--accent);
}
.more-btn {
  padding: 0.35rem 0.55rem;
}
.more-icon {
  display: block;
  font-size: 1.15rem;
  line-height: 1;
}
.more-tab {
  border: 0;
  background: transparent;
  font: inherit;
  cursor: pointer;
  padding: 0;
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
  grid-template-columns: repeat(5, 1fr);
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
.snack-stack {
  display: grid;
  gap: 0.25rem;
  flex: 1 1 auto;
  min-width: 0;
  text-align: left;
}
.snack-title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 700;
  line-height: 1.25;
  color: var(--text);
}
.snack-detail {
  margin: 0;
  font-size: 0.88rem;
  font-weight: 500;
  line-height: 1.35;
  color: var(--muted);
}
.toast-progress {
  z-index: 45;
  align-items: flex-end;
}
.toast-progress.toast-wide > .toast-progress-main > span {
  flex: none;
  font-size: 0.9rem;
  line-height: 1.35;
}
.toast-progress-main {
  flex: 1 1 12rem;
  min-width: 0;
  display: grid;
  gap: 0.4rem;
}
.toast-progress-bar {
  height: 0.4rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--border) 80%, var(--surface));
  overflow: hidden;
}
.toast-progress-fill {
  height: 100%;
  border-radius: inherit;
  background: var(--accent);
  transition: width 0.2s ease;
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
.snack-center-root {
  position: fixed;
  z-index: 100;
  pointer-events: none;
}
.snack-center-backdrop {
  position: absolute;
  inset: 0;
  border: 0;
  margin: 0;
  padding: 0;
  background: rgba(0, 0, 0, 0.45);
  cursor: pointer;
  pointer-events: auto;
}
.snack-center-root .toast-snack.toast-center {
  position: relative;
  z-index: 1;
  left: auto;
  right: auto;
  top: auto;
  bottom: auto;
  transform: none;
  pointer-events: auto;
  overflow: hidden;
}
.snack-center-enter-active {
  transition: opacity 0.26s ease;
}
.snack-center-leave-active {
  transition: opacity 0.2s ease;
}
.snack-center-enter-from,
.snack-center-leave-to {
  opacity: 0;
}
.snack-countdown {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 0.28rem;
  background: color-mix(in srgb, var(--border) 70%, transparent);
}
.snack-countdown-fill {
  height: 100%;
  width: 100%;
  background: var(--accent);
  transform: scaleX(0);
  transform-origin: left center;
  animation: snack-countdown-fill linear forwards;
}
@keyframes snack-countdown-fill {
  from {
    transform: scaleX(0);
  }
  to {
    transform: scaleX(1);
  }
}
@media (max-width: 767px) {
  .snack-center-root {
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    padding-bottom: calc(1rem + var(--bottom-nav-h, 3.75rem) + env(safe-area-inset-bottom));
  }
  .snack-center-root .toast-snack.toast-center {
    width: min(82vw, 20rem);
    max-width: 100%;
    flex-shrink: 0;
    aspect-ratio: 1;
    max-height: min(82vw, 20rem);
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1.25rem;
    padding: 1.75rem 1.5rem 1.5rem;
    border-radius: 10px;
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.22);
    text-align: center;
  }
  .snack-center-enter-active .toast-snack.toast-center,
  .snack-center-leave-active .toast-snack.toast-center {
    transition:
      opacity 0.26s ease,
      transform 0.26s cubic-bezier(0.22, 1, 0.36, 1);
  }
  .snack-center-leave-active .toast-snack.toast-center {
    transition-duration: 0.2s;
  }
  .snack-center-enter-from .toast-snack.toast-center,
  .snack-center-leave-to .toast-snack.toast-center {
    opacity: 0;
    transform: scale(0.94);
  }
  .snack-center-enter-to .toast-snack.toast-center {
    opacity: 1;
    transform: none;
  }
  .snack-center-root .snack-stack {
    display: grid;
    flex: 1 1 auto;
    align-content: center;
    justify-items: center;
    text-align: center;
    gap: 0.5rem;
    width: 100%;
  }
  .snack-center-root .snack-title {
    font-size: 1.5rem;
  }
  .snack-center-root .snack-detail {
    font-size: 1.05rem;
    line-height: 1.45;
    max-width: 14rem;
  }
  .snack-center-root .btn-ghost {
    align-self: center;
    min-width: 7.5rem;
    padding: 0.55rem 1.25rem;
    font-size: 1rem;
  }
}
@media (min-width: 768px) {
  .snack-center-root {
    inset: auto;
    top: auto;
    right: auto;
    left: 50%;
    bottom: 1.25rem;
    transform: translateX(-50%);
    z-index: 50;
    display: block;
    width: max-content;
    max-width: min(96vw, 36rem);
    padding: 0;
  }
  .snack-center-backdrop {
    display: none;
  }
  .snack-center-root .toast-snack.toast-center {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    width: max-content;
    max-width: min(96vw, 36rem);
    aspect-ratio: auto;
    max-height: none;
    flex-direction: row;
    gap: 0.5rem;
    padding: 0.65rem 0.85rem calc(0.65rem + 0.28rem);
    border-radius: 12px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
    text-align: left;
  }
  .snack-center-root .snack-stack {
    display: grid;
    flex: 1 1 auto;
    min-width: 0;
    text-align: left;
    gap: 0.25rem;
  }
  .snack-center-root .snack-title {
    font-size: 1.05rem;
  }
  .snack-center-root .snack-detail {
    font-size: 0.88rem;
    max-width: none;
  }
  .snack-center-root .btn-ghost {
    align-self: center;
    min-width: 0;
    padding: 0.35rem 0.65rem;
    font-size: 0.9rem;
    flex-shrink: 0;
  }
  .snack-center-enter-active .toast-snack.toast-center,
  .snack-center-leave-active .toast-snack.toast-center {
    transition: opacity 0.2s ease;
  }
  .snack-center-enter-from .toast-snack.toast-center,
  .snack-center-leave-to .toast-snack.toast-center {
    opacity: 0;
    transform: none;
  }
  .snack-center-enter-to .toast-snack.toast-center {
    opacity: 1;
    transform: none;
  }
}
@media (prefers-reduced-motion: reduce) {
  .snack-center-enter-active,
  .snack-center-leave-active,
  .snack-center-enter-active .toast-snack.toast-center,
  .snack-center-leave-active .toast-snack.toast-center {
    transition-duration: 0.01ms;
  }
  .snack-center-enter-from .toast-snack.toast-center,
  .snack-center-leave-to .toast-snack.toast-center {
    transform: none;
  }
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
  .top {
    gap: 0.4rem;
  }
  /* Back | Offline | SingTags — one row; brand stays right whether Back is present. */
  .top-back {
    display: inline-flex;
    order: 1;
    max-width: 42vw;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .top-mid {
    order: 2;
    flex: 1 1 auto;
    min-width: 0;
  }
  .brand-cluster {
    order: 3;
    margin-left: auto;
  }
  .brand-lockup {
    align-items: flex-end;
    text-align: right;
  }
  .topnav {
    display: none;
  }
  .offline-ribbon {
    grid-template-columns: auto auto;
    justify-content: center;
    justify-items: center;
    column-gap: 0.1rem;
  }
  .offline-ribbon-label {
    grid-column: 1;
  }
  .offline-ribbon-dismiss {
    grid-column: 2;
    width: 2.25rem;
    height: 2.25rem;
    margin: 0;
  }
}
</style>
