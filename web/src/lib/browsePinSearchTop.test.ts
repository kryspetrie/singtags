/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  isSearchTopPending,
  mayArmPinSearchTop,
  mayAutoPinSearchTop,
  shouldBlockVirtualizerScrollAdjust,
  shouldDisarmPinSearchTop,
  shouldNoteUserBrowseScroll,
  shouldNoteUserBrowseScrollGesture,
  shouldRepinAfterCatalogUpgrade,
} from './browsePinSearchTop'

describe('browsePinSearchTop', () => {
  it('disarms when the user scrolls away while pin is armed', () => {
    expect(
      shouldDisarmPinSearchTop({
        pinArmed: true,
        scrollY: 240,
        docTopEps: 2,
        suppressUntil: 0,
        now: 1000,
      }),
    ).toBe(true)
  })

  it('does not disarm during programmatic pin/restore', () => {
    expect(
      shouldDisarmPinSearchTop({
        pinArmed: true,
        scrollY: 240,
        docTopEps: 2,
        suppressUntil: 1500,
        now: 1000,
      }),
    ).toBe(false)
  })

  it('does not disarm at search top', () => {
    expect(
      shouldDisarmPinSearchTop({
        pinArmed: true,
        scrollY: 0,
        docTopEps: 2,
        suppressUntil: 0,
        now: 1000,
      }),
    ).toBe(false)
  })

  it('respects suppress even while pin is armed (layout remasure ≠ user scroll)', () => {
    expect(
      shouldNoteUserBrowseScroll({
        userTookScroll: false,
        scrollY: 400,
        docTopEps: 2,
        suppressUntil: 1500,
        pinArmed: true,
        now: 1000,
      }),
    ).toBe(false)
  })

  it('respects suppress during restore when pin is not armed', () => {
    expect(
      shouldNoteUserBrowseScroll({
        userTookScroll: false,
        scrollY: 400,
        docTopEps: 2,
        suppressUntil: 1500,
        pinArmed: false,
        now: 1000,
      }),
    ).toBe(false)
  })

  it('notes mid-list scroll after suppress while pin is still armed', () => {
    expect(
      shouldNoteUserBrowseScroll({
        userTookScroll: false,
        scrollY: 400,
        docTopEps: 2,
        suppressUntil: 500,
        pinArmed: true,
        now: 1000,
      }),
    ).toBe(true)
  })

  it('notes mid-list scroll after suppress when pin is not armed', () => {
    expect(
      shouldNoteUserBrowseScroll({
        userTookScroll: false,
        scrollY: 400,
        docTopEps: 2,
        suppressUntil: 500,
        pinArmed: false,
        now: 1000,
      }),
    ).toBe(true)
  })

  it('does not re-note after user already took scroll', () => {
    expect(
      shouldNoteUserBrowseScroll({
        userTookScroll: true,
        scrollY: 400,
        docTopEps: 2,
        suppressUntil: 0,
        pinArmed: true,
        now: 1000,
      }),
    ).toBe(false)
  })

  it('treats wheel/touchmove as user intent until already noted', () => {
    expect(shouldNoteUserBrowseScrollGesture({ userTookScroll: false })).toBe(true)
    expect(shouldNoteUserBrowseScrollGesture({ userTookScroll: true })).toBe(false)
    expect(
      shouldNoteUserBrowseScrollGesture({ userTookScroll: false, searchTopPending: true }),
    ).toBe(false)
  })

  it('blocks auto-pin after the user has scrolled, even if scrollY is later 0', () => {
    expect(
      mayAutoPinSearchTop({
        restoring: false,
        userTookScroll: true,
        scrollY: 0,
        docTopEps: 2,
      }),
    ).toBe(false)
  })

  it('allows auto-pin only at search top before any user scroll', () => {
    expect(
      mayAutoPinSearchTop({
        restoring: false,
        userTookScroll: false,
        scrollY: 0,
        docTopEps: 2,
      }),
    ).toBe(true)
    expect(
      mayAutoPinSearchTop({
        restoring: false,
        userTookScroll: false,
        scrollY: 400,
        docTopEps: 2,
      }),
    ).toBe(false)
    expect(
      mayAutoPinSearchTop({
        restoring: true,
        userTookScroll: false,
        scrollY: 0,
        docTopEps: 2,
      }),
    ).toBe(false)
  })

  it('arms initial pin even when scrollY is already mid-list', () => {
    expect(mayArmPinSearchTop({ restoring: false, userTookScroll: false })).toBe(true)
    expect(mayArmPinSearchTop({ restoring: false, userTookScroll: true })).toBe(false)
    expect(mayArmPinSearchTop({ restoring: true, userTookScroll: false })).toBe(false)
    expect(
      isSearchTopPending({
        browseReveal: false,
        restoringAtTag: false,
        scrollIntent: 'top',
      }),
    ).toBe(true)
    expect(
      isSearchTopPending({
        browseReveal: false,
        restoringAtTag: true,
        scrollIntent: 'restore',
      }),
    ).toBe(false)
  })

  it('blocks virtualizer scroll adjustments while search-top is settling', () => {
    expect(
      shouldBlockVirtualizerScrollAdjust({ pinArmed: false, searchTopPending: true }),
    ).toBe(true)
    expect(
      shouldBlockVirtualizerScrollAdjust({ pinArmed: true, searchTopPending: false }),
    ).toBe(true)
    expect(
      shouldBlockVirtualizerScrollAdjust({ pinArmed: false, searchTopPending: false }),
    ).toBe(false)
  })

  it('shouldRepinAfterCatalogUpgrade mirrors mayAutoPinSearchTop', () => {
    expect(
      shouldRepinAfterCatalogUpgrade({ restoring: false, scrollY: 0, docTopEps: 2 }),
    ).toBe(true)
    expect(
      shouldRepinAfterCatalogUpgrade({
        restoring: false,
        scrollY: 0,
        docTopEps: 2,
        userTookScroll: true,
      }),
    ).toBe(false)
  })
})
