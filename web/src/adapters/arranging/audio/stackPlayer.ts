/**
 * Four-part stack audition using the app pitch-pipe / pay-the-key voice
 * ({@link createPitchTonePlayer}), not bare oscillators.
 */
import { midiToNote } from '../../../audio/pianoSamples'
import {
  getActivePitchPipeVoice,
  PITCH_PIPE_VOICE_CHANGE_EVENT,
} from '../../../audio/pitchPipeVoice'
import { createPitchTonePlayer, type PitchTonePlayer } from '../../../audio/pitchTone'

export type StackVoice = 'tenor' | 'lead' | 'bari' | 'bass'

export type StackPlayback = {
  midi: Record<StackVoice, number>
  cents?: Partial<Record<StackVoice, number>>
}

const VOICES: readonly StackVoice[] = ['bass', 'bari', 'lead', 'tenor']

export function createStackPlayer() {
  const tone: PitchTonePlayer = createPitchTonePlayer('synth', { polyphony: true })
  tone.setVoice(getActivePitchPipeVoice())

  function syncVoice(): void {
    tone.setVoice(getActivePitchPipeVoice())
  }

  if (typeof window !== 'undefined') {
    window.addEventListener(PITCH_PIPE_VOICE_CHANGE_EVENT, syncVoice)
  }

  async function startStack(stack: StackPlayback): Promise<void> {
    syncVoice()
    tone.allNotesOff(false)
    await Promise.all(
      VOICES.map((v) => tone.noteOn(midiToNote(stack.midi[v]), stack.cents?.[v] ?? 0)),
    )
  }

  function stopStack(release = true): void {
    tone.allNotesOff(release)
  }

  async function playStack(stack: StackPlayback, durationMs = 900): Promise<void> {
    await startStack(stack)
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, Math.max(50, durationMs))
    })
    stopStack(true)
  }

  function dispose(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener(PITCH_PIPE_VOICE_CHANGE_EVENT, syncVoice)
    }
    tone.allNotesOff(false)
    tone.dispose()
  }

  return { playStack, startStack, stopStack, dispose }
}
