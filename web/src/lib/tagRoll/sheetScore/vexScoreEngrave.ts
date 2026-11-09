/**
 * Clef spelling, measure event windows, and eighth-note beaming for VexFlow.
 */
import { Beam, Factory, type StaveNote } from 'vexflow'
import type { SheetRhythmEvent } from './rhythmLayout'
import type { SheetClefKind } from './types'

export function clefSpec(kind: SheetClefKind): { clef: string; annotation?: string } {
  switch (kind) {
    case 'treble8vb':
      return { clef: 'treble', annotation: '8vb' }
    case 'bass8va':
      return { clef: 'bass', annotation: '8va' }
    case 'bass':
      return { clef: 'bass' }
    default:
      return { clef: 'treble' }
  }
}

export function eventsInMeasure(
  events: readonly SheetRhythmEvent[],
  start: number,
  end: number,
): SheetRhythmEvent[] {
  return events.filter((e) => e.startTick >= start && e.startTick < end)
}

/**
 * Beam eighths+ using rhythmLayout beamGroupId (beat groups; rests break beams).
 * Falls back to VexFlow generateBeams with rests kept so gaps still break groups.
 */
export function beamNotes(
  factory: Factory,
  notes: StaveNote[],
  events: readonly SheetRhythmEvent[],
): void {
  const byGroup = new Map<number, StaveNote[]>()
  for (let i = 0; i < notes.length; i++) {
    const n = notes[i]!
    if (n.isRest()) continue
    const d = n.getDuration()
    const beamable =
      d === '8' ||
      d === '16' ||
      d === '32' ||
      d.startsWith('8') ||
      d.startsWith('16') ||
      d.startsWith('32')
    if (!beamable) continue
    const gid = events[i]?.beamGroupId
    if (gid == null) continue
    const list = byGroup.get(gid) ?? []
    list.push(n)
    byGroup.set(gid, list)
  }
  let drew = false
  for (const group of byGroup.values()) {
    if (group.length < 2) continue
    try {
      factory.Beam({ notes: group, options: { autoStem: false } })
      drew = true
    } catch {
      /* ignore beam failures on mixed groups */
    }
  }
  if (drew) return
  try {
    // Keep rests so generateBeams does not bridge gaps between beamable notes.
    const withRests = notes.filter((n) => {
      if (n.isRest()) return true
      const d = n.getDuration()
      return (
        d === '8' ||
        d === '16' ||
        d === '32' ||
        d.startsWith('8') ||
        d.startsWith('16') ||
        d.startsWith('32')
      )
    })
    if (withRests.filter((n) => !n.isRest()).length < 2) return
    const beams = Beam.generateBeams(withRests, { maintainStemDirections: true })
    for (const beam of beams) {
      factory.Beam({ notes: beam.getNotes(), options: { autoStem: false } })
    }
  } catch {
    /* ignore */
  }
}

