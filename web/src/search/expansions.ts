/**
 * Search synonym / alias map (folded token → alternate folded tokens).
 */

import { normalizeToken } from './normalize'

/** Map from a normalized token to extra equivalent tokens. */
export type ExpansionMap = Record<string, string[]>

/** Expand a folded token via alias map (punctuation already stripped). */
export function expandToken(token: string, map: ExpansionMap): string[] {
  const t = normalizeToken(token)
  if (!t) return []
  const extras = map[t] ?? []
  const out = new Set<string>([t])
  for (const e of extras) {
    const n = normalizeToken(e)
    if (n) out.add(n)
  }
  return [...out]
}

/** Expand many tokens through the alias map (deduped). */
export function expandTokens(tokens: string[], map: ExpansionMap): string[] {
  const out = new Set<string>()
  for (const tok of tokens) {
    for (const e of expandToken(tok, map)) out.add(e)
  }
  return [...out]
}
