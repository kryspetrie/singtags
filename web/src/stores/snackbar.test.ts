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
})
