<script setup lang="ts">
/**
 * Secondary app menu: settings, downloads, sing mode toggle.
 * Destination links not pinned to the primary chrome appear here.
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import FilterSheet from './FilterSheet.vue'
import PwaInstallHowToDialog from './PwaInstallHowToDialog.vue'
import { usePwaInstall } from '../composables/usePwaInstall'
import {
  openGoogleLogin,
  openGoogleLogoutConfirm,
} from '../lib/google/accountUi'
import {
  googleAuthState,
  isGoogleConfigured,
  restoreGoogleConnection,
} from '../lib/google/googleAuth'
import {
  PRIMARY_NAV_ITEMS,
  morePrimaryNavIds,
  resolvePrimaryNavPinCount,
  type PrimaryNavGates,
} from '../lib/primaryNav'
import { primaryNavFitCapacity } from '../lib/primaryNavFit'
import { useOfflineModeStore } from '../stores/offlineMode'
import { usePreferencesStore } from '../stores/preferences'
import { useQueueStore } from '../stores/queue'
import { useSnackbarStore } from '../stores/snackbar'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const prefs = usePreferencesStore()
const offlineMode = useOfflineModeStore()
const queue = useQueueStore()
const snackbar = useSnackbarStore()
const { showInstallEntry, canPrompt, promptInstall } = usePwaInstall()
const howToOpen = ref(false)
const googleConfigured = isGoogleConfigured()
const isDesktop = ref(false)
const dockStyle = ref<Record<string, string> | null>(null)

const DESKTOP_MQ = '(min-width: 768px)'

function syncDesktop(): void {
  isDesktop.value = window.matchMedia(DESKTOP_MQ).matches
}

function updateDockPosition(): void {
  if (!isDesktop.value) {
    dockStyle.value = null
    return
  }
  const btn = document.querySelector(
    'header .topnav .more-btn',
  ) as HTMLElement | null
  if (!btn) {
    dockStyle.value = {
      '--dock-top': 'calc(var(--header-h, 3.5rem) + 0.35rem)',
      '--dock-right': '0.75rem',
    }
    return
  }
  const r = btn.getBoundingClientRect()
  const gap = 6
  dockStyle.value = {
    '--dock-top': `${Math.round(r.bottom + gap)}px`,
    '--dock-right': `${Math.max(8, Math.round(window.innerWidth - r.right))}px`,
  }
}

let desktopMq: MediaQueryList | null = null

onMounted(() => {
  syncDesktop()
  desktopMq = window.matchMedia(DESKTOP_MQ)
  desktopMq.addEventListener('change', syncDesktop)
})

onUnmounted(() => {
  desktopMq?.removeEventListener('change', syncDesktop)
  desktopMq = null
})

watch(
  () => props.open,
  (open) => {
    if (open) {
      restoreGoogleConnection()
      syncDesktop()
      updateDockPosition()
    }
  },
)

const accountMenuLabel = computed(() =>
  googleAuthState.connected ? 'Log out' : 'Log in with Google',
)

const accountMenuDesc = computed(() => {
  if (!googleConfigured) return 'Google sync is not configured in this build'
  if (googleAuthState.connected) {
    return googleAuthState.email
      ? `Signed in as ${googleAuthState.email}`
      : 'Disconnect Google Drive sync'
  }
  return 'Sync favorites & settings via your Drive'
})

const primaryNavGates = computed(
  (): PrimaryNavGates => ({
    localLibraryEnabled: prefs.localLibraryEnabled,
    singTogetherEnabled: prefs.singTogetherEnabled,
    tagStudioEnabled: prefs.tagRollEnabled,
    webrtcTransferEnabled: prefs.webrtcTransferEnabled,
  }),
)

const moreNavItems = computed(() => {
  const pinCount = resolvePrimaryNavPinCount(
    prefs.preferredPrimaryNavPinCount,
    primaryNavFitCapacity.value,
  )
  return morePrimaryNavIds(
    prefs.primaryNavOrder,
    primaryNavGates.value,
    prefs.primaryNavHidden,
    pinCount,
  ).map((id) => PRIMARY_NAV_ITEMS[id])
})

function close(): void {
  emit('close')
}

function onNavClick(): void {
  close()
}

async function onInstallApp(): Promise<void> {
  const outcome = await promptInstall()
  if (outcome === 'unavailable') {
    howToOpen.value = true
    close()
    return
  }
  close()
}

function toggleSingMode(): void {
  const next = !prefs.singMode
  prefs.setSingMode(next)
  close()
  snackbar.show(
    next ? 'Tags open in the fullscreen sheet' : 'Tags open on the tag page',
    {
      title: next ? 'Sing Mode On' : 'Sing Mode Off',
      tone: 'ok',
      ms: 3000,
      placement: 'center',
    },
  )
}

function toggleOfflineMode(): void {
  const next = !offlineMode.manualOffline
  offlineMode.setManualOffline(next)
  close()
  if (next) {
    snackbar.show('Using cached content only', {
      title: 'Offline Mode On',
      tone: 'ok',
      ms: 3000,
      placement: 'center',
    })
    return
  }
  snackbar.show(
    offlineMode.offline ? 'Still no network connection' : 'Back to live catalog and downloads',
    {
      title: 'Offline Mode Off',
      tone: 'ok',
      ms: 3000,
      placement: 'center',
    },
  )
}

function onAccountClick(): void {
  if (!googleConfigured) {
    snackbar.show('Google sync is not configured in this build', {
      title: 'Unavailable',
      tone: 'error',
      ms: 3500,
      placement: 'center',
    })
    close()
    return
  }
  // Dialogs live in AppAccountControl; close More so they aren’t buried.
  close()
  if (googleAuthState.connected) {
    openGoogleLogoutConfirm()
    return
  }
  openGoogleLogin()
}
</script>

<template>
  <FilterSheet
    :open="open"
    title="More"
    elevated
    hide-title
    :hide-header="isDesktop"
    fit-content
    :docked="isDesktop"
    :dock-style="dockStyle"
    @close="close"
  >
    <nav class="menu" aria-label="More">
      <label
        class="setting-row setting-sing"
        :class="{ on: prefs.singMode }"
        title="When on, Browse / Recent / Favorites open tags into sheet fullscreen"
      >
        <span class="setting-copy">
          <span class="setting-title">Sing mode</span>
          <span class="setting-desc">
            {{ prefs.singMode ? 'Tags with sheets open fullscreen' : 'Tags open on the tag page' }}
          </span>
        </span>
        <input
          type="checkbox"
          class="setting-switch"
          role="switch"
          :checked="prefs.singMode"
          :aria-checked="prefs.singMode"
          aria-label="Sing mode"
          @change="toggleSingMode"
        />
      </label>

      <label
        class="setting-row setting-offline"
        :class="{ on: offlineMode.manualOffline }"
        title="Use cached content only — pauses downloads and live catalog fetches"
      >
        <span class="setting-copy">
          <span class="setting-title">Offline mode</span>
          <span class="setting-desc">
            <template v-if="offlineMode.manualOffline">Using cached content only</template>
            <template v-else-if="offlineMode.browserOffline">No network — tap to force offline</template>
            <template v-else>Live catalog and downloads</template>
          </span>
        </span>
        <input
          type="checkbox"
          class="setting-switch"
          role="switch"
          :checked="offlineMode.manualOffline"
          :aria-checked="offlineMode.manualOffline"
          aria-label="Offline mode"
          @change="toggleOfflineMode"
        />
      </label>

      <RouterLink
        v-for="item in moreNavItems"
        :key="item.id"
        class="menu-item"
        :class="{ 'menu-item-downloads': item.id === 'queue' }"
        :to="item.path"
        @click="onNavClick"
      >
        <span class="menu-row">
          <span class="menu-label">{{ item.label }}</span>
          <span
            v-if="item.id === 'queue' && queue.count"
            class="badge"
            :aria-label="`${queue.count} in queue`"
            >{{ queue.count }}</span
          >
        </span>
        <span class="menu-desc">{{ item.desc }}</span>
      </RouterLink>

      <!-- Mobile only — desktop uses the top-right account control. -->
      <button
        v-if="!isDesktop"
        type="button"
        class="menu-item menu-item-account"
        :class="{ connected: googleAuthState.connected }"
        @click="onAccountClick"
      >
        <span class="menu-row">
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
          <span class="menu-label">{{ accountMenuLabel }}</span>
        </span>
        <span class="menu-desc">{{ accountMenuDesc }}</span>
      </button>

      <button
        v-if="showInstallEntry"
        type="button"
        class="menu-item menu-item-install"
        @click="onInstallApp"
      >
        <span class="menu-label">Install App</span>
        <span class="menu-desc">{{
          canPrompt
            ? 'Tap to install SingTags on this device'
            : 'Add SingTags from your browser menu'
        }}</span>
      </button>
    </nav>
  </FilterSheet>
  <PwaInstallHowToDialog :open="howToOpen" @close="howToOpen = false" />
</template>

<style scoped>
.menu {
  display: grid;
  gap: 0.45rem;
}
/* Mobile: links first, toggles at bottom, Install App last. */
.menu-item {
  order: 1;
  display: grid;
  gap: 0.15rem;
  padding: 0.65rem 0.75rem;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: inherit;
  text-decoration: none;
  cursor: pointer;
  font: inherit;
  text-align: left;
  width: 100%;
  box-sizing: border-box;
}
.menu-item-account {
  order: 4;
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
  background: color-mix(in srgb, var(--accent) 8%, var(--surface));
}
.menu-item-account .account-icon {
  display: inline-flex;
  color: var(--accent-hover);
  flex: 0 0 auto;
}
.menu-item-account .menu-label {
  color: var(--accent-hover);
  font-weight: 700;
}
.menu-item-account.connected {
  border-color: var(--border);
  background: var(--surface);
}
.menu-item-account.connected .menu-label {
  color: var(--accent-hover);
  font-weight: 650;
}
.menu-item-account.connected .account-icon {
  color: var(--accent);
}
.menu-item-install {
  order: 5;
  margin-top: 0.15rem;
  border-color: var(--accent-hover);
  background: var(--accent);
  color: var(--on-accent);
  box-shadow: 0 2px 0 color-mix(in srgb, var(--accent-hover) 50%, transparent);
}
.menu-item-install .menu-label {
  color: var(--on-accent);
  font-weight: 800;
  font-size: 1rem;
}
.menu-item-install .menu-desc {
  color: color-mix(in srgb, var(--on-accent) 88%, var(--accent));
}
.menu-item-install:hover {
  border-color: var(--accent-hover);
  background: var(--accent-hover);
}
.setting-sing {
  order: 2;
}
.setting-offline {
  order: 3;
}
.menu-item:hover {
  border-color: color-mix(in srgb, var(--accent) 35%, var(--border));
}
.menu-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.menu-label {
  font-size: 0.95rem;
  font-weight: 650;
  color: var(--text);
}
.menu-desc {
  font-size: 0.78rem;
  color: var(--muted);
  line-height: 1.35;
}
.badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.25rem;
  height: 1.25rem;
  padding: 0 0.35rem;
  border-radius: 999px;
  background: var(--accent);
  color: var(--on-accent);
  font-size: 0.72rem;
  font-weight: 700;
}
.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin: 0;
  padding: 0.55rem 0.65rem;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--surface);
  cursor: pointer;
  user-select: none;
}
.setting-row.on .setting-title {
  color: var(--accent-hover);
}
.setting-copy {
  display: grid;
  gap: 0.1rem;
  min-width: 0;
}
.setting-title {
  font-size: 0.92rem;
  font-weight: 650;
  color: var(--text);
}
.setting-desc {
  font-size: 0.78rem;
  color: var(--muted);
  line-height: 1.35;
}
.setting-switch {
  appearance: none;
  position: relative;
  flex: 0 0 auto;
  width: 2.6rem;
  height: 1.45rem;
  margin: 0;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: color-mix(in srgb, var(--border) 55%, var(--surface));
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
}
.setting-switch::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: calc(1.45rem - 6px);
  height: calc(1.45rem - 6px);
  border-radius: 50%;
  background: var(--text);
  transition: transform 0.15s ease;
}
.setting-switch:checked {
  background: color-mix(in srgb, var(--accent) 70%, var(--surface));
  border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
}
.setting-switch:checked::after {
  transform: translateX(1.15rem);
  background: #fff;
}
.setting-switch:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
@media (min-width: 768px) {
  /* Desktop: Sing → Offline → Settings → links → Install App (bottom). */
  .setting-sing {
    order: 0;
  }
  .setting-offline {
    order: 1;
  }
  .menu-item {
    order: 2;
  }
  .menu-item-install {
    order: 3;
  }
}
</style>
