/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { ensurePolecatPitchReviewProjects } from './ensurePolecatPitchReviews'
import type { TagRollRepository } from '../../ports/TagRollRepository'
import type { TagRollProject } from '../../lib/tagRoll/types'

describe('ensurePolecatPitchReviewProjects', () => {
  const clock = { now: () => 1_700_000_000_000 }

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.href
              : input.url
        if (url.includes('/tag-studio/polecat-pitch-reviews/index.json')) {
          return {
            ok: true,
            json: async () => ({ projects: [], count: 0, gold: [] }),
          }
        }
        return { ok: false, json: async () => null }
      }),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('removes leftover seed-polecat-pitch-* when the index is empty', async () => {
    const deleted: string[] = []
    const repo: TagRollRepository = {
      async list() {
        return [
          {
            id: 'seed-polecat-pitch-90001',
            title: 'Old',
            updatedAt: 1,
            noteCount: 1,
            bpm: 100,
          },
          {
            id: 'user-project',
            title: 'Keep',
            updatedAt: 1,
            noteCount: 1,
            bpm: 100,
          },
        ]
      },
      async get() {
        return null
      },
      async put() {},
      async remove(id: string) {
        deleted.push(id)
      },
      async getHistory() {
        return { projectId: '', entries: [], cursor: -1 }
      },
      async putHistory() {},
    }
    const result = await ensurePolecatPitchReviewProjects(repo, clock)
    expect(result.removed).toBe(1)
    expect(deleted).toEqual(['seed-polecat-pitch-90001'])
    expect(result.imported).toBe(0)
  })

  it('does not invent projects when the published index is empty', async () => {
    const puts: TagRollProject[] = []
    const repo: TagRollRepository = {
      async list() {
        return []
      },
      async get() {
        return null
      },
      async put(p) {
        puts.push(p)
      },
      async remove() {},
      async getHistory() {
        return { projectId: '', entries: [], cursor: -1 }
      },
      async putHistory() {},
    }
    const result = await ensurePolecatPitchReviewProjects(repo, clock)
    expect(result.imported).toBe(0)
    expect(puts).toHaveLength(0)
  })
})
