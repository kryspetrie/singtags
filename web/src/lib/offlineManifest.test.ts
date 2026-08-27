import { describe, expect, it } from 'vitest'
import { filterAudioManifest, flattenFilteredAudioManifest, estimateAudioDownloadBytes } from './offlineManifest'
import type { OfflineManifest } from '../offline/manifestTypes'

const manifest: OfflineManifest = {
  version: 1,
  kind: 'audio',
  builtAt: '2026-01-01',
  totalBytes: 1900,
  entries: [
    {
      tagId: 1,
      paths: ['media/1/lead.m4a', 'media/1/mix.m4a', 'media/1/tenor.m4a'],
      bytes: 900,
    },
    {
      tagId: 2,
      paths: ['media/2/bass.m4a', 'media/2/mix.m4a'],
      bytes: 1000,
    },
  ],
}

describe('offlineManifest', () => {
  it('pathMatchesParts still supports legacy mix filter in manifest helper', () => {
    const { entries, fileCount } = filterAudioManifest(manifest, 'mix', [])
    expect(entries[0]?.paths).toEqual(['media/1/mix.m4a'])
    expect(fileCount).toBe(2)
  })

  it('library download uses all manifest paths', () => {
    const { fileCount } = filterAudioManifest(manifest, 'all', [])
    expect(fileCount).toBe(5)
  })

  it('filters to custom parts', () => {
    const { fileCount } = filterAudioManifest(manifest, 'custom', ['lead', 'bass'])
    expect(fileCount).toBe(2)
  })

  it('orders mix tracks first when downloading all parts', () => {
    const items = flattenFilteredAudioManifest(manifest, 'all', [])
    const paths = items.map((i) => i.path)
    expect(paths.slice(0, 2)).toEqual(['media/1/mix.m4a', 'media/2/mix.m4a'])
    expect(paths).toContain('media/1/lead.m4a')
  })

  it('does not shrink estimate when manifest uses published opus tiers', () => {
    const opusManifest: OfflineManifest = {
      version: 1,
      kind: 'audio',
      builtAt: '2026-01-01',
      totalBytes: 1000,
      entries: [
        {
          tagId: 31,
          paths: ['media/31/lead.solo.opus', 'media/31/mix.ultra_mix.opus'],
          bytes: 1000,
        },
      ],
    }
    expect(estimateAudioDownloadBytes(opusManifest, 'all', [], 'lofi')).toBe(1000)
    expect(estimateAudioDownloadBytes(manifest, 'all', [], 'lofi')).toBe(Math.round(1900 * 0.3))
  })
})
