import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createFixedClock,
  createSequentialIdGenerator,
} from '../../adapters/system/systemServices'
import { applyHarmony } from './applyHarmony'
import { exportMidiBytes } from './exportMidi'
import { exportMusicXmlBytes } from './exportMusicXml'
import { persistTagRoll, putNewTagRoll, deleteTagRoll } from './persist'
import { downloadMidi } from './downloadMidi'
import { downloadMusicXml } from './downloadMusicXml'
import { downloadAudio } from './downloadAudio'
import { saveTagRollToLibrary } from './saveToLibrary'
import { createEmptyTagRollProject } from '../../lib/tagRoll/normalize'
import { TAG_ROLL_PPQ } from '../../lib/tagRoll/types'
import type { LibraryIngest } from '../../ports/LibraryIngest'
import type { MidiExporter } from '../../ports/MidiExporter'
import type { MusicXmlExporter } from '../../ports/MusicXmlExporter'
import type { TagRollRepository } from '../../ports/TagRollRepository'
import type { AudioBounce } from '../../ports/AudioBounce'

describe('tagRoll application use-cases', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('applyHarmony goes through injected IdGenerator', () => {
    const p = createEmptyTagRollProject({ title: 'H' })
    const lead = p.parts.find((x) => x.name === 'Lead')!
    p.notes = [
      {
        id: 'm1',
        partId: lead.id,
        midi: 60,
        startTick: 0,
        durationTicks: TAG_ROLL_PPQ,
      },
    ]
    const idGen = createSequentialIdGenerator(7)
    const result = applyHarmony({
      project: p,
      melodyNoteId: 'm1',
      pitches: { tenor: 67, bari: 57, bass: 48, lead: 60 },
      idGen,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.notes.some((n) => n.id.startsWith('trn_'))).toBe(true)
    expect(result.notes.filter((n) => n.id.startsWith('trn_')).map((n) => n.id)).toEqual([
      'trn_7',
      'trn_8',
      'trn_9',
    ])
  })

  it('persistTagRoll uses the repository port (not a direct IDB import)', async () => {
    const put = vi.fn(async () => undefined)
    const repository: TagRollRepository = {
      list: vi.fn(),
      get: vi.fn(),
      put,
      remove: vi.fn(),
      getHistory: vi.fn(),
      putHistory: vi.fn(),
    }
    const p = createEmptyTagRollProject({ title: 'Persist' })
    const clock = createFixedClock(1_700_000_000_000)
    const next = await persistTagRoll(repository, p, clock)
    expect(put).toHaveBeenCalledOnce()
    expect(next.updatedAt).toBe(1_700_000_000_000)
    expect(put.mock.calls[0]![0].title).toBe('Persist')
  })

  it('putNewTagRoll / deleteTagRoll go through repository + Clock', async () => {
    const put = vi.fn(async () => undefined)
    const putHistory = vi.fn(async () => undefined)
    const remove = vi.fn(async () => undefined)
    const repository: TagRollRepository = {
      list: vi.fn(),
      get: vi.fn(),
      put,
      remove,
      getHistory: vi.fn(),
      putHistory,
    }
    const clock = createFixedClock(42)
    const p = createEmptyTagRollProject({ title: 'New' })
    const saved = await putNewTagRoll(repository, p, clock)
    expect(saved.updatedAt).toBe(42)
    expect(putHistory).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: saved.id, updatedAt: 42 }),
    )
    await deleteTagRoll(repository, saved.id)
    expect(remove).toHaveBeenCalledWith(saved.id)
  })

  it('downloadMidi / downloadMusicXml use exporter ports (not lib download helpers)', () => {
    const p = createEmptyTagRollProject({ title: 'Dl' })
    const midiExporter: MidiExporter = {
      export: vi.fn(() => new Uint8Array([4, 5])),
    }
    const musicXmlExporter: MusicXmlExporter = {
      export: vi.fn(() => new Uint8Array([6])),
    }
    const download = vi.fn()
    downloadMidi(midiExporter, p, 'two', download)
    expect(midiExporter.export).toHaveBeenCalledWith(p, 'two', undefined)
    expect(download).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      expect.stringMatching(/\.mid$/),
      'audio/midi',
    )
    download.mockClear()
    downloadMusicXml(musicXmlExporter, p, download)
    expect(musicXmlExporter.export).toHaveBeenCalledWith(p)
    expect(download).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      expect.stringMatching(/\.musicxml$/),
      'application/vnd.recordare.musicxml+xml',
    )
  })

  it('downloadAudio bounces through AudioBounce port', async () => {
    const p = createEmptyTagRollProject({ title: 'Bounce' })
    const audioBounce: AudioBounce = {
      bounce: vi.fn(async () => [
        {
          partId: 'mix',
          label: 'Mix',
          filename: 'Bounce - Mix.mp3',
          bytes: new Uint8Array([1]).buffer,
        },
      ]),
    }
    const zip = await import('../../download/zip')
    const spy = vi.spyOn(zip, 'downloadBlob').mockImplementation(() => {})
    await downloadAudio(audioBounce, p, {
      mix: true,
      perPart: false,
      partLeft: false,
      format: 'mp3',
    })
    expect(audioBounce.bounce).toHaveBeenCalledWith(
      p,
      expect.objectContaining({ mix: true, format: 'mp3' }),
    )
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('exportMidiBytes / exportMusicXmlBytes call exporter ports', () => {
    const p = createEmptyTagRollProject({ title: 'X' })
    const midiExporter: MidiExporter = {
      export: vi.fn(() => new Uint8Array([1, 2, 3])),
    }
    const musicXmlExporter: MusicXmlExporter = {
      export: vi.fn(() => new Uint8Array([9, 9])),
    }
    expect([...exportMidiBytes(midiExporter, p, 'all')]).toEqual([1, 2, 3])
    expect(midiExporter.export).toHaveBeenCalledWith(p, 'all', undefined)
    expect([...exportMusicXmlBytes(musicXmlExporter, p)]).toEqual([9, 9])
    expect(musicXmlExporter.export).toHaveBeenCalledWith(p)
  })

  it('saveTagRollToLibrary uses AudioBounce + LibraryIngest ports', async () => {
    const p = createEmptyTagRollProject({ title: 'Lib' })
    const audioBounce: AudioBounce = {
      bounce: vi.fn(async () => [
        {
          partId: 'mix',
          label: 'Mix',
          filename: 'Lib - Mix.wav',
          bytes: new ArrayBuffer(8),
        },
      ]),
    }
    const ingest = vi.fn(async () => ({ entryId: 'le_1' }))
    const libraryIngest: LibraryIngest = { ingest }
    const { entryId } = await saveTagRollToLibrary(
      p,
      {
        audioBounce,
        libraryIngest,
        renderSheet: async () => new Blob(['png'], { type: 'image/png' }),
      },
      { mix: true, perPart: false },
    )
    expect(entryId).toBe('le_1')
    expect(audioBounce.bounce).toHaveBeenCalledOnce()
    expect(ingest).toHaveBeenCalledOnce()
    expect(ingest.mock.calls[0]![0].title).toBe('Lib')
    expect(ingest.mock.calls[0]![0].tracks).toHaveLength(1)
  })
})
