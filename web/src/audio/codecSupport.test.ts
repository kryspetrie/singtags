/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  noteOggOpusDecodeFailed,
  resetCodecSupportForTests,
  supportsOggOpusWebAudio,
} from './codecSupport'

describe('codecSupport', () => {
  beforeEach(() => {
    resetCodecSupportForTests()
    vi.restoreAllMocks()
  })

  it('treats empty canPlayType as no Ogg Opus', () => {
    vi.spyOn(document, 'createElement').mockReturnValue({
      canPlayType: () => '',
    } as unknown as HTMLAudioElement)
    expect(supportsOggOpusWebAudio()).toBe(false)
  })

  it('treats probably as supported', () => {
    vi.spyOn(document, 'createElement').mockReturnValue({
      canPlayType: () => 'probably',
    } as unknown as HTMLAudioElement)
    expect(supportsOggOpusWebAudio()).toBe(true)
  })

  it('latches false after noteOggOpusDecodeFailed', () => {
    vi.spyOn(document, 'createElement').mockReturnValue({
      canPlayType: () => 'probably',
    } as unknown as HTMLAudioElement)
    expect(supportsOggOpusWebAudio()).toBe(true)
    noteOggOpusDecodeFailed()
    expect(supportsOggOpusWebAudio()).toBe(false)
  })
})
