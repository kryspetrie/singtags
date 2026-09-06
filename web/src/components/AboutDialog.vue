<script setup lang="ts">
/**
 * About SingTags dialog with nested offline/install details and storage estimates.
 */
import { computed, onUnmounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { usePwaInstall } from '../composables/usePwaInstall'
import { useOfflineLibraryStore } from '../stores/offlineLibrary'
import { formatBytes } from '../offline/storageEstimate'
import { OFFLINE_LOFI_AUDIO_BALLPARK_LABEL } from '../lib/offlineAudioBallpark'
import PwaInstallHowToDialog from './PwaInstallHowToDialog.vue'

const props = defineProps<{
  /** Dialog visibility. */
  open: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const offlineLib = useOfflineLibraryStore()
const { showInstallEntry, promptInstall } = usePwaInstall()
const howToOpen = ref(false)

/** `about` main panel, or nested `details` (offline / install) with back. */
type Panel = 'about' | 'details'
const panel = ref<Panel>('about')

function onKeydown(e: KeyboardEvent): void {
  if (e.key !== 'Escape') return
  if (panel.value === 'details') {
    panel.value = 'about'
    return
  }
  emit('close')
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      panel.value = 'about'
      void offlineLib.refreshEstimate()
      window.addEventListener('keydown', onKeydown)
      return
    }
    window.removeEventListener('keydown', onKeydown)
  },
)

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
})

/** Approx on-device size when sheets + learning audio packs are fully cached. */
const fullCacheSizeLabel = computed(() => {
  const sheets = offlineLib.sheetsTotalBytes
  const audio = offlineLib.audioTotalBytes
  if (sheets > 0 && audio > 0) return formatBytes(sheets + audio)
  if (sheets > 0) return `${formatBytes(sheets)} sheets + ${OFFLINE_LOFI_AUDIO_BALLPARK_LABEL} audio`
  return `under 100 MB sheets + ${OFFLINE_LOFI_AUDIO_BALLPARK_LABEL} audio`
})

const usedNowLabel = computed(() => {
  const used = offlineLib.estimate?.usage ?? 0
  return used > 0 ? formatBytes(used) : null
})

function close(): void {
  panel.value = 'about'
  emit('close')
}

