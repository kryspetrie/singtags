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
  needsOnlineVirtualPartLearning,
  isUltraMonoStemPath,
  canOfferReconstructedMix,
  mixIsDisjoint,
  partsAreRecombinable,
  isBaseOfflineAudioPackPath,
  isUpgradeAudioCachePath,
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
      tag_id: 99,
      audio: { lead: 'media/99/lead.m4a', mix: 'media/99/mix.m4a' },
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

  it('uses hosted stereo when parts are not recombinable', () => {
    const demoted = detail({
      tag_id: 3068,
      audio: {
        lead: 'media/3068/lead.m4a',
        bari: 'media/3068/bari.m4a',
        mix: 'media/3068/mix.m4a',
      },
      audio_layout_summary: {
        parts: 'part_left',
        ultra_low: 'stereo_fallback',
        parts_recombinable: false,
        recombine_reason: 'align_untrusted',
        mix_cache: 'hosted',
      },
      audio_tiers: {
        lead: {
          ultra_stereo: 'media/3068/lead.ultra.opus',
          playback: 'media/3068/lead.playback.opus',
        },
        bari: { ultra_stereo: 'media/3068/bari.ultra.opus' },
        mix: { ultra_mix: 'media/3068/mix.ultra_mix.opus' },
      },
      audio_tiers_summary: { ultra_policy: 'stereo_fallback', parts_recombinable: false },
    })
    expect(partsAreRecombinable(demoted)).toBe(false)
    expect(usesMonoSolos(demoted)).toBe(false)
    expect(ultraAudioPath(demoted, 'lead')).toBe('media/3068/lead.ultra.opus')
    expect(ultraAudioPath(demoted, 'mix')).toBe('media/3068/mix.ultra_mix.opus')
    expect(canOfferReconstructedMix(demoted)).toBe(false)
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

  it('treats mono_downmix like mono solos for virtual part-left', () => {
    const monoDownmix = detail({
      tag_id: 922,
      audio: {
        lead: 'media/922/lead.mp3',
        tenor: 'media/922/tenor.mp3',
        bari: 'media/922/bari.mp3',
        bass: 'media/922/bass.mp3',
      },
      audio_layout_summary: { parts: 'mono', ultra_low: 'mono_downmix' },
      audio_tiers_summary: { ultra_policy: 'mono_downmix', mix_only: false },
    })
    expect(usesMonoSolos(monoDownmix)).toBe(true)
    expect(needsOnlineVirtualPartLearning(monoDownmix)).toBe(true)
    expect(needsOnlineVirtualPartLearning(monoSolos)).toBe(false)
    expect(isUltraMonoStemPath('1776 - Lead - Downmix.opus')).toBe(true)
    expect(isUltraMonoStemPath('lead.solo.opus')).toBe(true)
    expect(isUltraMonoStemPath('lead.playback.opus')).toBe(false)
  })

  it('classifies base offline pack vs upgrade audio paths', () => {
    expect(isBaseOfflineAudioPackPath('media/9/lead.solo.opus')).toBe(true)
    expect(isBaseOfflineAudioPackPath('media/9/mix.ultra_mix.opus')).toBe(true)
    expect(isUpgradeAudioCachePath('media/9/lead.playback.opus')).toBe(true)
    expect(isUpgradeAudioCachePath('media/9/lead.m4a')).toBe(true)
  })
})
