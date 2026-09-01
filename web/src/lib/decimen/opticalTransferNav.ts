import type { Router } from 'vue-router'

export type OpticalTransferNavOptions = {
  tagIds?: number[]
  name?: string
  collectionId?: string
}

/** Open optical transfer for selected tags or a saved collection. */
export function navigateToOpticalTransfer(router: Router, opts: OpticalTransferNavOptions): void {
  if (opts.collectionId) {
    void router.push({ name: 'optical-transfer', query: { collection: opts.collectionId } })
    return
  }
  const tagIds = opts.tagIds?.filter((id) => Number.isFinite(id)) ?? []
  if (!tagIds.length) return
  void router.push({
    name: 'optical-transfer',
    query: {
      tags: tagIds.join(','),
      name: opts.name?.trim() || 'Selection',
    },
  })
}

/** Route location for receive-first optical transfer (works fully offline). */
export const opticalReceiveRoute = {
  name: 'optical-transfer' as const,
  query: { mode: 'receive' },
}
