/**
 * Recover Harmonize panel selection from the Sketch map and/or sounding TTBB.
 */
import {
  BARBERSHOP_CHORDS,
  leadRoleInChord,
  placeVoicingConcert,
  VOICINGS_BY_CHORD,
  voicingFitsLead,
  type VoicingPitches,
} from './harmonizer/chords'
import { isBlankSketchQuality, natureToSketchQuality, sketchSpanAtTick } from './harmonySketch'
import { hearStackNotesAtTick } from './notesAtTick'
import type { HarmonySketchQuality, HarmonySketchSpan, TagRollClefFamily, TagRollMidiGroup, TagRollNote, TagRollPart } from './types'

export type RecoveredChordsSelection = {
  rootPc: number
  natureId: string
  quality: HarmonySketchQuality
  /** Catalogue voicing string when a full stack was matched; null for sketch-only. */
  voicing: string | null
  spread: boolean
  /** Human label for the Sketch chip. */
  label: string
  source: 'stack' | 'sketch'
}

function midiMatchScore(
  placed: VoicingPitches,
  heard: Partial<VoicingPitches> & { lead: number },
): number {
  let score = 0
  for (const part of ['bass', 'bari', 'tenor'] as const) {
    const want = heard[part]
    if (want == null) continue
    const got = placed[part]
    if (got === want) score += 1.2
    else if (((got % 12) + 12) % 12 === ((want % 12) + 12) % 12) score += 0.45
  }
  if (placed.lead === heard.lead) score += 0.5
  return score
}

function stackMidiAtTick(opts: {
  notes: readonly TagRollNote[]
  parts: readonly TagRollPart[]
  tick: number
  leadMidi: number
}): (Partial<VoicingPitches> & { lead: number }) | null {
  const byName = new Map(opts.parts.map((p) => [p.name, p.id]))
  const at = hearStackNotesAtTick(opts.notes, opts.tick)
  const midiOf = (name: string): number | undefined => {
    const id = byName.get(name)
    if (!id) return undefined
    return at.find((n) => n.partId === id)?.midi
  }
  const tenor = midiOf('Tenor')
  const bari = midiOf('Bari')
  const bass = midiOf('Bass')
  if (tenor == null || bari == null || bass == null) return null
  return { tenor, bari, bass, lead: opts.leadMidi }
}

/**
 * Match sounding concert MIDI to catalogue voicing + spread (TTBB-aware).
 */
export function matchConcertStackVoicing(opts: {
  midi: Partial<VoicingPitches> & { lead: number }
  rootPc: number
  natureId: string
  clefFamily?: TagRollClefFamily
  melodyStaff?: TagRollMidiGroup
}): { voicing: string; spread: boolean; score: number } | null {
  const chord = BARBERSHOP_CHORDS.find((c) => c.id === opts.natureId)
  if (!chord) return null
  const role = leadRoleInChord(chord, opts.rootPc, opts.midi.lead)
  if (role == null) return null
  let best: { voicing: string; spread: boolean; score: number } | null = null
  for (const voicing of VOICINGS_BY_CHORD[opts.natureId] ?? []) {
    if (!voicingFitsLead(voicing, role)) continue
    for (const spread of [false, true]) {
      const placed = placeVoicingConcert({
        chord,
        rootPc: opts.rootPc,
        leadMidi: opts.midi.lead,
        voicing,
        spread,
        clefFamily: opts.clefFamily ?? 'ttbb',
        melodyStaff: opts.melodyStaff ?? 'upper',
      })
      if (!placed) continue
      const score = midiMatchScore(placed, opts.midi)
      // Prefer closed when settle collapses spread to the same concert MIDI.
      if (
        !best ||
        score > best.score ||
        (score === best.score && best.spread && !spread)
      ) {
        best = { voicing, spread, score }
      }
    }
  }
  return best && best.score >= 2.5 ? best : null
}

/**
 * Prefer a full TTBB stack match; else a locked Sketch span; else null (no valid chord).
 */
export function recoverChordsSelection(opts: {
  notes: readonly TagRollNote[]
  parts: readonly TagRollPart[]
  sketch: readonly HarmonySketchSpan[]
  tick: number
  leadMidi: number
  preferFlats: boolean
  clefFamily?: TagRollClefFamily
  melodyStaff?: TagRollMidiGroup
  pcName: (pc: number, flats: boolean) => string
}): RecoveredChordsSelection | null {
  const stackMidi = stackMidiAtTick(opts)
  const span = sketchSpanAtTick(opts.sketch, opts.tick)
  // Blank placeholders are timing-only — treat as empty for Harmonize recover.
  const locked =
    span?.locked && !isBlankSketchQuality(span.quality) ? span : null

  if (stackMidi) {
    // Prefer sketch identity when locked; still recover voicing from sounding notes.
    if (locked) {
      const natureId = BARBERSHOP_CHORDS.some((c) => c.id === locked.quality)
        ? locked.quality
        : locked.quality === 'dim'
          ? 'dim'
          : locked.quality === 'ninth'
            ? 'ninth'
            : 'major'
      const matched = matchConcertStackVoicing({
        midi: stackMidi,
        rootPc: locked.rootPc,
        natureId,
        clefFamily: opts.clefFamily,
        melodyStaff: opts.melodyStaff,
      })
      const chord = BARBERSHOP_CHORDS.find((c) => c.id === natureId)
      return {
        rootPc: locked.rootPc,
        natureId,
        quality: natureToSketchQuality(natureId),
        voicing: matched?.voicing ?? null,
        spread: matched?.spread ?? false,
        label: `${opts.pcName(locked.rootPc, opts.preferFlats)}${chord?.notation || ''}`,
        source: matched ? 'stack' : 'sketch',
      }
    }

    // No sketch — try to identify nature by best concert catalogue match.
    let best: {
      natureId: string
      rootPc: number
      voicing: string
      spread: boolean
      score: number
    } | null = null
    for (const chord of BARBERSHOP_CHORDS) {
      for (let rootPc = 0; rootPc < 12; rootPc++) {
        const matched = matchConcertStackVoicing({
          midi: stackMidi,
          rootPc,
          natureId: chord.id,
          clefFamily: opts.clefFamily,
          melodyStaff: opts.melodyStaff,
        })
        if (!matched) continue
        if (!best || matched.score > best.score) {
          best = {
            natureId: chord.id,
            rootPc,
            voicing: matched.voicing,
            spread: matched.spread,
            score: matched.score,
          }
        }
      }
    }
    if (best && best.score >= 3.2) {
      const chord = BARBERSHOP_CHORDS.find((c) => c.id === best!.natureId)
      return {
        rootPc: best.rootPc,
        natureId: best.natureId,
        quality: natureToSketchQuality(best.natureId),
        voicing: best.voicing,
        spread: best.spread,
        label: `${opts.pcName(best.rootPc, opts.preferFlats)}${chord?.notation || ''}`,
        source: 'stack',
      }
    }
  }

  if (locked) {
    const natureId = BARBERSHOP_CHORDS.some((c) => c.id === locked.quality)
      ? locked.quality
      : 'major'
    const chord = BARBERSHOP_CHORDS.find((c) => c.id === natureId)
    return {
      rootPc: locked.rootPc,
      natureId,
      quality: natureToSketchQuality(natureId),
      voicing: null,
      spread: false,
      label: `${opts.pcName(locked.rootPc, opts.preferFlats)}${chord?.notation || ''}`,
      source: 'sketch',
    }
  }

  return null
}
