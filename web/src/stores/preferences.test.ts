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

  it('persists pitch pipe layout, range, concert A, and detune cents', () => {
    const prefs = usePreferencesStore()
    prefs.setPitchPipeLayout('piano')
    prefs.setPitchPipeRange('e3-e4')
    prefs.setPitchPipeConcertA(432)
    expect(JSON.parse(localStorage.getItem('singtags.pitchPipe.v1')!)).toEqual({
      range: 'e3-e4',
      layout: 'piano',
      aHz: 432,
      detuneCents: -32,
    })
    prefs.setPitchPipeDetuneCents(-7, { clearConcertA: true })
    expect(JSON.parse(localStorage.getItem('singtags.pitchPipe.v1')!)).toEqual({
      range: 'e3-e4',
      layout: 'piano',
      aHz: null,
      detuneCents: -7,
    })
    setActivePinia(createPinia())
    const again = usePreferencesStore()
    expect(again.pitchPipeLayout).toBe('piano')
    expect(again.pitchPipeRange).toBe('e3-e4')
    expect(again.pitchPipeAHz).toBeNull()
    expect(again.pitchPipeDetuneCents).toBe(-7)
  })

  it('migrates legacy fineCents-on-top-of-A pitch pipe prefs', () => {
    localStorage.setItem(
      'singtags.pitchPipe.v1',
      JSON.stringify({ range: 'e3-e4', layout: 'grid', aHz: 432, fineCents: 0 }),
    )
    setActivePinia(createPinia())
    const prefs = usePreferencesStore()
    expect(prefs.pitchPipeAHz).toBe(432)
    expect(prefs.pitchPipeDetuneCents).toBe(-32)
  })

  it('migrates legacy pitch pipe range/layout keys', () => {
    localStorage.setItem('singtags.pitchPipeRange.v1', 'e3-e4')
    localStorage.setItem('singtags.pitchPipeLayout.v1', 'list')
    setActivePinia(createPinia())
    const prefs = usePreferencesStore()
    expect(prefs.pitchPipeRange).toBe('e3-e4')
    expect(prefs.pitchPipeLayout).toBe('list')
    prefs.setPitchPipeDetuneCents(1, { clearConcertA: true })
    expect(localStorage.getItem('singtags.pitchPipeRange.v1')).toBeNull()
    expect(localStorage.getItem('singtags.pitchPipeLayout.v1')).toBeNull()
  })

  it('persists global detune application flag', () => {
    const prefs = usePreferencesStore()
    expect(prefs.applyDetuneGlobally).toBe(false)
    expect(prefs.globalPitchDetuneCents()).toBe(0)
    prefs.setPitchPipeConcertA(432)
    prefs.setApplyDetuneGlobally(true)
    expect(prefs.globalPitchDetuneCents()).toBe(-32)
    expect(localStorage.getItem('singtags.applyDetuneGlobally.v1')).toBe('1')
    setActivePinia(createPinia())
    expect(usePreferencesStore().applyDetuneGlobally).toBe(true)
  })

  it('persists sing mode off by default', () => {
    const prefs = usePreferencesStore()
    expect(prefs.singMode).toBe(false)
    prefs.setSingMode(true)
    expect(localStorage.getItem('singtags.singMode.v1')).toBe('1')
    setActivePinia(createPinia())
    expect(usePreferencesStore().singMode).toBe(true)
  })

  it('defaults optical transfer on and list buttons off', () => {
    const prefs = usePreferencesStore()
    expect(prefs.opticalTransferEnabled).toBe(true)
    expect(prefs.opticalTransferListButtons).toBe(false)
    prefs.setOpticalTransferEnabled(false)
    prefs.setOpticalTransferListButtons(true)
    expect(localStorage.getItem('singtags.labs.opticalTransfer.enabled.v1')).toBe('0')
    expect(localStorage.getItem('singtags.labs.opticalTransfer.listButtons.v1')).toBe('1')
    setActivePinia(createPinia())
    const again = usePreferencesStore()
    expect(again.opticalTransferEnabled).toBe(false)
    expect(again.opticalTransferListButtons).toBe(true)
  })

  it('persists share-fullscreen preference', () => {
    const prefs = usePreferencesStore()
    expect(prefs.shareFullscreen).toBe(false)
    prefs.setShareFullscreen(true)
    expect(localStorage.getItem('singtags.shareFullscreen.v1')).toBe('1')
    setActivePinia(createPinia())
    expect(usePreferencesStore().shareFullscreen).toBe(true)
  })

  it('persists share-barbershoptags preference', () => {
    const prefs = usePreferencesStore()
    expect(prefs.shareBarbershopTags).toBe(false)
    prefs.setShareBarbershopTags(true)
    expect(localStorage.getItem('singtags.shareBarbershopTags.v1')).toBe('1')
    setActivePinia(createPinia())
    expect(usePreferencesStore().shareBarbershopTags).toBe(true)
  })
})
