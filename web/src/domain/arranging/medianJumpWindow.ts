/**
 * Median-window voice leading for parts Fill just wrote.
 *
 * The reference for each part is the median absolute step along that part
 * (whole line). A step is an unexpected jump when it is at least a major
 * third and bigger than that median by more than a minor third. A leap that
 * matches the part's usual motion is ordinary, even if it is wide. A fourth
 * in a line that otherwise steps is not.
 *
 * Repair, per jump, smallest window first:
 * 1. Revoice the arrival chord only. Each alternate is another inversion,
 *    spread, or other legal chord that still holds the sung notes. The caller
 *    lists those pitches; this module does not name chords.
 * 2. If the jump is still unexpected, pin that arrival pitch so it stays, and
 *    widen the window one chord at a time. The chords around it may move.
 *    Keep a candidate only when the median step inside that same window drops
 *    by at least a semitone, the line's unexpected-step total does not grow,
 *    and no new step is larger than the worst step already in the line.
 *
 * Sung (locked) pitches never change. Lead is not a role here: it is already
 * fixed and simply omitted from the line.
 */

export const MEDIAN_JUMP_MARGIN = 3
export const MEDIAN_JUMP_MIN = 4
export const MEDIAN_JUMP_MAX_SPAN = 5
export const MEDIAN_JUMP_MIN_DROP = 1
const SEARCH_CAP = 2000

export const MEDIAN_JUMP_ROLES = ['tenor', 'bari', 'bass'] as const
export type MedianJumpRole = (typeof MEDIAN_JUMP_ROLES)[number]

export type MedianJumpChord = {
  id: string
  pitch: Partial<Record<MedianJumpRole, number>>
  locked: readonly MedianJumpRole[]
  /** Other legal stacks for this beat. Locked roles must match `pitch`. */
  alternates: readonly Partial<Record<MedianJumpRole, number>>[]
}

export type MedianJumpRepair = {
  step: number
  arrival: number
  kind: 'revoice-jump' | 'move-neighbors'
  window: readonly [number, number]
  medianBefore: number
  medianAfter: number
}

export type MedianJumpResult = {
  chords: MedianJumpChord[]
  repairs: MedianJumpRepair[]
}

export function median(values: readonly number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[mid]!
  return (sorted[mid - 1]! + sorted[mid]!) / 2
}

export function isUnexpectedJump(semitones: number, partMedian: number): boolean {
  return semitones >= MEDIAN_JUMP_MIN && semitones > partMedian + MEDIAN_JUMP_MARGIN
}

type Step = { index: number; semitones: number }

function cloneChords(chords: readonly MedianJumpChord[]): MedianJumpChord[] {
  return chords.map((chord) => ({
    id: chord.id,
    pitch: { ...chord.pitch },
    locked: [...chord.locked],
    alternates: chord.alternates.map((alt) => ({ ...alt })),
  }))
}

function pitchKey(pitch: Partial<Record<MedianJumpRole, number>>): string {
  return MEDIAN_JUMP_ROLES.map((role) => pitch[role] ?? '·').join(',')
}

function respectsLocks(chord: MedianJumpChord, alt: Partial<Record<MedianJumpRole, number>>): boolean {
  for (const role of chord.locked) {
    if (alt[role] != null && alt[role] !== chord.pitch[role]) return false
  }
  return true
}

function mergePitch(
  chord: MedianJumpChord,
  alt: Partial<Record<MedianJumpRole, number>>,
): Partial<Record<MedianJumpRole, number>> {
  const pitch = { ...chord.pitch }
  for (const role of MEDIAN_JUMP_ROLES) {
    if (alt[role] == null || chord.locked.includes(role)) continue
    pitch[role] = alt[role]
  }
  return pitch
}

