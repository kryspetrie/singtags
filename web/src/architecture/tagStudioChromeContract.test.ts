/**
 * @vitest-environment node
 *
 * Contract tests for Tag Studio chrome unification.
 * Locks shared CSS class names so migrations cannot delete globals accidentally.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(__dirname, '../styles')

function css(name: string): string {
  return readFileSync(resolve(root, name), 'utf8')
}

describe('Tag Studio chrome contracts', () => {
  it('utilities.css defines the shared button vocabulary', () => {
    const src = css('utilities.css')
    expect(src).toMatch(/\.btn\s*\{/)
    expect(src).toMatch(/\.btn-primary\s*\{/)
    expect(src).toMatch(/\.btn-ghost\s*\{/)
    expect(src).toMatch(/\.btn-danger\s*\{/)
  })

  it('utilities.css defines compact .btn-sm for Tag Studio chrome density', () => {
    const src = css('utilities.css')
    expect(src).toMatch(/\.btn-sm\s*\{/)
  })

  it('controls.css defines segment / tab vocabulary', () => {
    const src = css('controls.css')
    expect(src).toMatch(/\.ctrl-segment\s*\{/)
    expect(src).toMatch(/\.ctrl-tabs\s*\{/)
    expect(src).toMatch(/\.ctrl-segment--compact/)
  })
})
