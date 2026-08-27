import { describe, expect, it } from 'vitest'
import type { TagDetail } from '../types/tag'
import {
  cachedPathCandidates,
  catalogOriginalPaths,
  inferLowerQualityFromStarred,
  isMixOnlyTag,
  isPublishedTierPath,
  onlinePlaybackPaths,
  originalAudioPath,
  playableAudioParts,
  playbackAudioPath,
  storageAudioPath,
  ultraAudioPath,
  usesMonoSolos,
  canOfferReconstructedMix,
  mixIsDisjoint,
} from './audioTiers'

function detail(partial: Partial<TagDetail> & Pick<TagDetail, 'tag_id' | 'audio'>): TagDetail {
  return {
    title: 'T',
    arranger: null,
    key: null,
    ...partial,
  }
}

describe('audioTiers', () => {
  const monoSolos = detail({
    tag_id: 31,
    audio: {
      lead: 'media/31/lead.m4a',
      tenor: 'media/31/tenor.m4a',
      bari: 'media/31/bari.m4a',
      bass: 'media/31/bass.m4a',
      mix: 'media/31/mix.m4a',
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
      mix: {
        original: 'media/31/mix.m4a',
        playback: 'media/31/mix.playback.opus',
      },
    },
    audio_layout_summary: { parts: 'part_right', ultra_low: 'mono_solos', solo_side: 'right' },
    audio_tiers_summary: { ultra_policy: 'mono_solos', mix_only: false, playback_kbps: 64 },
  })

  const mixOnly = detail({
    tag_id: 3,
    audio: { mix: 'media/3/mix.m4a' },
    audio_tiers: {
      mix: {
        original: 'media/3/mix.m4a',
        playback: 'media/3/mix.playback.opus',
        ultra_mix: 'media/3/mix.ultra_mix.opus',
      },
    },
    audio_layout_summary: { parts: 'unknown', ultra_low: 'stereo_fallback' },
    audio_tiers_summary: { ultra_policy: 'stereo_fallback', mix_only: true, playback_kbps: 64 },
  })

  it('prefers playback for online paths', () => {
    expect(playbackAudioPath(monoSolos, 'lead')).toBe('media/31/lead.playback.opus')
    expect(onlinePlaybackPaths(monoSolos).lead).toBe('media/31/lead.playback.opus')
    expect(catalogOriginalPaths(monoSolos).lead).toBe('media/31/lead.m4a')
  })

  it('falls back to legacy audio when tiers missing', () => {
    const legacy = detail({
      tag_id: 1,
      audio: { lead: 'media/1/lead.m4a' },
    })
    expect(originalAudioPath(legacy, 'lead')).toBe('media/1/lead.m4a')
    expect(playbackAudioPath(legacy, 'lead')).toBe('media/1/lead.m4a')
  })

  it('selects ultra solos and skips mix for mono_solos', () => {
    expect(usesMonoSolos(monoSolos)).toBe(true)
    expect(ultraAudioPath(monoSolos, 'lead')).toBe('media/31/lead.solo.opus')
    expect(ultraAudioPath(monoSolos, 'mix')).toBeNull()
  })

  it('selects hosted ultra_mix when mix is disjoint from voice parts', () => {
    const disjoint = detail({
      audio_layout_summary: {
        parts: 'part_left',
        ultra_low: 'mono_solos',
        mix_disjoint: true,
        mix_cache: 'hosted',
      },
      audio_tiers: {
        lead: { ultra_solo: 'media/99/lead.solo.opus' },
        mix: { ultra_mix: 'media/99/mix.ultra_mix.opus', playback: 'media/99/mix.playback.opus' },
      },
    })
    expect(mixIsDisjoint(disjoint)).toBe(true)
    expect(ultraAudioPath(disjoint, 'mix')).toBe('media/99/mix.ultra_mix.opus')
    expect(canOfferReconstructedMix(disjoint)).toBe(false)
    expect(storageAudioPath(disjoint, 'mix', 'lofi')).toBe('media/99/mix.ultra_mix.opus')
  })

  it('selects ultra_mix for mix-only tags', () => {
    expect(isMixOnlyTag(mixOnly)).toBe(true)
    expect(ultraAudioPath(mixOnly, 'mix')).toBe('media/3/mix.ultra_mix.opus')
  })

  it('lists cache probe candidates original → playback → ultra', () => {
    const c = cachedPathCandidates(monoSolos, 'lead')
    expect(c[0]).toBe('media/31/lead.m4a')
    expect(c).toContain('media/31/lead.playback.opus')
    expect(c).toContain('media/31/lead.solo.opus')
  })

  it('detects published tier paths', () => {
    expect(isPublishedTierPath('media/31/lead.playback.opus')).toBe(true)
    expect(isPublishedTierPath('media/31/lead.m4a')).toBe(false)
  })

  it('maps storage quality to published tiers', () => {
    expect(storageAudioPath(monoSolos, 'lead', 'original')).toBe('media/31/lead.m4a')
    expect(storageAudioPath(monoSolos, 'lead', 'compact')).toBe('media/31/lead.playback.opus')
    expect(storageAudioPath(monoSolos, 'lead', 'lofi')).toBe('media/31/lead.solo.opus')
    expect(storageAudioPath(monoSolos, 'mix', 'lofi')).toBeNull()
    expect(storageAudioPath(mixOnly, 'mix', 'lofi')).toBe('media/3/mix.ultra_mix.opus')
  })

  it('infers lower quality from starred blobs', () => {
    expect(inferLowerQualityFromStarred(undefined)).toBe(false)
    expect(inferLowerQualityFromStarred({ lead: { quality: 'original' } })).toBe(false)
    expect(inferLowerQualityFromStarred({ lead: { quality: 'standard' } })).toBe(true)
  })

  it('playableAudioParts omits offline mix until voice stems exist', () => {
    expect(playableAudioParts(monoSolos, 'online')).toContain('mix')
    const offline = playableAudioParts(monoSolos, 'offline')
    expect(offline).toContain('lead')
    expect(offline).toContain('mix')
    expect(canOfferReconstructedMix(monoSolos)).toBe(true)
  })

  it('playableAudioParts is mix-only for mix-only tags', () => {
    expect(playableAudioParts(mixOnly, 'offline')).toEqual(['mix'])
  })
})
