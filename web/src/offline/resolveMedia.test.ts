import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mediaUrl } from '../lib/mediaUrl'
import type { TagDetail } from '../types/tag'

vi.mock('../audio/partLeftReconstruct', () => ({
  buildUltraMixObjectUrl: vi.fn(async () => ({
    url: 'blob:reconstructed-mix',
    sampleRate: 44100,
    length: 128,
  })),
  buildPartLearningStereoObjectUrl: vi.fn(async () => ({
    url: 'blob:reconstructed-learning',
    sampleRate: 44100,
    length: 128,
  })),
  monoSoloToHardPanObjectUrl: vi.fn(async () => ({
    url: 'blob:hard-pan',
    sampleRate: 44100,
    length: 128,
  })),
  monoSoloToStereoObjectUrl: vi.fn(async (url: string) => ({
    url,
    sampleRate: 44100,
    length: 128,
  })),
}))

vi.mock('./favoritesDb', () => ({
  getStarred: vi.fn(async () => undefined),
  blobUrlFromCached: vi.fn((entry: { data: ArrayBuffer }) =>
    URL.createObjectURL(new Blob([entry.data])),
  ),
}))

vi.mock('./libraryPack', () => {
  const sheets = new Map<string, ArrayBuffer>()
  const audio = new Map<string, ArrayBuffer>()
  return {
    sheetsPack: {
      kind: 'sheets',
      has: async (url: string) => sheets.has(url),
      get: async (url: string) => (sheets.has(url) ? new Response(sheets.get(url)) : null),
      put: async (url: string, res: Response) => {
        sheets.set(url, await res.arrayBuffer())
      },
      delete: async () => true,
      clear: async () => sheets.clear(),
      count: async () => sheets.size,
      listUrls: async () => [...sheets.keys()],
    },
    audioPack: {
      kind: 'audio',
      has: async (url: string) => audio.has(url),
      get: async (url: string) =>
        audio.has(url)
          ? new Response(audio.get(url), { headers: { 'Content-Type': 'audio/ogg' } })
          : null,
      put: async (url: string, res: Response) => {
        audio.set(url, await res.arrayBuffer())
      },
      delete: async () => true,
      clear: async () => audio.clear(),
      count: async () => audio.size,
      listUrls: async () => [...audio.keys()],
    },
  }
})

const sampleDetail: TagDetail = {
  tag_id: 31,
  title: 'T',
  arranger: null,
  key: null,
  audio: {
    lead: 'media/31/lead.m4a',
    mix: 'media/31/mix.m4a',
  },
  audio_tiers: {
    lead: {
      original: 'media/31/lead.m4a',
      playback: 'media/31/lead.playback.opus',
      ultra_solo: 'media/31/lead.solo.opus',
    },
    mix: {
      original: 'media/31/mix.m4a',
      playback: 'media/31/mix.playback.opus',
    },
  },
  audio_layout_summary: { parts: 'part_right', ultra_low: 'mono_solos' },
  audio_tiers_summary: { ultra_policy: 'mono_solos', mix_only: false },
}

describe('resolvePathUrl', () => {
  beforeEach(async () => {
    const { sheetsPack, audioPack } = await import('./libraryPack')
    await sheetsPack.clear()
    await audioPack.clear()
  })

  it('returns network URL when nothing cached', async () => {
    const { resolvePathUrl } = await import('./resolveMedia')
    const r = await resolvePathUrl('sheets/1/pages/page-01.webp')
    expect(r?.kind).toBe('network')
    expect(r?.url).toBe(mediaUrl('sheets/1/pages/page-01.webp'))
    if (r?.kind === 'network') expect(r.path).toBe('sheets/1/pages/page-01.webp')
  })

  it('returns pack blob when cached', async () => {
    const { sheetsPack } = await import('./libraryPack')
    const { resolvePathUrl } = await import('./resolveMedia')
    const url = mediaUrl('sheets/1/pages/page-01.webp')
    await sheetsPack.put(
      url,
      new Response(new Uint8Array(64).fill(7), {
        headers: { 'Content-Type': 'image/webp' },
      }),
    )
    const r = await resolvePathUrl('sheets/1/pages/page-01.webp', { offlineOnly: true })
    expect(r?.kind).toBe('blob')
    expect(r?.source).toBe('pack')
    if (r?.kind === 'blob') URL.revokeObjectURL(r.url)
  })

  it('returns null offlineOnly when missing', async () => {
    const { resolvePathUrl } = await import('./resolveMedia')
    const r = await resolvePathUrl('sheets/9/pages/page-01.webp', { offlineOnly: true })
    expect(r).toBeNull()
  })
})

