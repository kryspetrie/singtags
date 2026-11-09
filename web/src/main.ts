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
// Self-hosted IBM Plex (metric fallbacks + Vite HTML preload) — no Google CDN
import './styles/fonts.css'
import './styles/tokens.css'
import './styles/controls.css'
import './styles/utilities.css'
import './styles/tagRollNarrow.css'
import { ensureFetchPatchInstalled } from './lib/manualOfflineFetch'
import { resolveInitialUiScale, applyUiScale } from './lib/uiScale'
import { resolveInitialAppTheme, applyAppTheme } from './lib/theme'
import { resolveInitialEmbolden, applyEmbolden } from './lib/embolden'
import { syncNarrowViewportDataset } from './lib/narrowViewport'
import { getCatalogSnapshotIdb } from './offline/indexSnapshotDb'
import { browseUrlLooksDefault } from './lib/catalogFirstPaint'
import { browseReloadSnapIsSearchTop } from './lib/browseReloadScroll'
import { stripBrowseScrollParamsFromUrl } from './lib/browseScrollUrl'
import { useOfflineModeStore } from './stores/offlineMode'
import { useCatalogStore } from './stores/catalog'
import { useOfflineLibraryStore } from './stores/offlineLibrary'

// Apply persisted / viewport-default UI scale before first paint (avoids a zoom jump).
applyUiScale(resolveInitialUiScale())
applyAppTheme(resolveInitialAppTheme())
applyEmbolden(resolveInitialEmbolden())
// Re-stamp after zoom so matchMedia + CSS `html[data-narrow]` stay aligned.
syncNarrowViewportDataset()

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
  const searchTopReload = browseReloadSnapIsSearchTop()
  if (searchTopReload) stripBrowseScrollParamsFromUrl()
  if (browseUrlLooksDefault() || searchTopReload) {
    catalog.hydrateFirstPaint()
  } else if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('at')) {
    // Mid-list restore: jump-rail keys only so chrome can size before tags arrive.
    catalog.hydrateFirstPaintChrome()
  }
  catalog.hydrateFromSnapshot()
  offlineLib.hydrateManifestSnapshots()

  // Register before mount so HomeView `load()` awaits this instead of
  // starting a second catalog download and search-index build.
  const catalogReady = catalog.beginIndexedDbHydrate(
    earlyCatalogIdb.then((snap) =>
      snap?.tags?.length
        ? {
            tags: snap.tags,
            expansions: snap.expansions,
            sourceHash: snap.sourceHash,
            storageFormat: snap.storageFormat,
          }
        : null,
    ),
  )

  // Kick IDB/network warm-up immediately; do not block shell paint on it.
  const warmCatalog = (async () => {
    // First-paint slice still needs the full IDB catalog (jump rail, remaining tags).
    if (!catalog.loaded || catalog.partialCatalog) {
      await catalogReady
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

  // Google Drive app-state sync (Labs): idle hydrate after shell paint — never blocks Browse.
  void import('./lib/google/driveSyncBootstrap').then((m) => m.startDriveAppStateSync())
}

void bootstrap()
