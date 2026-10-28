/**
 * Voice a packed key-change path for Hear — global inversion search for
 * smooth part motion, strong/ringing stacks, and men’s TTBB range.
 */
import type { VoicingPitches } from '../../domain/arranging/chords/chords'
import type { PackedModulationStep } from '../../domain/arranging/keyChangePack'
import { natureToSketchQuality } from '../../lib/tagRoll/harmonySketch'
import {
  optimizeSketchHearPath,
  SKETCH_HEAR_BASS_MIN,
  SKETCH_HEAR_TENOR_MAX,
  type SketchHearChordRef,
} from '../../domain/arranging/sketchHearVoicing'

export type MelodyLeadHint = {
  startTick: number
  endTick: number
  midi: number
}

function leadForStep(
  step: PackedModulationStep,
  melody: readonly MelodyLeadHint[],
): number | undefined {
  if (!melody.length) return undefined
  const hit = melody.find(
    (m) => m.startTick >= step.startTick && m.startTick < step.endTick,
  )
  if (hit) return hit.midi
  // Prefer the melody onset nearest the step start within ±1 beat-ish window.
  let best: MelodyLeadHint | null = null
  let bestDist = Infinity
  for (const m of melody) {
    const d = Math.abs(m.startTick - step.startTick)
    if (d < bestDist) {
      bestDist = d
      best = m
    }
  }
  // Only latch if reasonably near (half a measure at typical 480ppq/4/4 ≈ 960).
  if (best && bestDist <= 960) return best.midi
  return undefined
}

/**
 * Build TTBB midis for each packed modulation chord using the same path
 * optimizer as Sketch / Polish (I/V home bass, min motion, ring tier).
 */
export function voiceModulationHearPath(
  steps: readonly PackedModulationStep[],
  opts?: {
    /** Departure key — opens I/V with bass on 1 or 5 when possible. */
    tonality?: number
    melodyNotes?: readonly MelodyLeadHint[]
  },
): VoicingPitches[] {
  if (!steps.length) return []
  const melody = opts?.melodyNotes ?? []
  const refs: SketchHearChordRef[] = steps.map((s) => ({
    rootPc: s.rootPc,
    quality: natureToSketchQuality(s.natureId),
    leadMidi: leadForStep(s, melody),
  }))
  const path = optimizeSketchHearPath(refs, { tonality: opts?.tonality ?? 0 })
  // Clamp any edge-case stacks into men’s preview band (optimizer already prefers it).
  return path.map((p) => {
    let { bass, bari, lead, tenor } = p
    while (bass < SKETCH_HEAR_BASS_MIN - 7 && tenor + 12 <= SKETCH_HEAR_TENOR_MAX + 7) {
      bass += 12
      bari += 12
      lead += 12
      tenor += 12
    }
    while (tenor > SKETCH_HEAR_TENOR_MAX + 7 && bass - 12 >= SKETCH_HEAR_BASS_MIN - 7) {
      bass -= 12
      bari -= 12
      lead -= 12
      tenor -= 12
    }
    if (tenor <= lead) tenor = lead + 1
    if (bass > bari) bass = Math.min(bass, bari)
    return { bass, bari, lead, tenor }
  })
}

export type KeyChangeRollGhost = {
  role: 'tenor' | 'lead' | 'bari' | 'bass'
  midi: number
  startTick: number
  durationTicks: number
  color: string
  /** Paint above written notes so the proposal stays visible. */
  overlay: true
}

const PART_FALLBACK: Record<KeyChangeRollGhost['role'], string> = {
  tenor: '#c45c26',
  lead: '#1d6a9f',
  bari: '#2f7d4a',
  bass: '#5b3d8f',
}

function melodyCoversStep(
  step: PackedModulationStep,
  melody: readonly MelodyLeadHint[],
): boolean {
  return melody.some((m) => m.startTick < step.endTick && m.endTick > step.startTick)
}

/** TTBB ghosts for the selected path, timed to the packed steps. Lead is omitted where the tune is already written. */
export function keyChangeRollGhosts(
  steps: readonly PackedModulationStep[],
  opts: {
    tonality?: number
    melodyNotes?: readonly MelodyLeadHint[]
    colorFor?: (partName: string) => string | undefined
  },
): KeyChangeRollGhost[] {
  const melody = opts.melodyNotes ?? []
  const voiced = voiceModulationHearPath(steps, {
    tonality: opts.tonality,
    melodyNotes: melody,
  })
  const out: KeyChangeRollGhost[] = []
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]!
    const stack = voiced[i]
    if (!stack) continue
    const dur = Math.max(1, step.endTick - step.startTick)
    const roles = ['bass', 'bari', 'tenor'] as const
    const pitches: Record<(typeof roles)[number] | 'lead', number> = stack
    const showLead = !melodyCoversStep(step, melody)
    const names = showLead ? ([...roles, 'lead'] as const) : roles
    for (const role of names) {
      const partName = role === 'bari' ? 'Bari' : role[0]!.toUpperCase() + role.slice(1)
      out.push({
        role,
        midi: pitches[role],
        startTick: step.startTick,
        durationTicks: dur,
        color: opts.colorFor?.(partName) || PART_FALLBACK[role],
        overlay: true,
      })
    }
  }
  return out
}
