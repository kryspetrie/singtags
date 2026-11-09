/**
 * Ports and adapters gate for Tag Studio, Arranging, and Labs.
 *
 * domain/ and application/ must not import adapters, Vue, Pinia, stores, or IndexedDB.
 * Grandfathered files may only leave the list. A file that is clean must not stay listed.
 *
 * @vitest-environment node
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'

const SRC = fileURLToPath(new URL('..', import.meta.url))

const FORBIDDEN = [
  /from\s+['"][^'"]*\/adapters\//,
  /from\s+['"][^'"]*\/offline\//,
  /from\s+['"][^'"]*\/stores\//,
  /from\s+['"][^'"]*\/components\//,
  /from\s+['"][^'"]*\/views\//,
  /from\s+['"]vue['"]/,
  /from\s+['"]pinia['"]/,
]

/**
 * Production files still allowed to break the rule. Shrink this list when a
 * slice moves; do not add a path to make a new import legal.
 */
export const ARCH_PORT_GRANDFATHER: readonly string[] = []

/** Labs modules that must stay free of IndexedDB, Vue, and Pinia. */
const LABS_PURE = [
  'lib/offlineReadiness.ts',
  'lib/rouletteDraw.ts',
  'lib/localLibraryBackup.ts',
  'lib/decimen/collectionReceive.ts',
  'lib/tagShare.ts',
  'lib/singTogether/csv.ts',
]

/** Stores that must reach persistence through adapters, not `offline/` directly. */
const LABS_STORES = ['stores/recorder.ts', 'stores/singTogether.ts']

function isTest(name: string): boolean {
  return /\.(test|spec)\.ts$/.test(name) || name.endsWith('.d.ts')
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name.startsWith('.')) continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      walk(full, out)
      continue
    }
    if (!name.endsWith('.ts') && !name.endsWith('.vue')) continue
    if (isTest(name)) continue
    out.push(full)
  }
  return out
}

function rel(full: string): string {
  return full.slice(SRC.length).replace(/\\/g, '/')
}

function violations(full: string): string[] {
  const src = readFileSync(full, 'utf8')
  return FORBIDDEN.filter((re) => re.test(src)).map((re) => String(re))
}

describe('ports and adapters', () => {
  const domainFiles = walk(join(SRC, 'domain'))
  const applicationFiles = walk(join(SRC, 'application'))
  const production = [...domainFiles, ...applicationFiles]

  it('grandfather entries still exist and still violate the rule', () => {
    for (const path of ARCH_PORT_GRANDFATHER) {
      const full = join(SRC, path)
      expect(statSync(full).isFile(), path).toBe(true)
      expect(violations(full).length, `${path} is clean — remove it from the grandfather list`).toBeGreaterThan(0)
    }
  })

  it('domain and application do not import adapters, Vue, Pinia, or IndexedDB', () => {
    const offenders: string[] = []
    const allowed = new Set(ARCH_PORT_GRANDFATHER)
    for (const full of production) {
      const path = rel(full)
      if (allowed.has(path)) continue
      const hits = violations(full)
      if (hits.length) offenders.push(`${path} ↔ ${hits.join(', ')}`)
    }
    expect(offenders).toEqual([])
  })

  it('Labs pure modules do not import Vue, Pinia, or IndexedDB', () => {
    const offenders: string[] = []
    for (const path of LABS_PURE) {
      const hits = violations(join(SRC, path))
      if (hits.length) offenders.push(`${path} ↔ ${hits.join(', ')}`)
    }
    expect(offenders).toEqual([])
  })

  it('Labs stores reach disks through adapters', () => {
    const offenders: string[] = []
    for (const path of LABS_STORES) {
      const src = readFileSync(join(SRC, path), 'utf8')
      if (/from\s+['"][^'"]*\/offline\//.test(src)) offenders.push(path)
    }
    expect(offenders).toEqual([])
  })
})
