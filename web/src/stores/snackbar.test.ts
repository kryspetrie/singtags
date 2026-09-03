import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSnackbarStore } from './snackbar'

describe('snackbar store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows and auto-dismisses errors', () => {
    const snack = useSnackbarStore()
    const onDismiss = vi.fn()
    snack.show('Sync failed', { tone: 'error', onDismiss })
    expect(snack.message).toBe('Sync failed')
    expect(snack.tone).toBe('error')
    vi.advanceTimersByTime(10_000)
    expect(snack.message).toBeNull()
    expect(onDismiss).toHaveBeenCalledOnce()
  })

  it('dismiss clears message immediately', () => {
    const snack = useSnackbarStore()
    snack.show('Nope', { tone: 'error', ms: 0 })
    snack.dismiss()
    expect(snack.message).toBeNull()
  })

  it('runs action then dismisses', () => {
    const snack = useSnackbarStore()
    const onClick = vi.fn()
    snack.show('Favorited', {
      tone: 'ok',
      ms: 0,
      action: { label: 'Add to collection', onClick },
    })
    expect(snack.actionLabel).toBe('Add to collection')
    snack.runAction()
    expect(onClick).toHaveBeenCalledOnce()
    expect(snack.message).toBeNull()
    expect(snack.actionLabel).toBeNull()
  })

  it('runs secondary action then dismisses', () => {
    const snack = useSnackbarStore()
    const onSecondary = vi.fn()
    snack.show('Imported', {
      tone: 'ok',
      ms: 0,
      action: { label: 'Open', onClick: vi.fn() },
      secondaryAction: { label: 'Add to group', onClick: onSecondary },
    })
    expect(snack.secondaryActionLabel).toBe('Add to group')
    snack.runSecondaryAction()
    expect(onSecondary).toHaveBeenCalledOnce()
    expect(snack.message).toBeNull()
    expect(snack.secondaryActionLabel).toBeNull()
  })

  it('supports centered placement for prominent mobile toasts', () => {
    const snack = useSnackbarStore()
    snack.show('Sing mode on', { tone: 'ok', placement: 'center' })
    expect(snack.placement).toBe('center')
    snack.dismiss()
    expect(snack.placement).toBe('default')
  })

  it('supports title + body for stacked center toasts', () => {
    const snack = useSnackbarStore()
    snack.show('Tags open in the fullscreen sheet', {
      title: 'Sing mode on',
      tone: 'ok',
      placement: 'center',
    })
    expect(snack.title).toBe('Sing mode on')
    expect(snack.message).toBe('Tags open in the fullscreen sheet')
    snack.dismiss()
    expect(snack.title).toBeNull()
  })

  it('tracks auto-dismiss duration for countdown UI', () => {
    const snack = useSnackbarStore()
    snack.show('Tags open in the fullscreen sheet', {
      title: 'Sing Mode On',
      tone: 'ok',
      placement: 'center',
      ms: 3000,
    })
    expect(snack.autoDismissMs).toBe(3000)
    expect(snack.showToken).toBe(1)
    snack.dismiss()
    expect(snack.autoDismissMs).toBe(0)
  })
})