function choices(chord: MedianJumpChord): Partial<Record<MedianJumpRole, number>>[] {
  const out: Partial<Record<MedianJumpRole, number>>[] = []
  const seen = new Set<string>()
  for (const alt of [chord.pitch, ...chord.alternates]) {
    if (!respectsLocks(chord, alt)) continue
    const pitch = mergePitch(chord, alt)
    const key = pitchKey(pitch)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(pitch)
  }
  return out
}

function stepsFor(chords: readonly MedianJumpChord[], role: MedianJumpRole, lo = 0, hi = chords.length - 1): Step[] {
  const steps: Step[] = []
  for (let i = lo; i < hi; i++) {
    const left = chords[i]?.pitch[role]
    const right = chords[i + 1]?.pitch[role]
    if (left == null || right == null) continue
    steps.push({ index: i, semitones: Math.abs(right - left) })
  }
  return steps
}

function windowMedianSum(chords: readonly MedianJumpChord[], lo: number, hi: number): number {
  let sum = 0
  for (const role of MEDIAN_JUMP_ROLES) {
    const steps = stepsFor(chords, role, lo, hi).map((step) => step.semitones)
    if (steps.length === 0) continue
    sum += median(steps)
  }
  return sum
}

function windowMotion(chords: readonly MedianJumpChord[], lo: number, hi: number): number {
  let sum = 0
  for (const role of MEDIAN_JUMP_ROLES) {
    for (const step of stepsFor(chords, role, lo, hi)) sum += step.semitones
  }
  return sum
}

export type MedianJumpOptions = {
  /** A step the style already treats as ordinary, such as a bass octave. */
  isOrdinaryStep?: (role: MedianJumpRole, semitones: number) => boolean
}

/** Bass may still take an octave when the rest of the line is stepwise. */
export function isBassOctaveStep(role: MedianJumpRole, semitones: number): boolean {
  return role === 'bass' && semitones === 12
}

function stepIsUnexpected(
  role: MedianJumpRole,
  semitones: number,
  partMedian: number,
  ordinary?: MedianJumpOptions['isOrdinaryStep'],
): boolean {
  if (ordinary?.(role, semitones)) return false
  return isUnexpectedJump(semitones, partMedian)
}

function lineEnergy(
  chords: readonly MedianJumpChord[],
  ordinary?: MedianJumpOptions['isOrdinaryStep'],
): { count: number; semitones: number; max: number } {
  let count = 0
  let semitones = 0
  let max = 0
  for (const role of MEDIAN_JUMP_ROLES) {
    const steps = stepsFor(chords, role)
    const partMedian = median(steps.map((step) => step.semitones))
    for (const step of steps) {
      max = Math.max(max, step.semitones)
      if (!stepIsUnexpected(role, step.semitones, partMedian, ordinary)) continue
      count += 1
      semitones += step.semitones
    }
  }
  return { count, semitones, max }
}

function withPitch(chords: readonly MedianJumpChord[], index: number, pitch: Partial<Record<MedianJumpRole, number>>): MedianJumpChord[] {
  return chords.map((chord, i) => (i === index ? { ...chord, pitch: { ...pitch } } : chord))
}

function acceptable(
  current: readonly MedianJumpChord[],
  next: readonly MedianJumpChord[],
  lo: number,
  hi: number,
  ordinary?: MedianJumpOptions['isOrdinaryStep'],
): boolean {
  const before = windowMedianSum(current, lo, hi)
  const after = windowMedianSum(next, lo, hi)
  if (before - after < MEDIAN_JUMP_MIN_DROP) return false
  const from = lineEnergy(current, ordinary)
  const to = lineEnergy(next, ordinary)
  return to.count <= from.count && to.semitones <= from.semitones && to.max <= from.max
}

function searchWindow(
  chords: readonly MedianJumpChord[],
  lo: number,
  hi: number,
  pinned: ReadonlySet<number>,
  ordinary?: MedianJumpOptions['isOrdinaryStep'],
): MedianJumpChord[] | null {
  const lists: Partial<Record<MedianJumpRole, number>>[][] = []
  for (let i = lo; i <= hi; i++) {
    lists.push(pinned.has(i) ? [chords[i]!.pitch] : choices(chords[i]!))
  }
  const product = lists.reduce((n, list) => n * list.length, 1)
  return product <= SEARCH_CAP ? brute(chords, lo, lists, ordinary) : descend(chords, lo, hi, pinned, ordinary)
}

