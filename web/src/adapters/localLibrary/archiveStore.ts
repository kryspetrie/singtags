import {
  getLocalLibraryPrefs,
  listAllLocalAssets,
  listAllLocalBlobs,
  listLocalEntries,
  listLocalGroups,
  listLocalPlaylists,
  putLocalAsset,
  putLocalEntry,
  putLocalGroup,
  putLocalLibraryPrefs,
  putLocalPlaylist,
} from '../../offline/localLibraryDb'
import type { LocalLibraryArchiveStore } from '../../ports/LocalLibraryArchive'

/** IndexedDB adapter for My Library backup / restore. */
export function createIndexedDbLocalLibraryArchive(): LocalLibraryArchiveStore {
  return {
    listEntries: () => listLocalEntries(),
    listAssets: () => listAllLocalAssets(),
    listBlobs: () => listAllLocalBlobs(),
    listGroups: () => listLocalGroups(),
    listPlaylists: () => listLocalPlaylists(),
    getPrefs: () => getLocalLibraryPrefs(),
    putEntry: (entry) => putLocalEntry(entry),
    putAsset: (asset, blob) => putLocalAsset(asset, blob),
    putGroup: (group) => putLocalGroup(group),
    putPlaylist: (playlist) => putLocalPlaylist(playlist),
    putPrefs: (prefs) => putLocalLibraryPrefs(prefs),
  }
}
