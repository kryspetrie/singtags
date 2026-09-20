import type { SheetErodeFilterParams } from '../sheetErode'
import { processSheetImageUrl } from '../sheetErode'
import { revokeObjectUrls } from './pageTransition'

export type SheetFxBakeInput = {
  bases: string[]
  upgrades: string[] | null
  params: SheetErodeFilterParams | null | undefined
  invert: boolean
  isStale: () => boolean
}

export type SheetFxBakeResult = {
  pages: string[]
  upgrades: string[] | null
  owned: string[]
}

/** Bake erode/invert FX for base and upgrade page URLs. */
export async function bakeSheetImageUrls(
  input: SheetFxBakeInput,
): Promise<SheetFxBakeResult | 'stale'> {
  const { bases, upgrades, params, invert, isStale } = input
  const created: string[] = []
  const dropCreated = (): void => revokeObjectUrls(created)

  try {
    const nextPages: string[] = []
    for (const src of bases) {
      if (isStale()) {
        dropCreated()
        return 'stale'
      }
      const out = await processSheetImageUrl(src, { params: params ?? null, invert })
      if (out !== src) created.push(out)
      nextPages.push(out)
    }

    let nextUp: string[] | null = null
    if (upgrades?.length) {
      nextUp = []
      for (const src of upgrades) {
        if (isStale()) {
          dropCreated()
          return 'stale'
        }
        const out = await processSheetImageUrl(src, { params: params ?? null, invert })
        if (out !== src) created.push(out)
        nextUp.push(out)
      }
    }

    if (isStale()) {
      dropCreated()
      return 'stale'
    }

    return { pages: nextPages, upgrades: nextUp, owned: created }
  } catch {
    dropCreated()
    throw new Error('Sheet FX bake failed')
  }
}

export function sheetFxNeeded(
  params: SheetErodeFilterParams | null | undefined,
  invert: boolean,
): boolean {
  return !!params || invert
}
