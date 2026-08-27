import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
// Self-hosted (npm) — no Google Fonts CDN
import '@fontsource/ibm-plex-sans/latin-400.css'
import '@fontsource/ibm-plex-sans/latin-600.css'
import '@fontsource/ibm-plex-serif/latin-600.css'
import '@fontsource/ibm-plex-serif/latin-700.css'
import './styles/tokens.css'
import './styles/controls.css'
import './styles/utilities.css'
import { ensureFetchPatchInstalled } from './lib/manualOfflineFetch'
import { useOfflineModeStore } from './stores/offlineMode'
import { useCatalogStore } from './stores/catalog'
import { useOfflineLibraryStore } from './stores/offlineLibrary'

ensureFetchPatchInstalled()

async function bootstrap(): Promise<void> {
  const app = createApp(App)
  const pinia = createPinia()
  app.use(pinia)

  const offlineMode = useOfflineModeStore()
  offlineMode.init()
  const offlineLib = useOfflineLibraryStore()
  const catalog = useCatalogStore()

  offlineLib.restoreCatalogCached()
  catalog.hydrateFromSnapshot()
  offlineLib.hydrateManifestSnapshots()
  await catalog.hydrateFromIndexedDb()

  if (!catalog.loaded) {
    await catalog.load({ refresh: !offlineMode.offline })
  } else if (!offlineMode.offline) {
    void catalog.load({ refresh: true })
  }
  await catalog.ensureLyrics()

  app.use(router)
  app.mount('#app')

  /** Warm pitch/speed DSP worker after first paint — does not block browse/play at 1×. */
  function scheduleBakePreload(): void {
    const run = () => {
      void import('./audio/bakeClient')
        .then((m) => m.preloadBakePipeline())
        .catch(() => {
          /* optional warm-up */
        })
    }
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(() => run(), { timeout: 4000 })
    } else {
      setTimeout(run, 1500)
    }
  }
  scheduleBakePreload()
}

void bootstrap()
