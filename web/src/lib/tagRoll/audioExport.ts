/**
 * Compatibility façade: download Tag Studio audio via composition AudioBounce.
 * Prefer {@link downloadAudio} from `application/tagRoll/downloadAudio` in new code.
 */
import { getTagStudioServices } from '../../composition/tagStudio'
import {
  downloadAudio,
  type DownloadAudioOpts,
} from '../../application/tagRoll/downloadAudio'
import type { TagRollProject } from './types'

export type AudioExportOpts = DownloadAudioOpts

export async function downloadTagRollAudio(
  project: TagRollProject,
  opts: AudioExportOpts,
): Promise<void> {
  return downloadAudio(getTagStudioServices().audioBounce, project, opts)
}
