/**
 * Uncovered-melody list rows: measure:beat · pitch (no pipe separators).
 */
import { midiToNote } from '../../audio/pianoSamples'
import { formatMeasureBeat } from '../tagRoll/measureBeat'
import type { TagRollTimeSignature } from '../tagRoll/types'

export function gapRowLabel(
  startTick: number,
  midi: number,
  timeSignature: TagRollTimeSignature,
): string {
  return `${formatMeasureBeat(startTick, timeSignature)} · ${midiToNote(midi)}`
}