describe('resolveAudioPart', () => {
  beforeEach(async () => {
    vi.stubGlobal('AudioContext', class MockAudioContext {} as typeof AudioContext)
    const { sheetsPack, audioPack } = await import('./libraryPack')
    const { clearLearningStereoCache } = await import('./resolveMedia')
    await sheetsPack.clear()
    await audioPack.clear()
    clearLearningStereoCache()
    vi.clearAllMocks()
  })

  it('online prefers playback network when nothing cached', async () => {
    const { resolveAudioPart } = await import('./resolveMedia')
    const r = await resolveAudioPart(sampleDetail, 'lead')
    expect(r?.kind).toBe('network')
    if (r?.kind === 'network') {
      expect(r.path).toBe('media/31/lead.playback.opus')
      expect(r.tier).toBe('playback')
    }
  })

  it('uses starred original before network', async () => {
    const { resolveAudioPart } = await import('./resolveMedia')
    const r = await resolveAudioPart(sampleDetail, 'lead', {
      starred: {
        tagId: 31,
        starredAt: 'x',
        summary: {
          id: 31,
          title: 'T',
          arranger: null,
          key: null,
          rating: null,
          type: null,
          collection: null,
          hasSheet: false,
          audioParts: ['lead'],
          sheet: null,
        },
        detail: sampleDetail,
        offlineMedia: true,
        audioBlobs: {
          lead: {
            path: 'media/31/lead.m4a',
            mime: 'audio/mp4',
            data: new Uint8Array(64).fill(7).buffer,
            quality: 'original',
          },
        },
      },
    })
    expect(r?.kind).toBe('blob')
    expect(r?.source).toBe('star')
    if (r?.kind === 'blob') {
      expect(r.tier).toBe('original')
      URL.revokeObjectURL(r.url)
    }
  })

  
  it('offline prefers cached playback over ultra for the selected part', async () => {
    const { audioPack } = await import('./libraryPack')
    const { resolveAudioPart, clearLearningStereoCache } = await import('./resolveMedia')
    clearLearningStereoCache()
    const detail: TagDetail = {
      ...sampleDetail,
      audio: {
        ...sampleDetail.audio,
        tenor: 'media/31/tenor.m4a',
        bari: 'media/31/bari.m4a',
      },
      audio_layout_summary: { parts: 'part_left', ultra_low: 'mono_solos' },
      audio_tiers: {
        ...sampleDetail.audio_tiers!,
        lead: {
          original: 'media/31/lead.m4a',
          playback: 'media/31/lead.playback.opus',
          ultra_solo: 'media/31/lead.solo.opus',
        },
        tenor: {
          original: 'media/31/tenor.m4a',
          playback: 'media/31/tenor.playback.opus',
          ultra_solo: 'media/31/tenor.solo.opus',
        },
        bari: {
          original: 'media/31/bari.m4a',
          playback: 'media/31/bari.playback.opus',
          ultra_solo: 'media/31/bari.solo.opus',
        },
      },
    }
    // Lead HQ playback + all ultra solos present
    await audioPack.put(
      mediaUrl('media/31/lead.playback.opus'),
      new Response(new Uint8Array(64).fill(3), { headers: { 'Content-Type': 'audio/ogg' } }),
    )
    for (const p of ['lead', 'tenor', 'bari']) {
      await audioPack.put(
        mediaUrl(`media/31/${p}.solo.opus`),
        new Response(new Uint8Array(64).fill(7), { headers: { 'Content-Type': 'audio/ogg' } }),
      )
    }
    const lead = await resolveAudioPart(detail, 'lead', { offlineOnly: true })
    expect(lead?.kind).toBe('blob')
    expect(lead?.source).toBe('pack')
    expect(lead?.tier).toBe('playback')
    if (lead?.kind === 'blob') URL.revokeObjectURL(lead.url)

    // Bari has no HQ — still reconstruct from ultra
    const { buildPartLearningStereoObjectUrl } = await import('../audio/partLeftReconstruct')
    vi.mocked(buildPartLearningStereoObjectUrl).mockClear()
    const bari = await resolveAudioPart(detail, 'bari', { offlineOnly: true })
    expect(bari?.kind).toBe('blob')
    expect(bari?.source).toBe('reconstruct')
    expect(buildPartLearningStereoObjectUrl).toHaveBeenCalled()
    if (bari?.kind === 'blob') URL.revokeObjectURL(bari.url)
  })

  it('online returns pack playback when already cached (no network)', async () => {
    const { audioPack } = await import('./libraryPack')
    const { resolveAudioPart, clearLearningStereoCache } = await import('./resolveMedia')
    clearLearningStereoCache()
    await audioPack.put(
      mediaUrl('media/31/lead.playback.opus'),
      new Response(new Uint8Array(64).fill(3), { headers: { 'Content-Type': 'audio/ogg' } }),
    )
    const r = await resolveAudioPart(sampleDetail, 'lead')
    expect(r?.kind).toBe('blob')
    expect(r?.source).toBe('pack')
    expect(r?.tier).toBe('playback')
    if (r?.kind === 'blob') URL.revokeObjectURL(r.url)
  })


  it('offline uses ultra solo from pack', async () => {
    const { audioPack } = await import('./libraryPack')
    const { resolveAudioPart } = await import('./resolveMedia')
    await audioPack.put(
      mediaUrl('media/31/lead.solo.opus'),
      new Response(new Uint8Array(64).fill(7), { headers: { 'Content-Type': 'audio/ogg' } }),
    )
    const r = await resolveAudioPart(sampleDetail, 'lead', { offlineOnly: true })
    expect(r?.kind).toBe('blob')
    // Solo-only pack → hard-pan stereo (labeled reconstruct when cached)
    expect(r?.source).toBe('reconstruct')
    if (r?.kind === 'blob') {
      expect(r.url).toBe('blob:hard-pan')
      expect(r.tier).toBe('ultra')
    }
  })

  it('offline reconstructs mix from cached voice solos', async () => {
    const { audioPack } = await import('./libraryPack')
    const { resolveAudioPart } = await import('./resolveMedia')
    const detail: TagDetail = {
      ...sampleDetail,
      audio: {
        ...sampleDetail.audio,
        tenor: 'media/31/tenor.m4a',
      },
      audio_layout_summary: { parts: 'mono', ultra_low: 'mono_downmix' },
      audio_tiers_summary: { ultra_policy: 'mono_downmix', mix_only: false },
      audio_tiers: {
        ...sampleDetail.audio_tiers!,
        tenor: {
          original: 'media/31/tenor.m4a',
          playback: 'media/31/tenor.playback.opus',
          ultra_solo: 'media/31/tenor.solo.opus',
        },
        lead: {
          original: 'media/31/lead.m4a',
          playback: 'media/31/lead.playback.opus',
          ultra_downmix: 'media/31/lead.downmix.opus',
          ultra_solo: 'media/31/lead.solo.opus',
        },
      },
    }
    await audioPack.put(
      mediaUrl('media/31/lead.solo.opus'),
      new Response(new Uint8Array(64).fill(7), { headers: { 'Content-Type': 'audio/ogg' } }),
    )
    await audioPack.put(
      mediaUrl('media/31/tenor.solo.opus'),
      new Response(new Uint8Array(64).fill(7), { headers: { 'Content-Type': 'audio/ogg' } }),
    )
    const r = await resolveAudioPart(detail, 'mix', { offlineOnly: true })
    expect(r?.kind).toBe('blob')
    expect(r?.source).toBe('reconstruct')
    if (r?.kind === 'blob') expect(r.url).toBe('blob:reconstructed-mix')
  })

  it('offline falls back to hard-pan solo when no accompaniment stems are cached', async () => {
    const { audioPack } = await import('./libraryPack')
    const { buildPartLearningStereoObjectUrl, monoSoloToHardPanObjectUrl } = await import(
      '../audio/partLeftReconstruct'
    )
    const { resolveAudioPart, clearLearningStereoCache } = await import('./resolveMedia')
    clearLearningStereoCache()
    vi.mocked(buildPartLearningStereoObjectUrl).mockClear()
    vi.mocked(monoSoloToHardPanObjectUrl).mockClear()
    const detail: TagDetail = {
      ...sampleDetail,
      audio: {
        ...sampleDetail.audio,
        tenor: 'media/31/tenor.m4a',
        bass: 'media/31/bass.m4a',
        bari: 'media/31/bari.m4a',
      },
      audio_layout_summary: { parts: 'part_right', ultra_low: 'mono_solos', solo_side: 'right' },
      audio_tiers: {
        ...sampleDetail.audio_tiers!,
        tenor: {
          original: 'media/31/tenor.m4a',
          playback: 'media/31/tenor.playback.opus',
          ultra_solo: 'media/31/tenor.solo.opus',
        },
        bass: {
          original: 'media/31/bass.m4a',
          playback: 'media/31/bass.playback.opus',
          ultra_solo: 'media/31/bass.solo.opus',
        },
        bari: {
          original: 'media/31/bari.m4a',
          playback: 'media/31/bari.playback.opus',
          ultra_solo: 'media/31/bari.solo.opus',
        },
      },
    }
    await audioPack.put(
      mediaUrl('media/31/lead.solo.opus'),
      new Response(new Uint8Array(64).fill(7), { headers: { 'Content-Type': 'audio/ogg' } }),
    )
    // No other stems — hard-pan solo (never dual-mono)
    const r = await resolveAudioPart(detail, 'lead', { offlineOnly: true })
    expect(r?.kind).toBe('blob')
    expect(buildPartLearningStereoObjectUrl).not.toHaveBeenCalled()
    expect(monoSoloToHardPanObjectUrl).toHaveBeenCalledWith(expect.any(String), 'left')
    if (r?.kind === 'blob') expect(r.url).toBe('blob:hard-pan')
  })

  it('offline reconstructs learning stereo with partial accompaniment stems', async () => {
    const { audioPack } = await import('./libraryPack')
    const { buildPartLearningStereoObjectUrl, monoSoloToHardPanObjectUrl } = await import(
      '../audio/partLeftReconstruct'
    )
    const { resolveAudioPart, clearLearningStereoCache } = await import('./resolveMedia')
    clearLearningStereoCache()
    vi.mocked(buildPartLearningStereoObjectUrl).mockClear()
    vi.mocked(monoSoloToHardPanObjectUrl).mockClear()
    const detail: TagDetail = {
      ...sampleDetail,
      audio: {
        ...sampleDetail.audio,
        tenor: 'media/31/tenor.m4a',
        bass: 'media/31/bass.m4a',
        bari: 'media/31/bari.m4a',
      },
      audio_layout_summary: { parts: 'part_right', ultra_low: 'mono_solos', solo_side: 'right' },
      audio_tiers: {
        ...sampleDetail.audio_tiers!,
        tenor: {
          original: 'media/31/tenor.m4a',
          playback: 'media/31/tenor.playback.opus',
          ultra_solo: 'media/31/tenor.solo.opus',
        },
        bass: {
          original: 'media/31/bass.m4a',
          playback: 'media/31/bass.playback.opus',
          ultra_solo: 'media/31/bass.solo.opus',
        },
        bari: {
          original: 'media/31/bari.m4a',
          playback: 'media/31/bari.playback.opus',
          ultra_solo: 'media/31/bari.solo.opus',
        },
      },
    }
    await audioPack.put(
      mediaUrl('media/31/lead.solo.opus'),
      new Response(new Uint8Array(64).fill(7), { headers: { 'Content-Type': 'audio/ogg' } }),
    )
    await audioPack.put(
      mediaUrl('media/31/tenor.solo.opus'),
      new Response(new Uint8Array(64).fill(7), { headers: { 'Content-Type': 'audio/ogg' } }),
    )
    const r = await resolveAudioPart(detail, 'lead', { offlineOnly: true })
    expect(r?.kind).toBe('blob')
    expect(r?.source).toBe('reconstruct')
    expect(buildPartLearningStereoObjectUrl).toHaveBeenCalled()
    expect(monoSoloToHardPanObjectUrl).not.toHaveBeenCalled()
    if (r?.kind === 'blob') expect(r.url).toBe('blob:reconstructed-learning')
  })

  it('offline reconstructs learning stereo for part when accompaniment stems cached', async () => {
    const { audioPack } = await import('./libraryPack')
    const { buildPartLearningStereoObjectUrl } = await import('../audio/partLeftReconstruct')
    const { resolveAudioPart, clearLearningStereoCache } = await import('./resolveMedia')
    clearLearningStereoCache()
    const detail: TagDetail = {
      ...sampleDetail,
      audio: {
        ...sampleDetail.audio,
        tenor: 'media/31/tenor.m4a',
        bass: 'media/31/bass.m4a',
      },
      audio_layout_summary: { parts: 'part_left', ultra_low: 'mono_solos' },
      audio_tiers: {
        ...sampleDetail.audio_tiers!,
        tenor: {
          original: 'media/31/tenor.m4a',
          playback: 'media/31/tenor.playback.opus',
          ultra_solo: 'media/31/tenor.solo.opus',
        },
        bass: {
          original: 'media/31/bass.m4a',
          playback: 'media/31/bass.playback.opus',
          ultra_solo: 'media/31/bass.solo.opus',
        },
      },
    }
    await audioPack.put(
      mediaUrl('media/31/lead.solo.opus'),
      new Response(new Uint8Array(64).fill(7), { headers: { 'Content-Type': 'audio/ogg' } }),
    )
    await audioPack.put(
      mediaUrl('media/31/tenor.solo.opus'),
      new Response(new Uint8Array(64).fill(7), { headers: { 'Content-Type': 'audio/ogg' } }),
    )
    await audioPack.put(
      mediaUrl('media/31/bass.solo.opus'),
      new Response(new Uint8Array(64).fill(7), { headers: { 'Content-Type': 'audio/ogg' } }),
    )
    const r = await resolveAudioPart(detail, 'lead', { offlineOnly: true })
    const { monoSoloToHardPanObjectUrl } = await import('../audio/partLeftReconstruct')
    expect(r?.kind).toBe('blob')
    expect(buildPartLearningStereoObjectUrl).toHaveBeenCalled()
    expect(monoSoloToHardPanObjectUrl).not.toHaveBeenCalled()
    if (r?.kind === 'blob') {
      expect(r.url).toBe('blob:reconstructed-learning')
      URL.revokeObjectURL(r.url)
    }

    // Session cache: second resolve should not rebuild
    vi.mocked(buildPartLearningStereoObjectUrl).mockClear()
    const r2 = await resolveAudioPart(detail, 'lead', { offlineOnly: true })
    expect(buildPartLearningStereoObjectUrl).not.toHaveBeenCalled()
    expect(r2?.kind).toBe('blob')
    if (r2?.kind === 'blob') expect(r2.url).toBe('blob:reconstructed-learning')
  })

  it('offline reconstructs learning stereo from starred lofi solos (no pack)', async () => {
    const { buildPartLearningStereoObjectUrl, monoSoloToHardPanObjectUrl } = await import(
      '../audio/partLeftReconstruct'
    )
    const { resolveAudioPart, clearLearningStereoCache } = await import('./resolveMedia')
    clearLearningStereoCache()
    vi.mocked(buildPartLearningStereoObjectUrl).mockClear()
    vi.mocked(monoSoloToHardPanObjectUrl).mockClear()

    const detail: TagDetail = {
      ...sampleDetail,
      audio: {
        lead: 'media/31/lead.m4a',
        tenor: 'media/31/tenor.m4a',
        bari: 'media/31/bari.m4a',
        bass: 'media/31/bass.m4a',
      },
      audio_layout_summary: {
        parts: 'part_right',
        ultra_low: 'mono_solos',
        solo_side: 'right',
      },
      audio_tiers: {
        lead: {
          original: 'media/31/lead.m4a',
          playback: 'media/31/lead.playback.opus',
          ultra_solo: 'media/31/lead.solo.opus',
        },
        tenor: {
          original: 'media/31/tenor.m4a',
          playback: 'media/31/tenor.playback.opus',
          ultra_solo: 'media/31/tenor.solo.opus',
        },
        bari: {
          original: 'media/31/bari.m4a',
          playback: 'media/31/bari.playback.opus',
          ultra_solo: 'media/31/bari.solo.opus',
        },
        bass: {
          original: 'media/31/bass.m4a',
          playback: 'media/31/bass.playback.opus',
          ultra_solo: 'media/31/bass.solo.opus',
        },
      },
    }
    const starred = {
      tagId: 31,
      starredAt: '2026-01-01T00:00:00.000Z',
      summary: {
        id: 31,
        title: 'T',
        arranger: null,
        key: null,
        rating: null,
        type: null,
        collection: null,
        hasSheet: false,
        audioParts: ['lead', 'tenor', 'bari', 'bass'],
        sheet: null,
      },
      detail,
      audioBlobs: {
        lead: {
          path: 'media/31/lead.solo.opus',
          mime: 'audio/ogg',
          data: new ArrayBuffer(4),
          quality: 'lofi' as const,
        },
        tenor: {
          path: 'media/31/tenor.solo.opus',
          mime: 'audio/ogg',
          data: new ArrayBuffer(4),
          quality: 'lofi' as const,
        },
        bari: {
          path: 'media/31/bari.solo.opus',
          mime: 'audio/ogg',
          data: new ArrayBuffer(4),
          quality: 'lofi' as const,
        },
        bass: {
          path: 'media/31/bass.solo.opus',
          mime: 'audio/ogg',
          data: new ArrayBuffer(4),
          quality: 'lofi' as const,
        },
      },
      offlineMedia: true,
    }

    const r = await resolveAudioPart(detail, 'lead', { offlineOnly: true, starred })
    expect(r?.kind).toBe('blob')
    expect(buildPartLearningStereoObjectUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        activePart: 'lead',
        soloSide: 'left',
        otherParts: expect.arrayContaining([
          expect.objectContaining({ part: 'tenor' }),
          expect.objectContaining({ part: 'bari' }),
          expect.objectContaining({ part: 'bass' }),
        ]),
      }),
    )
    expect(monoSoloToHardPanObjectUrl).not.toHaveBeenCalled()
    if (r?.kind === 'blob') expect(r.url).toBe('blob:reconstructed-learning')
  })

  it('probeAvailableAudioParts hides offline mix without cached stems', async () => {
    const { probeAvailableAudioParts } = await import('./resolveMedia')
    const parts = await probeAvailableAudioParts(sampleDetail, { offlineOnly: true })
    expect(parts).toEqual([])
  })

  it('probeAvailableAudioParts includes mix when two solos are cached', async () => {
    const { audioPack } = await import('./libraryPack')
    const { probeAvailableAudioParts } = await import('./resolveMedia')
    await audioPack.put(
      mediaUrl('media/31/lead.solo.opus'),
      new Response(new Uint8Array(64).fill(7), { headers: { 'Content-Type': 'audio/ogg' } }),
    )
    await audioPack.put(
      mediaUrl('media/31/tenor.solo.opus'),
      new Response(new Uint8Array(64).fill(7), { headers: { 'Content-Type': 'audio/ogg' } }),
    )
    const detail: TagDetail = {
      ...sampleDetail,
      audio: { ...sampleDetail.audio, tenor: 'media/31/tenor.m4a' },
      audio_tiers: {
        ...sampleDetail.audio_tiers!,
        tenor: {
          original: 'media/31/tenor.m4a',
          playback: 'media/31/tenor.playback.opus',
          ultra_solo: 'media/31/tenor.solo.opus',
        },
      },
    }
    const parts = await probeAvailableAudioParts(detail, { offlineOnly: true })
    expect(parts).toContain('lead')
    expect(parts).toContain('tenor')
    expect(parts).toContain('mix')
  })

  it('probeAvailableAudioParts finds starred blobs with mismatched part casing', async () => {
    const { probeAvailableAudioParts } = await import('./resolveMedia')
    const parts = await probeAvailableAudioParts(sampleDetail, {
      offlineOnly: true,
      starred: {
        tagId: 31,
        starredAt: '2026-01-01T00:00:00.000Z',
        summary: {
          id: 31,
          title: 'T',
          arranger: null,
          key: null,
          rating: null,
          type: null,
          collection: null,
          hasSheet: false,
          audioParts: ['Lead'],
          sheet: null,
        },
        detail: sampleDetail,
        audioBlobs: {
          Lead: { path: 'media/31/lead.m4a', mime: 'audio/mp4', data: new ArrayBuffer(4) },
        },
        offlineMedia: true,
      },
    })
    expect(parts.map((p) => p.toLowerCase())).toContain('lead')
  })

  it('probeAvailableAudioParts finds original-only pack hits offline', async () => {
    const { audioPack } = await import('./libraryPack')
    const { probeAvailableAudioParts, probeTagAudioAvailability } = await import('./resolveMedia')
    await audioPack.put(
      mediaUrl('media/31/lead.m4a'),
      new Response(new Uint8Array(64).fill(7), { headers: { 'Content-Type': 'audio/mp4' } }),
    )
    const originalsOnly: TagDetail = {
      tag_id: 31,
      title: 'T',
      arranger: null,
      key: null,
      audio: { lead: 'media/31/lead.m4a', mix: 'media/31/mix.m4a' },
    }
    const parts = await probeAvailableAudioParts(originalsOnly, { offlineOnly: true })
    expect(parts).toContain('lead')
    const avail = await probeTagAudioAvailability(originalsOnly, { offlineOnly: true })
    expect(avail.hasPackAudio).toBe(true)
    expect(avail.parts).toContain('lead')
  })

  it('probeTagAudioAvailability batches pack checks without listUrls', async () => {
    const { audioPack } = await import('./libraryPack')
    const { probeTagAudioAvailability } = await import('./resolveMedia')
    const detail: TagDetail = {
      ...sampleDetail,
      audio: {
        lead: 'media/31/lead.m4a',
        bari: 'media/31/bari.m4a',
        bass: 'media/31/bass.m4a',
        tenor: 'media/31/tenor.m4a',
        mix: 'media/31/mix.m4a',
      },
      audio_tiers: {
        lead: {
          original: 'media/31/lead.m4a',
          ultra_solo: 'media/31/lead.solo.opus',
        },
        bari: { original: 'media/31/bari.m4a', ultra_solo: 'media/31/bari.solo.opus' },
        bass: { original: 'media/31/bass.m4a', ultra_solo: 'media/31/bass.solo.opus' },
        tenor: { original: 'media/31/tenor.m4a', ultra_solo: 'media/31/tenor.solo.opus' },
        mix: { original: 'media/31/mix.m4a' },
      },
    }
    for (const part of ['lead', 'bari', 'bass', 'tenor'] as const) {
      await audioPack.put(
        mediaUrl(`media/31/${part}.solo.opus`),
        new Response(new Uint8Array(64).fill(3), { headers: { 'Content-Type': 'audio/ogg' } }),
      )
    }
    const listSpy = vi.spyOn(audioPack, 'listUrls')
    const avail = await probeTagAudioAvailability(detail, { offlineOnly: true })
    expect(avail.parts).toEqual(expect.arrayContaining(['lead', 'bari', 'bass', 'tenor', 'mix']))
    expect(avail.hasPackAudio).toBe(true)
    expect(listSpy).not.toHaveBeenCalled()
    listSpy.mockRestore()
  })
})
