/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest'
import { getPwaInstallGuide } from './pwaInstallGuide'

describe('pwaInstallGuide', () => {
  it('returns ios guide with Share / Add to Home Screen steps', () => {
    const g = getPwaInstallGuide('ios')
    expect(g.title).toMatch(/iPhone/)
    expect(g.steps.some((s) => /Add to Home Screen/i.test(s))).toBe(true)
    expect(g.imageSrc).toMatch(/install-ios\.jpg/)
  })

  it('returns android guide with Install app step', () => {
    const g = getPwaInstallGuide('android')
    expect(g.steps.some((s) => /Install app/i.test(s))).toBe(true)
    expect(g.imageSrc).toMatch(/install-android\.jpg/)
  })

  it('returns desktop guide with address-bar install', () => {
    const g = getPwaInstallGuide('desktop')
    expect(g.steps.some((s) => /address bar/i.test(s))).toBe(true)
    expect(g.imageSrc).toMatch(/install-desktop\.jpg/)
  })
})
