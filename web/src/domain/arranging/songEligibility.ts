/**
 * Song eligibility heuristics (Approach Two / contest manuals).
 */
import type { MelodyEvent } from './types'

export type EligibilityHint = {
  id: string
  severity: 'warn' | 'info'
  message: string
}

export type RangePreset = {
  id: string
  label: string
  leadMin: number
  leadMax: number
}

export const RANGE_PRESETS: RangePreset[] = [
  { id: 'ttbb_lead', label: 'TTBB lead (approx)', leadMin: 50, leadMax: 65 },
  { id: 'ttbb_wide', label: 'TTBB lead wide', leadMin: 48, leadMax: 72 },
  { id: 'ssaa_lead', label: 'SSAA lead (approx)', leadMin: 55, leadMax: 79 },
]

export function checkLeadAgainstPreset(
  melody: readonly MelodyEvent[],
  preset: RangePreset,
): EligibilityHint[] {
  const out: EligibilityHint[] = []
  for (const n of melody) {
    if (n.midi < preset.leadMin || n.midi > preset.leadMax) {
      out.push({
        id: `elig-range-${n.id}`,
        severity: 'warn',
        message: `Lead MIDI ${n.midi} outside ${preset.label} (${preset.leadMin}–${preset.leadMax}).`,
      })
    }
  }
  return out
}

/** Soft hint: many songs favor phrase lengths of 3/5/7 measures — informational only. */
export function phraseLengthHint(melody: readonly MelodyEvent[], measureTicks = 1920): EligibilityHint[] {
  if (melody.length < 4) return []
  const end = Math.max(...melody.map((n) => n.startTick + n.durationTicks))
  const measures = Math.max(1, Math.round(end / measureTicks))
  if ([3, 5, 7].includes(measures % 8) || [3, 5, 7].includes(measures)) {
    return []
  }
  return [
    {
      id: 'phrase-shape',
      severity: 'info',
      message: `Chart spans ~${measures} measures — contest ballads often group phrases in 3/5/7.`,
    },
  ]
}

export function assessSongEligibility(
  melody: readonly MelodyEvent[],
  presetId: string = 'ttbb_wide',
): EligibilityHint[] {
  const preset = RANGE_PRESETS.find((p) => p.id === presetId) ?? RANGE_PRESETS[1]!
  return [...checkLeadAgainstPreset(melody, preset), ...phraseLengthHint(melody)]
}
