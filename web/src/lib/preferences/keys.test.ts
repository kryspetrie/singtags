/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest'
import {
  LEGACY_AUDIO_QUALITY_KEY,
  PITCH_PIPE_PREFS_KEY,
  SOLO_IN_FILE_KEY,
} from './keys'

describe('preferences keys', () => {
  it('exports stable localStorage key names', () => {
    expect(SOLO_IN_FILE_KEY).toBe('singtags.partSoloInFile.v1')
    expect(PITCH_PIPE_PREFS_KEY).toBe('singtags.pitchPipe.v1')
    expect(LEGACY_AUDIO_QUALITY_KEY).toBe('singtags.audioEncodeQuality.v1')
  })
})
