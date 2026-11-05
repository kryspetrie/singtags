/**
 * Wire Drive app-state sync to Pinia stores after app mount.
 * Kept separate so `main.ts` stays thin and google modules stay free of Vue SFCs.
 */

import {
  configureDriveAppStateSync,
  ensureDriveHydrate,
  isDriveAppStateDirty,
  markDriveAppStateDirty,
  readLastSyncMeta,
} from './driveAppStateSync'
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
    void (async () => {
      // Stars saved before Drive was connected are not "dirty" yet. Mark them so the
      // first sync merges with Drive instead of replacing this device with the cloud copy.
      const favorites = useFavoritesStore()
      await favorites.ensureLoaded()
      if (!readLastSyncMeta() && !isDriveAppStateDirty() && favorites.records.length > 0) {
        markDriveAppStateDirty()
      }
      await ensureDriveHydrate({ allowTokenPrompt: false })
      await ensureDriveCacheSync({ allowTokenPrompt: false })
    })()
  })
}
