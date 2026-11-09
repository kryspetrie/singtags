import { listStarred } from '../../offline/favoritesDb'
import { audioPack, sheetsPack } from '../../offline/libraryPack'
import { buildReadinessFromUrlLists, type TagCacheReady } from '../../lib/offlineReadiness'

/** Load offline readiness with one bulk listing per pack plus one favorites read. */
export async function loadOfflineReadinessIndex(): Promise<Map<number, TagCacheReady>> {
  const [sheetUrls, audioUrls, starred] = await Promise.all([
    sheetsPack.listUrls(),
    audioPack.listUrls(),
    listStarred(),
  ])
  return buildReadinessFromUrlLists(sheetUrls, audioUrls, starred)
}
