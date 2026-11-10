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

export type ChordStackScore = {
  natureId: string
  rootPc: number
  selfLocked: boolean
  keyCentered: boolean
  /** Signed common shift of the chord vs key grid (¢). */
  commonShiftCents: number
  unstable: boolean
  status: 'locked' | 'shifted' | 'fix' | 'wait'
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

  if (!nature || tones.length === 0) {
    return {
      natureId: opts.natureId,
      rootPc: opts.rootPc,
      selfLocked: false,
      keyCentered: false,
      commonShiftCents: 0,
      unstable: true,
      status: 'wait',
    }
  }

  const roles = sortedRoles(nature)
  const sorted = [...tones].sort((a, b) => a.hz - b.hz)
  if (sorted.length < roles.length) {
    return {
      natureId: opts.natureId,
      rootPc: opts.rootPc,
      selfLocked: false,
      keyCentered: false,
      commonShiftCents: 0,
      unstable: true,
      status: 'wait',
    }
  }

  const used = sorted.slice(0, roles.length)
  const errors: number[] = []
  for (let i = 0; i < roles.length; i++) {
    const role = roles[i]!
    const tone = used[i]!
    const ji = roleCents(nature, role as ChordToneRole)
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

  return {
    natureId: opts.natureId,
    rootPc: opts.rootPc,
    selfLocked,
    keyCentered,
    commonShiftCents: shiftVsKey,
    unstable: false,
    status,
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
