<script setup lang="ts">
/**
 * Secondary app menu: offline settings, downloads, sing mode toggle.
 */
import { RouterLink } from 'vue-router'
import FilterSheet from './FilterSheet.vue'
import { useOfflineModeStore } from '../stores/offlineMode'
import { usePreferencesStore } from '../stores/preferences'
import { useQueueStore } from '../stores/queue'
import { useSnackbarStore } from '../stores/snackbar'

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

function close(): void {
  emit('close')
}

function onNavClick(): void {
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
</script>

<template>
  <FilterSheet :open="open" title="More" elevated hide-title @close="close">
    <nav class="menu" aria-label="More">
      <RouterLink class="menu-item" to="/settings" @click="onNavClick">
        <span class="menu-label">Offline settings</span>
        <span class="menu-desc">Cache, downloads, and offline mode</span>
      </RouterLink>

      <RouterLink class="menu-item" to="/optical-transfer" @click="onNavClick">
        <span class="menu-label">Optical transfer</span>
        <span class="menu-desc">Send or receive files via animated QR codes</span>
      </RouterLink>

      <RouterLink class="menu-item menu-item-downloads" to="/queue" @click="onNavClick">
        <span class="menu-row">
          <span class="menu-label">Downloads</span>
          <span v-if="queue.count" class="badge" :aria-label="`${queue.count} in queue`">{{
            queue.count
          }}</span>
        </span>
        <span class="menu-desc">Sheet and track download queue</span>
      </RouterLink>

      <label
        class="setting-row"
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

      <label
        class="setting-row"
        :class="{ on: prefs.singMode }"
        title="When on, Browse / Recent / Favorites open tags into sheet fullscreen"
      >
        <span class="setting-copy">
          <span class="setting-title">Sing mode</span>
          <span class="setting-desc">
            {{ prefs.singMode ? 'Tags open fullscreen' : 'Tags open on the tag page' }}
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
    </nav>
  </FilterSheet>
</template>

<style scoped>
.menu {
  display: grid;
  gap: 0.45rem;
}
.menu-item {
  display: grid;
  gap: 0.15rem;
  padding: 0.65rem 0.75rem;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: inherit;
  text-decoration: none;
  cursor: pointer;
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
@media (min-width: 768px) {
  .menu-item-downloads {
    display: none;
  }
}
</style>
