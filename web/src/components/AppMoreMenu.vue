<script setup lang="ts">
/**
 * Secondary app menu: offline settings, downloads, sing mode toggle.
 */
import { RouterLink } from 'vue-router'
import FilterSheet from './FilterSheet.vue'
import PwaInstallHowToDialog from './PwaInstallHowToDialog.vue'
import { usePwaInstall } from '../composables/usePwaInstall'
import { useOfflineModeStore } from '../stores/offlineMode'
import { usePreferencesStore } from '../stores/preferences'
import { useQueueStore } from '../stores/queue'
import { useSnackbarStore } from '../stores/snackbar'
import { ref } from 'vue'

defineProps<{
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

function bumpScale(delta: number): void {
  prefs.nudgeUiScale(delta)
}
</script>

<template>
  <FilterSheet :open="open" title="More" elevated hide-title fit-content @close="close">
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

      <div class="setting-row setting-scale" role="group" aria-label="Display size">
        <span class="setting-copy">
          <span class="setting-title">Display size</span>
          <span class="setting-desc">Scale the whole app 70%–130%</span>
        </span>
        <div class="scale-stepper">
          <button
            type="button"
            class="scale-nudge"
            :disabled="prefs.uiScalePercent <= 70"
            aria-label="Decrease display size"
            @click="bumpScale(-5)"
          >
            −
          </button>
          <span class="scale-pct" aria-live="polite">{{ prefs.uiScalePercent }}%</span>
          <button
            type="button"
            class="scale-nudge"
            :disabled="prefs.uiScalePercent >= 130"
            aria-label="Increase display size"
            @click="bumpScale(5)"
          >
            +
          </button>
        </div>
      </div>

      <RouterLink class="menu-item" to="/settings" @click="onNavClick">
        <span class="menu-label">Offline settings</span>
        <span class="menu-desc">Cache, downloads, and offline mode</span>
      </RouterLink>

      <RouterLink
        v-if="prefs.localLibraryEnabled"
        class="menu-item"
        to="/library"
        @click="onNavClick"
      >
        <span class="menu-label">My Library</span>
        <span class="menu-desc">Charts, images, and tracks on this device, with pitch and transfer</span>
      </RouterLink>

      <RouterLink
        v-if="prefs.opticalTransferEnabled"
        class="menu-item"
        to="/tx"
        @click="onNavClick"
      >
        <span class="menu-label">Optical transfer</span>
        <span class="menu-desc">Send or receive files via animated QR codes</span>
      </RouterLink>

      <RouterLink class="menu-item" to="/labs" @click="onNavClick">
        <span class="menu-label">SingTags Labs</span>
        <span class="menu-desc">Experimental features and feature flags</span>
      </RouterLink>

      <RouterLink class="menu-item menu-item-downloads" to="/queue" @click="onNavClick">
        <span class="menu-row">
          <span class="menu-label">Export</span>
          <span v-if="queue.count" class="badge" :aria-label="`${queue.count} in queue`">{{
            queue.count
          }}</span>
        </span>
        <span class="menu-desc">Sheet and track export queue</span>
      </RouterLink>

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
/* Mobile: links first, toggles + scale at bottom, Install App last. */
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
}
.menu-item-install {
  order: 5;
  margin-top: 0.15rem;
  border-color: var(--accent-hover);
  background: var(--accent);
  color: #fff;
  box-shadow: 0 2px 0 color-mix(in srgb, var(--accent-hover) 50%, transparent);
}
.menu-item-install .menu-label {
  color: #fff;
  font-weight: 800;
  font-size: 1rem;
}
.menu-item-install .menu-desc {
  color: color-mix(in srgb, #fff 88%, var(--accent));
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
.setting-scale {
  order: 4;
  cursor: default;
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
  color: #fff;
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
.scale-stepper {
  display: flex;
  align-items: center;
  gap: 0.2rem;
  flex: 0 0 auto;
}
.scale-nudge {
  width: 2.25rem;
  height: 2.25rem;
  margin: 0;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--text);
  font: inherit;
  font-size: 1.2rem;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
}
.scale-nudge:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.scale-nudge:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.scale-pct {
  min-width: 3rem;
  text-align: center;
  font-weight: 750;
  font-variant-numeric: tabular-nums;
  font-size: 0.92rem;
}
@media (min-width: 768px) {
  /* Desktop: Sing → Offline → Display size → links → Install App (bottom). */
  .setting-sing {
    order: 0;
  }
  .setting-offline {
    order: 1;
  }
  .setting-scale {
    order: 2;
  }
  .menu-item {
    order: 3;
  }
  .menu-item-install {
    order: 4;
  }
}
</style>
