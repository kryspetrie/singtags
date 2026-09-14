/**
 * Pinia store for Sing Together repertoire (local device).
 */
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { parseRepertoireCsv } from '../lib/singTogether/csv'
import { loadStoredProfile, saveStoredProfile } from '../lib/singTogether/storage'
import {
  clampConfidence,
  emptyProfile,
  newSongId,
  type Confidence,
  type RepertoireProfile,
  type RepertoireSong,
  type Voicing,
} from '../lib/singTogether/types'

export const useSingTogetherStore = defineStore('singTogether', () => {
  const profile = ref<RepertoireProfile>(loadStoredProfile())

  watch(
    profile,
    (v) => {
      saveStoredProfile(v)
    },
    { deep: true, flush: 'sync' },
  )

  const songCount = computed(() => profile.value.songs.length)

  function setDisplayName(name: string): void {
    profile.value = { ...profile.value, displayName: name.trim().slice(0, 64) }
  }

  function upsertSong(song: Omit<RepertoireSong, 'id'> & { id?: string }): void {
    const id = song.id || newSongId()
    const next: RepertoireSong = {
      id,
      title: song.title.trim(),
      arranger: song.arranger.trim(),
      key: song.key?.trim() || undefined,
      voicing: song.voicing,
      parts: { ...song.parts },
    }
    const idx = profile.value.songs.findIndex((s) => s.id === id)
    const songs = [...profile.value.songs]
    if (idx >= 0) songs[idx] = next
    else songs.push(next)
    profile.value = { ...profile.value, songs }
  }

  function removeSong(id: string): void {
    profile.value = {
      ...profile.value,
      songs: profile.value.songs.filter((s) => s.id !== id),
    }
  }

  function setPartConfidence(songId: string, partId: string, confidence: Confidence | null): void {
    const songs = profile.value.songs.map((s) => {
      if (s.id !== songId) return s
      const parts = { ...s.parts }
      if (confidence == null) delete parts[partId]
      else parts[partId] = clampConfidence(confidence)
      return { ...s, parts }
    })
    profile.value = { ...profile.value, songs }
  }

  function importCsv(text: string): { added: number; skipped: number; errors: string[] } {
    const result = parseRepertoireCsv(text)
    if (result.songs.length) {
      profile.value = {
        ...profile.value,
        songs: [...profile.value.songs, ...result.songs],
      }
    }
    return { added: result.songs.length, skipped: result.skipped, errors: result.errors }
  }

  function clearSongs(): void {
    profile.value = { ...profile.value, songs: [] }
  }

  function replaceProfile(next: RepertoireProfile): void {
    profile.value = {
      displayName: next.displayName,
      songs: next.songs,
      updatedAt: Date.now(),
    }
  }

  function resetAll(): void {
    profile.value = emptyProfile()
  }

  function addBlankSong(voicing?: Voicing): string {
    const id = newSongId()
    upsertSong({
      id,
      title: '',
      arranger: '',
      voicing,
      parts: {},
    })
    return id
  }

  return {
    profile,
    songCount,
    setDisplayName,
    upsertSong,
    removeSong,
    setPartConfidence,
    importCsv,
    clearSongs,
    replaceProfile,
    resetAll,
    addBlankSong,
  }
})
