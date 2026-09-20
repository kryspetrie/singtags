/**
 * Architecture guard: pure Tag Studio helpers must not import Vue / Pinia / IndexedDB edges.
 *
 * @vitest-environment node
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'

const LIB_ROOT = fileURLToPath(new URL('../lib/tagRoll', import.meta.url))

const FORBIDDEN = [
  /from\s+['"][^'"]*\/offline\//,
  /from\s+['"][^'"]*\/stores\//,
  /from\s+['"]vue['"]/,
  /from\s+['"]pinia['"]/,
  /from\s+['"][^'"]*localLibraryDb['"]/,
]

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name.startsWith('.')) continue
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) {
      walk(full, out)
      continue
    }
    if (!name.endsWith('.ts')) continue
    if (/\.(test|spec)\.ts$/.test(name)) continue
    if (name.endsWith('.d.ts')) continue
    out.push(full)
  }
  return out
}

describe('tagRoll purity', () => {
  it('lib/tagRoll has no Vue/Pinia/offline imports', () => {
    const offenders: string[] = []
    for (const file of walk(LIB_ROOT)) {
      const src = readFileSync(file, 'utf8')
      for (const re of FORBIDDEN) {
        if (re.test(src)) {
          offenders.push(`${file.replace(LIB_ROOT + '/', '')} ↔ ${re}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })
})