function brute(
  chords: readonly MedianJumpChord[],
  lo: number,
  lists: readonly (readonly Partial<Record<MedianJumpRole, number>>[])[],
  ordinary?: MedianJumpOptions['isOrdinaryStep'],
): MedianJumpChord[] | null {
  const hi = lo + lists.length - 1
  let best: MedianJumpChord[] | null = null
  let bestMedian = Number.POSITIVE_INFINITY
  let bestMotion = Number.POSITIVE_INFINITY
  let bestChanges = Number.POSITIVE_INFINITY

  const walk = (offset: number, acc: MedianJumpChord[]) => {
    if (offset === lists.length) {
      if (!acceptable(chords, acc, lo, hi, ordinary)) return
      const score = windowMedianSum(acc, lo, hi)
      const motion = windowMotion(acc, lo, hi)
      const changes = acc.reduce(
        (n, chord, i) => n + (pitchKey(chord.pitch) === pitchKey(chords[i]!.pitch) ? 0 : 1),
        0,
      )
      const better =
        score < bestMedian - 1e-9 ||
        (Math.abs(score - bestMedian) <= 1e-9 && motion < bestMotion) ||
        (Math.abs(score - bestMedian) <= 1e-9 && motion === bestMotion && changes < bestChanges)
      if (!better) return
      best = acc
      bestMedian = score
      bestMotion = motion
      bestChanges = changes
      return
    }
    for (const pitch of lists[offset]!) {
      walk(offset + 1, withPitch(acc, lo + offset, pitch))
    }
  }
  walk(0, chords.map((chord) => ({ ...chord, pitch: { ...chord.pitch } })))
  return best
}

function descend(
  chords: readonly MedianJumpChord[],
  lo: number,
  hi: number,
  pinned: ReadonlySet<number>,
  ordinary?: MedianJumpOptions['isOrdinaryStep'],
): MedianJumpChord[] | null {
  let current = chords.map((chord) => ({ ...chord, pitch: { ...chord.pitch } }))
  let improved = false
  for (let sweep = 0; sweep < 3; sweep++) {
    let sweepImproved = false
    for (let index = lo; index <= hi; index++) {
      if (pinned.has(index)) continue
      for (const pitch of choices(current[index]!)) {
        const next = withPitch(current, index, pitch)
        if (!acceptable(current, next, lo, hi, ordinary)) continue
        current = next
        sweepImproved = true
        improved = true
      }
    }
    if (!sweepImproved) break
  }
  return improved ? current : null
}

function firstOpenJump(
  chords: readonly MedianJumpChord[],
  gaveUp: ReadonlySet<string>,
  ordinary?: MedianJumpOptions['isOrdinaryStep'],
): number | null {
  let found: number | null = null
  for (const role of MEDIAN_JUMP_ROLES) {
    const steps = stepsFor(chords, role)
    const partMedian = median(steps.map((step) => step.semitones))
    for (const step of steps) {
      if (!stepIsUnexpected(role, step.semitones, partMedian, ordinary)) continue
      if (gaveUp.has(`${role}:${step.index}`)) continue
      if (found == null || step.index < found) found = step.index
    }
  }
  return found
}

function stillUnexpected(
  chords: readonly MedianJumpChord[],
  step: number,
  ordinary?: MedianJumpOptions['isOrdinaryStep'],
): MedianJumpRole[] {
  const roles: MedianJumpRole[] = []
  for (const role of MEDIAN_JUMP_ROLES) {
    const steps = stepsFor(chords, role)
    const partMedian = median(steps.map((item) => item.semitones))
    const hit = steps.find((item) => item.index === step)
    if (hit && stepIsUnexpected(role, hit.semitones, partMedian, ordinary)) roles.push(role)
  }
  return roles
}

