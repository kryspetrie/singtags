/**
 * Parse / serialize Tag Studio editor URL query for deep-linking.
 * Example: /tag-studio/:id?mode=view&surface=sheet&layout=page&sizing=dynamic
 */
import type {
  TagRollEditorMode,
  TagRollScoreSurface,
  TagRollSheetLayout,
  TagRollSheetMeasureSizing,
  TagRollViewPrefs,
} from './types'

export type TagRollEditorUrlQuery = {
  mode?: TagRollEditorMode
  surface?: TagRollScoreSurface
  layout?: TagRollSheetLayout
  sizing?: TagRollSheetMeasureSizing
}

export function parseTagRollEditorQuery(
  query: Record<string, unknown>,
): TagRollEditorUrlQuery {
  const out: TagRollEditorUrlQuery = {}
  const mode = String(query.mode ?? '')
  if (mode === 'view' || mode === 'compose' || mode === 'lyrics') out.mode = mode
  const surface = String(query.surface ?? '')
  if (surface === 'roll' || surface === 'sheet') out.surface = surface
  const layout = String(query.layout ?? '')
  if (layout === 'continuous' || layout === 'page') out.layout = layout
  // Legacy aliases
  if (layout === 'equal' || layout === 'compressed') out.layout = 'continuous'
  const sizing = String(query.sizing ?? '')
  if (sizing === 'equal' || sizing === 'dynamic') out.sizing = sizing
  if (sizing === 'compressed') out.sizing = 'dynamic'
  return out
}

/** Patch applied onto view prefs from URL (only keys present in query). */
export function viewPatchFromEditorQuery(
  q: TagRollEditorUrlQuery,
): Partial<TagRollViewPrefs> {
  const patch: Partial<TagRollViewPrefs> = {}
  if (q.mode) patch.mode = q.mode
  if (q.surface) patch.scoreSurface = q.surface
  if (q.layout) patch.sheetLayout = q.layout
  if (q.sizing) patch.sheetMeasureSizing = q.sizing
  return patch
}

export function editorQueryFromView(view: TagRollViewPrefs): TagRollEditorUrlQuery {
  return {
    mode: view.mode,
    surface: view.scoreSurface,
    layout: view.sheetLayout,
    sizing: view.sheetMeasureSizing,
  }
}

/** Flat string record for vue-router `query`. */
export function serializeEditorQuery(
  q: TagRollEditorUrlQuery,
): Record<string, string> {
  const out: Record<string, string> = {}
  if (q.mode) out.mode = q.mode
  if (q.surface) out.surface = q.surface
  if (q.layout) out.layout = q.layout
  if (q.sizing) out.sizing = q.sizing
  return out
}
