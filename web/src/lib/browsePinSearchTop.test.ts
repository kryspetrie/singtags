/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  mayAutoPinSearchTop,
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

  it('notes mid-list scroll during pin suppress (fast-scroll race)', () => {
    expect(
      shouldNoteUserBrowseScroll({
        userTookScroll: false,
        scrollY: 400,
        docTopEps: 2,
        suppressUntil: 1500,
        pinArmed: true,
        now: 1000,
      }),
    ).toBe(true)
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