function neighborMoved(before: readonly MedianJumpChord[], after: readonly MedianJumpChord[], arrival: number): boolean {
  return after.some((chord, index) => index !== arrival && pitchKey(chord.pitch) !== pitchKey(before[index]!.pitch))
}

/**
 * One repair per unexpected jump, left to right, until every remaining jump
 * has no accepted alternate in a window of `MEDIAN_JUMP_MAX_SPAN` chords.
 * A suggested chord uses {@link medianJumpRankPenalty} against the step into
 * the previous stack, which is the recent median when only two chords are known.
 */
let medianJumpPenaltyEnabled: () => boolean = () => true

/** Fill and the coach share one switch. Unbound means the penalty stays on. */
export function bindMedianJumpPenalty(read: () => boolean): void {
  medianJumpPenaltyEnabled = read
}

export function medianJumpRankPenalty(
  prevPrev: { tenor: number; bari: number; bass: number } | null | undefined,
  prev: { tenor: number; bari: number; bass: number } | null | undefined,
  next: { tenor: number; bari: number; bass: number },
): number {
  if (!medianJumpPenaltyEnabled()) return 0
  if (!prev || !prevPrev) return 0
  let penalty = 0
  for (const role of MEDIAN_JUMP_ROLES) {
    const history = Math.abs(prev[role] - prevPrev[role])
    const step = Math.abs(next[role] - prev[role])
    if (isBassOctaveStep(role, step)) continue
    if (!isUnexpectedJump(step, history)) continue
    penalty += (step - history - MEDIAN_JUMP_MARGIN) / 8
  }
  return penalty
}

export function smoothMedianJumpWindow(
  input: readonly MedianJumpChord[],
  options?: MedianJumpOptions,
): MedianJumpResult {
  const ordinary = options?.isOrdinaryStep
  const chords = cloneChords(input)
  const repairs: MedianJumpRepair[] = []
  const gaveUp = new Set<string>()

  for (let guard = 0; guard < chords.length * MEDIAN_JUMP_ROLES.length; guard++) {
    const step = firstOpenJump(chords, gaveUp, ordinary)
    if (step == null) break
    const arrival = step + 1
    const started = cloneChords(chords)
    let lo = step
    let hi = arrival
    let applied: readonly [number, number] | null = null
    const phaseA = searchWindow(chords, lo, hi, new Set([step]), ordinary)
    if (phaseA) {
      chords.splice(0, chords.length, ...phaseA)
      applied = [lo, hi]
    }

    if (stillUnexpected(chords, step, ordinary).length > 0) {
      const pinned = new Set<number>([arrival])
      for (;;) {
        const widened = searchWindow(chords, lo, hi, pinned, ordinary)
        if (widened) {
          chords.splice(0, chords.length, ...widened)
          applied = [lo, hi]
        }
        if (stillUnexpected(chords, step, ordinary).length === 0) break
        if (hi - lo + 1 >= MEDIAN_JUMP_MAX_SPAN || (lo === 0 && hi === chords.length - 1)) break
        lo = Math.max(0, lo - 1)
        hi = Math.min(chords.length - 1, hi + 1)
      }
    }

    if (applied && chords.some((chord, index) => pitchKey(chord.pitch) !== pitchKey(started[index]!.pitch))) {
      repairs.push({
        step,
        arrival,
        kind: neighborMoved(started, chords, arrival) ? 'move-neighbors' : 'revoice-jump',
        window: applied,
        medianBefore: windowMedianSum(started, applied[0], applied[1]),
        medianAfter: windowMedianSum(chords, applied[0], applied[1]),
      })
    }
    for (const role of stillUnexpected(chords, step, ordinary)) gaveUp.add(`${role}:${step}`)
  }

  return { chords, repairs }
}
