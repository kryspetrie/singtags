import { describe, expect, it, vi } from 'vitest'
import { createAudioBounce } from './audioBounce'
import { createIndexedDbTagRollRepository } from './indexedDbRepository'
import { createMidiExporter } from './midiExporter'
import { createMusicXmlExporter } from './musicXmlExporter'
import { createEmptyTagRollProject } from '../../lib/tagRoll/normalize'
import { TAG_ROLL_PPQ } from '../../lib/tagRoll/types'
import * as tagRollDb from '../../offline/tagRollDb'
import * as midiExport from '../../lib/tagRoll/midiExport'
import * as musicxmlExport from '../../lib/tagRoll/musicxmlExport'
import * as audioBounce from '../../lib/tagRoll/audioBounce'

describe('tagRoll adapters', () => {
  it('midi / musicxml adapters delegate to existing exporters', () => {
    const p = createEmptyTagRollProject({ title: 'A' })
    const midiSpy = vi.spyOn(midiExport, 'exportTagRollMidi').mockReturnValue(new Uint8Array([1]))
    const xmlSpy = vi
      .spyOn(musicxmlExport, 'exportTagRollMusicXml')
      .mockReturnValue(new Uint8Array([2]))
    expect([...createMidiExporter().export(p, 'two')]).toEqual([1])
    expect(midiSpy).toHaveBeenCalledWith(p, 'two')
    expect([...createMusicXmlExporter().export(p)]).toEqual([2])
    expect(xmlSpy).toHaveBeenCalledWith(p)
    midiSpy.mockRestore()
    xmlSpy.mockRestore()
  })

  it('audioBounce adapter delegates to bounceTagRollTracks', async () => {
    const p = createEmptyTagRollProject({ title: 'B' })
    const bounceSpy = vi.spyOn(audioBounce, 'bounceTagRollTracks').mockResolvedValue([])
    await createAudioBounce().bounce(p, { mix: true, perPart: false })
    expect(bounceSpy).toHaveBeenCalledWith(p, { mix: true, perPart: false })
    bounceSpy.mockRestore()
  })

  it('indexedDb repository adapter forwards list/get/put/remove', async () => {
    const list = vi.spyOn(tagRollDb, 'listTagRollProjects').mockResolvedValue([])
    const get = vi.spyOn(tagRollDb, 'getTagRollProject').mockResolvedValue(null)
    const put = vi.spyOn(tagRollDb, 'putTagRollProject').mockResolvedValue()
    const remove = vi.spyOn(tagRollDb, 'deleteTagRollProject').mockResolvedValue()
    const repo = createIndexedDbTagRollRepository()
    await repo.list()
    await repo.get('x')
    const p = createEmptyTagRollProject({ title: 'C' })
    p.notes = [
      {
        id: 'n1',
        partId: p.parts[0]!.id,
        midi: 60,
        startTick: 0,
        durationTicks: TAG_ROLL_PPQ,
      },
    ]
    await repo.put(p)
    await repo.remove('x')
    expect(list).toHaveBeenCalledOnce()
    expect(get).toHaveBeenCalledWith('x')
    expect(put).toHaveBeenCalledWith(p)
    expect(remove).toHaveBeenCalledWith('x')
    list.mockRestore()
    get.mockRestore()
    put.mockRestore()
    remove.mockRestore()
  })
})
