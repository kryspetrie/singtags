/**
 * Denser VL / homophony / doubled-third / dull-harmonicity lints.
 */
import type { ArrangementProject, ChordStack } from './types'
import type { ArrangementLint } from './qa/types'
import { BARBERSHOP_CHORDS } from './chords'
import { scoreHarmonicity, normalizeHarmonicity } from './harmonicity/harmonicityScore'
import { candidatesForMelodyNote } from './harmonize'

function chordThirdPc(rootPc: number, natureId: string): number | null {
  const nature = BARBERSHOP_CHORDS.find((c) => c.id === natureId)
  const off = nature?.offsets[3]
  if (off == null) return null
  return ((rootPc + off) % 12 + 12) % 12
}

/** Warn when two parts share the chordal third pitch class. */
export function doubledThirdLints(stacks: readonly ChordStack[]): ArrangementLint[] {
  const out: ArrangementLint[] = []
  for (const s of stacks) {
    if (!s.midi) continue
    if (s.natureId !== 'major' && s.natureId !== 'minor' && s.natureId !== 'seventh') continue
    const third = chordThirdPc(s.rootPc, s.natureId)
    if (third == null) continue
    const pcs = [s.midi.bass, s.midi.bari, s.midi.lead, s.midi.tenor].map(
      (m) => ((m % 12) + 12) % 12,
    )
    const hits = pcs.filter((pc) => pc === third).length
    if (hits >= 2) {
      out.push({
        id: `doubled-3rd-${s.id}`,
        ruleId: 'doubled-third',
        severity: 'warn',
        message: 'Chordal third appears in more than one part — often muddy; re-voice.',
        stackId: s.id,
      })
    }
  }
  return out
}

/** Soft check: many consecutive stacks with identical density (all notes same duration / onset). */
export function homophonyDensityLints(project: ArrangementProject): ArrangementLint[] {
  if (project.stacks.length < 6) return []
  const sorted = [...project.stacks].sort((a, b) => a.startTick - b.startTick)
  let sameDur = 0
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i]!.durationTicks === sorted[i - 1]!.durationTicks) sameDur++
  }
  const ratio = sameDur / (sorted.length - 1)
  if (ratio < 0.85) return []
  return [
    {
      id: 'homophony-dense',
      ruleId: 'homophony-density',
      severity: 'info',
      message:
        'Stacks are highly uniform in duration — contest charts often mix passing lengths; optional variety pass.',
    },
  ]
}

/** Flag stacks whose JI harmonicity is much worse than the best alternate candidate. */
export function dullHarmonicityLints(project: ArrangementProject): ArrangementLint[] {
  const out: ArrangementLint[] = []
  for (const s of project.stacks) {
    if (!s.midi || !s.voicing) continue
    const note = project.melody.find((n) => n.startTick === s.startTick)
    const pillar = project.pillars.find(
      (p) => p.startTick <= s.startTick && s.startTick < p.endTick,
    )
    if (!note || !pillar) continue
    const current = normalizeHarmonicity(
      scoreHarmonicity({
        midi: s.midi,
        natureId: s.natureId,
        rootPc: s.rootPc,
        voicing: s.voicing,
        useJust: true,
      }),
    )
    const cands = candidatesForMelodyNote({
      note,
      pillar,
      tonality: project.tonality,
      prevRootPc: null,
      limit: 6,
      profile: project.contestProfile,
    })
    const bestH = Math.max(0, ...cands.map((c) => c.harmonicity ?? 0))
    if (bestH - current >= 0.18 && cands[0] && cands[0].natureId !== s.natureId) {
      out.push({
        id: `dull-ring-${s.id}`,
        ruleId: 'dull-harmonicity',
        severity: 'info',
        message: `Voicing rings less than alternatives (H ${current.toFixed(2)} vs ${bestH.toFixed(2)}).`,
        stackId: s.id,
        data: { current, best: bestH },
      })
    }
  }
  return out
}

export function copyrightReminderLint(project: ArrangementProject): ArrangementLint[] {
  if (!project.melody.length) return []
  return [
    {
      id: 'copyright-human',
      ruleId: 'copyright-reminder',
      severity: 'info',
      message:
        'HUMAN: confirm copyright / licensing before sharing or contesting this arrangement.',
    },
  ]
}
