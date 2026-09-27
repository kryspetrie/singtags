/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { useDeclaredStripGestures } from './useDeclaredStripGestures'

describe('useDeclaredStripGestures pillar toggle', () => {
  it('Alt+click on a span calls onTogglePillar without starting a drag', () => {
    const track = document.createElement('div')
    Object.defineProperty(track, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 400, height: 44, right: 400, bottom: 44 }),
    })
    track.setPointerCapture = vi.fn()
    const trackEl = ref<HTMLElement | null>(track)
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
