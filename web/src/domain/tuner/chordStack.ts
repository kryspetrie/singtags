/**
 * Chord-stack scoring policy — Locked / Shifted / fault from PC set + JI targets.
 * View-model only; no Vue. Used by Phase 4–5 kill-gate / Chord Glance.
 */

import {
  BARBERSHOP_CHORDS,
  type BarbershopChordNature,
  type ChordToneRole,
} from '../arranging/chords'
import { roleCents } from './chordLock'
import { keyGridOffsetCents, type KeyGridTemperament } from './keyGridTemperament'

export type ChordStackToneIn = {
  hz: number
  /** Cents vs equal at nearest MIDI for this hz (from noteFromHz). */
  etCents: number
  midi: number
}

export type ChordStackToneOut = {
  hz: number
  midi: number
  note: string
  role: ChordToneRole
  errorCentsVsJi: number
  inTuneSelf: boolean
  /** ▲ / ▼ / OK vs JI after common-shift removal. */
  glanceMark: 'OK' | '▲' | '▼'
}

export type ChordStackScore = {
  natureId: string
  rootPc: number
  selfLocked: boolean
  keyCentered: boolean
  /** Signed common shift of the chord vs key grid (¢). */
  commonShiftCents: number
  unstable: boolean
  status: 'locked' | 'shifted' | 'fix' | 'wait'
  tones: ChordStackToneOut[]
  assistedPinRequired: boolean
}

export type ChordStackScoreOpts = {
  natureId: string
  rootPc: number
  keyPc: number
  temperament?: KeyGridTemperament
  customOffsetsCents?: readonly number[]
  /** JI role green window (default 5). */
  chordLockWindowCents?: number
  /** |common shift| below this ⇒ key-centered (default 8). */
  keyCenterWindowCents?: number
  /** Phase 4 Conditional — UI shows Assisted banner. */
  assistedPinRequired?: boolean
}

/**
 * Score a held stack against a pinned nature + root.
 * Assigns tones low→high to nature roles in pitch order.
 */
export function scoreChordStack(
  tones: readonly ChordStackToneIn[],
  opts: ChordStackScoreOpts,
): ChordStackScore {
  const nature = BARBERSHOP_CHORDS.find((c) => c.id === opts.natureId)
  const window = opts.chordLockWindowCents ?? 5
  const keyWin = opts.keyCenterWindowCents ?? 8
  const temperament = opts.temperament ?? 'equal'

  const empty = (status: ChordStackScore['status']): ChordStackScore => ({
    natureId: opts.natureId,
    rootPc: opts.rootPc,
    selfLocked: false,
    keyCentered: false,
    commonShiftCents: 0,
    unstable: true,
    status,
    tones: [],
    assistedPinRequired: opts.assistedPinRequired === true,
  })

  if (!nature || tones.length === 0) return empty('wait')

  const roles = sortedRoles(nature)
  const sorted = [...tones].sort((a, b) => a.hz - b.hz)
  if (sorted.length < roles.length) return empty('wait')

  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
  const used = sorted.slice(0, roles.length)
  const errors: number[] = []
  for (let i = 0; i < roles.length; i++) {
    const role = roles[i]!
    const tone = used[i]!
    const ji = roleCents(nature, role)
    errors.push(tone.etCents - ji)
  }

  const commonShift = median(errors)
  const relative = errors.map((e) => e - commonShift)
  const selfLocked = relative.every((e) => Math.abs(e) <= window)

  // Key centering: common shift vs key-grid offset of the root
  const rootGrid = keyGridOffsetCents(
    opts.rootPc,
    opts.keyPc,
    temperament,
    opts.customOffsetsCents,
  )
  const shiftVsKey = commonShift - rootGrid
  const keyCentered = Math.abs(shiftVsKey) <= keyWin

  let status: ChordStackScore['status'] = 'fix'
  if (selfLocked && keyCentered) status = 'locked'
  else if (selfLocked && !keyCentered) status = 'shifted'
  else status = 'fix'

  const toneOut: ChordStackToneOut[] = used.map((tone, i) => {
    const role = roles[i]!
    const rel = relative[i]!
    const pc = ((tone.midi % 12) + 12) % 12
    const oct = Math.floor(tone.midi / 12) - 1
    return {
      hz: tone.hz,
      midi: tone.midi,
      note: `${NOTE_NAMES[pc]!}${oct}`,
      role,
      errorCentsVsJi: rel,
      inTuneSelf: Math.abs(rel) <= window,
      glanceMark: Math.abs(rel) <= window ? 'OK' : rel > 0 ? '▲' : '▼',
    }
  })

  return {
    natureId: opts.natureId,
    rootPc: opts.rootPc,
    selfLocked,
    keyCentered,
    commonShiftCents: shiftVsKey,
    unstable: false,
    status,
    tones: toneOut,
    assistedPinRequired: opts.assistedPinRequired === true,
  }
}

function sortedRoles(nature: BarbershopChordNature): ChordToneRole[] {
  const roles: ChordToneRole[] = []
  for (const key of Object.keys(nature.offsets)) {
    const n = Number(key)
    if (n === 1 || n === 3 || n === 5 || n === 6 || n === 7 || n === 9) {
      roles.push(n)
    }
  }
  return roles.sort((a, b) => a - b)
}

function median(xs: number[]): number {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2
}
