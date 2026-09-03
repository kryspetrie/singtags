/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import TagPlayer from './TagPlayer.vue'

const mockState = {
  paused: true,
  currentTime: 0,
  duration: 12,
  usingWorklet: false,
  channels: 2,
  effectivelyMono: false,
  pitch: 0,
  speed: 1,
  loop: false,
  update: null as (() => void) | null,
  ended: null as (() => void) | null,
  load: vi.fn(async () => {}),
  setSolo: vi.fn(async () => {}),
  setTransform: vi.fn(async (p: number, s: number) => {
    mockState.pitch = p
    mockState.speed = s
  }),
  seek: vi.fn((t: number) => {
    mockState.currentTime = t
  }),
  play: vi.fn(async () => {
    mockState.paused = false
  }),
  pause: vi.fn(() => {
    mockState.paused = true
  }),
}

vi.mock('../audio/player', () => {
  class MockPlayer {
    get paused() {
      return mockState.paused
    }
    get currentTime() {
      return mockState.currentTime
    }
    get duration() {
      return mockState.duration
    }
    get usingWorklet() {
      return mockState.usingWorklet
    }
    get usingBake() {
      return false
    }
    get baking() {
      return false
    }
    get bakeError() {
      return null
    }
    getPitchSemitones() {
      return mockState.pitch
    }
    getSpeed() {
      return mockState.speed
    }
    get channels() {
      return mockState.channels
    }
    get effectivelyMono() {
      return mockState.channels < 2 || !!mockState.effectivelyMono
    }
    setUpdateListener(fn: (() => void) | null) {
      mockState.update = fn
    }
    setEndedListener(fn: (() => void) | null) {
      mockState.ended = fn
    }
    load = mockState.load
    setSolo = mockState.setSolo
    setPitchSemitones = vi.fn(async (n: number) => {
      mockState.pitch = n
    })
    setSpeed = vi.fn(async (n: number) => {
      mockState.speed = n
    })
    setTransform = mockState.setTransform
    setBalance = vi.fn(async () => {})
    setLoop = vi.fn()
    setPlayRegion = vi.fn()
    seek = mockState.seek
    play = mockState.play
    pause = mockState.pause
    clearSource = vi.fn()
    dispose = vi.fn()
    getOriginalBuffer = vi.fn(() => null)
  }
  return { TagAudioPlayer: MockPlayer }
})

vi.mock('../audio/waveform', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../audio/waveform')>()
  return {
    ...actual,
    loadWaveformPeaks: vi.fn(async () => ({
      peaks: [0.2, 0.5, 0.8, 0.4],
      channels: 2,
    })),
  }
})

const buildMix = vi.fn(async () => ({ url: 'blob:mix', sampleRate: 44100, length: 100 }))
const buildUltraMix = vi.fn(async () => ({ url: 'blob:ultra-mix', sampleRate: 44100, length: 100 }))
vi.mock('../audio/multiPartMix', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../audio/multiPartMix')>()
  return {
    ...actual,
    buildSoloMixObjectUrl: (...args: unknown[]) => buildMix(...args),
  }
})

vi.mock('../audio/partLeftReconstruct', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../audio/partLeftReconstruct')>()
  return {
    ...actual,
    buildUltraMixObjectUrl: (...args: unknown[]) => buildUltraMix(...args),
  }
})

