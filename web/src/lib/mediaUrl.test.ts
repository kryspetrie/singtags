import { describe, expect, it, vi } from 'vitest'
import { mediaBaseUrl, mediaUrl, tagDetailUrl, indexesUrl } from './mediaUrl'

describe('mediaUrl', () => {
  it('prefixes relative paths with /library by default', () => {
    expect(mediaUrl('Some Tag/Lead.mp3')).toBe('/library/Some Tag/Lead.mp3')
    expect(tagDetailUrl(9)).toBe('/tags/9/metadata.json')
    expect(indexesUrl('core.json.gz')).toBe('/indexes/core.json.gz')
  })

  it('leaves absolute and blob URLs alone', () => {
    expect(mediaUrl('/x')).toBe('/x')
    expect(mediaUrl('blob:abc')).toBe('blob:abc')
    expect(mediaUrl('https://cdn.example/a')).toBe('https://cdn.example/a')
    expect(mediaUrl('http://cdn.example/a')).toBe('http://cdn.example/a')
    expect(mediaUrl('data:text/plain,hi')).toBe('data:text/plain,hi')
  })

  it('respects VITE_MEDIA_BASE when set', () => {
    vi.stubEnv('VITE_MEDIA_BASE', 'https://cdn.example/library/')
    expect(mediaBaseUrl()).toBe('https://cdn.example/library')
    expect(mediaUrl('a.m4a')).toBe('https://cdn.example/library/a.m4a')
    expect(tagDetailUrl(3)).toBe('/tags/3/metadata.json')
    vi.unstubAllEnvs()
  })
})
