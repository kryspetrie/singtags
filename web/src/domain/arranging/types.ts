/**
 * Arrangement document types — mirrors knowledge/schemas/arrangement.v1.json.
 * Pure domain: no Vue / storage / audio.
 */

export const ARRANGEMENT_SCHEMA = 'arranging.arrangement.v1' as const
export const ARRANGING_PPQ = 480

export type WizardStep =
  | 'melody'
  | 'step1_roots'
  | 'step2_confirm'
  | 'step3_pmn_pcf'
  | 'step4_smn_pcf'
  | 'step5_smn_scf'
  | 'step6_alts'
  | 'step7_variety'
  | 'step8_voicing'
  | 'step9_final'
  | 'done'

export type MelodyRole = 'pmn' | 'smn' | 'unknown'

export type MelodyEvent = {
  id: string
  midi: number
  startTick: number
  durationTicks: number
  lyric?: string
  role: MelodyRole
}

export type Pillar = {
  id: string
  rootPc: number
  startTick: number
  endTick: number
  source: 'ear' | 'sheet' | 'user' | 'inferred'
  confirmed: boolean
  /** Optional infer hint for coach UI (not required by schema). */
  reason?: string
  confidence?: number
}

export type StackLayer = 'primary' | 'passing' | 'embellishment'

export type RuleTag =
  | 'R1_p5'
  | 'R1_retro'
  | 'R2_chromatic'
  | 'R3_tritone'
  | 'R4_dim7'
  | 'R5_m3up'
  | 'springboard'

export type ChordStack = {
  id: string
  startTick: number
  durationTicks: number
  rootPc: number
  natureId: string
  voicing: string
  spread: boolean
  layer: StackLayer
  scfGroup: number | null
  pillarId: string | null
  midi: { tenor: number; lead: number; bari: number; bass: number } | null
  ruleTags: RuleTag[]
}

export type TuningMode = 'equal' | 'just'

export type ContestProfile = 'sai11' | 'bhs_extended' | 'learning'

/** Major vs minor-feel tonality for pillars / RN / springboards. */
export type TonalityMode = 'major' | 'minor'

export type ArrangementProject = {
  schema: typeof ARRANGEMENT_SCHEMA
  id: string
  title: string
  tonality: number
  /** Affects pillar inference, springboards, and Roman labels. Default major. */
  tonalityMode: TonalityMode
  preferFlats: boolean
  bpm: number
  ppq: typeof ARRANGING_PPQ
  wizardStep: WizardStep
  tuningMode: TuningMode
  contestProfile: ContestProfile
  melody: MelodyEvent[]
  pillars: Pillar[]
  stacks: ChordStack[]
  createdAt: number
  updatedAt: number
}

export const WIZARD_STEP_LABELS: Record<WizardStep, string> = {
  melody: 'Enter melody',
  step1_roots: 'I — Primary roots',
  step2_confirm: 'II — Confirm pillars',
  step3_pmn_pcf: 'III — PMN with PCF',
  step4_smn_pcf: 'IV — SMN with PCF',
  step5_smn_scf: 'V — SCF passing',
  step6_alts: 'VI — Strengthen',
  step7_variety: 'VII — Variety / swipes',
  step8_voicing: 'VIII — Voicing polish',
  step9_final: 'IX — Final options',
  done: 'Done',
}

export const WIZARD_ORDER: WizardStep[] = [
  'melody',
  'step1_roots',
  'step2_confirm',
  'step3_pmn_pcf',
  'step4_smn_pcf',
  'step5_smn_scf',
  'step6_alts',
  'step7_variety',
  'step8_voicing',
  'step9_final',
  'done',
]

/** Fallback id helper for tests; production code should inject IdGenerator. */
export function newId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

export function createEmptyArrangement(
  title = 'Untitled',
  opts?: { id?: string; now?: number },
): ArrangementProject {
  const now = opts?.now ?? Date.now()
  return {
    schema: ARRANGEMENT_SCHEMA,
    id: opts?.id ?? newId('arr'),
    title,
    tonality: 0,
    tonalityMode: 'major',
    preferFlats: true,
    bpm: 100,
    ppq: ARRANGING_PPQ,
    wizardStep: 'melody',
    tuningMode: 'equal',
    contestProfile: 'sai11',
    melody: [],
    pillars: [],
    stacks: [],
    createdAt: now,
    updatedAt: now,
  }
}
