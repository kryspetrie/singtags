/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { allModuleHelp, coreModuleHelp, labsModuleHelp, modeModuleHelp } from './moduleHelp'
import { PRIMARY_NAV_ITEMS } from './primaryNav'

describe('moduleHelp', () => {
  it('covers core + labs nav destinations with blurbs', () => {
    const core = coreModuleHelp()
    const labs = labsModuleHelp()
    expect(core.length).toBeGreaterThan(5)
    expect(labs.length).toBeGreaterThan(3)
    for (const entry of [...core, ...labs]) {
      expect(entry.blurb.trim().length).toBeGreaterThan(12)
      expect(entry.navId).toBeTruthy()
      expect(PRIMARY_NAV_ITEMS[entry.navId!].label).toBe(entry.title)
      expect(entry.path).toBe(PRIMARY_NAV_ITEMS[entry.navId!].path)
    }
  })

  it('includes More toggles without routes', () => {
    const modes = modeModuleHelp()
    expect(modes.map((m) => m.id)).toEqual(['sing-mode', 'offline-mode'])
    expect(modes.every((m) => m.path == null)).toBe(true)
  })

  it('allModuleHelp is a flat ordered list', () => {
    const all = allModuleHelp()
    expect(all.length).toBe(
      coreModuleHelp().length + labsModuleHelp().length + modeModuleHelp().length,
    )
    expect(new Set(all.map((e) => e.id)).size).toBe(all.length)
  })
})
