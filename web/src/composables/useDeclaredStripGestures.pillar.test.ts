/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { STRIP_DRAG_SLOP_PX } from '../lib/tagRoll/harmonyStripGestures'
import { useDeclaredStripGestures, sketchSpanIdsBetween } from './useDeclaredStripGestures'

function makeTrack() {
  const track = document.createElement('div')
  Object.defineProperty(track, 'getBoundingClientRect', {
    value: () => ({ left: 0, top: 0, width: 400, height: 44, right: 400, bottom: 44 }),
  })
  track.setPointerCapture = vi.fn()
  track.releasePointerCapture = vi.fn()
  track.hasPointerCapture = vi.fn(() => true)
  return track
}

describe('useDeclaredStripGestures pillar toggle', () => {
  it('Alt+click on a span calls onTogglePillar without starting a drag', () => {
    const trackEl = ref<HTMLElement | null>(makeTrack())
    const onTogglePillar = vi.fn()
    const onSelect = vi.fn()
    const onBeginGesture = vi.fn()

    const { onPointerDown, gesture } = useDeclaredStripGestures({
      trackEl,
      declared: ref([
        {
          id: 's1',
          startTick: 0,
          endTick: 480,
          rootPc: 0,
          quality: 'major',
          displayName: 'C',
          displayRoman: 'I',
        },
      ]),
      selectedIds: ref([]),
      scrollX: ref(0),
      cellW: ref(24),
      ppq: ref(480),
      snapTicks: ref(120),
      lengthTicks: ref(1920),
      onBeginGesture,
      onSelect,
      onClearSelection: vi.fn(),
      onPlaceRange: vi.fn(),
      onEdit: vi.fn(),
      onTogglePillar,
      onGeometry: vi.fn(),
      onGeometryMany: vi.fn(),
      onFocusRange: vi.fn(),
    })

    onPointerDown(
      new PointerEvent('pointerdown', {
        button: 0,
        clientX: 12,
        clientY: 10,
        altKey: true,
        pointerId: 1,
      }),
    )

    expect(onTogglePillar).toHaveBeenCalledTimes(1)
    expect(onTogglePillar.mock.calls[0]![0].id).toBe('s1')
    expect(onSelect).toHaveBeenCalledWith(['s1'])
    expect(onBeginGesture).not.toHaveBeenCalled()
    expect(gesture.value).toBeNull()
  })
})

describe('useDeclaredStripGestures drag-select', () => {
  it('drag across empty that covers chords selects those sketch spans (not place)', () => {
    const trackEl = ref<HTMLElement | null>(makeTrack())
    const onSelect = vi.fn()
    const onFocusRange = vi.fn()
    const onPlaceRange = vi.fn()

    const { onPointerDown, onPointerMove, onPointerUp } = useDeclaredStripGestures({
      trackEl,
      declared: ref([
        {
          id: 's1',
          startTick: 480,
          endTick: 960,
          rootPc: 0,
          quality: 'major',
          displayName: 'C',
          displayRoman: 'I',
        },
        {
          id: 's2',
          startTick: 960,
          endTick: 1440,
          rootPc: 7,
          quality: 'major',
          displayName: 'G',
          displayRoman: 'V',
        },
      ]),
      selectedIds: ref([]),
      scrollX: ref(0),
      cellW: ref(24),
      ppq: ref(480),
      snapTicks: ref(120),
      lengthTicks: ref(1920),
      onBeginGesture: vi.fn(),
      onSelect,
      onClearSelection: vi.fn(),
      onPlaceRange,
      onEdit: vi.fn(),
      onTogglePillar: vi.fn(),
      onGeometry: vi.fn(),
      onGeometryMany: vi.fn(),
      onFocusRange,
    })

    // Empty at tick 0 — drag through both chords (24px ≈ 480 ticks).
    onPointerDown(
      new PointerEvent('pointerdown', { button: 0, clientX: 2, clientY: 10, pointerId: 1 }),
    )
    onPointerMove(
      new PointerEvent('pointermove', {
        clientX: 2 + STRIP_DRAG_SLOP_PX + 72,
        clientY: 10,
        pointerId: 1,
      }),
    )
    onPointerUp(new PointerEvent('pointerup', { pointerId: 1 }))

    expect(onPlaceRange).not.toHaveBeenCalled()
    expect(onSelect).toHaveBeenCalledWith(['s1', 's2'])
    expect(onFocusRange).toHaveBeenCalledWith(480, 1440)
  })
})

