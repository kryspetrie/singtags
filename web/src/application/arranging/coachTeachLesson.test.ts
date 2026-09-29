import { describe, expect, it } from 'vitest'
import { buildTeachLesson } from './coachTeachLesson'

describe('buildTeachLesson', () => {
  it('expands glossary detail and collects key-of-C examples', () => {
    const lesson = buildTeachLesson({
      title: 'Classic cadences',
      glossaryIds: ['classic_cadences', 'bs7', 'tension_release'],
      intro: 'Lead ^5→^1 wants V7→I.',
    })
    expect(lesson.keyHint).toMatch(/key of C/i)
    expect(lesson.topics.map((t) => t.id)).toEqual([
      'classic_cadences',
      'bs7',
      'tension_release',
    ])
    const bs7 = lesson.topics.find((t) => t.id === 'bs7')
    expect(bs7?.detail.length ?? 0).toBeGreaterThan(bs7?.short.length ?? 0)
    expect(bs7?.makeup).toMatch(/C7/)
    expect(lesson.examples.some((e) => e.id === 'ex-auth-v7-i')).toBe(true)
    expect(lesson.examples.some((e) => e.id === 'ex-bs7-makeup')).toBe(true)
    const auth = lesson.examples.find((e) => e.id === 'ex-auth-v7-i')!
    expect(auth.chords[0]?.makeup).toMatch(/Bass/)
    expect(auth.chords[0]?.midi.lead).toBeTypeOf('number')
  })

  it('dedupes glossary ids and skips unknown', () => {
    const lesson = buildTeachLesson({
      title: 'Test',
      glossaryIds: ['bs7', 'bs7', 'nope'],
    })
    expect(lesson.topics).toHaveLength(1)
    expect(lesson.topics[0]!.id).toBe('bs7')
  })

  it('includes eleven-chord examples, images, and circle homecoming', () => {
    const eleven = buildTeachLesson({
      title: 'Eleven chords',
      glossaryIds: ['eleven_chords'],
    })
    expect(eleven.topics[0]?.images.length).toBeGreaterThanOrEqual(2)
    expect(eleven.topics[0]?.images[0]?.src).toMatch(/education\/eleven-chords/)
    expect(eleven.examples.map((e) => e.id)).toEqual(
      expect.arrayContaining(['ex-eleven-major', 'ex-eleven-minor', 'ex-eleven-sym']),
    )
    expect(eleven.examples.find((e) => e.id === 'ex-eleven-major')?.chords).toHaveLength(6)

    const circle = buildTeachLesson({
      title: 'Circle',
      glossaryIds: ['circle_fifths'],
    })
    expect(circle.topics[0]?.images.some((i) => i.src.includes('circle-of-fifths'))).toBe(true)
    expect(circle.examples.some((e) => e.id === 'ex-circle-fifths')).toBe(true)
    expect(circle.examples.some((e) => e.id === 'ex-circle-homecoming')).toBe(true)
  })
})
