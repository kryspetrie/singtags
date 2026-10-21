/**
 * Complete a sparse TTBB stack (melody + 0–3 harmony pitches) into a full
 * barbershop voicing, or explain why the moment should be skipped.
 */
import {
  BARBERSHOP_CHORDS,
  leadRoleInChord,
  placeVoicing,
  VOICINGS_BY_CHORD,
  type VoicingPitches,
} from './chords'
import { identifyNatureFromMidi, majorKeyIncompleteAllows } from './chordCompletion'
import { isNatureAllowed, type ContestProfile } from './contestProfile'
import type { TonalityMode } from './types'

export type SparseSkipReason = 'unrecognized' | 'outside_vocab' | 'no_completion'

export type SparseHarmonyRole = 'tenor' | 'bari' | 'bass'

export type SparseCompleteOk = {
  ok: true
  natureId: string
  rootPc: number
  pitches: VoicingPitches
  filledRoles: SparseHarmonyRole[]
  lockedRoles: Array<'tenor' | 'lead' | 'bari' | 'bass'>
}

export type SparseCompleteFail = {
  ok: false
  reason: SparseSkipReason
}

export type SparseCompleteResult = SparseCompleteOk | SparseCompleteFail

const HARMONY_ROLES: readonly SparseHarmonyRole[] = ['tenor', 'bari', 'bass']

/** Minimum ID confidence when no Detected preference is supplied. */
const MIN_ID_CONFIDENCE = 0.45

function pc(m: number): number {
  return ((m % 12) + 12) % 12
}

function uniquePcs(midis: readonly number[]): number[] {
  return [...new Set(midis.map(pc))]
}

function chordTonePcs(rootPc: number, natureId: string): number[] {
  const chord = BARBERSHOP_CHORDS.find((c) => c.id === natureId)
  if (!chord) return []
  return Object.values(chord.offsets)
    .filter((o): o is number => o != null)
    .map((o) => pc(rootPc + o))
}

function presentList(midi: Partial<VoicingPitches> & { lead: number }): number[] {
  const out: number[] = [midi.lead]
  for (const r of HARMONY_ROLES) {
    if (midi[r] != null) out.push(midi[r]!)
  }
  return out
}

function presentPcsFitNature(
  presentMidi: readonly number[],
  natureId: string,
  rootPc: number,
): boolean {
  const tones = chordTonePcs(rootPc, natureId)
  if (!tones.length) return false
  return uniquePcs(presentMidi).every((p) => tones.includes(p))
}

function spacingOk(midi: VoicingPitches): boolean {
  return midi.tenor > midi.lead && midi.bass <= Math.min(midi.bari, midi.lead)
}

/** Locked non-lead may match by pitch-class; lead must be exact. */
function matchesLocked(
  midi: VoicingPitches,
  locked: Partial<VoicingPitches>,
): boolean {
  for (const k of ['bass', 'bari', 'lead', 'tenor'] as const) {
    if (locked[k] == null) continue
    if (k === 'lead') {
      if (midi.lead !== locked.lead) return false
    } else if (pc(midi[k]) !== pc(locked[k]!)) {
      return false
    }
  }
  return true
}

function applyExactLocks(
  midi: VoicingPitches,
  locked: Partial<VoicingPitches>,
): VoicingPitches {
  return {
    tenor: locked.tenor ?? midi.tenor,
    lead: locked.lead ?? midi.lead,
    bari: locked.bari ?? midi.bari,
    bass: locked.bass ?? midi.bass,
  }
}

/**
 * Place a catalogue voicing for nature/root that honors locked midis (by PC)
 * and contains all present pitch-classes.
 */
