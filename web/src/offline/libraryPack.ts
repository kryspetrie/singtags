/**
 * Offline pack storage: Cache API first, with optional OPFS fallback for put failures.
 * Keys are absolute media URLs (same as mediaUrl()).
 * When Cache API is unavailable (e.g. some test envs), uses an in-memory map.
 */

export type PackKind = 'sheets' | 'audio'

/** Cache API bucket names for each tier-2 offline pack. */
export const PACK_CACHE_NAMES: Record<PackKind, string> = {
  sheets: 'singtags-sheets-v1',
  audio: 'singtags-audio-v1',
}

/**
 * Key/value store for one offline pack (sheets or audio).
 *
 * Keys are absolute media URLs (same as {@link mediaUrl}). Values are `Response` bodies.
 */
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

/** Reuse Cache handles — opening per file dominates tiny-asset packs. */
const openCacheMemo = new Map<string, Promise<Cache | null>>()

async function openCache(name: string): Promise<Cache | null> {
  if (!cacheApiAvailable()) return null
  let pending = openCacheMemo.get(name)
  if (!pending) {
    pending = caches.open(name).catch((err) => {
      openCacheMemo.delete(name)
      throw err
    })
    openCacheMemo.set(name, pending)
  }
  return pending
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

/**
 * Create a pack store backed by Cache API, with OPFS fallback and in-memory test fallback.
 *
 * @param kind `'sheets'` or `'audio'`.
 */
export function createPackStore(kind: PackKind): OfflinePackStore {
  const cacheName = PACK_CACHE_NAMES[kind]
  let opfsDir: FileSystemDirectoryHandle | null | undefined
  /** pathname → stored absolute URL; avoids O(n) Cache.keys() on every miss. */
  let pathnameIndex: Map<string, string> | null = null
  let pathnameIndexBuild: Promise<Map<string, string>> | null = null

  function pageBase(): string {
    return typeof window !== 'undefined' ? window.location.href : 'http://127.0.0.1/'
  }

  function lookupKeys(url: string): string[] {
    const keys = [url]
    try {
      keys.push(new URL(url, pageBase()).href)
    } catch {
      /* ignore */
    }
    return [...new Set(keys)]
  }

  function pathnameOf(url: string): string | null {
    try {
      return new URL(url, pageBase()).pathname
    } catch {
      return null
    }
  }

  function rememberPath(storeUrl: string): void {
    const path = pathnameOf(storeUrl)
    if (!path) return
    if (!pathnameIndex) pathnameIndex = new Map()
    pathnameIndex.set(path, storeUrl)
  }

  function forgetPath(url: string): void {
    if (!pathnameIndex) return
    for (const key of lookupKeys(url)) {
      const path = pathnameOf(key)
      if (!path) continue
      if (pathnameIndex.get(path) === key || pathnameIndex.get(path) === url) {
        pathnameIndex.delete(path)
      }
    }
  }

  function invalidatePathnameIndex(): void {
    pathnameIndex = null
    pathnameIndexBuild = null
  }

  async function ensurePathnameIndex(): Promise<Map<string, string>> {
    if (pathnameIndex) return pathnameIndex
    if (!pathnameIndexBuild) {
      pathnameIndexBuild = (async () => {
        const map = new Map<string, string>()
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
              const stored = (await f.text()).trim()
              if (stored) urls.add(stored)
            }
          } catch {
            /* ignore */
          }
        }
        for (const stored of urls) {
          const path = pathnameOf(stored)
          if (path) map.set(path, stored)
        }
        pathnameIndex = map
        return map
      })().catch((err) => {
        pathnameIndexBuild = null
        throw err
      })
    }
    return pathnameIndexBuild
  }

  async function ensureOpfs(): Promise<FileSystemDirectoryHandle | null> {
    if (opfsDir !== undefined) return opfsDir
    opfsDir = await opfsRoot(kind)
    return opfsDir
  }

  async function getExact(url: string): Promise<Response | null> {
    const keys = lookupKeys(url)
    const cache = await openCache(cacheName)
    for (const key of keys) {
      if (cache) {
        const hit = await cache.match(key)
        if (hit) return hit
      }
      const mem = memoryMap(cacheName).get(key)
      if (mem) {
        return new Response(mem, {
          headers: { 'Content-Type': 'application/octet-stream' },
        })
      }
    }
    const dir = await ensureOpfs()
    if (!dir) return null
    for (const key of keys) {
      const hit = await opfsGet(dir, key)
      if (hit) return hit
    }
    return null
  }

  return {
    kind,
    async has(url: string): Promise<boolean> {
      // Existence only — avoid OPFS file reads; pathname index covers origin mismatches.
      const keys = lookupKeys(url)
      const cache = await openCache(cacheName)
      for (const key of keys) {
        if (cache && (await cache.match(key))) return true
        if (memoryMap(cacheName).has(key)) return true
      }
      const want = pathnameOf(url)
      if (want) {
        const index = await ensurePathnameIndex()
        const stored = index.get(want)
        if (stored) {
          for (const key of lookupKeys(stored)) {
            if (cache && (await cache.match(key))) return true
            if (memoryMap(cacheName).has(key)) return true
          }
        }
      }
      // OPFS fallback only when Cache API unavailable (test / rare envs).
      if (!cache) {
        const dir = await ensureOpfs()
        if (!dir) return false
        for (const key of keys) {
          if (await opfsGet(dir, key)) return true
        }
      }
      return false
    },
    async get(url: string): Promise<Response | null> {
      const exact = await getExact(url)
      if (exact) return exact
      // Origin / relative vs absolute mismatch: one pathname index build, then O(1).
      const want = pathnameOf(url)
      if (!want) return null
      const index = await ensurePathnameIndex()
      const stored = index.get(want)
      if (!stored || stored === url) return null
      return getExact(stored)
    },
    async put(url: string, response: Response): Promise<void> {
      // Normalize to absolute URL so match/has survive relative vs absolute lookups.
      let storeUrl = url
      try {
        storeUrl = new URL(url, pageBase()).href
      } catch {
        /* keep original */
      }
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
          await cache.put(storeUrl, wrapped.clone())
          rememberPath(storeUrl)
          return
        } catch {
          const dir = await ensureOpfs()
          if (dir) {
            await opfsPut(dir, storeUrl, wrapped)
            rememberPath(storeUrl)
            return
          }
        }
      }
      memoryMap(cacheName).set(storeUrl, buf)
      rememberPath(storeUrl)
    },
    async delete(url: string): Promise<boolean> {
      let a = false
      const cache = await openCache(cacheName)
      if (cache) {
        for (const key of lookupKeys(url)) {
          a = (await cache.delete(key)) || a
        }
      }
      for (const key of lookupKeys(url)) {
        a = memoryMap(cacheName).delete(key) || a
      }
      forgetPath(url)
      try {
        const dir = await ensureOpfs()
        if (dir) {
          for (const key of lookupKeys(url)) {
            const name = urlToOpfsName(key)
            try {
              await dir.removeEntry(name)
              await dir.removeEntry(`${name}.url`)
            } catch {
              /* missing */
            }
          }
        }
      } catch {
        /* ignore */
      }
      return a
    },
    async clear(): Promise<void> {
      invalidatePathnameIndex()
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

/** Shared tier-2 sheets pack store instance. */
export const sheetsPack = createPackStore('sheets')
/** Shared tier-2 audio pack store instance. */
export const audioPack = createPackStore('audio')
