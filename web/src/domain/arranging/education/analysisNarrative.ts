/**
 * Textual teaching narratives over arrangement analyses.
 * Turns RN / progression / VL / barbershopness data into coach prose.
 */
import {
  analyzeArrangementHarmony,
  type ArrangementHarmonicAnalysis,
  type ProgressionLink,
  type ProgressionPattern,
  type StackHarmonicLabel,
} from '../progressionAnalyze'
import { assessBarbershopness, type BarbershopnessReport } from '../barbershopness'
import { analyzeHarmonyTheory, type HarmonyTheoryReport } from '../analyzeHarmonyTheory'
import { glossaryById } from './explain'
import type { GlossaryEntry } from './types'
import type { ArrangementProject } from '../types'

export type NarrativeParagraph = {
  id: string
  /** Section for UI grouping */
  section: 'overview' | 'progression' | 'chord' | 'voice_leading' | 'style' | 'next_steps'
  title?: string
  body: string
  teachingIds: string[]
  stackId?: string
  linkId?: string
}

export type ArrangementTeachingReport = {
  /** Short headline for a Learn / Analyze panel */
  headline: string
  /** Full ordered teaching paragraphs */
  paragraphs: NarrativeParagraph[]
  /** Flattened unique glossary entries referenced */
  glossary: GlossaryEntry[]
  /** Structured analyses used (UI may also show tables) */
  progression: ArrangementHarmonicAnalysis
  theory: HarmonyTheoryReport
  barbershopness: BarbershopnessReport
}

function uniqTeaching(ids: (string | undefined)[]): string[] {
  const out: string[] = []
  for (const id of ids) {
    if (id && !out.includes(id)) out.push(id)
  }
  return out
}

function keyName(tonality: number, mode: string): string {
  const names = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B']
  return `${names[((tonality % 12) + 12) % 12]}${mode === 'minor' ? ' minor' : ' major'}`
}

function functionProse(kind: StackHarmonicLabel['functionKind']): string {
  switch (kind) {
    case 'tonic':
      return 'This is tonic-area harmony — a place of rest or “home” in the key.'
    case 'subdominant':
      return 'Subdominant harmony often prepares the dominant or acts as a springboard.'
    case 'dominant':
      return 'Dominant harmony creates tension that wants to release to tonic (classic 5–1).'
    case 'secondary_dominant':
      return 'A secondary dominant aims its tension at a non-tonic chord (V7 of something).'
    case 'tritone_sub':
      return 'A tritone substitute shares the active 3↔7 pair with the expected dominant, with a different bass.'
    case 'passing':
      return 'Passing / neighbor color — connective tissue between stronger pillars.'
    case 'neighbor':
      return 'Neighbor harmony ornaments a more structural chord.'
    case 'relative':
      return 'Relative / mediant color — related to the key’s I or vi family.'
    case 'counterpart':
      return 'Tritone counterpart of a barbershop seventh — same tension tones, different root.'
    case 'modal_color':
      return 'Modal or chromatic color — not the plain diatonic triad for this degree.'
    default:
      return 'Listen for how this chord supports the lead and the surrounding highway.'
  }
}

function linkProse(link: ProgressionLink): string {
  switch (link.kind) {
    case 'authentic':
      return `${link.fromRoman} moving to ${link.toRoman} is an authentic cadence (5–1). The dominant’s leading tone wants to rise and its ♭7 wants to fall — that is tension releasing into rest.`
    case 'plagal':
      return `${link.fromRoman} to ${link.toRoman} is a plagal (“amen”) move — softer than 5–1, still a common way home.`
    case 'half_cadence':
      return `Landing on ${link.toRoman} leaves the phrase open — a half cadence that expects continuation.`
    case 'deceptive':
      return `${link.fromRoman} to ${link.toRoman} is deceptive: the ear expected tonic, but the harmony slipped to the relative.`
    case 'secondary_resolution':
      return `${link.fromRoman} resolves into ${link.toRoman} — a secondary dominant doing its job (V7 of that target).`
    case 'circle_fifth':
      return `${link.fromRoman} → ${link.toRoman} walks down a fifth — the barbershop harmonic highway.`
    case 'tritone_sub_resolve':
      return `${link.fromRoman} resolving to ${link.toRoman} behaves like a dominant approach, using the tritone-substitute bass.`
    case 'counterpart_swap':
      return `${link.fromRoman} ↔ ${link.toRoman} are tritone counterparts: they share the same 3rd/7th tension tones under the lead.`
    case 'chromatic_pass':
      return `${link.fromRoman} to ${link.toRoman} moves by half step in the root — typical passing / neighboring color between pillars.`
    case 'retrogression':
      return `${link.fromRoman} to ${link.toRoman} backs up the circle (up a fifth) — useful for variety, then resume forward motion.`
    case 'same_harmony':
      return `${link.fromRoman} is held — same harmony under a new melodic moment.`
    default:
      return `${link.fromRoman} moves to ${link.toRoman}. Ask: is tension increasing, releasing, or decorating?`
  }
}