function placeLockedVoicing(opts: {
  natureId: string
  rootPc: number
  leadMidi: number
  locked: Partial<VoicingPitches>
  presentMidi: readonly number[]
  prevMidi?: Partial<VoicingPitches> | null
}): VoicingPitches | null {
  const chord = BARBERSHOP_CHORDS.find((c) => c.id === opts.natureId)
  if (!chord) return null
  // Lead must be a chord tone; voicingFitsLead is intentionally skipped —
  // locked sparse parts often force catalogue voicings that fail that filter
  // even when placeVoicing + PC locks succeed (e.g. C7 with Lead on root).
  if (leadRoleInChord(chord, opts.rootPc, opts.leadMidi) == null) return null
  const voicings = VOICINGS_BY_CHORD[opts.natureId] ?? []
  const presentPcs = uniquePcs(opts.presentMidi)
  const thirdOff = chord.offsets[3]
  let best: VoicingPitches | null = null
  let bestHasRoot = false
  let bestHasThird = false
  let bestTones = 0
  let bestCost = Number.POSITIVE_INFINITY

  for (const voicing of voicings) {
    for (const spread of [false, true]) {
      const placed = placeVoicing({
        chord,
        rootPc: opts.rootPc,
        leadMidi: opts.leadMidi,
        voicing,
        spread,
      })
      if (!placed) continue
      if (!spacingOk(placed)) continue
      if (!matchesLocked(placed, opts.locked)) continue
      const stackPcs = uniquePcs([placed.bass, placed.bari, placed.lead, placed.tenor])
      if (!presentPcs.every((p) => stackPcs.includes(p))) continue
      const forced = applyExactLocks(placed, opts.locked)
      const settled = settleSingerVoicing(forced, opts.locked, opts.prevMidi)
      const sounding = uniquePcs([settled.bass, settled.bari, settled.lead, settled.tenor])
      if (!presentPcs.every((p) => sounding.includes(p))) continue
      const hasRoot = sounding.includes(pc(opts.rootPc))
      const hasThird = thirdOff == null || sounding.includes(pc(opts.rootPc + thirdOff))
      const cost = singerMotionCost(settled, opts.prevMidi)
      const better =
        !best ||
        (hasRoot && !bestHasRoot) ||
        (hasRoot === bestHasRoot && hasThird && !bestHasThird) ||
        (hasRoot === bestHasRoot &&
          hasThird === bestHasThird &&
          sounding.length > bestTones) ||
        (hasRoot === bestHasRoot &&
          hasThird === bestHasThird &&
          sounding.length === bestTones &&
          cost < bestCost)
      if (better) {
        best = settled
        bestHasRoot = hasRoot
        bestHasThird = hasThird
        bestTones = sounding.length
        bestCost = cost
      }
    }
  }
  if (best) return best
  const around = voiceAroundLocks(opts)
  return around ? settleSingerVoicing(around, opts.locked, opts.prevMidi) : null
}

/** Chord-tone midi in range, skipping pitches already used. */
function findChordTone(
  from: number,
  until: number,
  step: number,
  tones: ReadonlySet<number>,
  used: ReadonlySet<number>,
): number | null {
  if (step === 0) return null
  for (let midi = from; step > 0 ? midi <= until : midi >= until; midi += step) {
    if (tones.has(pc(midi)) && !used.has(midi)) return midi
  }
  return null
}

/**
 * Catalogue voicings have no slot between a bass and a lead a third apart.
 * Keep the sung pitches and hang the missing chord tones around them.
 */
function voiceAroundLocks(opts: {
  natureId: string
  rootPc: number
  leadMidi: number
  locked: Partial<VoicingPitches>
  presentMidi: readonly number[]
}): VoicingPitches | null {
  const tones = new Set(chordTonePcs(opts.rootPc, opts.natureId))
  const lead = opts.leadMidi
  const bass = opts.locked.bass
  const tenorLocked = opts.locked.tenor
  const bariLocked = opts.locked.bari
  if (!tones.has(pc(lead))) return null
  if (bass != null && !tones.has(pc(bass))) return null
  if (tenorLocked != null && !tones.has(pc(tenorLocked))) return null
  if (bariLocked != null && !tones.has(pc(bariLocked))) return null

  const used = new Set<number>([lead])
  if (bass != null) used.add(bass)
  if (tenorLocked != null) used.add(tenorLocked)
  if (bariLocked != null) used.add(bariLocked)

  const tenor =
    tenorLocked ??
    findChordTone(Math.min(lead + 12, 77), lead + 3, -1, tones, used)
  if (tenor == null || tenor <= lead) return null
  used.add(tenor)

  let bari = bariLocked ?? null
  if (bari == null && bass != null) {
    bari = findChordTone(lead - 1, bass + 1, -1, tones, used)
  }
  if (bari == null) {
    bari = findChordTone(lead + 1, tenor - 1, 1, tones, used)
  }
  // Tenor a step above the lead leaves no seat between them. The bari goes below.
  if (bari == null) {
    bari = findChordTone(lead - 1, Math.max(SINGER_BAND.bari.min, lead - 16), -1, tones, used)
  }
  if (bari == null) return null
  used.add(bari)

  const bassMidi = bass ?? findChordTone(lead - 1, lead - 24, -1, tones, used)
  if (bassMidi == null) return null
  const midi: VoicingPitches = {
    bass: bassMidi,
    lead,
    bari,
    tenor,
  }
  if (new Set([midi.bass, midi.bari, midi.lead, midi.tenor]).size < 4) return null
  const stackPcs = uniquePcs([midi.bass, midi.bari, midi.lead, midi.tenor])
  if (!uniquePcs(opts.presentMidi).every((p) => stackPcs.includes(p))) return null
  return midi
}

