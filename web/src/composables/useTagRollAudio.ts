/**
 * Shared Tag Studio audio API (one player per editor mount).
 */
import { inject, provide, type InjectionKey } from 'vue'
import type { PitchTonePlayer } from '../audio/pitchTone'

export type TagRollAudioApi = {
  ensurePlayer: () => PitchTonePlayer
  previewPitch: (midi: number | null) => Promise<void>
  auditionMidi: (midi: number) => Promise<void>
  allNotesOff: (soft?: boolean) => void
  /** When true, tote/harmonizer must not steal the shared player. */
  isTransportPlaying?: () => boolean
}

export const TAG_ROLL_AUDIO_KEY: InjectionKey<TagRollAudioApi> = Symbol('tagRollAudio')

export function provideTagRollAudio(api: TagRollAudioApi): void {
  provide(TAG_ROLL_AUDIO_KEY, api)
}

export function useTagRollAudio(): TagRollAudioApi | null {
  return inject(TAG_ROLL_AUDIO_KEY, null)
}
