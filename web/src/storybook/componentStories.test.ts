/**
 * Guard: every Vue SFC under src/ has a colocated Storybook story.
 * @vitest-environment node
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const srcRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function walkVueFiles(dir: string, out: string[] = []): string[] {
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, name.name)
    if (name.isDirectory()) walkVueFiles(full, out)
    else if (name.isFile() && name.name.endsWith('.vue')) out.push(full)
  }
  return out
}

describe('Storybook coverage', () => {
  it('every .vue has a colocated .stories.ts', () => {
    const missing = walkVueFiles(srcRoot)
      .map((vueAbs) => {
        const storyAbs = vueAbs.replace(/\.vue$/, '.stories.ts')
        return fs.existsSync(storyAbs)
          ? null
          : path.relative(srcRoot, vueAbs).replace(/\\/g, '/')
      })
      .filter((x): x is string => x != null)
      .sort()

    expect(
      missing,
      missing.length
        ? `Missing stories (run: node scripts/generate-component-stories.mjs):\n${missing.join('\n')}`
        : undefined,
    ).toEqual([])
  })
})
