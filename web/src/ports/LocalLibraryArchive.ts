import type {
  LocalAsset,
  LocalAssetBlob,
  LocalEntry,
  LocalGroup,
  LocalLibraryPrefs,
  LocalPlaylist,
} from '../types/localLibrary'

/** Port: My Library rows the backup zip reads and writes. Adapter is IndexedDB. */
export interface LocalLibraryArchiveStore {
  listEntries(): Promise<LocalEntry[]>
  listAssets(): Promise<LocalAsset[]>
  listBlobs(): Promise<LocalAssetBlob[]>
  listGroups(): Promise<LocalGroup[]>
  listPlaylists(): Promise<LocalPlaylist[]>
  getPrefs(): Promise<LocalLibraryPrefs>
  putEntry(entry: LocalEntry): Promise<void>
  putAsset(asset: LocalAsset, blob?: LocalAssetBlob): Promise<void>
  putGroup(group: LocalGroup): Promise<void>
  putPlaylist(playlist: LocalPlaylist): Promise<void>
  putPrefs(prefs: LocalLibraryPrefs): Promise<void>
}
