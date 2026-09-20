import type {
  BounceFormat,
  BounceProgress,
  BounceTrack,
} from '../lib/tagRoll/audioBounce'
import type { TagRollProject } from '../lib/tagRoll/types'

export type AudioBounceOpts = {
  mix: boolean
  perPart: boolean
  partLeft?: boolean
  format?: BounceFormat
  onProgress?: (p: BounceProgress) => void
}

/** Port: offline bounce of a TagRoll project to downloadable tracks. */
export interface AudioBounce {
  bounce(project: TagRollProject, opts: AudioBounceOpts): Promise<BounceTrack[]>
}
