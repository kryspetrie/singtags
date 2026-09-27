import { describe, expect, it } from 'vitest'
import { TAG_ROLL_PPQ } from './types'
import { pageScrollToRevealNote } from './selectionPageScroll'
import { ticksToPx } from './normalize'

describe('pageScrollToRevealNote', () => {
  const base = {
    noteMidi: 80,
    scrollX: 0,
    scrollY: 0,
    cellW: 40,
    cellH: 14,
    viewportW: 400,
    viewportH: 280,
    lengthTicks: TAG_ROLL_PPQ * 64,
    ppq: TAG_ROLL_PPQ,
    marginPx: 40,
  }

  it('returns null when the note is already on-screen', () => {
    expect(
      pageScrollToRevealNote({
        ...base,
        noteStartTick: TAG_ROLL_PPQ * 2, // 80px
      }),
    ).toBeNull()
  })

  it('pages right by one viewport when the note is just off-screen', () => {
    const tick = TAG_ROLL_PPQ * 12 // 480px > 400
    const next = pageScrollToRevealNote({
      ...base,
      noteStartTick: tick,
    })
    expect(next).not.toBeNull()
    expect(next!.scrollX).toBe(400)
    const screenX = ticksToPx(tick, 40) - next!.scrollX
    expect(screenX).toBeGreaterThanOrEqual(40)
    expect(screenX).toBeLessThanOrEqual(400 - 40)
  })

  it('pages left by one viewport when the note is left of the view', () => {
    const tick = TAG_ROLL_PPQ * 2 // 80px
    const next = pageScrollToRevealNote({
      ...base,
      scrollX: 400,
      noteStartTick: tick,
    })
    expect(next).not.toBeNull()
    expect(next!.scrollX).toBe(0)
  })

  it('snaps when the note is more than one page away', () => {
    const tick = TAG_ROLL_PPQ * 40 // 1600px
    const next = pageScrollToRevealNote({
      ...base,
      noteStartTick: tick,
    })
    expect(next).not.toBeNull()
    // One page (400) would leave it off-screen; snap to margin.
    expect(next!.scrollX).toBe(ticksToPx(tick, 40) - 40)
  })

  it('pages vertically for an off-screen pitch', () => {
    // midi 60 → y = (83-60)*14 = 322; viewportH 280 → off bottom
    const next = pageScrollToRevealNote({
      ...base,
      noteStartTick: 0,
      noteMidi: 60,
    })
    expect(next).not.toBeNull()
    expect(next!.scrollY).toBe(280)
  })
})