describe('TagPlayer', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    mockState.paused = true
    mockState.currentTime = 0
    mockState.channels = 2
    mockState.effectivelyMono = false
    mockState.load.mockClear()
    mockState.setSolo.mockClear()
    mockState.setTransform.mockClear()
    buildMix.mockClear()
    buildUltraMix.mockClear()
  })

  it('folds detuneCents into Mix bake pitch', async () => {
    vi.useFakeTimers()
    const w = mount(TagPlayer, {
      props: {
        parts: { mix: 'media/1/mix.m4a' },
        pitchSemitones: 2,
        detuneCents: 0,
      },
      global: { plugins: [createPinia()] },
    })
    await flushPromises()
    mockState.setTransform.mockClear()
    await w.setProps({ detuneCents: 50 })
    await flushPromises()
    vi.advanceTimersByTime(200)
    await flushPromises()
    expect(mockState.setTransform).toHaveBeenCalled()
    const [pitch] = mockState.setTransform.mock.calls.at(-1)!
    expect(pitch).toBeCloseTo(2.5, 5)
    w.unmount()
    vi.useRealTimers()
  })

  it('does not fall back to parts keys when availableParts is empty', async () => {
    const w = mount(TagPlayer, {
      props: {
        parts: { lead: 'media/1/lead.m4a', mix: 'media/1/mix.m4a', bari: 'media/1/bari.m4a' },
        availableParts: [],
      },
      global: { plugins: [createPinia()] },
    })
    await flushPromises()
    expect(w.findAll('.part-btn').length).toBe(0)
    w.unmount()
  })

  it('renders Mix…Custom part tabs and waveform without a stuck loading overlay', async () => {
    const empty = mount(TagPlayer, {
      props: { parts: {} },
      global: { plugins: [createPinia()] },
    })
    expect(empty.text()).toContain('No audio parts available')

    const w = mount(TagPlayer, {
      props: { parts: { lead: 'media/1/lead.m4a', bari: 'media/1/bari.m4a', mix: 'media/1/mix.m4a' } },
      global: { plugins: [createPinia()] },
    })
    await flushPromises()
    expect(w.text()).toContain('Mix')
    expect(w.text()).toContain('Custom')
    expect(w.text()).not.toContain('Loading waveform')
    expect(w.find('[aria-label="Tag audio player"]').exists()).toBe(true)
    expect(
      w.find('[aria-label="Waveform: drag to scrub, or drag loop brackets"]').exists(),
    ).toBe(true)
    expect(w.find('.combine').exists()).toBe(false)
    const active = w.findAll('.part-btn').find((b) => b.classes().includes('active'))
    expect(active?.text()).toContain('Mix')
    w.unmount()
  })

  it('opens custom controls when Custom tab is selected', async () => {
    const w = mount(TagPlayer, {
      props: { parts: { lead: 'media/1/lead.m4a', bari: 'media/1/bari.m4a', mix: 'media/1/mix.m4a' } },
      global: { plugins: [createPinia()] },
    })
    await flushPromises()
    await w.findAll('.part-btn').find((b) => b.text() === 'Custom')!.trigger('click')
    await flushPromises()
    expect(w.find('.combine').exists()).toBe(true)
    expect(w.text()).toContain('Select parts to preview')
    expect(w.text()).not.toContain('Start here')
    expect(w.text()).not.toContain('Full track')
    expect(w.find('[aria-label="Play"]').attributes('disabled')).toBeDefined()
    expect(w.find('.playback-adjust button.toggle-btn').text()).toBe('Off')
    expect(w.find('.playback-adjust button.toggle-btn').attributes('disabled')).toBeDefined()
    expect(w.find('.transport .toggle-btn').exists()).toBe(false)
    expect(w.find('.transport select[aria-label="Playback speed"]').exists()).toBe(true)
    expect(buildMix).not.toHaveBeenCalled()
    w.unmount()
  })

  it('loads a single custom part waveform before the mix is ready', async () => {
    const w = mount(TagPlayer, {
      props: { parts: { lead: 'media/1/lead.m4a', bari: 'media/1/bari.m4a' } },
      global: { plugins: [createPinia()] },
    })
    await flushPromises()
    await w.findAll('.part-btn').find((b) => b.text() === 'Custom')!.trigger('click')
    await flushPromises()
    mockState.load.mockClear()
    buildMix.mockClear()
    const checks = w.findAll('.combine-check input')
    await checks[0]!.setValue(true)
    await flushPromises()
    expect(buildMix).not.toHaveBeenCalled()
    expect(mockState.load).toHaveBeenCalled()
    expect(mockState.load.mock.calls.at(-1)?.[1]).toBe('left')
    expect(w.text()).toContain('Select one more part')
    expect(w.find('[aria-label="Play"]').attributes('disabled')).toBeUndefined()
    expect(w.text()).not.toContain('Loading waveform')
    w.unmount()
  })

  it('switches solo via segmented control', async () => {
    const w = mount(TagPlayer, {
      props: { parts: { lead: 'media/1/lead.m4a' } },
      global: { plugins: [createPinia()] },
    })
    await flushPromises()
    await w.findAll('.seg button').find((b) => b.text().includes('Left'))!.trigger('click')
    await flushPromises()
    expect(mockState.setSolo).toHaveBeenCalledWith('left')
    w.unmount()
  })

  it('builds a multi-part mix when Custom is active and two parts are selected', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const w = mount(TagPlayer, {
      props: { parts: { lead: 'media/1/lead.m4a', bari: 'media/1/bari.m4a' } },
      global: { plugins: [pinia] },
    })
    await flushPromises()
    await w.findAll('.part-btn').find((b) => b.text() === 'Custom')!.trigger('click')
    await flushPromises()
    mockState.load.mockClear()
    const checks = w.findAll('.combine-check input')
    expect(checks.length).toBe(2)
    await checks[0]!.setValue(true)
    await checks[1]!.setValue(true)
    await flushPromises()
    expect(buildMix).toHaveBeenCalled()
    const inputs = buildMix.mock.calls.at(-1)![0] as Array<{ pan: string; soloInFile: string }>
    expect(inputs.map((i) => i.pan)).toEqual(['left', 'right'])
    expect(inputs.every((i) => i.soloInFile === 'left')).toBe(true)
    expect(mockState.load).toHaveBeenCalledWith('blob:mix', 'stereo', expect.objectContaining({ signal: expect.any(AbortSignal) }))
    expect(w.find('select[aria-label="Playback speed"]').element).toHaveProperty('value', '1')
    w.unmount()
  })

  it('shows Custom tab for ultra-low mono stems even when parts layout is mono', async () => {
    const w = mount(TagPlayer, {
      props: {
        parts: { lead: 'media/1/lead.m4a', bari: 'media/1/bari.m4a' },
        audioLayoutSummary: { parts: 'mono', ultra_low: 'mono_downmix' },
      },
      global: { plugins: [createPinia()] },
    })
    await flushPromises()
    expect(w.findAll('.part-btn').some((b) => b.text() === 'Custom')).toBe(true)
    w.unmount()
  })

  it('hides Custom tab when layout is mono without ultra stem policy', async () => {
    const w = mount(TagPlayer, {
      props: {
        parts: { lead: 'media/1/lead.m4a', bari: 'media/1/bari.m4a' },
        audioLayoutSummary: { parts: 'mono' },
      },
      global: { plugins: [createPinia()] },
    })
    await flushPromises()
    expect(w.findAll('.part-btn').some((b) => b.text() === 'Custom')).toBe(false)
    w.unmount()
  })

  it('uses panned ultra mix for mono_solos custom combine', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const w = mount(TagPlayer, {
      props: {
        parts: { lead: 'media/1/lead.m4a', bari: 'media/1/bari.m4a' },
        audioLayoutSummary: { parts: 'part_right', solo_side: 'right', ultra_low: 'mono_solos' },
        audioLayouts: {
          lead: { kind: 'part_right', solo_side: 'right' },
          bari: { kind: 'part_right', solo_side: 'right' },
        },
      },
      global: { plugins: [pinia] },
    })
    await flushPromises()
    await w.findAll('.part-btn').find((b) => b.text() === 'Custom')!.trigger('click')
    await flushPromises()
    expect(w.text()).toContain('Part R')
    expect(w.findAll('button').filter((b) => b.text() === 'Part L').length).toBe(0)
    const checks = w.findAll('.combine-check input')
    await checks[0]!.setValue(true)
    await checks[1]!.setValue(true)
    await flushPromises()
    expect(buildUltraMix).toHaveBeenCalled()
    const inputs = buildUltraMix.mock.calls.at(-1)![0] as Array<{ pan: number }>
    expect(inputs.map((i) => i.pan)).toEqual([-1, 1])
    w.unmount()
  })

  it('uses metadata solo side for stereo custom mix and locks Part L/R', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const w = mount(TagPlayer, {
      props: {
        parts: { lead: 'media/1/lead.m4a', bari: 'media/1/bari.m4a' },
        audioLayoutSummary: { parts: 'part_right', solo_side: 'right' },
        audioLayouts: {
          lead: { kind: 'part_right', solo_side: 'right' },
          bari: { kind: 'part_right', solo_side: 'right' },
        },
      },
      global: { plugins: [pinia] },
    })
    await flushPromises()
    await w.findAll('.part-btn').find((b) => b.text() === 'Custom')!.trigger('click')
    await flushPromises()
    expect(w.text()).toContain('Part R')
    const checks = w.findAll('.combine-check input')
    await checks[0]!.setValue(true)
    await checks[1]!.setValue(true)
    await flushPromises()
    const inputs = buildMix.mock.calls.at(-1)![0] as Array<{ soloInFile: string }>
    expect(inputs.every((i) => i.soloInFile === 'right')).toBe(true)
    w.unmount()
  })

  it('defaults first custom-track selection hard left and later hard right', async () => {
    const { usePreferencesStore } = await import('../stores/preferences')
    const pinia = createPinia()
    setActivePinia(pinia)
    const prefs = usePreferencesStore()
    const w = mount(TagPlayer, {
      props: {
        parts: {
          lead: 'media/1/lead.m4a',
          bari: 'media/1/bari.m4a',
          bass: 'media/1/bass.m4a',
        },
      },
      global: { plugins: [pinia] },
    })
    await flushPromises()
    await w.findAll('.part-btn').find((b) => b.text() === 'Custom')!.trigger('click')
    await flushPromises()
    const checks = w.findAll('.combine-check input')
    await checks[0]!.setValue(true)
    expect(prefs.getPartMixPan('lead')).toBe('left')
    await checks[1]!.setValue(true)
    expect(prefs.getPartMixPan('bari')).toBe('right')
    await checks[2]!.setValue(true)
    expect(prefs.getPartMixPan('bass')).toBe('right')
    w.unmount()
  })

  it('enables solo L/R when reconstructed offline part is stereo', async () => {
    mockState.effectivelyMono = false
    mockState.channels = 2
    const w = mount(TagPlayer, {
      props: {
        parts: { lead: 'media/1/lead.m4a' },
        availableParts: ['lead'],
        resolvePart: vi.fn(async () => 'blob:learning-stereo'),
      },
      global: { plugins: [createPinia()] },
    })
    await flushPromises()
    const leftBtn = w.findAll('button').find((b) => b.text() === 'Left')
    const rightBtn = w.findAll('button').find((b) => b.text() === 'Right')
    expect(leftBtn?.attributes('disabled')).toBeUndefined()
    expect(rightBtn?.attributes('disabled')).toBeUndefined()
    expect(w.text()).not.toContain('channel solo is unavailable')
    w.unmount()
  })

  it('disables solo L/R for effectively mono tracks', async () => {
    mockState.effectivelyMono = true
    mockState.channels = 1
    const w = mount(TagPlayer, {
      props: {
        parts: { lead: 'media/1/lead.m4a' },
        availableParts: ['lead'],
      },
      global: { plugins: [createPinia()] },
    })
    await flushPromises()
    const leftBtn = w.findAll('button').find((b) => b.text() === 'Left')
    expect(leftBtn?.attributes('disabled')).toBeDefined()
    expect(w.text()).toContain('channel solo is unavailable')
    w.unmount()
  })

  it('preserves playhead when a new part URL appears during part switch', async () => {
    mockState.effectivelyMono = false
    mockState.channels = 2
    mockState.currentTime = 12
    mockState.paused = false
    mockState.duration = 60

    let resolveTenor!: (url: string) => void
    const tenorReady = new Promise<string>((r) => {
      resolveTenor = r
    })
    const parts = ref<Record<string, string>>({
      lead: 'blob:lead',
    })

    const w = mount(TagPlayer, {
      props: {
        parts: parts.value,
        availableParts: ['lead', 'tenor'],
        resolvePart: async (p: string) => {
          if (p === 'lead') return 'blob:lead'
          if (p === 'tenor') {
            const url = await tenorReady
            parts.value = { ...parts.value, tenor: url }
            await w.setProps({ parts: { ...parts.value } })
            return url
          }
          return null
        },
      },
      global: { plugins: [createPinia()] },
    })
    await flushPromises()

    mockState.currentTime = 12
    mockState.paused = false
    // Same length as the prior part — playhead should be preserved.
    mockState.duration = 60
    const tenorTab = w.findAll('.part-btn').find((b) => b.text() === 'Tenor')
    expect(tenorTab).toBeTruthy()
    await tenorTab!.trigger('click')
    await flushPromises()

    resolveTenor('blob:tenor')
    await flushPromises()

    expect(mockState.seek).toHaveBeenCalled()
    const seekTimes = mockState.seek.mock.calls.map((c) => c[0] as number)
    expect(seekTimes.some((t) => t >= 11.5 && t <= 12.5)).toBe(true)
    w.unmount()
  })

  it('resets playhead when switching to a part whose duration differs by >0.5s', async () => {
    mockState.effectivelyMono = false
    mockState.channels = 2
    mockState.currentTime = 0
    mockState.paused = true
    mockState.duration = 60

    const w = mount(TagPlayer, {
      props: {
        parts: { lead: 'blob:lead', bari: 'blob:bari' },
        availableParts: ['lead', 'bari'],
      },
      global: { plugins: [createPinia()] },
    })
    await flushPromises()

    mockState.currentTime = 20
    mockState.paused = false
    mockState.seek.mockClear()

    // Simulate a shorter learning track loading after the tab click.
    mockState.load.mockImplementationOnce(async () => {
      mockState.duration = 8
    })

    const bariTab = w.findAll('.part-btn').find((b) => b.text() === 'Bari')
    expect(bariTab).toBeTruthy()
    await bariTab!.trigger('click')
    await flushPromises()

    const seekTimes = mockState.seek.mock.calls.map((c) => c[0] as number)
    expect(seekTimes.some((t) => t >= 19.5 && t <= 20.5)).toBe(false)
    expect(seekTimes.at(-1)).toBe(0)
    w.unmount()
  })

  it('stop pauses and seeks to mark A; nudge uses ±1s', async () => {
    mockState.paused = false
    mockState.currentTime = 20
    mockState.duration = 60
    const w = mount(TagPlayer, {
      props: {
        parts: { lead: 'media/1/lead.m4a' },
        availableParts: ['lead'],
      },
      global: { plugins: [createPinia()] },
    })
    await flushPromises()

    // Set A–B via waveform marks by calling stop after seeking marks — use exposed transport.
    expect(w.text()).toContain('−1s')
    expect(w.text()).toContain('+1s')
    expect(w.text()).not.toContain('−5s')

    await w.get('[aria-label="Back 1 second"]').trigger('click')
    expect(mockState.seek).toHaveBeenCalled()

    mockState.seek.mockClear()
    mockState.pause.mockClear()
    mockState.currentTime = 20
    mockState.paused = false
    await w.get('[aria-label="Stop — pause and go to start"]').trigger('click')
    await flushPromises()
    expect(mockState.pause).toHaveBeenCalled()
    expect(mockState.seek).toHaveBeenCalledWith(0)
    w.unmount()
  })

  it('enters and exits fullscreen locally without exit-origin', async () => {
    const w = mount(TagPlayer, {
      props: {
        parts: { lead: 'media/1/lead.m4a' },
        exitOriginLabel: 'tag page',
      },
      global: { plugins: [createPinia()] },
      attachTo: document.body,
    })
    await flushPromises()
    await (w.vm as { enterFullscreen: () => Promise<void> }).enterFullscreen()
    await flushPromises()
    expect(w.emitted('fullscreen-change')?.[0]).toEqual([true])
    expect(document.body.style.overflow).toBe('hidden')
    expect(document.body.querySelector('.player.fullscreen')).toBeTruthy()

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await flushPromises()
    expect(w.emitted('fullscreen-change')?.at(-1)).toEqual([false])
    expect(w.emitted('exit-origin')).toBeFalsy()
    expect(document.body.style.overflow).toBe('')
    w.unmount()
  })

  it('exitFullscreen does not history.back (avoids leaving the tag page)', async () => {
    const back = vi.spyOn(history, 'back')
    const w = mount(TagPlayer, {
      props: {
        parts: { lead: 'media/1/lead.m4a' },
        exitOriginLabel: 'tag page',
      },
      global: { plugins: [createPinia()] },
      attachTo: document.body,
    })
    await flushPromises()
    await (w.vm as { enterFullscreen: () => Promise<void> }).enterFullscreen()
    await flushPromises()
    await (w.vm as { exitFullscreen: () => Promise<void> }).exitFullscreen()
    await flushPromises()
    expect(back).not.toHaveBeenCalled()
    expect(w.emitted('fullscreen-change')?.at(-1)).toEqual([false])
    back.mockRestore()
    w.unmount()
  })

  it('shows playback adjust controls in fullscreen and caps waveform height', async () => {
    const prevVp = window.visualViewport
    vi.stubGlobal('innerHeight', 700)
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: { height: 700 },
    })
    const w = mount(TagPlayer, {
      props: { parts: { lead: 'media/1/lead.m4a' } },
      global: { plugins: [createPinia()] },
      attachTo: document.body,
    })
    await flushPromises()
    await (w.vm as { enterFullscreen: () => Promise<void> }).enterFullscreen()
    await flushPromises()
    expect(document.body.querySelector('.player.fullscreen')).toBeTruthy()
    expect(document.body.querySelector('.player.fullscreen .wave.fill')).toBeFalsy()
    expect(document.body.querySelector('.player.fullscreen .playback-adjust')).toBeTruthy()
    expect(document.body.querySelector('.player.fullscreen details')).toBeFalsy()
    expect(document.body.querySelector('.player.fullscreen .loop-field')).toBeTruthy()
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: prevVp,
    })
    vi.unstubAllGlobals()
    w.unmount()
  })

  it('shows Pitch controls in fullscreen chrome', async () => {
    const prevVp = window.visualViewport
    vi.stubGlobal('innerHeight', 700)
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: { height: 700 },
    })
    const w = mount(TagPlayer, {
      props: {
        parts: { lead: 'media/1/lead.m4a' },
        songKey: 'Ab Major',
        payKeyEnabled: true,
      },
      global: { plugins: [createPinia()] },
      attachTo: document.body,
    })
    await flushPromises()
    await (w.vm as { enterFullscreen: () => Promise<void> }).enterFullscreen()
    await flushPromises()
    expect(document.body.querySelector('.player.fullscreen .player-chrome-title')).toBeFalsy()
    const pitchBtn = document.body.querySelector('.player.fullscreen .paybtn') as HTMLButtonElement | null
    expect(pitchBtn).toBeTruthy()
    pitchBtn!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    expect(w.emitted('pay-down')).toBeTruthy()
    pitchBtn!.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))
    expect(w.emitted('pay-up')).toBeTruthy()
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: prevVp,
    })
    vi.unstubAllGlobals()
    w.unmount()
  })

  it('emits exit-origin from fullscreen chrome when exit label is a list', async () => {
    const w = mount(TagPlayer, {
      props: {
        parts: { lead: 'media/1/lead.m4a' },
        exitOriginLabel: 'Favorites',
      },
      global: { plugins: [createPinia()] },
      attachTo: document.body,
    })
    await flushPromises()
    await (w.vm as { enterFullscreen: () => Promise<void> }).enterFullscreen()
    await flushPromises()
    const exitBtn = document.body.querySelector('.player-chrome-exit') as HTMLButtonElement
    expect(exitBtn).toBeTruthy()
    exitBtn.click()
    await flushPromises()
    expect(w.emitted('exit-origin')).toBeTruthy()
    expect(w.emitted('fullscreen-change')?.at(-1)).toEqual([false])
    w.unmount()
  })
})
