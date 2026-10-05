/**
 * SingTags SPA bootstrap: Pinia, offline fetch patch, catalog hydration, router mount.
 * Heavy audio (bake / Opus WASM) warms on first Tag play or Pitch Pipe — not on cold boot.
 *
 * Paint the shell immediately; hydrate the catalog from IndexedDB in parallel so a
 * reload is not a blank screen waiting on async storage / network.
 */
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { library } from '@fortawesome/fontawesome-svg-core'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
import { faHeart as faHeartSolid, faPause, faPen, faPlay, faStop, faEllipsisVertical, faBackwardStep, faForwardStep, faBackwardFast, faForwardFast, faRotateLeft, faHand, faArrowPointer, faChevronLeft, faChevronRight, faChevronDown, faChevronUp, faEye, faLayerGroup } from '@fortawesome/free-solid-svg-icons'
import { faHeart as faHeartRegular } from '@fortawesome/free-regular-svg-icons'
import App from './App.vue'
import { router } from './router'
// Self-hosted (npm) — no Google Fonts CDN
import '@fontsource/ibm-plex-sans/latin-400.css'
import '@fontsource/ibm-plex-sans/latin-500.css'
import '@fontsource/ibm-plex-sans/latin-600.css'
import '@fontsource/ibm-plex-sans/latin-700.css'
import '@fontsource/ibm-plex-serif/latin-600.css'
import '@fontsource/ibm-plex-serif/latin-700.css'
import './styles/tokens.css'
import './styles/controls.css'
import './styles/utilities.css'
import { ensureFetchPatchInstalled } from './lib/manualOfflineFetch'
import { resolveInitialUiScale, applyUiScale } from './lib/uiScale'
import { resolveInitialAppTheme, applyAppTheme } from './lib/theme'
import { resolveInitialEmbolden, applyEmbolden } from './lib/embolden'
import { getCatalogSnapshotIdb } from './offline/indexSnapshotDb'
import { browseUrlLooksDefault } from './lib/catalogFirstPaint'
import { useOfflineModeStore } from './stores/offlineMode'
import { useCatalogStore } from './stores/catalog'
import { useOfflineLibraryStore } from './stores/offlineLibrary'

// Apply persisted / viewport-default UI scale before first paint (avoids a zoom jump).
applyUiScale(resolveInitialUiScale())
applyAppTheme(resolveInitialAppTheme())
applyEmbolden(resolveInitialEmbolden())

// Register FontAwesome icons (hearts + media transport; avoid emoji glyphs that break on mobile)
library.add(
  faHeartSolid,
  faHeartRegular,
  faPen,
  faHand,
  faArrowPointer,
  faPlay,
  faPause,
  faStop,
  faEllipsisVertical,
  faBackwardStep,
  faForwardStep,
  faBackwardFast,
  faForwardFast,
  faRotateLeft,
  faChevronLeft,
  faChevronRight,
  faChevronDown,
  faChevronUp,
  faEye,
  faLayerGroup,
)

ensureFetchPatchInstalled()

// Start IndexedDB catalog read ASAP (overlaps Vue/app setup).
const earlyCatalogIdb =
  typeof indexedDB !== 'undefined' ? getCatalogSnapshotIdb() : Promise.resolve(undefined)

async function bootstrap(): Promise<void> {
  const app = createApp(App)
  const pinia = createPinia()
  app.component('font-awesome-icon', FontAwesomeIcon)
  app.use(pinia)

  const offlineMode = useOfflineModeStore()
  offlineMode.init()
  const offlineLib = useOfflineLibraryStore()
  const catalog = useCatalogStore()

  offlineLib.restoreCatalogCached()
  // Sync mirror is legacy/tiny only — full library lives in IndexedDB.
  // Default Browse: paint a localStorage viewport slice before IDB returns.
  // (HomeView pins to top / restores reload scroll when the full catalog swaps in.)
  if (browseUrlLooksDefault()) {
    catalog.hydrateFirstPaint()
  } else if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('at')) {
    // Mid-list restore: jump-rail keys only so chrome can size before tags arrive.
    catalog.hydrateFirstPaintChrome()
  }
  catalog.hydrateFromSnapshot()
  offlineLib.hydrateManifestSnapshots()

  const catalogIdb = earlyCatalogIdb

  // Kick IDB/network warm-up immediately; do not block shell paint on it.
  const warmCatalog = (async () => {
    // First-paint slice still needs the full IDB catalog (jump rail, remaining tags).
    if (!catalog.loaded || catalog.partialCatalog) {
      const snap = await catalogIdb
      await catalog.hydrateFromIndexedDb(
        snap?.tags?.length
          ? { tags: snap.tags, expansions: snap.expansions }
          : null,
      )
    }
    if (!catalog.loaded) {
      await catalog.load({ refresh: !offlineMode.offline })
    } else if (!offlineMode.offline) {
      void catalog.load({ refresh: true })
    }
    await catalog.hydrateLyricsFromIndexedDb()
    await catalog.ensureLyrics()
  })()

  app.use(router)
  app.mount('#app')

  void warmCatalog
}

void bootstrap()
