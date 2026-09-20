/**
 * Fermata hold/gap in musical beats (1 beat = one quarter at TAG_ROLL_PPQ).
 */
import { TAG_ROLL_PPQ } from './types'

export function ticksToBeats(ticks: number): number {
  return ticks / TAG_ROLL_PPQ
}

export function beatsToTicks(beats: number): number {
  if (!Number.isFinite(beats)) return 0
  return Math.round(beats * TAG_ROLL_PPQ)
}

/** Round for inspector display (quarters of a beat). */
export function ticksToBeatsDisplay(ticks: number): number {
  return Math.round(ticksToBeats(ticks) * 4) / 4
}
