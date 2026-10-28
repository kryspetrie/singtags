/**
 * @vitest-environment node
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { goldenOffersFromIndex, LILLY_LIBRARY_SEED, librarySeedInLibrary } from '../../lib/tagRoll/librarySeeds'
import type { TagRollProject } from '../../lib/tagRoll/types'
import type { TagRollRepository } from '../../ports/TagRollRepository'
import { importSelectedLibrarySeeds } from './importLibrarySeeds'

const INDEX = resolve(__dirname, '../../../public/tag-studio/polecat-mixed-seeds/index.json')
const MILL = resolve(__dirname, '../../../public/tag-studio/polecat-mixed-seeds/90011.json')

function memoryRepo(): TagRollRepository & { projects: Map<string, TagRollProject> } {
  const projects = new Map<string, TagRollProject>()
  return {
    projects,
    async list() {
      return [...projects.values()].map((p) => ({
        id: p.id,
        title: p.title,
        updatedAt: p.updatedAt,
        noteCount: p.notes.length,
        bpm: p.bpm,
      }))
    },
    async get(id) {
      return projects.get(id) ?? null
    },
    async put(project) {
      projects.set(project.id, project)
    },
    async remove(id) {
      projects.delete(id)
    },
    async getHistory(projectId) {
      return { projectId, undo: [], redo: [], updatedAt: 0 }
    },
    async putHistory() {},
  }
}

describe('library seed catalog', () => {
  it('lists the twelve golden songs by their chart names', () => {
    const offers = goldenOffersFromIndex(JSON.parse(readFileSync(INDEX, 'utf8')))
    expect(offers).toHaveLength(12)
    expect(offers.map((o) => o.label)).toContain('Down By The Old Mill Stream')
    expect(offers.every((o) => o.kind === 'golden' && o.fileUrl?.endsWith('.json'))).toBe(true)
    expect(offers.find((o) => o.id === 'seed-polecat-mixed-90011')?.label).toBe(
      'Down By The Old Mill Stream',
    )
  })

  it('treats an existing Lilly title as already in the library', () => {
    expect(
      librarySeedInLibrary(
        [{ id: 'user-copy', title: 'Lilly Marlene (v2)' }],
        LILLY_LIBRARY_SEED,
      ),
    ).toBe(true)
    expect(
      librarySeedInLibrary([{ id: 'other', title: 'Mill Stream' }], LILLY_LIBRARY_SEED),
    ).toBe(false)
  })
})

describe('importSelectedLibrarySeeds', () => {
  const clock = { now: () => 1_700_000_000_000 }
  const mill = JSON.parse(readFileSync(MILL, 'utf8')) as unknown

  it('adds only the selected charts and leaves ones already stored', async () => {
    const repo = memoryRepo()
    repo.projects.set('user-copy', {
      id: 'user-copy',
      title: 'Lilly Marlene (v2)',
      notes: [{ id: 'n' }],
      bpm: 80,
      updatedAt: 1,
    } as TagRollProject)
    const offers = [
      LILLY_LIBRARY_SEED,
      ...goldenOffersFromIndex(JSON.parse(readFileSync(INDEX, 'utf8'))),
    ]
    const result = await importSelectedLibrarySeeds(
      repo,
      clock,
      offers,
      [LILLY_LIBRARY_SEED.id, 'seed-polecat-mixed-90011', 'seed-polecat-mixed-90008'],
      async (url) => (url.endsWith('/90011.json') ? mill : null),
    )
    expect(result.skipped).toEqual(['Lilly Marlene'])
    expect(result.imported).toEqual(['Down By The Old Mill Stream'])
    expect(result.errors).toEqual(['Could not load Shine On Me'])
    expect(repo.projects.has('seed-polecat-mixed-90011')).toBe(true)
    expect(repo.projects.has('seed-lilly-marlene-v2')).toBe(false)
    expect(repo.projects.get('user-copy')?.title).toBe('Lilly Marlene (v2)')
  })

  it('stores Lilly under the stable seed id when the library does not have it', async () => {
    const repo = memoryRepo()
    const result = await importSelectedLibrarySeeds(
      repo,
      clock,
      [LILLY_LIBRARY_SEED],
      [LILLY_LIBRARY_SEED.id],
    )
    expect(result.imported).toEqual(['Lilly Marlene'])
    const saved = repo.projects.get('seed-lilly-marlene-v2')
    expect(saved?.title).toBe('Lilly Marlene (v2)')
    expect(saved?.notes.length).toBeGreaterThan(0)
    expect(saved?.parts.map((p) => p.name)).toEqual(['Tenor', 'Lead', 'Bari', 'Bass'])
  })
})
