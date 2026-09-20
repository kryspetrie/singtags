import type { AudioBounce } from '../../ports/AudioBounce'
import type { LibraryIngest } from '../../ports/LibraryIngest'
import type { TagRollProject } from '../../lib/tagRoll/types'
import { renderTagRollSheet } from '../../lib/tagRoll/sheetRender'

export type SaveTagRollToLibraryProgress = { label: string; ratio: number }

export type SaveTagRollToLibraryDeps = {
  audioBounce: AudioBounce
  libraryIngest: LibraryIngest
  renderSheet?: (project: TagRollProject) => Promise<Blob>
}

/**
 * Use-case: bounce + sheet render + library ingest.
 * No Pinia — adapters own Local Library / preferences.
 */
export async function saveTagRollToLibrary(
  project: TagRollProject,
  deps: SaveTagRollToLibraryDeps,
  opts?: {
    mix?: boolean
    perPart?: boolean
    updateLinked?: boolean
    onProgress?: (p: SaveTagRollToLibraryProgress) => void
  },
): Promise<{ entryId: string }> {
  const renderSheet = deps.renderSheet ?? renderTagRollSheet
  opts?.onProgress?.({ label: 'Rendering sheet…', ratio: 0.05 })
  const sheetPng = await renderSheet(project)

  const tracks = await deps.audioBounce.bounce(project, {
    mix: opts?.mix !== false,
    perPart: opts?.perPart !== false,
    format: 'wav',
    onProgress: (p) =>
      opts?.onProgress?.({ label: p.label, ratio: 0.15 + p.ratio * 0.7 }),
  })

  const lyricsHint = project.notes
    .filter((n) => n.lyric)
    .slice(0, 8)
    .map((n) => n.lyric)
    .join(' ')

  opts?.onProgress?.({ label: 'Importing files…', ratio: 0.9 })
  const result = await deps.libraryIngest.ingest({
    title: project.title,
    entryId: opts?.updateLinked !== false ? project.localEntryId : null,
    sheetPng,
    tracks: tracks.map((t) => ({
      filename: t.filename,
      bytes: t.bytes,
      mime: 'audio/wav',
    })),
    lyricsHint,
    notes: 'Created from Tag Studio',
  })
  opts?.onProgress?.({ label: 'Done', ratio: 1 })
  return result
}
