/**
 * Mill Stream (3/4) must not bisect on-beat quarters into tied eighths.
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { normalizeTagRollProject } from './normalize'
import { assignSheetStaves } from './sheetScore/assignStaves'
import { buildSheetRhythm } from './sheetScore/rhythmLayout'
import { TAG_ROLL_PPQ } from './types'

const SEED = resolve(
  __dirname,
  '../../../public/tag-studio/polecat-mixed-seeds/90011.json',
)

describe('Mill Stream sheet rhythm ties', () => {
  it.skipIf(!existsSync(SEED))(
    'does not engrave pointless tied eighths from on-beat quarters',
    () => {
      const project = normalizeTagRollProject(JSON.parse(readFileSync(SEED, 'utf8')))
      expect(project).not.toBeNull()
      if (!project) return
      expect(project.timeSignature).toEqual({ numerator: 3, denominator: 4 })

      const assignment = assignSheetStaves(project.parts, project.clefFamily)
      const events = buildSheetRhythm({
        assignment,
        notes: project.notes,
        lengthTicks: project.lengthTicks,
        timeSignature: project.timeSignature,
        ppq: TAG_ROLL_PPQ,
        tuplets: project.tuplets,
      })
      const notes = events
        .filter((e) => e.concertMidi != null)
        .sort((a, b) => a.startTick - b.startTick || a.partId.localeCompare(b.partId))

      const tiedEighthPairs: string[] = []
      for (let i = 0; i < notes.length - 1; i++) {
        const a = notes[i]!
        const b = notes[i + 1]!
        if (a.partId !== b.partId) continue
        if (!a.tieStart || !b.tieStop) continue
        if (a.concertMidi !== b.concertMidi) continue
        if (a.duration.type !== 'eighth' || b.duration.type !== 'eighth') continue
        if (a.duration.dots || b.duration.dots) continue
        if (a.durationTicks + b.durationTicks !== TAG_ROLL_PPQ) continue
        tiedEighthPairs.push(`${a.partId}@${a.startTick}`)
      }
      expect(tiedEighthPairs).toEqual([])
    },
  )
})
