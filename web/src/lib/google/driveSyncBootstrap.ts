/**
 * Wire Drive app-state sync to Pinia stores after app mount.
 * Kept separate so `main.ts` stays thin and google modules stay free of Vue SFCs.
 */

import { configureDriveAppStateSync, ensureDriveHydrate } from './driveAppStateSync'
import { ensureDriveCacheSync } from './driveCacheSync'
import { startDriveSyncPolling } from './driveSyncPoll'
import { isDriveSyncEnabled, restoreGoogleConnection } from './googleAuth'
import { useFavoritesStore } from '../../stores/favorites'
import { usePracticeStore } from '../../stores/practice'
import { useUserCollectionsStore } from '../../stores/userCollections'

/** Register snapshot/apply hooks and kick a background hydrate when connected. */
export function startDriveAppStateSync(): void {
  restoreGoogleConnection()

  configureDriveAppStateSync({
    getSnapshot: async () => {
      const favorites = useFavoritesStore()
      const userCollections = useUserCollectionsStore()
      const practice = usePracticeStore()
      await favorites.ensureLoaded()
      return {
        records: favorites.records,
        collections: userCollections.exportSnapshot(),
        practice: practice.exportSnapshot(),
      }
    },
    applyFavorites: async (favoritesBackup, _mode) => {
      const favorites = useFavoritesStore()
      const userCollections = useUserCollectionsStore()
      const practice = usePracticeStore()
      await favorites.importFromJson(favoritesBackup.starred, false)
      userCollections.replaceAll(favoritesBackup.collections)
      practice.importSnapshot(favoritesBackup.practice)
    },
  })

  // Poll interval is Settings-configurable; safe even when not connected (ticks no-op).
  startDriveSyncPolling()

  if (!isDriveSyncEnabled()) return

  const idle = (cb: () => void) => {
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(() => cb(), { timeout: 4000 })
    } else {
      window.setTimeout(cb, 1200)
    }
  }
  // Idle hydrate only runs when a token is already in memory (no popup flash).
  idle(() => {
    void ensureDriveHydrate({ allowTokenPrompt: false }).then(() =>
      ensureDriveCacheSync({ allowTokenPrompt: false }),
    )
  })
}