function patternProse(p: ProgressionPattern): string {
  if (p.kind === 'V7/V–V–I') {
    return `Pattern ${p.romans.join(' → ')}: five-of-five into a 5–1. ${p.romans[0]} is V7 of V; it drives into the real dominant, which then releases to tonic. This is one of the clearest “highway” stories in barbershop.`
  }
  if (p.kind === 'circle_chain') {
    return `Pattern ${p.romans.join(' → ')}: a circle-of-fifths chain. Each root falls a fifth, building forward motion toward a goal.`
  }
  return `Pattern ${p.label}.`
}

function chordInContext(
  label: StackHarmonicLabel,
  index: number,
  labels: StackHarmonicLabel[],
  links: ProgressionLink[],
): NarrativeParagraph {
  const prev = labels[index - 1]
  const next = labels[index + 1]
  const inLink = links.find((l) => l.toStackId === label.stackId)
  const outLink = links.find((l) => l.fromStackId === label.stackId)

  const bits: string[] = []
  bits.push(`${label.roman} (${label.natureId} on degree ${label.degree}). ${label.role}`)
  bits.push(functionProse(label.functionKind))
  if (label.alts.length) {
    bits.push(`You may also hear it as ${label.alts.join(' or ')}.`)
  }
  if (inLink) {
    bits.push(`Arriving from ${inLink.fromRoman}: ${linkProse(inLink)}`)
  } else if (prev) {
    bits.push(`It follows ${prev.roman}.`)
  }
  if (outLink && outLink.kind !== 'same_harmony') {
    bits.push(`What comes next (${outLink.toRoman}) matters: ${shortNextHint(outLink)}.`)
  } else if (next) {
    bits.push(`Next is ${next.roman} — listen for whether tension grows or releases.`)
  }

  return {
    id: `chord-${label.stackId}`,
    section: 'chord',
    title: label.roman,
    body: bits.join(' '),
    teachingIds: uniqTeaching([label.teachingId, inLink?.teachingId, outLink?.teachingId]),
    stackId: label.stackId,
    linkId: outLink?.id ?? inLink?.id,
  }
}

function shortNextHint(link: ProgressionLink): string {
  switch (link.kind) {
    case 'authentic':
    case 'secondary_resolution':
    case 'tritone_sub_resolve':
      return 'expect release of the active 3rd/7th by step if you can.'
    case 'circle_fifth':
      return 'keep riding the descending-fifth highway.'
    case 'chromatic_pass':
      return 'treat it as connective color, not a new pillar.'
    default:
      return 'keep the lead story clear.'
  }
}

function overviewParagraphs(
  project: ArrangementProject,
  progression: ArrangementHarmonicAnalysis,
  bb: BarbershopnessReport,
): NarrativeParagraph[] {
  const key = keyName(progression.tonality, progression.mode)
  const romanLine = progression.stacks.map((s) => s.roman).join(' – ')
  const out: NarrativeParagraph[] = [
    {
      id: 'overview-key',
      section: 'overview',
      title: 'Key and story',
      body: `We are reading this chart in ${key}. In that key, your stacks spell: ${romanLine || '(no stacks yet)'}. ${progression.summary}`,
      teachingIds: uniqTeaching(['roman_analysis', 'circle_fifths', 'tension_release']),
    },
  ]

  if (progression.counts.authentic || progression.counts.secondaryResolutions) {
    out.push({
      id: 'overview-cadences',
      section: 'overview',
      title: 'Cadences and drive',
      body: `Found ${progression.counts.authentic} authentic 5–1 resolution(s) and ${progression.counts.secondaryResolutions} secondary-dominant resolution(s). Those are the clearest teaching moments for tension → release.`,
      teachingIds: ['tension_release', 'secondary_dom'],
    })
  }

  out.push({
    id: 'overview-style',
    section: 'style',
    title: 'How barbershop is this?',
      body: `Contest-character score ${bb.score}/100. ${bb.summary} ${bb.factors
      .slice(0, 3)
      .map((f) => `${f.label}: ${Math.round(f.raw * 100)}%`)
      .join('; ')}.`,
    teachingIds: ['bs7', 'lock_ring'],
  })

  if (project.pillars.length === 0) {
    out.push({
      id: 'overview-pillars',
      section: 'next_steps',
      title: 'Next step',
      body: 'Confirm primary pillars so Roman labels can lean on destinations (V7 of the next pillar), not only local root motion.',
      teachingIds: ['pillar'],
    })
  }

  return out
}