async function onInstall(): Promise<void> {
  const outcome = await promptInstall()
  if (outcome === 'unavailable') {
    howToOpen.value = true
    return
  }
  close()
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="about-root"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="panel === 'about' ? 'about-title' : 'about-details-title'"
    >
      <button type="button" class="backdrop" aria-label="Close about" @click="close" />
      <div class="panel" tabindex="-1">
        <template v-if="panel === 'about'">
          <header class="head">
            <p class="eyebrow">About</p>
            <h2 id="about-title">SingTags</h2>
            <p class="tagline">Barbershop tags… fast.</p>
          </header>

          <div class="body">
            <p>
              SingTags is a fast, offline-first mirror of the
              <a href="https://www.barbershoptags.com/" target="_blank" rel="noopener noreferrer"
                >barbershoptags.com</a
              >
              tag library. Catalog data syncs <strong>weekly</strong> (Coming Soon…) from
              barbershoptags.com as the source of truth. Outside that sync, SingTags does
              <strong>not</strong> call barbershoptags.com — download counts and ratings here are
              read-only snapshots.
            </p>

            <p>
              Built by <strong>Krys Petrie (NED)</strong> —
              <a href="mailto:info@singtags.com">info@singtags.com</a>. Email Krys for feature
              requests or bug reports.
            </p>

            <p>
              Designed for absolute performance: in-memory catalog, offline favorites, and bulk
              download tools.
            </p>
            <p class="details-action">
              <button type="button" class="btn btn-ghost" @click="panel = 'details'">
                Offline, install &amp; cache details
              </button>
            </p>
          </div>

          <footer class="actions">
            <button type="button" class="btn btn-primary" @click="close">Close</button>
            <button
              v-if="showInstallEntry"
              type="button"
              class="btn btn-install"
              @click="onInstall"
            >
              Install App
            </button>
            <a class="btn" href="mailto:info@singtags.com">Email Krys</a>
          </footer>
        </template>

        <template v-else>
          <header class="head">
            <button type="button" class="btn btn-ghost back" @click="panel = 'about'">← About</button>
            <p class="eyebrow">Details</p>
            <h2 id="about-details-title">Offline, install &amp; cache</h2>
          </header>

          <div class="body">
            <p>
              Performance comes from an in-memory catalog (no live database queries) and a
              <strong>mobile-first PWA</strong> design. Starred tags can cache sheet music and
              learning tracks in a compact on-device format for 100% offline use. Bulk download
              tools fill the songbook and lo-fi learning packs in the background.
            </p>

            <p>
              Favorites, recent tags, and media packs live in persistent browser storage. With
              everything downloaded, the full cache is about
              <strong>{{ fullCacheSizeLabel }}</strong
              ><template v-if="usedNowLabel">
                (this device currently uses {{ usedNowLabel }})</template
              >.
            </p>

            <div class="install-guides">
              <p class="install-heading">How to install as an app</p>
              <ul>
                <li>
                  <a
                    href="https://support.google.com/chrome/answer/9658361?hl=en&amp;co=GENIE.Platform%3DDesktop"
                    target="_blank"
                    rel="noopener noreferrer"
                    >Chrome or Brave — desktop</a
                  >
                </li>
                <li>
                  <a
                    href="https://support.google.com/chrome/answer/9658361?hl=en&amp;co=GENIE.Platform%3DAndroid"
                    target="_blank"
                    rel="noopener noreferrer"
                    >Chrome or Brave — Android</a
                  >
                </li>
                <li>
                  <a
                    href="https://support.microsoft.com/en-us/edge/install-manage-or-uninstall-apps-in-microsoft-edge"
                    target="_blank"
                    rel="noopener noreferrer"
                    >Microsoft Edge — desktop &amp; mobile</a
                  >
                </li>
                <li>
                  <a
                    href="https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/ios"
                    target="_blank"
                    rel="noopener noreferrer"
                    >iPhone (Safari — Add to Home Screen)</a
                  >
                </li>
                <li>
                  <a
                    href="https://support.apple.com/guide/ipad/open-as-web-app-ipad8f1f7a29/ipados"
                    target="_blank"
                    rel="noopener noreferrer"
                    >iPad (Safari — Add to Home Screen)</a
                  >
                </li>
                <li>
                  <a
                    href="https://web.dev/learn/pwa/installation"
                    target="_blank"
                    rel="noopener noreferrer"
                    >More detail (web.dev)</a
                  >
                </li>
              </ul>
            </div>

            <p>
              Favorites, recent tags, and media packs live in persistent browser storage. Use Offline
              settings to export or back up your starred / offline data whenever you need a copy on
              your device.
            </p>
          </div>

          <footer class="actions">
            <button type="button" class="btn btn-primary" @click="close">Close</button>
            <button
              v-if="showInstallEntry"
              type="button"
              class="btn btn-install"
              @click="onInstall"
            >
              Install App
            </button>
            <RouterLink class="btn btn-ghost" to="/settings" @click="close">
              Offline settings
            </RouterLink>
          </footer>
        </template>
      </div>
    </div>
    <PwaInstallHowToDialog :open="howToOpen" @close="howToOpen = false" />
  </Teleport>
</template>

<style scoped>
.about-root {
  position: fixed;
  inset: 0;
  z-index: 55;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  padding-bottom: calc(1rem + env(safe-area-inset-bottom));
}
.backdrop {
  position: absolute;
  inset: 0;
  border: 0;
  background: rgba(0, 0, 0, 0.4);
}
.panel {
  position: relative;
  width: min(100%, 32rem);
  max-height: min(88vh, 42rem);
  overflow: auto;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1.15rem 1.2rem 1rem;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.18);
  display: grid;
  gap: 0.85rem;
}
.head {
  display: grid;
  gap: 0.2rem;
}
.back {
  justify-self: start;
  margin: 0 0 0.15rem;
  min-height: 36px;
  padding: 0.3rem 0.65rem;
  font-size: 0.85rem;
}
.eyebrow {
  margin: 0;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--accent);
}
.head h2 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.35rem;
  line-height: 1.2;
}
.tagline {
  margin: 0;
  color: var(--muted);
  font-size: 0.92rem;
}
.body {
  display: grid;
  gap: 0.75rem;
  color: var(--text);
  font-size: 0.95rem;
  line-height: 1.5;
}
.body p {
  margin: 0;
}
.body a {
  color: var(--accent);
}
.details-action .btn {
  min-height: 36px;
  padding: 0.3rem 0.65rem;
  font-size: 0.85rem;
}
.install-guides {
  display: grid;
  gap: 0.35rem;
}
.install-heading {
  margin: 0;
  font-weight: 700;
  font-size: 0.92rem;
}
.install-guides ul {
  margin: 0;
  padding-left: 1.2rem;
  display: grid;
  gap: 0.35rem;
}
.install-guides li {
  margin: 0;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
}
.btn-install {
  border: 1px solid var(--accent-hover);
  background: var(--accent);
  color: #fff;
  font-weight: 750;
}
.btn-install:hover {
  background: var(--accent-hover);
}
</style>
