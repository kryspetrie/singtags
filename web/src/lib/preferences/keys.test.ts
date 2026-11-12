/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest'
import {
  LEGACY_AUDIO_QUALITY_KEY,
  LEGACY_TAG_STUDIO_ENABLED_KEY,
  PITCH_PIPE_PREFS_KEY,
  SOLO_IN_FILE_KEY,
  TAG_ROLL_CELL_H_KEY,
  TAG_ROLL_CELL_W_KEY,
  TAG_ROLL_ENABLED_KEY,
} from './keys'

describe('preferences keys', () => {
  it('exports stable localStorage key names', () => {
    expect(SOLO_IN_FILE_KEY).toBe('singtags.partSoloInFile.v1')
    expect(PITCH_PIPE_PREFS_KEY).toBe('singtags.pitchPipe.v1')
    expect(LEGACY_AUDIO_QUALITY_KEY).toBe('singtags.audioEncodeQuality.v1')
    expect(TAG_ROLL_ENABLED_KEY).toBe('singtags.labs.tagRoll.enabled.v1')
    expect(TAG_ROLL_CELL_W_KEY).toBe('singtags.labs.tagRoll.cellW.v1')
    expect(TAG_ROLL_CELL_H_KEY).toBe('singtags.labs.tagRoll.cellH.v1')
    expect(LEGACY_TAG_STUDIO_ENABLED_KEY).toBe('singtags.labs.tagStudio.enabled.v1')
  })
})

