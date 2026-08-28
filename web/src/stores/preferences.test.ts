/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { usePreferencesStore } from './preferences'

describe('preferences store', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('defaults to standard and persists changes', () => {
    const prefs = usePreferencesStore()
    expect(prefs.audioEncodeQuality).toBe('standard')
    prefs.setAudioEncodeQuality('compact')
    expect(localStorage.getItem('singtags.audioEncodeQuality.v1')).toBe('compact')
    setActivePinia(createPinia())
    const again = usePreferencesStore()
    expect(again.audioEncodeQuality).toBe('compact')
  })

  it('defaults part solo-in-file and mix pan to left and persists', () => {
    const prefs = usePreferencesStore()
    expect(prefs.getPartSoloInFile('lead')).toBe('left')
    expect(prefs.getPartMixPan('bari')).toBe('left')
    prefs.setPartSoloInFile('lead', 'right')
    prefs.setPartMixPan('bari', 'right')
    expect(JSON.parse(localStorage.getItem('singtags.partSoloInFile.v1')!)).toEqual({
      lead: 'right',
    })
    expect(JSON.parse(localStorage.getItem('singtags.partMixPan.v1')!)).toEqual({
      bari: 'right',
    })
    setActivePinia(createPinia())
    const again = usePreferencesStore()
    expect(again.getPartSoloInFile('lead')).toBe('right')
    expect(again.getPartMixPan('bari')).toBe('right')
  })

  it('persists browse welcome dismissal', () => {
    const prefs = usePreferencesStore()
    expect(prefs.browseWelcomeDismissed).toBe(false)
    prefs.dismissBrowseWelcome()
    expect(prefs.browseWelcomeDismissed).toBe(true)
    expect(localStorage.getItem('singtags.browseWelcomeDismissed.v1')).toBe('1')
  })

  it('defaults library audio pack to all voice parts', () => {
    const prefs = usePreferencesStore()
    expect(prefs.libraryAudioPartsMode).toBe('all')
  })

  it('persists pitch pipe layout, range, A, and fine cents', () => {
    const prefs = usePreferencesStore()
    prefs.setPitchPipeLayout('piano')
    prefs.setPitchPipeRange('e3-e4')
    prefs.setPitchPipeAHz(432)
    prefs.setPitchPipeFineCents(-7)
    expect(JSON.parse(localStorage.getItem('singtags.pitchPipe.v1')!)).toEqual({
      range: 'e3-e4',
      layout: 'piano',
      aHz: 432,
      fineCents: -7,
    })
    setActivePinia(createPinia())
    const again = usePreferencesStore()
    expect(again.pitchPipeLayout).toBe('piano')
    expect(again.pitchPipeRange).toBe('e3-e4')
    expect(again.pitchPipeAHz).toBe(432)
    expect(again.pitchPipeFineCents).toBe(-7)
  })

  it('migrates legacy pitch pipe range/layout keys', () => {
    localStorage.setItem('singtags.pitchPipeRange.v1', 'e3-e4')
    localStorage.setItem('singtags.pitchPipeLayout.v1', 'list')
    setActivePinia(createPinia())
    const prefs = usePreferencesStore()
    expect(prefs.pitchPipeRange).toBe('e3-e4')
    expect(prefs.pitchPipeLayout).toBe('list')
    prefs.setPitchPipeFineCents(1)
    expect(localStorage.getItem('singtags.pitchPipeRange.v1')).toBeNull()
    expect(localStorage.getItem('singtags.pitchPipeLayout.v1')).toBeNull()
  })
})
