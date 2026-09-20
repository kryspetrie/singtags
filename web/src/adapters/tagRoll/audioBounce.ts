import { bounceTagRollTracks } from '../../lib/tagRoll/audioBounce'
import type { AudioBounce } from '../../ports/AudioBounce'

export function createAudioBounce(): AudioBounce {
  return {
    bounce: bounceTagRollTracks,
  }
}
