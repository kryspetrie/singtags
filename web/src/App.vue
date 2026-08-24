<script setup lang="ts">
import { onMounted, onUnmounted, ref, shallowRef } from 'vue'
import { RouterLink, RouterView } from 'vue-router'
import { useRegisterSW } from 'virtual:pwa-register/vue'
import { useStarsStore } from './stores/stars'
import { useQueueStore } from './stores/queue'
import { useOfflineLibraryStore } from './stores/offlineLibrary'
import { formatBytes } from './offline/storageEstimate'
import { useReconnectCaches } from './composables/useReconnectCaches'

const stars = useStarsStore()
const queue = useQueueStore()
const offlineLib = useOfflineLibraryStore()
useReconnectCaches()

const { needRefresh, updateServiceWorker } = useRegisterSW({
  immediate: true,
})

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const installEvent = shallowRef<BeforeInstallPromptEvent | null>(null)
const showInstall = ref(false)

function onBeforeInstall(e: Event): void {
  e.preventDefault()
  installEvent.value = e as BeforeInstallPromptEvent
  showInstall.value = true
}

onMounted(() => {
  void stars.ensureLoaded()
  offlineLib.restoreCatalogCached()
  void offlineLib.loadManifests()
  window.addEventListener('beforeinstallprompt', onBeforeInstall)
})

onUnmounted(() => {
  window.removeEventListener('beforeinstallprompt', onBeforeInstall)
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
  await ev.userChoice
  showInstall.value = false
  installEvent.value = null
}

function dismissInstall(): void {
  showInstall.value = false
}

async function downloadSheetsFromPrompt(): Promise<void> {
  await offlineLib.dismissSheetsPrompt()
  await offlineLib.startPack('sheets')
}
</script>

<template>
  <div class="app">
    <a class="skip" href="#main">Skip to content</a>
    <header class="top">
      <RouterLink class="brand" to="/">SingTags</RouterLink>
      <nav class="topnav" aria-label="Primary">
        <RouterLink to="/">Browse</RouterLink>
        <RouterLink to="/starred">Starred<span v-if="stars.count" class="n">{{ stars.count }}</span></RouterLink>
        <RouterLink to="/pitch-pipe">Pitch Pipe</RouterLink>
        <RouterLink to="/queue">Downloads<span v-if="queue.count" class="n">{{ queue.count }}</span></RouterLink>
        <RouterLink to="/settings">Offline</RouterLink>
      </nav>
    </header>
    <main id="main">
      <RouterView />
    </main>
    <nav class="bottom" aria-label="Mobile">
      <RouterLink to="/" class="tab">
        <span class="ico" aria-hidden="true">⌕</span>
        Browse
      </RouterLink>
      <RouterLink to="/starred" class="tab">
        <span class="ico" aria-hidden="true">★</span>
        Starred
        <span v-if="stars.count" class="n tab-n">{{ stars.count }}</span>
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
      v-else-if="offlineLib.showSheetsPrompt && !showInstall"
      class="toast toast-wide"
      role="status"
    >
      <span>
        Make SingTags work offline? Download songbook sheets
        ({{ formatBytes(offlineLib.sheetsTotalBytes) }}). Audio for tags you star.
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
  </div>
</template>

<style scoped>
.skip {
  position: absolute;
  left: -999px;
  top: 0;
  background: var(--accent);
  color: #fff;
  padding: 0.5rem 0.75rem;
  z-index: 100;
}
.skip:focus {
  left: 0.5rem;
  top: calc(0.5rem + env(safe-area-inset-top));
}
.app {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  padding-bottom: calc(var(--bottom-nav-h) + env(safe-area-inset-bottom));
}
.top {
  --header-h: 3.5rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: calc(0.65rem + env(safe-area-inset-top)) 1rem 0.65rem;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
  position: sticky;
  top: 0;
  z-index: 10;
}
.brand {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 1.15rem;
  color: var(--text);
  text-decoration: none;
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
  padding: 1rem 1rem 1.5rem;
  flex: 1;
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
  font-size: 0.72rem;
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
  gap: 0.5rem;
  padding: 0.65rem 0.85rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  white-space: nowrap;
}
.toast-wide {
  flex-wrap: wrap;
  white-space: normal;
  max-width: min(96vw, 36rem);
}
.toast-wide span {
  flex: 1 1 100%;
  font-size: 0.9rem;
  line-height: 1.35;
}
@media (min-width: 768px) {
  .app {
    padding-bottom: 0;
  }
  .topnav {
    display: flex;
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
}
</style>