function progressionParagraphs(progression: ArrangementHarmonicAnalysis): NarrativeParagraph[] {
  const out: NarrativeParagraph[] = []
  for (const p of progression.patterns) {
    out.push({
      id: `pattern-${p.id}`,
      section: 'progression',
      title: p.kind,
      body: patternProse(p),
      teachingIds: uniqTeaching([p.teachingId, 'secondary_dom', 'circle_fifths']),
    })
  }
  // Highlight strongest links (not every "other")
  const strong = progression.links.filter(
    (l) =>
      l.confidence >= 0.75 &&
      l.kind !== 'other' &&
      l.kind !== 'same_harmony',
  )
  for (const link of strong) {
    out.push({
      id: `link-${link.id}`,
      section: 'progression',
      title: `${link.fromRoman} → ${link.toRoman}`,
      body: linkProse(link),
      teachingIds: uniqTeaching([link.teachingId]),
      linkId: link.id,
      stackId: link.toStackId,
    })
  }
  return out
}

function theoryParagraphs(theory: HarmonyTheoryReport): NarrativeParagraph[] {
  if (!theory.issues.length) {
    return [
      {
        id: 'vl-ok',
        section: 'voice_leading',
        title: 'Voice leading & spacing',
        body: 'No major spacing or dominant-resolution warnings on the current stacks. Still prefer small motion, common-tone holds, and series-like spacing (wider at the bottom).',
        teachingIds: ['harmonic_series_spacing', 'common_tone', 'contrary_motion'],
      },
    ]
  }
  const byTeaching = new Map<string, typeof theory.issues>()
  for (const issue of theory.issues) {
    const key = issue.teachingId ?? issue.source
    const list = byTeaching.get(key) ?? []
    list.push(issue)
    byTeaching.set(key, list)
  }
  const out: NarrativeParagraph[] = []
  for (const [teachingId, issues] of byTeaching) {
    const sample = issues.slice(0, 3).map((i) => i.message)
    out.push({
      id: `theory-${teachingId}`,
      section: 'voice_leading',
      title: teachingId.replace(/_/g, ' '),
      body: `${issues.length} note(s): ${sample.join(' ')}${issues.length > 3 ? ' …' : ''} Fix these when you polish voicings — they teach how chords lock and how tension resolves.`,
      teachingIds: uniqTeaching([teachingId]),
      stackId: issues[0]?.stackId,
    })
  }
  return out
}

function nextStepsParagraph(
  progression: ArrangementHarmonicAnalysis,
  bb: BarbershopnessReport,
): NarrativeParagraph {
  const tips: string[] = []
  if (bb.score < 60) {
    tips.push('Raise barbershop-seventh density toward ~30% and prefer strong lead tones (3/7 on dominants).')
  }
  if (!progression.counts.authentic && progression.stacks.length >= 2) {
    tips.push('Look for a clear V7 → I (or V7/X → X) so listeners feel tension release.')
  }
  if (progression.counts.passing > progression.counts.authentic + 2) {
    tips.push('Many chromatic passes — confirm pillars so decoration does not replace the highway.')
  }
  if (!tips.length) {
    tips.push('Sing the Roman line aloud. If a label surprises you, check whether a secondary dominant or counterpart reading fits better.')
  }
  return {
    id: 'next-steps',
    section: 'next_steps',
    title: 'Practice focus',
    body: tips.join(' '),
    teachingIds: uniqTeaching(['bs7', 'tension_release', 'pillar', 'secondary_dom']),
  }
}

function collectGlossary(paragraphs: NarrativeParagraph[]): GlossaryEntry[] {
  const ids = uniqTeaching(paragraphs.flatMap((p) => p.teachingIds))
  return ids
    .map((id) => glossaryById(id))
    .filter((g): g is GlossaryEntry => g != null)
}

/**
 * Build a full teaching narrative for the arrangement (all stacks in key context).
 */
export function narrateArrangementAnalysis(
  project: ArrangementProject,
): ArrangementTeachingReport {
  const progression = analyzeArrangementHarmony(project)
  const theory = analyzeHarmonyTheory(project)
  const barbershopness = assessBarbershopness(project)

  const paragraphs: NarrativeParagraph[] = [
    ...overviewParagraphs(project, progression, barbershopness),
    ...progressionParagraphs(progression),
    ...progression.stacks.map((lab, i) =>
      chordInContext(lab, i, progression.stacks, progression.links),
    ),
    ...theoryParagraphs(theory),
    nextStepsParagraph(progression, barbershopness),
  ]

  const key = keyName(progression.tonality, progression.mode)
  const headline =
    progression.stacks.length === 0
      ? 'Add voicings to unlock harmonic teaching'
      : `Analysis in ${key}: ${progression.stacks.map((s) => s.roman).join(' – ')}`

  return {
    headline,
    paragraphs,
    glossary: collectGlossary(paragraphs),
    progression,
    theory,
    barbershopness,
  }
}

/** Single-stack teaching blurb (for click-to-learn on a chord). */
export function narrateStackInContext(
  project: ArrangementProject,
  stackId: string,
): NarrativeParagraph | null {
  const report = narrateArrangementAnalysis(project)
  return report.paragraphs.find((p) => p.section === 'chord' && p.stackId === stackId) ?? null
}
