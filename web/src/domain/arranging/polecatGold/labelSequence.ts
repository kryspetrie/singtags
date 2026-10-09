/**
 * Collapse consecutive identical chords and label pillar / passing / mid.
 * Mirrors polecats/build_gold_sequences.py for in-test regeneration checks.
 */
import type { ChordRole, GoldChordToken, PolecatGoldSequence } from './types'

export type RawStack = {
  t0?: number
  t1?: number
  dur?: number
  rootPc: number
  natureId: string
  roman?: string
  confidence?: number
  midi?: { lead?: number }
}

function degree(rootPc: number, tonality: number): number {
  return ((rootPc % 12) - (tonality % 12) + 12) % 12
}

function isHighway(
  rootPc: number,
  nature: string,
  tonality: number,
  long: boolean,
): boolean {
  const deg = degree(rootPc, tonality)
  const n = nature.toLowerCase()
  if (deg === 0 && ['major', 'seventh', 'ninth', 'sixth'].includes(n)) return true
  if (deg === 5 && ['major', 'seventh', 'ninth', 'sixth'].includes(n)) return true
  if (deg === 7 && ['seventh', 'ninth', 'major'].includes(n)) return true
  // ii / ii7 and II7 (= V7/V) — not madd6 (YIN color noise on long holds).
  if (deg === 2 && ['minor', 'm7', 'seventh', 'ninth', 'major'].includes(n)) return true
  // vi / vi7 when long; VI7 (= V7/ii) is a highway approach even when short-ish.
  if (deg === 9) {
    if (['seventh', 'ninth'].includes(n)) return true
    if (['minor', 'm7'].includes(n) && long) return true
  }
  return false
}

function median(xs: number[]): number {
  if (!xs.length) return 0.5
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2
}

export function collapseAndLabel(
  stacks: RawStack[],
  tonality: number,
): GoldChordToken[] {
  const collapsed: GoldChordToken[] = []
  for (const st of stacks) {
    const rootPc = st.rootPc
    const natureId = st.natureId || 'unknown'
    const dur =
      st.dur ??
      (st.t0 != null && st.t1 != null ? Math.max(0, st.t1 - st.t0) : 0)
    const leadMidi = st.midi?.lead ?? null
    const roman = st.roman ?? ''
    const last = collapsed[collapsed.length - 1]
    if (last && last.rootPc === rootPc && last.natureId === natureId) {
      last.dur = Math.round((last.dur + dur) * 10000) / 10000
      if (leadMidi != null) last.leadMidi = leadMidi
      continue
    }
    collapsed.push({
      roman,
      rootPc,
      natureId,
      dur: Math.round(dur * 10000) / 10000,
      role: 'mid',
      leadMidi,
      confidence: st.confidence,
    })
  }
  const med = median(collapsed.map((t) => t.dur).filter((d) => d > 0))
  for (const t of collapsed) {
    // Slightly stricter than 1.15 — short “highway” flashes stay mid/passing.
    const long = t.dur >= med * 1.25
    const short = t.dur <= med * 0.8
    const noisy = ['unknown', 'madd6', 'dim7', 'dim', 'aug'].includes(
      t.natureId.toLowerCase(),
    )
    const deg = degree(t.rootPc, tonality)
    // Chromatic roots (bII, etc.) need a very long hold to count as pillars.
    const diatonicDeg = [0, 2, 4, 5, 7, 9, 11].includes(deg)
    const veryLong = t.dur >= med * 1.6
    const highway = !noisy && isHighway(t.rootPc, t.natureId, tonality, long)
    // Long hold alone is not enough for off-flavor natures (v7 on V, etc.).
    const longOk =
      long &&
      !noisy &&
      (diatonicDeg || veryLong) &&
      (highway || veryLong)
    let role: ChordRole
    if (longOk) role = 'pillar'
    else if (highway && !short && diatonicDeg) role = 'pillar'
    else if (short && !highway) role = 'passing'
    else role = 'mid'
    t.role = role
    t.medianDur = Math.round(med * 10000) / 10000
  }
  return collapsed
}

export function sequenceFromStacksDoc(doc: {
  id: number
  title?: string
  tonality?: number
  mode?: string
  bpm?: number
  method?: string
  stack_count?: number
  stacks?: RawStack[]
}): PolecatGoldSequence {
  const tonality = doc.tonality ?? 0
  const tokens = collapseAndLabel(doc.stacks ?? [], tonality)
  const pillars = tokens.filter((t) => t.role === 'pillar')
  return {
    tagId: doc.id,
    title: doc.title,
    tonality,
    mode: doc.mode ?? 'major',
    bpm: doc.bpm,
    sourceMethod: doc.method,
    stackCountRaw: doc.stack_count ?? (doc.stacks?.length ?? 0),
    tokenCount: tokens.length,
    pillarCount: pillars.length,
    pillarRomans: pillars.map((t) => t.roman),
    tokens,
  }
}