/** Men's TTBB comfort. Sung (locked) notes may sit outside these. */
const SINGER_BAND = {
  bass: { min: 45, max: 60 },
  bari: { min: 50, max: 69 },
  tenor: { min: 58, max: 77 },
} as const

function octavesBetween(pitchPc: number, lo: number, hi: number): number[] {
  const out: number[] = []
  let midi = pitchPc
  while (midi < lo) midi += 12
  for (; midi <= hi; midi += 12) out.push(midi)
  return out
}

function permutationsOf(pcs: number[]): number[][] {
  if (pcs.length <= 1) return [pcs]
  const out: number[][] = []
  for (let i = 0; i < pcs.length; i++) {
    const rest = pcs.slice(0, i).concat(pcs.slice(i + 1))
    for (const tail of permutationsOf(rest)) out.push([pcs[i]!, ...tail])
  }
  return out
}

function octaveChoices(role: 'bass' | 'bari' | 'tenor', pitchPc: number, lead: number): number[] {
  if (role === 'tenor') {
    const hi = Math.min(lead + 12, SINGER_BAND.tenor.max)
    const found = octavesBetween(pitchPc, lead + 1, Math.max(hi, lead + 1))
    if (found.length) return found
  } else if (role === 'bari') {
    const found = octavesBetween(pitchPc, Math.max(45, lead - 16), lead + 11)
    if (found.length) return found
  } else {
    const found = octavesBetween(pitchPc, SINGER_BAND.bass.min, Math.min(SINGER_BAND.bass.max, lead - 1))
    if (found.length) return found
  }
  let midi = pitchPc
  const mid = role === 'tenor' ? lead + 5 : role === 'bari' ? lead - 5 : lead - 12
  while (midi < mid - 6) midi += 12
  while (midi > mid + 6) midi -= 12
  return [midi]
}

function stackDistinct(midi: VoicingPitches): boolean {
  return new Set([midi.bass, midi.bari, midi.lead, midi.tenor]).size === 4
}

function singerMotionCost(
  midi: VoicingPitches,
  prev?: Partial<VoicingPitches> | null,
): number {
  let cost = 0
  for (const role of ['bass', 'bari', 'tenor'] as const) {
    const band = SINGER_BAND[role]
    const note = midi[role]
    if (note < band.min || note > band.max) {
      cost += 40 + Math.abs(note < band.min ? band.min - note : note - band.max)
    }
    const before = prev?.[role]
    if (before != null) {
      const delta = Math.abs(note - before)
      const weight = role === 'tenor' ? 3 : role === 'bass' ? 2.2 : 1
      cost += delta * weight
      if (delta === 0) cost -= 4
      if (delta > 9 && !(role === 'bass' && delta === 12)) cost += 25
    } else {
      const target = role === 'tenor' ? midi.lead + 5 : role === 'bari' ? midi.lead - 4 : midi.lead - 12
      cost += Math.abs(note - target) * 0.6
    }
  }
  const trioHi = Math.max(midi.bari, midi.lead, midi.tenor)
  const trioLo = Math.min(midi.bari, midi.lead, midi.tenor)
  if (trioHi - trioLo > 12) cost += (trioHi - trioLo - 12) * 2
  if (midi.tenor - midi.bass > 21) cost += (midi.tenor - midi.bass - 21) * 3
  if (midi.bari > midi.lead) cost += 12
  if (midi.bass > midi.bari) cost += 18
  return cost
}

/**
 * Keep the chord tones already chosen. Put each filled part in a singable
 * octave, closed under the lead when there is room, and as close as possible
 * to where that part just sang.
 */
function settleSingerVoicing(
  midi: VoicingPitches,
  locked: Partial<VoicingPitches>,
  prev?: Partial<VoicingPitches> | null,
): VoicingPitches {
  const roles = ['bass', 'bari', 'tenor'] as const
  const free = roles.filter((role) => locked[role] == null)
  if (!free.length) return midi
  const seen = new Set<string>()
  let best: VoicingPitches | null = null
  let bestCost = Number.POSITIVE_INFINITY
  for (const assign of permutationsOf(free.map((role) => pc(midi[role])))) {
    const key = assign.join(',')
    if (seen.has(key)) continue
    seen.add(key)
    const choices = free.map((role, i) => octaveChoices(role, assign[i]!, midi.lead))
    const walk = (index: number, acc: number[]) => {
      if (index === free.length) {
        const next: VoicingPitches = { ...midi }
        free.forEach((role, i) => {
          next[role] = acc[i]!
        })
        if (!stackDistinct(next) || next.tenor <= next.lead || next.bass >= next.lead) return
        const cost = singerMotionCost(next, prev)
        if (cost < bestCost) {
          best = next
          bestCost = cost
        }
        return
      }
      for (const choice of choices[index]!) walk(index + 1, [...acc, choice])
    }
    walk(0, [])
  }
  return best ?? midi
}

