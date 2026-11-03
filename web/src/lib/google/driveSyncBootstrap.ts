/**
 * Wire Drive app-state sync to Pinia stores after app mount.
 * Kept separate so `main.ts` stays thin and google modules stay free of Vue SFCs.
 */

import { configureDriveAppStateSync, ensureDriveHydrate } from './driveAppStateSync'
import { isDriveSyncEnabled, restoreGoogleConnection } from './googleAuth'
import { useFavoritesStore } from '../../stores/favorites'
import { usePracticeStore } from '../../stores/practice'
import { useUserCollectionsStore } from '../../stores/userCollections'

/** Register snapshot/apply hooks and kick a background hydrate when connected. */
export function startDriveAppStateSync(): void {
  restoreGoogleConnection()

  configureDriveAppStateSync({
    getSnapshot: () => {
      const favorites = useFavoritesStore()
      const userCollections = useUserCollectionsStore()
      const practice = usePracticeStore()
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

  if (!isDriveSyncEnabled()) return

  const idle = (cb: () => void) => {
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(() => cb(), { timeout: 4000 })
    } else {
      window.setTimeout(cb, 1200)
    }
  }
  idle(() => {
    void ensureDriveHydrate()
  })
}
