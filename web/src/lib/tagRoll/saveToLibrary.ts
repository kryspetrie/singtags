/**
 * Compatibility façade: save Tag Studio → My Library via composition root.
 * Prefer {@link saveTagRollToLibrary} from `application/tagRoll/saveToLibrary` in new code.
 */
import { getTagStudioServices } from '../../composition/tagStudio'
import {
  saveTagRollToLibrary as saveViaUseCase,
  type SaveTagRollToLibraryProgress,
} from '../../application/tagRoll/saveToLibrary'
import type { TagRollProject } from './types'

export type { SaveTagRollToLibraryProgress }

export async function saveTagRollToLibrary(
  project: TagRollProject,
  opts?: {
    mix?: boolean
    perPart?: boolean
    updateLinked?: boolean
    onProgress?: (p: SaveTagRollToLibraryProgress) => void
  },
): Promise<{ entryId: string }> {
  const services = getTagStudioServices()
  return saveViaUseCase(
    project,
    {
      audioBounce: services.audioBounce,
      libraryIngest: services.libraryIngest,
    },
    opts,
  )
}
