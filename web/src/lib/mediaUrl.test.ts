import { describe, expect, it, vi } from 'vitest'
import { mediaBaseUrl, mediaUrl, tagDetailUrl, indexesUrl } from './mediaUrl'

describe('mediaUrl', () => {
  it('prefixes relative paths', () => {
    expect(mediaUrl('media/1/lead.m4a')).toBe('/sample-data/media/1/lead.m4a')
    expect(tagDetailUrl(9)).toBe('/sample-data/tags/9/metadata.json')
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
    vi.stubEnv('VITE_MEDIA_BASE', 'https://cdn.example/media/')
    expect(mediaBaseUrl()).toBe('https://cdn.example/media')
    expect(mediaUrl('a.m4a')).toBe('https://cdn.example/media/a.m4a')
    vi.unstubAllEnvs()
  })
})
