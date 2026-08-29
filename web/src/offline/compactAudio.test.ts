import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('../download/encode', () => ({
  encodeDecodedBytes: vi.fn(async () => new Uint8Array([1, 2, 3])),
}))

describe('compactAudio', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(new Uint8Array([9, 8, 7]), {
          status: 200,
          headers: { 'Content-Type': 'audio/ogg' },
        }),
      ),
    )
  })

  it('skips re-encode for published opus paths', async () => {
    const { fetchAudioForStorage } = await import('./compactAudio')
    const { encodeDecodedBytes } = await import('../download/encode')
    const out = await fetchAudioForStorage('media/1/lead.playback.opus', 'standard')
    expect(out?.encoded).toBe(false)
    expect(encodeDecodedBytes).not.toHaveBeenCalled()
  })

  it('re-encodes hosted m4a when quality is not original', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(new Uint8Array([9, 8, 7]), {
          status: 200,
          headers: { 'Content-Type': 'audio/mp4' },
        }),
      ),
    )
    const { fetchAudioForStorage } = await import('./compactAudio')
    const { encodeDecodedBytes } = await import('../download/encode')
    const out = await fetchAudioForStorage('media/1/lead.m4a', 'standard')
    expect(out?.encoded).toBe(true)
    expect(encodeDecodedBytes).toHaveBeenCalled()
  })

  it('falls back to original bytes when decode/re-encode fails', async () => {
    const { encodeDecodedBytes } = await import('../download/encode')
    vi.mocked(encodeDecodedBytes).mockRejectedValueOnce(new Error('Unable to decode audio data'))
    const { encodeBytesForStorage, sniffAudioMime } = await import('./compactAudio')
    const mp3 = new Uint8Array([0xff, 0xfb, 0x90, 0x00, ...new Array(60).fill(0)])
    expect(sniffAudioMime(mp3)).toBe('audio/mpeg')
    const out = await encodeBytesForStorage(mp3, 'standard', 'application/octet-stream', 'x/Lead.bin')
    expect(out.mime).toBe('audio/mpeg')
    expect([...out.bytes]).toEqual([...mp3])
  })

  it('refuses to store HTML/JSON poison', async () => {
    const { encodeBytesForStorage } = await import('./compactAudio')
    await expect(
      encodeBytesForStorage(
        new TextEncoder().encode('<!DOCTYPE html><html></html>'),
        'standard',
      ),
    ).rejects.toThrow(/non-audio/)
    await expect(
      encodeBytesForStorage(new TextEncoder().encode('{"tag_id":1}'), 'standard'),
    ).rejects.toThrow(/non-audio/)
  })

  it('returns null when fetch body is HTML/JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response('<!DOCTYPE html><html></html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        }),
      ),
    )
    const { fetchAudioForStorage } = await import('./compactAudio')
    expect(await fetchAudioForStorage('media/1/lead.m4a', 'original')).toBeNull()
  })
})
