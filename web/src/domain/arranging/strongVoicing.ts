/**
 * Strong-voicing heuristic (Prietto): lead should be a chord tone that supports
 * the intended sonority — prefer chord 3rd/7th on lead for BS7 color.
 */
import type { ChordStack, MelodyEvent } from './types'
import type { ArrangementLint } from './qa/types'

export function strongVoicingLints(
  stacks: readonly ChordStack[],
  melody: readonly MelodyEvent[],
): ArrangementLint[] {
  const out: ArrangementLint[] = []
  for (const s of stacks) {
    if (!s.midi || s.voicing.length < 4) continue
    const leadRole = Number(s.voicing[2])
    if (!Number.isFinite(leadRole)) continue
    const note = melody.find((n) => n.startTick === s.startTick)
    if (s.natureId === 'seventh' || s.natureId === 'ninth') {
      if (leadRole === 1 || leadRole === 5) {
        out.push({
          id: `strong-voice-${s.id}`,
          ruleId: 'strong-voicing',
          severity: 'info',
          message:
            'Lead is root/5th on a dominant — 3rd or 7th in the lead often sings stronger.',
          stackId: s.id,
          noteId: note?.id,
        })
      }
    }
    if ((s.natureId === 'major' || s.natureId === 'minor') && leadRole === 5) {
      out.push({
        id: `strong-fifth-${s.id}`,
        ruleId: 'strong-voicing',
        severity: 'info',
        message: 'Lead on the 5th of a triad — consider 3rd for a stronger pillar color.',
        stackId: s.id,
        noteId: note?.id,
      })
    }
  }
  return out
}
