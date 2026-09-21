/**
 * Approach Three Rule 3 — tritone counterpart swap eligibility.
 * @see knowledge/06-approach-three-rules.md
 */
import { BARBERSHOP_CHORDS, leadRoleInChord, placeVoicing, voicingFitsLead } from './chords'
import type { ChordStack, MelodyEvent } from './types'
import { newId } from './types'

export function counterpartRoot(rootPc: number): number {
  return (((rootPc + 6) % 12) + 12) % 12
}

/**
 * Melody may freely swap to the tritone counterpart when it is the 3rd or 7th
 * of the original BS7, the raised root (♯1), or the lowered 5th of the original
 * (→ counterpart root).
 */
export function leadAllowsCounterpartSwap(opts: {
  originalRoot: number
  leadMidi: number
  allowFlatFive?: boolean
  allowRaisedRoot?: boolean
}): boolean {
  const seventh = BARBERSHOP_CHORDS.find((c) => c.id === 'seventh')
  if (!seventh) return false
  const role = leadRoleInChord(seventh, opts.originalRoot, opts.leadMidi)
  if (role === 3 || role === 7) return true
  const leadPc = ((opts.leadMidi % 12) + 12) % 12
  if (opts.allowRaisedRoot !== false) {
    const raisedRoot = (((opts.originalRoot + 1) % 12) + 12) % 12
    if (leadPc === raisedRoot) return true
  }
  if (opts.allowFlatFive !== false) {
    const flatFive = counterpartRoot(opts.originalRoot)
    if (leadPc === flatFive) return true
  }
  return false
}

export type CounterpartSuggestion = {
  fromRoot: number
  toRoot: number
  natureId: 'seventh' | 'ninth'
  voicing: string
  midi: { tenor: number; lead: number; bari: number; bass: number }
  reason: string
}

/** Suggest a counterpart BS7/9 stack for a melody note given the original harmony root. */
export function suggestCounterpart(opts: {
  note: MelodyEvent
  originalRoot: number
  natureId?: 'seventh' | 'ninth'
  spread?: boolean
}): CounterpartSuggestion | null {
  const natureId = opts.natureId ?? 'seventh'
  if (
    !leadAllowsCounterpartSwap({
      originalRoot: opts.originalRoot,
      leadMidi: opts.note.midi,
    })
  ) {
    return null
  }
  const toRoot = counterpartRoot(opts.originalRoot)
  const chord = BARBERSHOP_CHORDS.find((c) => c.id === natureId)
  if (!chord) return null
  const leadRole = leadRoleInChord(chord, toRoot, opts.note.midi)
  if (leadRole == null) return null
  // Prefer closed voicings with lead on 3 or 7
  const preferred =
    leadRole === 3 || leadRole === 7
      ? [`1${leadRole === 3 ? '735' : '375'}`, `5${leadRole === 3 ? '173' : '137'}`]
      : []
  const tryVoicings = [
    ...preferred,
    '1735',
    '1375',
    '5173',
    '5713',
    '7153',
    '7513',
    '3175',
    '3715',
  ]
  for (const voicing of tryVoicings) {
    if (!voicingFitsLead(voicing, leadRole)) continue
    const midi = placeVoicing({
      chord,
      rootPc: toRoot,
      leadMidi: opts.note.midi,
      voicing,
      spread: opts.spread ?? false,
    })
    if (!midi) continue
    if (!(midi.tenor > midi.lead && midi.bass <= Math.min(midi.bari, midi.lead))) continue
    const leadPc = ((opts.note.midi % 12) + 12) % 12
    const raisedRoot = (((opts.originalRoot + 1) % 12) + 12) % 12
    const flatFive = counterpartRoot(opts.originalRoot)
    let reason: string
    if (leadRole === 3 || leadRole === 7) {
      reason = 'Lead is shared 3↔7 of tritone counterpart pair'
    } else if (leadPc === raisedRoot) {
      reason = 'Lead is raised root (♯1) of original — counterpart gate open'
    } else if (leadPc === flatFive) {
      reason = 'Lead is ♭5 of original → counterpart root'
    } else {
      reason = 'Lead allows counterpart swap (Approach Three R3 gate)'
    }
    return {
      fromRoot: opts.originalRoot,
      toRoot,
      natureId,
      voicing,
      midi,
      reason,
    }
  }
  return null
}

/** Apply a counterpart suggestion onto an existing stack (preserves id/timing). */
export function applyCounterpartToStack(
  stack: ChordStack,
  suggestion: CounterpartSuggestion,
): ChordStack {
  return {
    ...stack,
    rootPc: suggestion.toRoot,
    natureId: suggestion.natureId,
    voicing: suggestion.voicing,
    midi: suggestion.midi,
    scfGroup: null,
    layer: stack.layer === 'primary' ? 'passing' : stack.layer,
    ruleTags: stack.ruleTags.includes('R3_tritone')
      ? stack.ruleTags
      : [...stack.ruleTags, 'R3_tritone'],
  }
}

export function counterpartSuggestionToStack(
  note: MelodyEvent,
  suggestion: CounterpartSuggestion,
  pillarId: string | null,
): ChordStack {
  return {
    id: newId('stk'),
    startTick: note.startTick,
    durationTicks: note.durationTicks,
    rootPc: suggestion.toRoot,
    natureId: suggestion.natureId,
    voicing: suggestion.voicing,
    spread: false,
    layer: 'passing',
    scfGroup: null,
    pillarId,
    midi: suggestion.midi,
    ruleTags: ['R3_tritone'],
  }
}
