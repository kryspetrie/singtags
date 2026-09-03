/**
 * @vitest-environment node
 */
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useLocalLibraryStore } from './localLibrary'
import {
  guessAssetRoles,
  isLocalLibraryMime,
  defaultOpticalTransferAssets,
  encodeLocalTransferAssetQuery,
  decodeLocalTransferAssetQuery,
  matchLocalLibraryQuery,
  orderEntriesByIds,
  type LocalEntry,
} from '../types/localLibrary'

describe('localLibrary store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    indexedDB.deleteDatabase('singtags-local-library')
  })

  it('accepts pdf, image, and audio mimes', () => {
    expect(isLocalLibraryMime('application/pdf', 'a.pdf')).toBe(true)
    expect(isLocalLibraryMime('image/png', 'a.png')).toBe(true)
    expect(isLocalLibraryMime('audio/mpeg', 'a.mp3')).toBe(true)
    expect(isLocalLibraryMime('text/plain', 'a.txt')).toBe(false)
  })

  it('guesses roles for a mixed batch', () => {
    expect(
      guessAssetRoles([
        { mime: 'application/pdf', filename: 'a.pdf' },
        { mime: 'application/pdf', filename: 'b.pdf' },
        { mime: 'audio/mpeg', filename: 'c.mp3' },
        { mime: 'image/png', filename: 'd.png' },
      ]),
    ).toEqual(['sheet', 'alternateSheet', 'track', 'image'])
  })

  it('defaults optical transfer to the primary sheet only', () => {
    const assets = [
      {
        id: 't',
        entryId: 'e',
        role: 'track' as const,
        label: 'Lead',
        mime: 'audio/mpeg',
        filename: 'lead.mp3',
        byteLength: 9_000_000,
        sortIndex: 1,
        createdAt: '',
        updatedAt: '',
      },
      {
        id: 's',
        entryId: 'e',
        role: 'sheet' as const,
        label: 'Chart',
        mime: 'application/pdf',
        filename: 'chart.pdf',
        byteLength: 1000,
        sortIndex: 0,
        createdAt: '',
        updatedAt: '',
      },
    ]
    expect(defaultOpticalTransferAssets(assets).map((a) => a.id)).toEqual(['s'])
    expect(encodeLocalTransferAssetQuery({ e: ['s'] })).toBe('e:s')
    expect(decodeLocalTransferAssetQuery('e:s+t,f:a')).toEqual({
      e: ['s', 't'],
      f: ['a'],
    })
  })

  it('imports separate files as separate entries', async () => {
    const store = useLocalLibraryStore()
    const files = [
      new File([new Uint8Array([9, 9, 9])], 'Warmup.pdf', { type: 'application/pdf' }),
      new File([new Uint8Array([1])], 'cover.png', { type: 'image/png' }),
    ]
    const created = await store.importFilesSeparate(files)
    expect(created).toHaveLength(2)
    expect(created[0]!.title).toBe('Warmup')
    expect(store.assetsFor(created[0]!.id)).toHaveLength(1)
    expect(store.assetsFor(created[0]!.id)[0]!.role).toBe('sheet')
    const blob = await store.getLocalAssetBlob(store.assetsFor(created[0]!.id)[0]!.id)
    expect(blob?.data.byteLength).toBe(3)
  })

  it('imports combined files as one entry with roles', async () => {
    const store = useLocalLibraryStore()
    const files = [
      new File([new Uint8Array([1])], 'sheet.pdf', { type: 'application/pdf' }),
      new File([new Uint8Array([2, 2])], 'lead.mp3', { type: 'audio/mpeg' }),
    ]
    const entry = await store.importFilesCombined(files, {
      title: 'My Song',
      roles: ['sheet', 'track'],
      labels: ['Chart', 'Lead'],
    })
    expect(entry.title).toBe('My Song')
    const assets = store.assetsFor(entry.id)
    expect(assets).toHaveLength(2)
    expect(assets.map((a) => a.role)).toEqual(['sheet', 'track'])
    expect(assets[1]!.label).toBe('Lead')
  })

  it('updates metadata and creates groups', async () => {
    const store = useLocalLibraryStore()
    const group = await store.createGroup('Rehearsal')
    expect(group?.name).toBe('Rehearsal')
    const [entry] = await store.importFilesSeparate(
      [new File([new Uint8Array([1])], 'a.png', { type: 'image/png' })],
      { groupId: group!.id },
    )
    store.activeGroupId = group!.id
    expect(store.filteredEntries.map((d) => d.id)).toEqual([entry!.id])
    const updated = await store.updateMeta(entry!.id, {
      title: 'Warm-up Chart',
      arranger: 'K',
      key: 'F Major',
    })
    expect(updated?.title).toBe('Warm-up Chart')
    expect(updated?.key).toBe('F Major')
  })

  it('reorders entries in All and within a group', async () => {
    const store = useLocalLibraryStore()
    const group = await store.createGroup('Set')
    const created = await store.importFilesSeparate(
      [
        new File([new Uint8Array([1])], 'a.pdf', { type: 'application/pdf' }),
        new File([new Uint8Array([2])], 'b.pdf', { type: 'application/pdf' }),
        new File([new Uint8Array([3])], 'c.pdf', { type: 'application/pdf' }),
      ],
      { groupId: group!.id },
    )
    // Imports prepend; reverse of import order in entryOrder.
    expect(store.entryOrder).toEqual([created[2]!.id, created[1]!.id, created[0]!.id])
    await store.reorderEntry(created[2]!.id, 2)
    expect(store.entryOrder).toEqual([created[1]!.id, created[0]!.id, created[2]!.id])

    store.activeGroupId = group!.id
    const g = store.groups.find((x) => x.id === group!.id)!
    expect(g.entryIds).toEqual([created[0]!.id, created[1]!.id, created[2]!.id])
    await store.reorderEntry(created[0]!.id, 2)
    expect(store.groups.find((x) => x.id === group!.id)!.entryIds).toEqual([
      created[1]!.id,
      created[2]!.id,
      created[0]!.id,
    ])
    expect(store.filteredEntries.map((e) => e.id)).toEqual([
      created[1]!.id,
      created[2]!.id,
      created[0]!.id,
    ])
  })

  it('adds and removes entries from groups and renames', async () => {
    const store = useLocalLibraryStore()
    const group = await store.createGroup('Contest')
    const [a, b] = await store.importFilesSeparate([
      new File([new Uint8Array([1])], 'a.pdf', { type: 'application/pdf' }),
      new File([new Uint8Array([2])], 'b.pdf', { type: 'application/pdf' }),
    ])
    await store.addEntriesToGroup(group!.id, [a!.id, b!.id])
    expect(store.entries.find((e) => e.id === a!.id)!.groupIds).toContain(group!.id)
    expect(store.groups.find((g) => g.id === group!.id)!.entryIds).toEqual([a!.id, b!.id])

    await store.removeEntriesFromGroup(group!.id, [a!.id])
    expect(store.entries.find((e) => e.id === a!.id)!.groupIds).not.toContain(group!.id)
    expect(store.groups.find((g) => g.id === group!.id)!.entryIds).toEqual([b!.id])

    const renamed = await store.renameGroup(group!.id, 'Show set')
    expect(renamed?.name).toBe('Show set')
  })

  it('merges source entries into a target song', async () => {
    const store = useLocalLibraryStore()
    const sheet = await store.importFilesSeparate([
      new File([new Uint8Array([1, 1])], 'chart.pdf', { type: 'application/pdf' }),
    ])
    const tracks = await store.importFilesSeparate([
      new File([new Uint8Array([2])], 'lead.mp3', { type: 'audio/mpeg' }),
      new File([new Uint8Array([3])], 'bass.mp3', { type: 'audio/mpeg' }),
    ])
    const targetId = sheet[0]!.id
    const sourceIds = tracks.map((t) => t.id)
    const assets = [
      ...store.assetsFor(targetId),
      ...sourceIds.flatMap((id) => store.assetsFor(id)),
    ].map((a, i) => ({
      id: a.id,
      role: (i === 0 ? 'sheet' : 'track') as const,
      label: a.label,
    }))
    const merged = await store.mergeEntries(targetId, sourceIds, {
      assets,
      title: 'Full Tag',
      appendNotes: false,
    })
    expect(merged.title).toBe('Full Tag')
    expect(store.assetsFor(targetId)).toHaveLength(3)
    expect(store.assetsFor(targetId).map((a) => a.role)).toEqual(['sheet', 'track', 'track'])
    expect(store.entries.map((e) => e.id)).toEqual([targetId])
    expect(await store.getLocalAssetBlob(assets[1]!.id)).toBeTruthy()
  })

  it('finds soft duplicates and replaces in place', async () => {
    const store = useLocalLibraryStore()
    const group = await store.createGroup('Keep')
    const [original] = await store.importFilesSeparate(
      [new File([new Uint8Array([1, 2, 3])], 'chart.pdf', { type: 'application/pdf' })],
      { groupId: group!.id },
    )
    await store.updateMeta(original!.id, { title: 'Coney' })
    expect(store.findSoftDuplicate('coney', 3)?.id).toBe(original!.id)
    expect(store.findSoftDuplicate('coney', 4)).toBeNull()

    const replaced = await store.replaceEntryFromBundle(original!.id, {
      entry: {
        title: 'Coney',
        arranger: 'Lou',
        notes: '',
        key: 'Bb',
        detuneCents: 5,
      },
      assets: [
        {
          role: 'sheet',
          label: 'Chart',
          mime: 'application/pdf',
          filename: 'chart.pdf',
          data: new Uint8Array([9, 9, 9]).buffer,
          sortIndex: 0,
        },
      ],
    })
    expect(replaced.id).toBe(original!.id)
    expect(replaced.arranger).toBe('Lou')
    expect(replaced.detuneCents).toBe(5)
    expect(replaced.groupIds).toContain(group!.id)
    expect(store.assetsFor(replaced.id)[0]!.byteLength).toBe(3)
    expect(store.entryOrder).toContain(replaced.id)
  })
})