function lockedFromPresent(
  midi: Partial<VoicingPitches> & { lead: number },
): Partial<VoicingPitches> {
  const locked: Partial<VoicingPitches> = { lead: midi.lead }
  for (const r of HARMONY_ROLES) {
    if (midi[r] != null) locked[r] = midi[r]
  }
  return locked
}

/** A leap past this is worth giving up a color tone to avoid. Bass may still octave. */
export const FILLED_LEAP_LIMIT = { tenor: 7, bari: 9, bass: 7 } as const

export function filledLeapExcess(role: SparseHarmonyRole, leap: number): number {
  if (role === 'bass' && leap === 12) return 0
  return Math.max(0, leap - FILLED_LEAP_LIMIT[role])
}

function toneOctaves(
  role: SparseHarmonyRole,
  tones: readonly number[],
  lead: number,
): number[] {
  const out: number[] = []
  for (const tone of tones) {
    for (const midi of octaveChoices(role, tone, lead)) {
      if (role === 'tenor' && (midi <= lead || midi > SINGER_BAND.tenor.max)) continue
      if (role === 'bass' && (midi >= lead || midi < SINGER_BAND.bass.min || midi > SINGER_BAND.bass.max)) continue
      if (out.includes(midi)) continue
      out.push(midi)
    }
  }
  return out
}

function smoothLeapCost(note: number, other: number | undefined, role: SparseHarmonyRole): number {
  if (other == null) return 0
  const delta = Math.abs(note - other)
  if (delta === 0) return -3
  if (role === 'bass' && delta === 12) return 4
  const limit = FILLED_LEAP_LIMIT[role]
  if (delta <= limit) return delta * 2
  return 70 + (delta - limit) * 8
}

/**
 * Another voicing of the same chord. The lead stays put, and so does every
 * harmony part that was already sung (`locked`). Filled parts may take any
 * chord tone in a singable octave, so two filled voices can swap and a filled
 * bass can change the inversion. A leap past the part's limit costs more than
 * dropping a color tone.
 */
export function chooseSmoothVoicing(opts: {
  natureId: string
  rootPc: number
  lead: number
  locked: Partial<Record<SparseHarmonyRole, number>>
  prev?: Partial<Record<SparseHarmonyRole, number>>
  next?: Partial<Record<SparseHarmonyRole, number>>
}): VoicingPitches | null {
  const tones = chordTonePcs(opts.rootPc, opts.natureId)
  if (!tones.length || !tones.includes(pc(opts.lead))) return null
  for (const role of HARMONY_ROLES) {
    const held = opts.locked[role]
    if (held != null && !tones.includes(pc(held))) return null
  }
  const choices: Record<SparseHarmonyRole, number[]> = {
    tenor: opts.locked.tenor != null ? [opts.locked.tenor] : toneOctaves('tenor', tones, opts.lead),
    bari: opts.locked.bari != null ? [opts.locked.bari] : toneOctaves('bari', tones, opts.lead),
    bass: opts.locked.bass != null ? [opts.locked.bass] : toneOctaves('bass', tones, opts.lead),
  }
  if (HARMONY_ROLES.some((role) => choices[role].length === 0)) return null
  const chord = BARBERSHOP_CHORDS.find((c) => c.id === opts.natureId)
  const third = pc(opts.rootPc + (chord?.offsets[3] ?? 4))
  const seventhOff = chord?.offsets[7]
  let best: VoicingPitches | null = null
  let bestCost = Number.POSITIVE_INFINITY
  for (const tenor of choices.tenor) {
    for (const bari of choices.bari) {
      for (const bass of choices.bass) {
        const midi: VoicingPitches = { lead: opts.lead, bass, tenor, bari }
        if (!stackDistinct(midi)) continue
        if (opts.locked.tenor == null && midi.tenor <= midi.lead) continue
        if (opts.locked.bass == null && midi.bass >= midi.lead) continue
        const sounding = uniquePcs([midi.bass, midi.bari, midi.lead, midi.tenor])
        let cost = 0
        for (const role of HARMONY_ROLES) {
          if (opts.locked[role] != null) continue
          cost += smoothLeapCost(midi[role], opts.prev?.[role], role)
          cost += smoothLeapCost(midi[role], opts.next?.[role], role)
          const band = SINGER_BAND[role]
          if (midi[role] < band.min || midi[role] > band.max) cost += 20
        }
        if (!sounding.includes(third)) cost += 28
        if (seventhOff != null && !sounding.includes(pc(opts.rootPc + seventhOff))) cost += 10
        if (bari > opts.lead) cost += 8
        if (midi.bass > midi.bari) cost += 18
        if (midi.tenor - midi.bass > 21) cost += (midi.tenor - midi.bass - 21) * 3
        if (cost < bestCost) {
          best = midi
          bestCost = cost
        }
      }
    }
  }
  return best
}

