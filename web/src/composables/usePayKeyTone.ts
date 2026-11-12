/**
 * Shared pay-the-key / blow-pitch tone for Tag, My Library, set lists, and Sing Together.
 * Uses {@link createPitchTonePlayer} so attack/voice match Pitch Pipe synth.
 */
import { onUnmounted } from 'vue'
import { composePayKeyCents } from '../audio/payKeyDetune'
import { createPitchTonePlayer, type PitchTonePlayer } from '../audio/pitchTone'
import {
  getActivePitchPipeVoice,
  PITCH_PIPE_VOICE_CHANGE_EVENT,
} from '../audio/pitchPipeVoice'

export function usePayKeyTone() {
  let player: PitchTonePlayer | null = null

  function ensure(): PitchTonePlayer {
    if (!player) {
      player = createPitchTonePlayer('synth', { polyphony: false })
      player.setVoice(getActivePitchPipeVoice())
    }
    return player
  }

  function syncVoice(): void {
    player?.setVoice(getActivePitchPipeVoice())
  }

  async function start(note: string, detuneCents: number): Promise<void> {
    const p = ensure()
    await p.warmUp?.()
    await p.start(note, detuneCents)
  }

  /** Hold tonic with semitone shift + fine cents. */
  async function play(
    note: string,
    opts: { shiftSemitones?: number; fineCents?: number } = {},
  ): Promise<void> {
    await start(note, composePayKeyCents(opts))
  }

  function stop(fade: boolean | number = true): void {
    player?.stop(fade)
  }

  function dispose(): void {
    player?.dispose()
    player = null
  }

  if (typeof window !== 'undefined') {
    window.addEventListener(PITCH_PIPE_VOICE_CHANGE_EVENT, syncVoice)
  }

  onUnmounted(() => {
    if (typeof window !== 'undefined') {
      window.removeEventListener(PITCH_PIPE_VOICE_CHANGE_EVENT, syncVoice)
    }
    dispose()
  })

  return { start, play, stop, dispose, syncVoice }
}
