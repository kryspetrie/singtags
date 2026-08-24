/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import TagPlayer from './TagPlayer.vue'

const mockState = {
  paused: true,
  currentTime: 0,
  duration: 12,
  usingWorklet: false,
  channels: 2,
  pitch: 0,
  speed: 1,
  loop: false,
  update: null as (() => void) | null,
  ended: null as (() => void) | null,
  load: vi.fn(async () => {}),
  setSolo: vi.fn(async () => {}),
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
    get channels() {
      return mockState.channels
    }
    setUpdateListener(fn: (() => void) | null) {
      mockState.update = fn
    }
    setEndedListener(fn: (() => void) | null) {
      mockState.ended = fn
    }
    load = mockState.load
    setSolo = mockState.setSolo
    setPitchSemitones = vi.fn(async () => {})
    setSpeed = vi.fn(async () => {})
    setBalance = vi.fn(async () => {})
    setLoop = vi.fn()
    seek = mockState.seek
    play = mockState.play
    pause = mockState.pause
    clearSource = vi.fn()
    dispose = vi.fn()
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
vi.mock('../audio/multiPartMix', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../audio/multiPartMix')>()
  return {
    ...actual,
    buildSoloMixObjectUrl: (...args: unknown[]) => buildMix(...args),
  }
})

describe('TagPlayer', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    mockState.paused = true
    mockState.currentTime = 0
    mockState.load.mockClear()
    mockState.setSolo.mockClear()
    buildMix.mockClear()
  })

  it('renders Mix…Custom part tabs and waveform without a stuck loading overlay', async () => {
    const empty = mount(TagPlayer, {
      props: { parts: {} },
      global: { plugins: [createPinia()] },
    })
    expect(empty.text()).toContain('No audio parts available')

    const w = mount(TagPlayer, {
      props: { parts: { lead: 'media/1/lead.mp4', bari: 'media/1/bari.mp4', mix: 'media/1/mix.mp4' } },
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
      props: { parts: { lead: 'media/1/lead.mp4', bari: 'media/1/bari.mp4', mix: 'media/1/mix.mp4' } },
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
    expect(w.find('button.toggle-btn').text()).toBe('Loop')
    expect(w.find('button.toggle-btn').attributes('disabled')).toBeDefined()
    expect(buildMix).not.toHaveBeenCalled()
    w.unmount()
  })

  it('loads a single custom part waveform before the mix is ready', async () => {
    const w = mount(TagPlayer, {
      props: { parts: { lead: 'media/1/lead.mp4', bari: 'media/1/bari.mp4' } },
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
      props: { parts: { lead: 'media/1/lead.mp4' } },
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
      props: { parts: { lead: 'media/1/lead.mp4', bari: 'media/1/bari.mp4' } },
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
    expect(mockState.load).toHaveBeenCalledWith('blob:mix', 'stereo')
    expect(w.find('select[aria-label="Playback speed"]').element).toHaveProperty('value', '1')
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
          lead: 'media/1/lead.mp4',
          bari: 'media/1/bari.mp4',
          bass: 'media/1/bass.mp4',
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
})
