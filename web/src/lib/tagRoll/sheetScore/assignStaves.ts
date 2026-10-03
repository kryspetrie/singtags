/**
 * Map Tag Studio parts onto barbershop grand-staff voices.
 * Canonical TTBB/SSAA names fill the first upper/lower pair; extras pack onto
 * additional tenor-clef or bass-clef staves based on midiGroup / pitch range.
 */
import type { TagRollClefFamily, TagRollNote, TagRollPart } from '../types'
import type {
  SheetClefKind,
  SheetStaffAssignment,
  SheetStaffSpec,
  SheetVoiceRole,
  SheetVoiceSlot,
} from './types'

function normName(name: string): string {
  return name.trim().toLowerCase()
}

function roleForPartName(name: string): SheetVoiceRole | null {
  const n = normName(name)
  if (n === 'tenor') return 'tenor'
  if (n === 'lead') return 'lead'
  if (n === 'bari' || n === 'baritone') return 'bari'
  if (n === 'bass') return 'bass'
  return null
}

function clefForStaff(
  kind: 'upper' | 'lower',
  family: TagRollClefFamily,
): SheetClefKind {
  if (kind === 'upper') return family === 'ttbb' ? 'treble8vb' : 'treble'
  return family === 'ssaa' ? 'bass8va' : 'bass'
}

function slot(
  part: TagRollPart,
  role: SheetVoiceRole,
  voice: 1 | 2,
  melodyPartId?: string | null,
): SheetVoiceSlot {
  return {
    partId: part.id,
    partName: part.name,
    color: part.color,
    voice,
    role,
    ...(melodyPartId && part.id === melodyPartId ? { isMelody: true } : {}),
  }
}

/** Concert MIDI split between tenor-clef vs bass-clef extras (~G3). */
export const SHEET_EXTRA_RANGE_SPLIT_MIDI = 55

function meanMidiForPart(
  partId: string,
  notes: readonly Pick<TagRollNote, 'partId' | 'midi'>[],
): number | null {
  let sum = 0
  let n = 0
  for (const note of notes) {
    if (note.partId !== partId) continue
    sum += note.midi
    n++
  }
  return n > 0 ? sum / n : null
}

/**
 * Decide whether an extra (non-TTBB-named) part belongs on a tenor-clef or
 * bass-clef staff. Prefers explicit midiGroup; otherwise mean pitch; finally
 * a light name heuristic when the part has no notes yet.
 */
export function sheetExtraStaffBucket(
  part: TagRollPart,
  notes: readonly Pick<TagRollNote, 'partId' | 'midi'>[] = [],
): 'upper' | 'lower' {
  if (part.midiGroup === 'upper') return 'upper'
  if (part.midiGroup === 'lower') return 'lower'

  const mean = meanMidiForPart(part.id, notes)
  if (mean != null) {
    return mean >= SHEET_EXTRA_RANGE_SPLIT_MIDI ? 'upper' : 'lower'
  }

  const n = normName(part.name)
  if (/(bass|bari|baritone|alto|contralto)/.test(n)) return 'lower'
  return 'upper'
}

function roleForPacked(part: TagRollPart): SheetVoiceRole {
  return roleForPartName(part.name) ?? 'solo'
}

/** Pack parts two-per-staff (stems up / down). */
function packStaffQueue(
  queue: readonly TagRollPart[],
  kind: 'upper' | 'lower',
  clefFamily: TagRollClefFamily,
  melodyPartId: string | null,
): SheetStaffSpec[] {
  const staves: SheetStaffSpec[] = []
  for (let i = 0; i < queue.length; i += 2) {
    const a = queue[i]!
    const b = queue[i + 1]
    const voices: SheetVoiceSlot[] = [
      slot(a, roleForPacked(a), 1, melodyPartId),
      ...(b ? [slot(b, roleForPacked(b), 2, melodyPartId)] : []),
    ]
    const n = staves.length
    staves.push({
      id: n === 0 ? kind : `${kind}:${n}`,
      kind,
      clef: clefForStaff(kind, clefFamily),
      labels: voices.map((v) => v.partName),
      voices,
    })
  }
  return staves
}

/**
 * Assign parts to staves.
 * - Named Tenor/Lead/Bari/Bass fill the first upper/lower pair (in part order).
 * - Remaining parts join matching-range queues and pack onto additional
 *   tenor-clef or bass-clef staves (max two voices each).
 * - Empty primary voice slots are filled by matching-range extras before new
 *   staves are created.
 */
export function assignSheetStaves(
  parts: readonly TagRollPart[],
  clefFamily: TagRollClefFamily,
  opts?: {
    melodyPartId?: string | null
    notes?: readonly Pick<TagRollNote, 'partId' | 'midi'>[]
  },
): SheetStaffAssignment {
  let tenor: TagRollPart | undefined
  let lead: TagRollPart | undefined
  let bari: TagRollPart | undefined
  let bass: TagRollPart | undefined
  const extras: TagRollPart[] = []
  const mid = opts?.melodyPartId ?? null
  const notes = opts?.notes ?? []

  for (const p of parts) {
    const role = roleForPartName(p.name)
    if (role === 'tenor' && !tenor) tenor = p
    else if (role === 'lead' && !lead) lead = p
    else if (role === 'bari' && !bari) bari = p
    else if (role === 'bass' && !bass) bass = p
    else extras.push(p)
  }

  const upperQueue: TagRollPart[] = []
  const lowerQueue: TagRollPart[] = []

  if (tenor) upperQueue.push(tenor)
  if (lead) upperQueue.push(lead)
  if (bari) lowerQueue.push(bari)
  if (bass) lowerQueue.push(bass)

  for (const p of extras) {
    if (sheetExtraStaffBucket(p, notes) === 'upper') upperQueue.push(p)
    else lowerQueue.push(p)
  }

  // No named TTBB parts and no extras classified yet — still pack every part.
  if (!upperQueue.length && !lowerQueue.length) {
    for (const p of parts) {
      if (sheetExtraStaffBucket(p, notes) === 'upper') upperQueue.push(p)
      else lowerQueue.push(p)
    }
  }

  const upperStaves = packStaffQueue(upperQueue, 'upper', clefFamily, mid)
  const lowerStaves = packStaffQueue(lowerQueue, 'lower', clefFamily, mid)

  // Primary grand-staff pair first, then overflow upper, then overflow lower.
  const staves: SheetStaffSpec[] = [
    ...(upperStaves[0] ? [upperStaves[0]] : []),
    ...(lowerStaves[0] ? [lowerStaves[0]] : []),
    ...upperStaves.slice(1),
    ...lowerStaves.slice(1),
  ]

  return { clefFamily, staves }
}
