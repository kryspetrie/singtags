/**
 * User-facing "check Drive for updates" across app state and the song cache.
 */
import { isSingTagsOffline } from '../appOffline'
import { restoreMissingUserBlobs } from '../userDocuments'
import { downloadUserBlob } from './driveUserBlobs'
import {
  googleAuthState,
  hasUsableAccessToken,
  isDriveSyncEnabled,
  restoreGoogleConnection,
} from './googleAuth'
import {
  clearRetry,
  driveSyncState,
  ensureDriveHydrate,
  readCloudAppState,
  reloadAfterHydrate,
  setReloadAfterHydrate,
  setSuppressDrivePush,
  suppressDrivePush,
} from './driveAppStateSync'

/** One line for the account-menu check after every Drive store has been pulled. */
export function summarizeDriveUpdateCheck(input: {
  stateMessage: string
  restoredItems: number
  cacheMessage: string
}): string {
  const notes: string[] = []
  const state = input.stateMessage.trim()
  if (state && state !== 'Drive synced' && state !== 'Up to date') {
    notes.push(state.replace(/\.$/, ''))
  }
  if (input.restoredItems > 0) {
    const n = input.restoredItems
    notes.push(`Brought in ${n} item${n === 1 ? '' : 's'} from Drive`)
  }
  const cache = input.cacheMessage.trim()
  if (cache) notes.push(cache.replace(/\.$/, ''))
  if (!notes.length) return 'Up to date'
  return `${notes.join('. ')}.`
}

/**
 * User-gesture pull of everything stored in Drive: app state (favorites,
 * settings, Tag Studio, arranging, My Library, recordings, Tag Roulette),
 * the audio and library files those records point at, and this device's
 * song cache. Local edits stay queued for the upload batch.
 */
export async function checkDriveForUpdates(): Promise<{ ok: boolean; message: string }> {
  if (isSingTagsOffline()) return { ok: false, message: 'Offline — Drive sync paused' }
  restoreGoogleConnection()
  if (!googleAuthState.connected) return { ok: false, message: 'Sign in to check Google Drive' }
  if (!isDriveSyncEnabled()) return { ok: false, message: 'Turn on Google Drive sync in Labs first' }
  clearRetry()
  setReloadAfterHydrate(false)
  await ensureDriveHydrate({ allowTokenPrompt: true, pushLocal: false, deferReload: true })

  const finish = (result: { ok: boolean; message: string }): { ok: boolean; message: string } => {
    if (reloadAfterHydrate) {
      setReloadAfterHydrate(false)
      window.setTimeout(() => window.location.reload(), 250)
    }
    return result
  }

  if (driveSyncState.status === 'error') {
    return finish({ ok: false, message: driveSyncState.message || 'Could not check Google Drive' })
  }

  let restoredItems = 0
  let cacheMessage = ''
  if (hasUsableAccessToken()) {
    try {
      const remote = await readCloudAppState()
      const previous = suppressDrivePush
      setSuppressDrivePush(true)
      try {
        restoredItems = await restoreMissingUserBlobs(remote?.documents, downloadUserBlob)
      } finally {
        setSuppressDrivePush(previous)
      }
    } catch (e) {
      return finish({
        ok: false,
        message: e instanceof Error ? e.message : 'Could not download saved files from Drive',
      })
    }

    try {
      const cache = await import('./driveCacheSync')
      if (cache.isDriveCacheSyncEnabled()) {
        const format = await cache.ensureDriveCacheFormatCompatible()
        if (!format.compatible) {
          cacheMessage = format.clearedLocal
            ? 'Song media format updated — refill cleared packs from SingTags (other Drive media kept)'
            : 'Song cache on Drive needs an update from this device'
        } else {
          const pulled = await cache.hydrateDriveCache()
          if (pulled.sheets + pulled.audio > 0) cacheMessage = cache.driveCacheSyncState.message
        }
      }
    } catch (e) {
      return finish({
        ok: false,
        message: e instanceof Error ? e.message : 'Could not check the song cache',
      })
    }
  }

  return finish({
    ok: true,
    message: summarizeDriveUpdateCheck({
      stateMessage: driveSyncState.message,
      restoredItems,
      cacheMessage,
    }),
  })
}

