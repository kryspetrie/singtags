/**
 * Pure title-pill / semicolon-token helpers for Sing Together quick-add.
 */

export type TitleTokenState = {
  pills: string[]
  draft: string
  title: string
}

export function titleFromTokens(pills: readonly string[], draft: string): string {
  const bits = [...pills]
  const t = draft.trim()
  if (t) bits.push(t)
  return bits.join('; ')
}

export function lockTitleDraft(pills: readonly string[], draft: string): TitleTokenState | null {
  const t = draft.trim()
  if (!t) return null
  const nextPills = [...pills, t]
  return {
    pills: nextPills,
    draft: '',
    title: titleFromTokens(nextPills, ''),
  }
}

export function unlockLastTitlePill(
  pills: readonly string[],
  draft: string,
): TitleTokenState | null {
  if (!pills.length || draft.length) return null
  const next = [...pills]
  const last = next.pop()!
  return {
    pills: next,
    draft: last,
    title: titleFromTokens(next, last),
  }
}

export function removeTitlePillAt(
  pills: readonly string[],
  draft: string,
  index: number,
): TitleTokenState {
  const nextPills = pills.filter((_, i) => i !== index)
  return {
    pills: nextPills,
    draft,
    title: titleFromTokens(nextPills, draft),
  }
}

/**
 * Apply draft input: plain text updates draft; values with `;` lock completed
 * segments into pills and leave the trailing fragment as draft.
 */
export function applyTitleDraftInput(
  pills: readonly string[],
  raw: string,
): TitleTokenState {
  if (!raw.includes(';')) {
    return {
      pills: [...pills],
      draft: raw,
      title: titleFromTokens(pills, raw),
    }
  }
  const chunks = raw.split(';')
  const locked = chunks
    .slice(0, -1)
    .map((s) => s.trim())
    .filter(Boolean)
  const rest = (chunks[chunks.length - 1] ?? '').replace(/^\s+/, '')
  const nextPills = locked.length ? [...pills, ...locked] : [...pills]
  return {
    pills: nextPills,
    draft: rest,
    title: titleFromTokens(nextPills, rest),
  }
}
