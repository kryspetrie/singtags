import { describe, expect, it } from 'vitest'
import { parseTeachProse } from './teachProse'

describe('parseTeachProse', () => {
  it('keeps a plain paragraph', () => {
    expect(parseTeachProse('Just a sentence.')).toEqual([
      { type: 'p', text: 'Just a sentence.' },
    ])
  })

  it('splits blank-line paragraphs', () => {
    expect(parseTeachProse('First.\n\nSecond.')).toEqual([
      { type: 'p', text: 'First.' },
      { type: 'p', text: 'Second.' },
    ])
  })

  it('parses bullet lists after a lead sentence (no blank line)', () => {
    const blocks = parseTeachProse(
      'Classic closes:\n• Authentic V7→I — G7→C.\n• Circle II7→V7→I — D7→G7→C.',
    )
    expect(blocks).toEqual([
      { type: 'p', text: 'Classic closes:' },
      {
        type: 'ul',
        items: ['Authentic V7→I — G7→C.', 'Circle II7→V7→I — D7→G7→C.'],
      },
    ])
  })

  it('parses numbered how-to steps', () => {
    const blocks = parseTeachProse(
      'How to use it:\n1. Fix tonic as home.\n2. From I or IV you may leap.\n3. Prefer tension on a BS7.',
    )
    expect(blocks[0]).toEqual({ type: 'p', text: 'How to use it:' })
    expect(blocks[1]).toMatchObject({
      type: 'ol',
      items: [
        'Fix tonic as home.',
        'From I or IV you may leap.',
        'Prefer tension on a BS7.',
      ],
    })
  })
})
