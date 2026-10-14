/**
 * Human labels for TTBB voicing strings (bass|bari|lead|tenor chord-tone roles).
 * Role-stack layout mirrors znarf94/MuseScore_Barbershop_Harmonizer voicing chips.
 */
export type InversionKind = 'root' | '1st' | '2nd' | '3rd' | 'other'

export type VoicingRoleStack = {
  /** Chord-tone role digits top→bottom: tenor, lead, bari, bass. */
  tenor: string
  lead: string
  bari: string
  bass: string
}

const ROLE_NAMES: Record<string, string> = {
  '1': 'root',
  '3': 'third',
  '5': 'fifth',
  '6': 'sixth',
  '7': 'seventh',
  '9': 'ninth',
}

/** Bass chord-tone role → classical inversion name. */
export function inversionKindFromVoicing(voicing: string): InversionKind {
  const bass = Number(voicing?.[0])
  if (bass === 1) return 'root'
  if (bass === 3) return '1st'
  if (bass === 5) return '2nd'
  if (bass === 7 || bass === 6 || bass === 9) return '3rd'
  return 'other'
}

export function inversionLabelFromVoicing(voicing: string): string {
  const kind = inversionKindFromVoicing(voicing)
  if (kind === 'root') return 'root'
  if (kind === '1st') return '1st inv'
  if (kind === '2nd') return '2nd inv'
  if (kind === '3rd') return '3rd inv'
  return 'inv'
}

/** Parse voicing string into TTBB role digits (plugin chip order). */
export function voicingRoleStack(voicing: string): VoicingRoleStack | null {
  const v = voicing?.trim() || ''
  if (v.length < 4) return null
  return {
    bass: v[0]!,
    bari: v[1]!,
    lead: v[2]!,
    tenor: v[3]!,
  }
}

/** Tooltip / a11y: Tenor/Lead/Bari/Bass role names + inversion. */
export function voicingRoleStackTitle(voicing: string): string {
  const stack = voicingRoleStack(voicing)
  if (!stack) return voicingDisplayLabel(voicing)
  const name = (d: string) => ROLE_NAMES[d] ?? d
  return [
    `Tenor: ${name(stack.tenor)}`,
    `Lead: ${name(stack.lead)}`,
    `Bari: ${name(stack.bari)}`,
    `Bass: ${name(stack.bass)}`,
    inversionLabelFromVoicing(voicing),
    voicing.trim(),
  ].join(' · ')
}

/** Button / list label: inversion first, then role string. */
export function voicingDisplayLabel(voicing: string): string {
  const v = voicing?.trim() || ''
  if (!v) return ''
  return `${inversionLabelFromVoicing(v)} · ${v}`
}
