import { ARRANGING_PPQ } from './types'

export const DURATION_PRESETS = [
  { id: 'whole', label: '1', ticks: ARRANGING_PPQ * 4 },
  { id: 'half', label: '½', ticks: ARRANGING_PPQ * 2 },
  { id: 'quarter', label: '¼', ticks: ARRANGING_PPQ },
  { id: 'eighth', label: '⅛', ticks: ARRANGING_PPQ / 2 },
  { id: 'sixteenth', label: '16th', ticks: ARRANGING_PPQ / 4 },
] as const

export function snapTick(tick: number, snapTicks: number): number {
  const s = Math.max(1, Math.round(snapTicks))
  return Math.max(0, Math.round(tick / s) * s)
}

export const MIDI_MIN = 48
export const MIDI_MAX = 84
export const DEFAULT_SNAP = ARRANGING_PPQ / 4
export const DEFAULT_LENGTH = ARRANGING_PPQ * 4 * 8
