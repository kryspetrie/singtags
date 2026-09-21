/**
 * Selection sets for arrangement document ops (UI maps gestures → these).
 */
export type ArrangementSelection = {
  melodyIds: string[]
  stackIds: string[]
  pillarIds: string[]
}

export function emptySelection(): ArrangementSelection {
  return { melodyIds: [], stackIds: [], pillarIds: [] }
}

export function selectOnlyMelody(ids: readonly string[]): ArrangementSelection {
  return { melodyIds: [...ids], stackIds: [], pillarIds: [] }
}

export function selectOnlyStacks(ids: readonly string[]): ArrangementSelection {
  return { melodyIds: [], stackIds: [...ids], pillarIds: [] }
}

export function toggleId(list: readonly string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id]
}

export function selectionIsEmpty(sel: ArrangementSelection): boolean {
  return !sel.melodyIds.length && !sel.stackIds.length && !sel.pillarIds.length
}