describe('local library search helpers', () => {
  const sample: LocalEntry = {
    id: 'le1',
    title: 'Goodbye My Coney Island Baby',
    arranger: 'Lou Perry',
    notes: 'Contest set opener',
    key: 'Bb',
    detuneCents: 0,
    createdAt: '',
    updatedAt: '',
    groupIds: [],
  }

  it('matches title, arranger, and key; notes only when opted in', () => {
    expect(matchLocalLibraryQuery(sample, 'coney')).toBe(true)
    expect(matchLocalLibraryQuery(sample, 'perry')).toBe(true)
    expect(matchLocalLibraryQuery(sample, 'bb')).toBe(true)
    expect(matchLocalLibraryQuery(sample, 'contest')).toBe(false)
    expect(matchLocalLibraryQuery(sample, 'contest', { includeNotes: true })).toBe(true)
    expect(matchLocalLibraryQuery(sample, '')).toBe(true)
  })

  it('orders entries by id list and appends leftovers', () => {
    const a = { ...sample, id: 'a', title: 'A' }
    const b = { ...sample, id: 'b', title: 'B' }
    const c = { ...sample, id: 'c', title: 'C' }
    expect(orderEntriesByIds([a, b, c], ['c', 'a']).map((e) => e.id)).toEqual(['c', 'a', 'b'])
  })
})
