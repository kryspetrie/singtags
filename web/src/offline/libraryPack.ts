/**
 * Offline pack storage: Cache API first, with optional OPFS fallback for put failures.
 * Keys are absolute media URLs (same as mediaUrl()).
 * When Cache API is unavailable (e.g. some test envs), uses an in-memory map.
 */

export type PackKind = 'sheets' | 'audio'

export const PACK_CACHE_NAMES: Record<PackKind, string> = {
  sheets: 'singtags-sheets-v1',
  audio: 'singtags-audio-v1',
}

export interface OfflinePackStore {
  kind: PackKind
  has(url: string): Promise<boolean>
  get(url: string): Promise<Response | null>
  put(url: string, response: Response): Promise<void>
  delete(url: string): Promise<boolean>
  clear(): Promise<void>
  count(): Promise<number>
  /** Sum of cached blob sizes (deduped by URL). */
  totalBytes(): Promise<number>
  /** All cached absolute URLs in this pack. */
  listUrls(): Promise<string[]>
}

const memoryCaches = new Map<string, Map<string, ArrayBuffer>>()

function memoryMap(name: string): Map<string, ArrayBuffer> {
  let m = memoryCaches.get(name)
  if (!m) {
    m = new Map()
    memoryCaches.set(name, m)
  }
  return m
}

function cacheApiAvailable(): boolean {
  return typeof caches !== 'undefined' && typeof caches.open === 'function'
}

async function openCache(name: string): Promise<Cache | null> {
  if (!cacheApiAvailable()) return null
  return caches.open(name)
}

function opfsSupported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.storage?.getDirectory
}

async function opfsRoot(kind: PackKind): Promise<FileSystemDirectoryHandle | null> {
  if (!opfsSupported()) return null
  try {
    const root = await navigator.storage.getDirectory()
    return await root.getDirectoryHandle(`singtags-pack-${kind}`, { create: true })
  } catch {
    return null
  }
}

function urlToOpfsName(url: string): string {
  let h = 0
  for (let i = 0; i < url.length; i++) h = (Math.imul(31, h) + url.charCodeAt(i)) | 0
  return `${(h >>> 0).toString(16)}_${url.length}.bin`
}

async function opfsPut(
  dir: FileSystemDirectoryHandle,
  url: string,
  response: Response,
): Promise<void> {
  const buf = await response.clone().arrayBuffer()
  const name = urlToOpfsName(url)
  const metaName = `${name}.url`
  const file = await dir.getFileHandle(name, { create: true })
  const writable = await file.createWritable()
  await writable.write(buf)
  await writable.close()
  const meta = await dir.getFileHandle(metaName, { create: true })
  const mw = await meta.createWritable()
  await mw.write(new TextEncoder().encode(url))
  await mw.close()
}

async function opfsGet(
  dir: FileSystemDirectoryHandle,
  url: string,
): Promise<Response | null> {
  try {
    const name = urlToOpfsName(url)
    const file = await dir.getFileHandle(name)
    const f = await file.getFile()
    return new Response(f, {
      headers: { 'Content-Type': f.type || 'application/octet-stream' },
    })
  } catch {
    return null
  }
}

export function createPackStore(kind: PackKind): OfflinePackStore {
  const cacheName = PACK_CACHE_NAMES[kind]
  let opfsDir: FileSystemDirectoryHandle | null | undefined

  async function ensureOpfs(): Promise<FileSystemDirectoryHandle | null> {
    if (opfsDir !== undefined) return opfsDir
    opfsDir = await opfsRoot(kind)
    return opfsDir
  }

  return {
    kind,
    async has(url: string): Promise<boolean> {
      const cache = await openCache(cacheName)
      if (cache && (await cache.match(url))) return true
      if (memoryMap(cacheName).has(url)) return true
      const dir = await ensureOpfs()
      if (!dir) return false
      return !!(await opfsGet(dir, url))
    },
    async get(url: string): Promise<Response | null> {
      const cache = await openCache(cacheName)
      if (cache) {
        const hit = await cache.match(url)
        if (hit) return hit
      }
      const mem = memoryMap(cacheName).get(url)
      if (mem) {
        return new Response(mem, {
          headers: { 'Content-Type': 'application/octet-stream' },
        })
      }
      const dir = await ensureOpfs()
      if (!dir) return null
      return opfsGet(dir, url)
    },
    async put(url: string, response: Response): Promise<void> {
      const buf = await response.clone().arrayBuffer()
      const wrapped = new Response(buf.slice(0), {
        status: 200,
        headers: {
          'Content-Type': response.headers.get('Content-Type') || 'application/octet-stream',
        },
      })
      const cache = await openCache(cacheName)
      if (cache) {
        try {
          await cache.put(url, wrapped.clone())
          return
        } catch {
          const dir = await ensureOpfs()
          if (dir) {
            await opfsPut(dir, url, wrapped)
            return
          }
        }
      }
      memoryMap(cacheName).set(url, buf)
    },
    async delete(url: string): Promise<boolean> {
      let a = false
      const cache = await openCache(cacheName)
      if (cache) a = await cache.delete(url)
      a = memoryMap(cacheName).delete(url) || a
      try {
        const dir = await ensureOpfs()
        if (dir) {
          const name = urlToOpfsName(url)
          try {
            await dir.removeEntry(name)
            await dir.removeEntry(`${name}.url`)
          } catch {
            /* missing */
          }
        }
      } catch {
        /* ignore */
      }
      return a
    },
    async clear(): Promise<void> {
      if (cacheApiAvailable()) await caches.delete(cacheName)
      memoryMap(cacheName).clear()
      try {
        if (opfsSupported()) {
          const root = await navigator.storage.getDirectory()
          await root.removeEntry(`singtags-pack-${kind}`, { recursive: true })
          opfsDir = null
        }
      } catch {
        opfsDir = undefined
      }
    },
    async count(): Promise<number> {
      const cache = await openCache(cacheName)
      const cacheCount = cache ? (await cache.keys()).length : 0
      return Math.max(cacheCount, memoryMap(cacheName).size)
    },
    async totalBytes(): Promise<number> {
      const urls = await this.listUrls()
      let total = 0
      for (const url of urls) {
        const res = await this.get(url)
        if (!res) continue
        total += (await res.arrayBuffer()).byteLength
      }
      return total
    },
    async listUrls(): Promise<string[]> {
      const urls = new Set<string>()
      const cache = await openCache(cacheName)
      if (cache) {
        for (const req of await cache.keys()) urls.add(req.url)
      }
      for (const u of memoryMap(cacheName).keys()) urls.add(u)
      const dir = await ensureOpfs()
      if (dir) {
        try {
          for await (const [name, handle] of dir.entries()) {
            if (!name.endsWith('.url') || handle.kind !== 'file') continue
            const f = await handle.getFile()
            const url = await f.text()
            if (url) urls.add(url.trim())
          }
        } catch {
          /* ignore */
        }
      }
      return [...urls]
    },
  }
}

export const sheetsPack = createPackStore('sheets')
export const audioPack = createPackStore('audio')
