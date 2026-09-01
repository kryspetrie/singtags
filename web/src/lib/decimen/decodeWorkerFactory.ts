import type { PoolWorker } from '../../../vendor/decimen/shared/worker-pool'

export function createDecodeWorker(): PoolWorker {
  return new Worker(new URL('./decodeWorker.ts', import.meta.url), { type: 'module' })
}
