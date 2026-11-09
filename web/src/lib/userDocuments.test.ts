import { describe, expect, it } from 'vitest'
import { APP_STATE_LOCAL_KEYS, buildAppStateBackup, parseAppStateBackup } from './appStateBackup'
import { mergeUserDocuments, parseUserDocuments } from './userDocuments'

describe('user documents', () => {
  it('ignores backups that never stored documents', () => {
    expect(parseUserDocuments(undefined)).toBeUndefined()
    expect(parseUserDocuments({})).toBeUndefined()
    const file = buildAppStateBackup(
      { records: [], collections: [], practice: { order: [], autoAdvance: false } },
      false,
    )
    expect(parseAppStateBackup(file).documents).toBeUndefined()
    expect(APP_STATE_LOCAL_KEYS).toContain('singtags.roulette.v1')
    expect(APP_STATE_LOCAL_KEYS).toContain('singtags.labs.tagStudio.enabled.v1')
  })

  it('keeps the newer copy of a project and unions ids', () => {
    const local = parseUserDocuments({
      tagStudio: {
        projects: [
          { id: 'a', updatedAt: 2, title: 'local' },
          { id: 'b', updatedAt: 1, title: 'only-local' },
        ],
      },
    })
    const cloud = parseUserDocuments({
      tagStudio: {
        projects: [
          { id: 'a', updatedAt: 5, title: 'cloud' },
          { id: 'c', updatedAt: 1, title: 'only-cloud' },
        ],
      },
    })
    const merged = mergeUserDocuments(local, cloud)
    const titles = Object.fromEntries(
      (merged?.tagStudio.projects ?? []).map((project) => [project.id, project.title]),
    )
    expect(titles).toEqual({ a: 'cloud', b: 'only-local', c: 'only-cloud' })
  })
})
