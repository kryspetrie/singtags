/**
 * Detect same-staff voice crossings for sheet reading marks (concert pitch):
 * - Upper staff: Lead above Tenor
 * - Lower staff: Bass above Bari
 */

export type CrossoverNote = {
  id: string
  partId: string
  midi: number
  startTick: number
  durationTicks: number
}

export type CrossoverPart = {
  id: string
  name: string
}

function normName(name: string): string {
  return name.trim().toLowerCase()
}

function roleOf(name: string): 'tenor' | 'lead' | 'bari' | 'bass' | null {
  const n = normName(name)
  if (n === 'tenor') return 'tenor'
  if (n === 'lead') return 'lead'
  if (n === 'bari' || n === 'baritone') return 'bari'
  if (n === 'bass') return 'bass'
  return null
}

function overlaps(
  a: { startTick: number; durationTicks: number },
  b: { startTick: number; durationTicks: number },
): boolean {
  const aEnd = a.startTick + Math.max(1, a.durationTicks)
  const bEnd = b.startTick + Math.max(1, b.durationTicks)
  return a.startTick < bEnd && b.startTick < aEnd
}

/**
 * Mark the higher voice when it crosses above its staff partner:
 * Lead notes above Tenor, Bass notes above Bari.
 */
export function staffCrossoverNoteIds(
  notes: readonly CrossoverNote[],
  parts: readonly CrossoverPart[],
): Set<string> {
  const byRole = new Map<'tenor' | 'lead' | 'bari' | 'bass', string>()
  for (const p of parts) {
    const role = roleOf(p.name)
    if (role && !byRole.has(role)) byRole.set(role, p.id)
  }

  const pairs: { highId: string; lowId: string }[] = []
  const tenorId = byRole.get('tenor')
  const leadId = byRole.get('lead')
  if (tenorId && leadId) pairs.push({ highId: leadId, lowId: tenorId })
  const bariId = byRole.get('bari')
  const bassId = byRole.get('bass')
  if (bariId && bassId) pairs.push({ highId: bassId, lowId: bariId })
  if (!pairs.length) return new Set()

  const out = new Set<string>()
  for (const { highId, lowId } of pairs) {
    const highs = notes.filter((n) => n.partId === highId)
    const lows = notes.filter((n) => n.partId === lowId)
    if (!highs.length || !lows.length) continue
    for (const high of highs) {
      for (const low of lows) {
        if (!overlaps(high, low)) continue
        if (high.midi > low.midi) {
          out.add(high.id)
          break
        }
      }
    }
  }
  return out
}
