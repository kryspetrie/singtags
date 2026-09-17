/**
 * Save Tag Roll project into My Library (sheet PNG + WAV tracks).
 */
import { useLocalLibraryStore } from '../../stores/localLibrary'
import { usePreferencesStore } from '../../stores/preferences'
import { bounceTagRollTracks } from './audioBounce'
import { renderTagRollSheet } from './sheetRender'
import type { TagRollProject } from './types'

export type SaveToLibraryProgress = { label: string; ratio: number }

export async function saveTagRollToLibrary(
  project: TagRollProject,
  opts?: {
    mix?: boolean
    perPart?: boolean
    updateLinked?: boolean
    onProgress?: (p: SaveToLibraryProgress) => void
  },
): Promise<{ entryId: string }> {
  const prefs = usePreferencesStore()
  if (!prefs.localLibraryEnabled) prefs.setLocalLibraryEnabled(true)

  const lib = useLocalLibraryStore()
  await lib.ensureLoaded()

  opts?.onProgress?.({ label: 'Rendering sheet…', ratio: 0.05 })
  const sheetBlob = await renderTagRollSheet(project)

  const tracks = await bounceTagRollTracks(project, {
    mix: opts?.mix !== false,
    perPart: opts?.perPart !== false,
    onProgress: (p) =>
      opts?.onProgress?.({ label: p.label, ratio: 0.15 + p.ratio * 0.7 }),
  })

  const lyricsHint = project.notes
    .filter((n) => n.lyric)
    .slice(0, 8)
    .map((n) => n.lyric)
    .join(' ')

  let entryId = opts?.updateLinked !== false ? project.localEntryId : null
  if (entryId) {
    const existing = lib.entries.find((e) => e.id === entryId)
    if (!existing) entryId = null
  }

  if (!entryId) {
    const entry = await lib.createEmptyEntry({
      title: project.title,
      notes: 'Created from Tag Roll',
      lyricsHint: lyricsHint.slice(0, 120),
    })
    entryId = entry.id
  } else {
    await lib.updateMeta(entryId, {
      title: project.title,
      lyricsHint: lyricsHint.slice(0, 120) || undefined,
    })
    const assets = lib.assetsFor(entryId)
    for (const a of assets) {
      if (a.filename.startsWith('tag-roll-')) {
        await lib.removeAsset(a.id)
      }
    }
  }

  opts?.onProgress?.({ label: 'Importing files…', ratio: 0.9 })
  const files: File[] = [
    new File([sheetBlob], 'tag-roll-sheet.png', { type: 'image/png' }),
  ]
  const roles: Array<'sheet' | 'track'> = ['sheet']
  for (const t of tracks) {
    const copy = t.bytes instanceof ArrayBuffer ? t.bytes.slice(0) : new Uint8Array(t.bytes).buffer
    files.push(new File([copy], t.filename, { type: 'audio/wav' }))
    roles.push('track')
  }
  await lib.addFilesToEntry(entryId, files, roles)

  opts?.onProgress?.({ label: 'Done', ratio: 1 })
  return { entryId }
}
