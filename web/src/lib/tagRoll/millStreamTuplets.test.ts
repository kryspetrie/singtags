/**
 * Mill Stream is 3/4 with no MusicXML tuplets — sheet inference must stay quiet.
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

describe('Mill Stream sheet tuplets', () => {
  it.skipIf(!existsSync(SEED))('does not infer triplet brackets on the seed', () => {
    const project = normalizeTagRollProject(JSON.parse(readFileSync(SEED, 'utf8')))
    expect(project).not.toBeNull()
    if (!project) return
    expect(project.tuplets ?? []).toHaveLength(0)
    expect(project.notes.every((n) => !n.tuplet)).toBe(true)

    const assignment = assignSheetStaves(project.parts, project.clefFamily)
    const events = buildSheetRhythm({
      assignment,
      notes: project.notes,
      lengthTicks: project.lengthTicks,
      timeSignature: project.timeSignature,
      ppq: TAG_ROLL_PPQ,
      tuplets: project.tuplets,
    })
    const inferred = events.filter((e) => e.concertMidi != null && e.tuplet)
    expect(inferred).toHaveLength(0)
  })
})
