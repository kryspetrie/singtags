/**
 * Human labels for TTBB voicing strings (bass|bari|lead|tenor chord-tone roles).
 */
export type InversionKind = 'root' | '1st' | '2nd' | '3rd' | 'other'

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

/** Button / list label: inversion first, then role string. */
export function voicingDisplayLabel(voicing: string): string {
  const v = voicing?.trim() || ''
  if (!v) return ''
  return `${inversionLabelFromVoicing(v)} · ${v}`
}
