import { ref } from 'vue'
import { defineStore } from 'pinia'

export type SnackbarTone = 'error' | 'info' | 'ok'

/**
 * App-wide snackbar (toast) for transient messages — especially errors that
 * should not sit permanently in page body copy.
 */
export const useSnackbarStore = defineStore('snackbar', () => {
  const message = ref<string | null>(null)
  const tone = ref<SnackbarTone>('info')
  let timer: ReturnType<typeof setTimeout> | null = null
  let onDismissCb: (() => void) | null = null

  function dismiss(): void {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    message.value = null
    const cb = onDismissCb
    onDismissCb = null
    cb?.()
  }

  function show(
    msg: string,
    opts?: {
      tone?: SnackbarTone
      /** Auto-dismiss delay; 0 = stay until dismissed. Default 10s for errors, 5s otherwise. */
      ms?: number
      onDismiss?: () => void
    },
  ): void {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    const nextTone = opts?.tone ?? 'info'
    message.value = msg
    tone.value = nextTone
    onDismissCb = opts?.onDismiss ?? null
    const ms = opts?.ms ?? (nextTone === 'error' ? 10_000 : 5_000)
    if (ms > 0) {
      timer = setTimeout(() => dismiss(), ms)
    }
  }

  return { message, tone, show, dismiss }
})
