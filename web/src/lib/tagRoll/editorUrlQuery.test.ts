import { describe, expect, it } from 'vitest'
import {
  editorQueryFromView,
  parseTagRollEditorQuery,
  serializeEditorQuery,
  viewPatchFromEditorQuery,
} from './editorUrlQuery'
import { TAG_ROLL_DEFAULT_VIEW } from './types'

describe('editorUrlQuery', () => {
  it('parses mode, surface, layout, sizing', () => {
    expect(
      parseTagRollEditorQuery({
        mode: 'view',
        surface: 'sheet',
        layout: 'page',
        sizing: 'dynamic',
      }),
    ).toEqual({
      mode: 'view',
      surface: 'sheet',
      layout: 'page',
      sizing: 'dynamic',
    })
  })

  it('maps legacy layout aliases', () => {
    expect(parseTagRollEditorQuery({ layout: 'equal' }).layout).toBe('continuous')
    expect(parseTagRollEditorQuery({ layout: 'compressed' }).layout).toBe('continuous')
    expect(parseTagRollEditorQuery({ sizing: 'compressed' }).sizing).toBe('dynamic')
  })

  it('builds view patch and serializes', () => {
    const q = parseTagRollEditorQuery({
      mode: 'view',
      surface: 'sheet',
      layout: 'page',
      sizing: 'equal',
    })
    expect(viewPatchFromEditorQuery(q)).toEqual({
      mode: 'view',
      scoreSurface: 'sheet',
      sheetLayout: 'page',
      sheetMeasureSizing: 'equal',
    })
    expect(serializeEditorQuery(editorQueryFromView(TAG_ROLL_DEFAULT_VIEW))).toEqual({
      mode: 'compose',
      surface: 'roll',
      layout: 'continuous',
      sizing: 'equal',
    })
  })
})
