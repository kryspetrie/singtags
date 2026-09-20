import { afterEach, describe, expect, it } from 'vitest'
import { createMidiExporter } from '../adapters/tagRoll/midiExporter'
import { createMusicXmlExporter } from '../adapters/tagRoll/musicXmlExporter'
import { createSequentialIdGenerator } from '../adapters/system/systemServices'
import {
  createTagStudioServices,
  getTagStudioServices,
  setTagStudioServicesForTests,
} from './tagStudio'
import { createEmptyTagRollProject } from '../lib/tagRoll/normalize'
import { TAG_ROLL_PPQ } from '../lib/tagRoll/types'

describe('composition/tagStudio', () => {
  afterEach(() => {
    setTagStudioServicesForTests(null)
  })

  it('wires production defaults and allows test overrides', () => {
    const idGen = createSequentialIdGenerator(1)
    const services = createTagStudioServices({ idGen })
    setTagStudioServicesForTests(services)
    expect(getTagStudioServices().idGen.next('trn')).toBe('trn_1')
    expect(getTagStudioServices().midiExporter).toBeDefined()
    expect(getTagStudioServices().repository).toBeDefined()
  })

  it('midi / musicxml adapters export real bytes for a tiny project', () => {
    const p = createEmptyTagRollProject({ title: 'Port' })
    const lead = p.parts[0]!
    p.notes = [
      {
        id: 'n1',
        partId: lead.id,
        midi: 60,
        startTick: 0,
        durationTicks: TAG_ROLL_PPQ,
      },
    ]
    const midi = createMidiExporter().export(p, 'one')
    const xml = createMusicXmlExporter().export(p)
    expect(midi.byteLength).toBeGreaterThan(20)
    expect(new TextDecoder().decode(xml)).toContain('score-partwise')
  })
})