function rolesFromResult(
  midi: Partial<VoicingPitches> & { lead: number },
): Pick<SparseCompleteOk, 'filledRoles' | 'lockedRoles'> {
  const filledRoles: SparseHarmonyRole[] = []
  const lockedRoles: Array<'tenor' | 'lead' | 'bari' | 'bass'> = ['lead']
  for (const r of HARMONY_ROLES) {
    if (midi[r] != null) lockedRoles.push(r)
    else filledRoles.push(r)
  }
  return { filledRoles, lockedRoles }
}

/**
 * Complete sparse sounding pitches into TTBB, or return a skip reason.
 *
 * Skip when:
 * - no solid catalogue / PC match (`unrecognized`)
 * - preferred or identified nature is outside the contest profile (`outside_vocab`)
 * - no voicing keeps present / locked pitches (`no_completion`)
 */
export function completeSparseStack(opts: {
  midi: Partial<VoicingPitches> & { lead: number }
  tonality: number
  mode?: TonalityMode
  profile: ContestProfile
  /** Detected / Alt pick — preferred when allowed. */
  preferredNatureId?: string | null
  preferredRootPc?: number | null
  /** Previous TTBB stack, so filled parts step instead of leaping. */
  prevMidi?: Partial<VoicingPitches> | null
  pillarRoot?: number
  limit?: number
}): SparseCompleteResult {
  void opts.pillarRoot
  void opts.limit

  let preferredNature =
    opts.preferredNatureId &&
    opts.preferredNatureId !== 'unknown' &&
    opts.preferredNatureId !== 'blank'
      ? opts.preferredNatureId
      : null
  let preferredRoot =
    preferredNature != null && opts.preferredRootPc != null
      ? ((opts.preferredRootPc % 12) + 12) % 12
      : null

  if (preferredNature && !isNatureAllowed(opts.profile, preferredNature)) {
    return { ok: false, reason: 'outside_vocab' }
  }

  const present = presentList(opts.midi)
  const locked = lockedFromPresent(opts.midi)
  const mode = opts.mode ?? 'major'
  const soundingCount = (['tenor', 'lead', 'bari', 'bass'] as const).filter(
    (k) => opts.midi[k] != null,
  ).length
  if (
    mode === 'major' &&
    soundingCount < 4 &&
    preferredNature &&
    preferredRoot != null &&
    !majorKeyIncompleteAllows(preferredNature, preferredRoot, uniquePcs(present), opts.tonality)
  ) {
    preferredNature = null
    preferredRoot = null
  }

  let natureId: string | null = preferredNature
  let rootPc: number | null = preferredRoot

  if (natureId == null || rootPc == null) {
    const identified = identifyNatureFromMidi({
      midi: opts.midi,
      profile: opts.profile,
      tonality: opts.tonality,
      mode,
    })
    if (
      !identified ||
      identified.confidence < MIN_ID_CONFIDENCE ||
      !presentPcsFitNature(present, identified.natureId, identified.rootPc)
    ) {
      return { ok: false, reason: 'unrecognized' }
    }
    if (!isNatureAllowed(opts.profile, identified.natureId)) {
      return { ok: false, reason: 'outside_vocab' }
    }
    natureId = natureId ?? identified.natureId
    rootPc = rootPc ?? identified.rootPc
  }

  if (!isNatureAllowed(opts.profile, natureId)) {
    return { ok: false, reason: 'outside_vocab' }
  }

  if (!presentPcsFitNature(present, natureId, rootPc)) {
    return { ok: false, reason: 'unrecognized' }
  }

  const pitches = placeLockedVoicing({
    natureId,
    rootPc,
    leadMidi: opts.midi.lead,
    locked,
    presentMidi: present,
    prevMidi: opts.prevMidi,
  })
  if (!pitches) {
    return { ok: false, reason: 'no_completion' }
  }

  return {
    ok: true,
    natureId,
    rootPc,
    pitches,
    ...rolesFromResult(opts.midi),
  }
}
