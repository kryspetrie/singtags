/**
 * Phase 4 multi-F0 kill-gate evaluation on synthetic held stacks.
 * Pure / CI — measures Locked / Shifted / Fix discrimination + PC-set recall.
 */

import { BARBERSHOP_CHORDS } from '../../domain/arranging/chords'
import { roleCents } from '../../domain/tuner/chordLock'
import { scoreChordStack, type ChordStackToneIn } from '../../domain/tuner/chordStack'
import { matchNatureFromPcs } from '../../domain/tuner/natureMatch'
import { noteFromHz } from '../../domain/tuner/noteFromHz'
import { multiF0, synthStackFrame } from './multiF0'

export type KillGateCaseKind = 'locked' | 'shifted' | 'fix'

export type KillGateCaseResult = {
  kind: KillGateCaseKind
  natureId: string
  rootPc: number
  expectedStatus: 'locked' | 'shifted' | 'fix'
  scoredStatus: 'locked' | 'shifted' | 'fix' | 'wait'
  statusOk: boolean
  pcRecall: number
  natureOk: boolean
}

export type KillGateReport = {
  cases: KillGateCaseResult[]
  statusAccuracy: number
  natureAccuracy: number
  meanPcRecall: number
  /** Provisional rubric against synthetic Go threshold (0.95). */
  syntheticsGo: boolean
}

const A4 = 440
const SR = 48_000
const WIN = 8192
const SHIFT_CENTS = 18
const FAULT_CENTS = 22

function midiHz(midi: number): number {
  return A4 * 2 ** ((midi - 69) / 12)
}

function jiStackHz(
  rootMidi: number,
  natureId: string,
  commonShiftCents = 0,
  faultRole: number | null = null,
): number[] {
  const nature = BARBERSHOP_CHORDS.find((c) => c.id === natureId)
  if (!nature) return []
  const roles = Object.keys(nature.offsets)
    .map(Number)
    .sort((a, b) => a - b)
  const out: number[] = []
  for (const role of roles) {
    const off = nature.offsets[role as 1 | 3 | 5 | 6 | 7 | 9]
    if (off == null) continue
    const etMidi = rootMidi + off
    const ji = roleCents(nature, role as 1 | 3 | 5 | 6 | 7 | 9)
    let cents = ji + commonShiftCents
    if (faultRole === role) cents += FAULT_CENTS
    out.push(midiHz(etMidi) * 2 ** (cents / 1200))
  }
  return out
}

function expectedPcs(rootPc: number, natureId: string): number[] {
  const nature = BARBERSHOP_CHORDS.find((c) => c.id === natureId)
  if (!nature) return []
  return Object.values(nature.offsets)
    .map((off) => (((rootPc + off) % 12) + 12) % 12)
    .sort((a, b) => a - b)
}

function tonesFromPeaks(peaks: { hz: number }[]): ChordStackToneIn[] {
  const tones: ChordStackToneIn[] = []
  for (const p of peaks) {
    const n = noteFromHz(p.hz, A4)
    if (!n) continue
    tones.push({ hz: p.hz, midi: n.midi, etCents: n.cents })
  }
  return tones.sort((a, b) => a.hz - b.hz)
}

function pcRecall(got: readonly number[], want: readonly number[]): number {
  if (!want.length) return 0
  let hit = 0
  for (const p of want) if (got.includes(p)) hit++
  return hit / want.length
}

function evalCase(
  kind: KillGateCaseKind,
  natureId: string,
  rootMidi: number,
): KillGateCaseResult {
  const rootPc = ((rootMidi % 12) + 12) % 12
  const shift = kind === 'shifted' ? SHIFT_CENTS : 0
  // Major/minor may not have role 7 — fault the third instead
  const nature = BARBERSHOP_CHORDS.find((c) => c.id === natureId)!
  const roles = Object.keys(nature.offsets).map(Number)
  const fault =
    kind === 'fix' ? (roles.includes(7) ? 7 : roles.includes(3) ? 3 : roles[roles.length - 1]!) : null

  const hz = jiStackHz(rootMidi, natureId, shift, fault)
  const frame = synthStackFrame(hz, SR, WIN, 0.22)
  const { peaks, pitchClasses } = multiF0(frame, SR, {
    a4Hz: A4,
    maxPeaks: Math.max(4, hz.length),
    salienceFloor: 0.12,
    fMinHz: 65,
    fMaxHz: 1100,
  })
  const wantPcs = expectedPcs(rootPc, natureId)
  const recall = pcRecall(pitchClasses, wantPcs)
  const match = matchNatureFromPcs(pitchClasses)
  const natureOk = match?.natureId === natureId && match.rootPc === rootPc

  const expectedStatus = kind === 'locked' ? 'locked' : kind === 'shifted' ? 'shifted' : 'fix'
  // Score with pinned nature (Assisted path) — discrimination of self/key is the Go metric
  const tones = tonesFromPeaks(peaks)
  const score = scoreChordStack(tones, {
    natureId,
    rootPc,
    keyPc: rootPc,
    chordLockWindowCents: 5,
    keyCenterWindowCents: 8,
  })
  return {
    kind,
    natureId,
    rootPc,
    expectedStatus,
    scoredStatus: score.status,
    statusOk: score.status === expectedStatus,
    pcRecall: recall,
    natureOk: !!natureOk,
  }
}

/**
 * Run the synthetic kill-gate battery (C/F/G roots × major/seventh × locked/shifted/fix).
 */
export function runSyntheticKillGate(): KillGateReport {
  const natures = ['seventh', 'major'] as const
  const roots = [48, 53, 55] // C3, F3, G3
  const kinds: KillGateCaseKind[] = ['locked', 'shifted', 'fix']
  const cases: KillGateCaseResult[] = []
  for (const natureId of natures) {
    for (const root of roots) {
      for (const kind of kinds) {
        cases.push(evalCase(kind, natureId, root))
      }
    }
  }
  const statusOk = cases.filter((c) => c.statusOk).length
  const natureOk = cases.filter((c) => c.natureOk).length
  const meanPcRecall = cases.reduce((s, c) => s + c.pcRecall, 0) / cases.length
  const statusAccuracy = statusOk / cases.length
  const natureAccuracy = natureOk / cases.length
  return {
    cases,
    statusAccuracy,
    natureAccuracy,
    meanPcRecall,
    syntheticsGo: statusAccuracy >= 0.95 && natureAccuracy >= 0.9,
  }
}
