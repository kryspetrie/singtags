/**
 * Map Tag Studio parts onto barbershop grand-staff voices + solo staves.
 */
import type { TagRollClefFamily, TagRollPart } from '../types'
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
  kind: 'upper' | 'lower' | 'solo',
  family: TagRollClefFamily,
): SheetClefKind {
  if (kind === 'solo') return 'treble'
  if (kind === 'upper') return family === 'ttbb' ? 'treble8vb' : 'treble'
  return family === 'ssaa' ? 'bass8va' : 'bass'
}

function slot(
  part: TagRollPart,
  role: SheetVoiceRole,
  voice: 1 | 2,
): SheetVoiceSlot {
  return {
    partId: part.id,
    partName: part.name,
    color: part.color,
    voice,
    role,
  }
}

/**
 * Assign parts to staves. Canonical TTBB names share the grand staff;
 * everything else gets its own solo staff (order preserved).
 */
export function assignSheetStaves(
  parts: readonly TagRollPart[],
  clefFamily: TagRollClefFamily,
): SheetStaffAssignment {
  let tenor: TagRollPart | undefined
  let lead: TagRollPart | undefined
  let bari: TagRollPart | undefined
  let bass: TagRollPart | undefined
  const extras: TagRollPart[] = []

  for (const p of parts) {
    const role = roleForPartName(p.name)
    if (role === 'tenor' && !tenor) tenor = p
    else if (role === 'lead' && !lead) lead = p
    else if (role === 'bari' && !bari) bari = p
    else if (role === 'bass' && !bass) bass = p
    else extras.push(p)
  }

  const staves: SheetStaffSpec[] = []
  const hasGrand = !!(tenor || lead || bari || bass)

  if (hasGrand) {
    const upperVoices: SheetVoiceSlot[] = []
    if (tenor) upperVoices.push(slot(tenor, 'tenor', 1))
    if (lead) upperVoices.push(slot(lead, 'lead', 2))
    staves.push({
      id: 'upper',
      kind: 'upper',
      clef: clefForStaff('upper', clefFamily),
      labels: upperVoices.map((v) => v.partName),
      voices: upperVoices,
    })

    const lowerVoices: SheetVoiceSlot[] = []
    if (bari) lowerVoices.push(slot(bari, 'bari', 1))
    if (bass) lowerVoices.push(slot(bass, 'bass', 2))
    staves.push({
      id: 'lower',
      kind: 'lower',
      clef: clefForStaff('lower', clefFamily),
      labels: lowerVoices.map((v) => v.partName),
      voices: lowerVoices,
    })
  }

  for (const p of extras) {
    staves.push({
      id: `solo:${p.id}`,
      kind: 'solo',
      clef: clefForStaff('solo', clefFamily),
      labels: [p.name],
      voices: [slot(p, 'solo', 1)],
    })
  }

  return { clefFamily, staves }
}
