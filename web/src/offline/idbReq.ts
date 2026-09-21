/**
 * Shared IndexedDB request helper (mirrors SingTags offlineIndexedDb.idbReq).
 */
export function idbReq<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'))
  })
}
