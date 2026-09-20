/**
 * Adapter: Tag Studio → My Library ingest (Pinia Local Library + preferences).
 * Keeps Pinia at the adapter edge so application use-cases stay free of stores.
 */
import { useLocalLibraryStore } from '../../stores/localLibrary'
import { usePreferencesStore } from '../../stores/preferences'
import type { LibraryIngest, LibraryIngestInput } from '../../ports/LibraryIngest'

export function createLocalLibraryIngest(): LibraryIngest {
  return {
    async ingest(input: LibraryIngestInput): Promise<{ entryId: string }> {
      const prefs = usePreferencesStore()
      if (!prefs.localLibraryEnabled) prefs.setLocalLibraryEnabled(true)

      const lib = useLocalLibraryStore()
      await lib.ensureLoaded()

      const lyricsHint = (input.lyricsHint ?? '').slice(0, 120)
      let entryId = input.entryId ?? null
      if (entryId) {
        const existing = lib.entries.find((e) => e.id === entryId)
        if (!existing) entryId = null
      }

      if (!entryId) {
        const entry = await lib.createEmptyEntry({
          title: input.title,
          notes: input.notes ?? 'Created from Tag Studio',
          lyricsHint,
        })
        entryId = entry.id
      } else {
        await lib.updateMeta(entryId, {
          title: input.title,
          lyricsHint: lyricsHint || undefined,
        })
        const assets = lib.assetsFor(entryId)
        for (const a of assets) {
          if (
            a.role === 'track' &&
            (a.filename.startsWith('tag-roll-') ||
              a.filename.startsWith(`${input.title} - `) ||
              / - (Mix|Tenor|Lead|Bari|Bass|Solo)\b/i.test(a.filename))
          ) {
            await lib.removeAsset(a.id)
          }
        }
      }

      const files: File[] = [
        new File([input.sheetPng], 'tag-roll-sheet.png', { type: 'image/png' }),
      ]
      const roles: Array<'sheet' | 'track'> = ['sheet']
      for (const t of input.tracks) {
        const copy =
          t.bytes instanceof ArrayBuffer ? t.bytes.slice(0) : new Uint8Array(t.bytes).buffer
        files.push(
          new File([copy], t.filename, {
            type: t.mime ?? 'audio/wav',
          }),
        )
        roles.push('track')
      }
      await lib.addFilesToEntry(entryId, files, roles)
      return { entryId }
    },
  }
}
