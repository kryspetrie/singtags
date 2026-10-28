/**
 * VexFlow places pitch spelling in the key string (c#/4) but does not draw
 * accidental glyphs unless Accidental.applyAccidentals runs against the voice.
 * Note spelling follows the musical key marker; accidental glyphs follow the
 * last printed signature on that system (updated mid-system when the key changes).
 */
import { Accidental, type Voice } from 'vexflow'
import { keyAtTick, type KeyAtTick } from '../keyMap'
import { vexKeySpec } from '../keySignature'
import type { TagRollProject } from '../types'

function keyFallback(project: TagRollProject): KeyAtTick {
  return {
    tonality: project.tonality,
    tonalityMode: project.tonalityMode ?? 'major',
    preferFlats: project.preferFlats,
  }
}

export function sheetKeyAtTick(project: TagRollProject, tick: number): KeyAtTick {
  return keyAtTick(tick, project.keyMarkers, keyFallback(project))
}

/** Key signature id at `tick` for VexFlow accidental / stave key marks. */
export function sheetKeySpecAtTick(project: TagRollProject, tick: number): string {
  const key = sheetKeyAtTick(project, tick)
  return vexKeySpec(key.tonality, key.preferFlats, key.tonalityMode)
}

/** Flat/sharp spelling bias for a note onset (follows key markers, not only tick 0). */
export function preferFlatsAtTick(project: TagRollProject, tick: number): boolean {
  return sheetKeyAtTick(project, tick).preferFlats
}

/** Attach sharp / flat / natural glyphs for notes that differ from the key. */
export function applySheetAccidentals(voices: readonly Voice[], keySpec: string): void {
  if (!voices.length) return
  Accidental.applyAccidentals([...voices], keySpec || 'C')
}