describe('useDeclaredStripGestures shift-click range', () => {
  const spans = [
    {
      id: 's1',
      startTick: 0,
      endTick: 480,
      rootPc: 0,
      quality: 'major' as const,
      displayName: 'C',
      displayRoman: 'I',
    },
    {
      id: 's2',
      startTick: 480,
      endTick: 960,
      rootPc: 5,
      quality: 'major' as const,
      displayName: 'F',
      displayRoman: 'IV',
    },
    {
      id: 's3',
      startTick: 960,
      endTick: 1440,
      rootPc: 7,
      quality: 'major' as const,
      displayName: 'G',
      displayRoman: 'V',
    },
  ]

  it('sketchSpanIdsBetween returns inclusive endpoints ordered by time', () => {
    expect(sketchSpanIdsBetween(spans, 's1', 's3')).toEqual(['s1', 's2', 's3'])
    expect(sketchSpanIdsBetween(spans, 's3', 's1')).toEqual(['s1', 's2', 's3'])
    expect(sketchSpanIdsBetween(spans, 's2', 's2')).toEqual(['s2'])
  })

  it('click then Shift+click selects the inclusive range', () => {
    const trackEl = ref<HTMLElement | null>(makeTrack())
    const selectedIds = ref<string[]>([])
    const onSelect = vi.fn((ids: string[]) => {
      selectedIds.value = ids
    })

    const { onPointerDown, onPointerUp } = useDeclaredStripGestures({
      trackEl,
      declared: ref(spans),
      selectedIds,
      scrollX: ref(0),
      cellW: ref(24),
      ppq: ref(480),
      snapTicks: ref(120),
      lengthTicks: ref(1920),
      onBeginGesture: vi.fn(),
      onSelect,
      onClearSelection: vi.fn(),
      onPlaceRange: vi.fn(),
      onEdit: vi.fn(),
      onTogglePillar: vi.fn(),
      onGeometry: vi.fn(),
      onGeometryMany: vi.fn(),
      onFocusRange: vi.fn(),
    })

    // Click s1 (x≈12 → tick 240)
    onPointerDown(
      new PointerEvent('pointerdown', { button: 0, clientX: 12, clientY: 10, pointerId: 1 }),
    )
    onPointerUp(new PointerEvent('pointerup', { pointerId: 1 }))
    expect(onSelect).toHaveBeenLastCalledWith(['s1'])

    // Shift+click s3 (x≈60 → tick 1200)
    onPointerDown(
      new PointerEvent('pointerdown', {
        button: 0,
        clientX: 60,
        clientY: 10,
        shiftKey: true,
        pointerId: 2,
      }),
    )
    onPointerUp(new PointerEvent('pointerup', { pointerId: 2 }))
    expect(onSelect).toHaveBeenLastCalledWith(['s1', 's2', 's3'])
  })

  it('Shift+click alone with no prior selection selects only that chord', () => {
    const trackEl = ref<HTMLElement | null>(makeTrack())
    const selectedIds = ref<string[]>([])
    const onSelect = vi.fn((ids: string[]) => {
      selectedIds.value = ids
    })

    const { onPointerDown, onPointerUp } = useDeclaredStripGestures({
      trackEl,
      declared: ref(spans),
      selectedIds,
      scrollX: ref(0),
      cellW: ref(24),
      ppq: ref(480),
      snapTicks: ref(120),
      lengthTicks: ref(1920),
      onBeginGesture: vi.fn(),
      onSelect,
      onClearSelection: vi.fn(),
      onPlaceRange: vi.fn(),
      onEdit: vi.fn(),
      onTogglePillar: vi.fn(),
      onGeometry: vi.fn(),
      onGeometryMany: vi.fn(),
      onFocusRange: vi.fn(),
    })

    onPointerDown(
      new PointerEvent('pointerdown', {
        button: 0,
        clientX: 60,
        clientY: 10,
        shiftKey: true,
        pointerId: 1,
      }),
    )
    onPointerUp(new PointerEvent('pointerup', { pointerId: 1 }))
    expect(onSelect).toHaveBeenCalledWith(['s3'])
  })
})
