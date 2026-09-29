/**
 * Coach Choose-lane stack audition via {@link AudioPreview} (ports — not Tag Roll transport).
 */
import type { HarmonizeCandidate } from '../../domain/arranging/harmonize'
import type { AudioPreview, StackPreview } from '../../ports/AudioPreview'

export type CoachStackMidi = {
  bass: number
  bari: number
  lead: number
  tenor: number
}

export function stackPreviewFromMidi(midi: CoachStackMidi): StackPreview {
  return {
    midi: {
      bass: midi.bass,
      bari: midi.bari,
      lead: midi.lead,
      tenor: midi.tenor,
    },
  }
}

export function createCoachStackHear(opts: {
  getPreview: () => AudioPreview
  /** When true, skip audition (e.g. Tag Roll transport already playing). */
  isTransportPlaying?: () => boolean
}) {
  async function playTimed(midi: CoachStackMidi, durationMs = 700): Promise<void> {
    if (opts.isTransportPlaying?.()) return
    await opts.getPreview().playStack(stackPreviewFromMidi(midi), durationMs)
  }

  async function holdStart(midi: CoachStackMidi): Promise<void> {
    if (opts.isTransportPlaying?.()) return
    await opts.getPreview().startStack(stackPreviewFromMidi(midi))
  }

  function holdStop(): void {
    if (opts.isTransportPlaying?.()) return
    opts.getPreview().stopStack()
  }

  async function hearCandidate(c: HarmonizeCandidate, durationMs = 700): Promise<void> {
    await playTimed(c.midi, durationMs)
  }

  return { playTimed, holdStart, holdStop, hearCandidate }
}
