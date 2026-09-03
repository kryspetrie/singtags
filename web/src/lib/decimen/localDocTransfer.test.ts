/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  isLocalDocTransferFile,
  isLocalEntryTransferFile,
  packLocalDocPayload,
  unpackLocalDocPayload,
  packLocalEntryPayload,
  unpackLocalEntryPayload,
  localDocTransferMetaFromDoc,
  entryAssetsFromTransfer,
} from './localDocTransfer'

describe('localDocTransfer', () => {
  it('round-trips packed local doc payload with metadata', () => {
    const meta = localDocTransferMetaFromDoc(
      {
        title: 'My Chart',
        arranger: 'Me',
        notes: 'Verse only',
        key: 'Bb',
        detuneCents: -5,
        mime: 'application/pdf',
        filename: 'chart.pdf',
      },
      { openNow: true },
    )
    const bytes = new Uint8Array([1, 2, 3])
    const packed = packLocalDocPayload({ meta, bytes })
    const out = unpackLocalDocPayload(packed)
    expect(out.meta.title).toBe('My Chart')
    expect(out.meta.key).toBe('Bb')
    expect(out.meta.openNow).toBe(true)
    expect([...out.bytes]).toEqual([1, 2, 3])
  })

  it('round-trips multi-asset entry packages', () => {
    const packed = packLocalEntryPayload({
      meta: {
        v: 2,
        title: 'Song',
        arranger: 'Arr',
        notes: '',
        key: 'C Major',
        detuneCents: 0,
        openNow: true,
        assets: [
          {
            role: 'sheet',
            label: 'Chart',
            mime: 'application/pdf',
            filename: 'a.pdf',
            dataB64: btoa(String.fromCharCode(1, 2, 3)),
            sortIndex: 0,
          },
          {
            role: 'track',
            label: 'Lead',
            mime: 'audio/mpeg',
            filename: 'lead.mp3',
            dataB64: btoa(String.fromCharCode(9)),
            sortIndex: 1,
          },
        ],
      },
    })
    const out = unpackLocalEntryPayload(packed)
    expect(out.meta.v).toBe(2)
    expect(out.meta.title).toBe('Song')
    expect(out.meta.assets).toHaveLength(2)
    const assets = entryAssetsFromTransfer(out.meta)
    expect(assets[0]!.data.byteLength).toBe(3)
    expect(assets[1]!.role).toBe('track')
  })

  it('detects local doc / entry optical files by mime or name', () => {
    expect(
      isLocalDocTransferFile({
        name: 'singtags-local-abc.doc',
        type: 'application/octet-stream',
        bytes: new Uint8Array(),
      }),
    ).toBe(true)
    expect(
      isLocalEntryTransferFile({
        name: 'singtags-local-abc.entry',
        type: 'application/octet-stream',
        bytes: new Uint8Array(),
      }),
    ).toBe(true)
    expect(
      isLocalDocTransferFile({
        name: 'note.txt',
        type: 'text/plain',
        bytes: new Uint8Array(),
      }),
    ).toBe(false)
  })
})
