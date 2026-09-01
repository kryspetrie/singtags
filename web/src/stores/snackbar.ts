import { ref } from 'vue'
import { defineStore } from 'pinia'

/** Visual tone for snackbar messages. */
export type SnackbarTone = 'error' | 'info' | 'ok'

/** Optional primary action shown beside Dismiss. */
export type SnackbarAction = {
  label: string
  onClick: () => void
}

/**
 * App-wide snackbar (toast) for transient messages — completed actions (ok/info)
 * and errors that should not sit permanently in page body copy.
 */
export const useSnackbarStore = defineStore('snackbar', () => {
  const message = ref<string | null>(null)
  const tone = ref<SnackbarTone>('info')
  const actionLabel = ref<string | null>(null)
  let timer: ReturnType<typeof setTimeout> | null = null
  let onDismissCb: (() => void) | null = null
  let actionCb: (() => void) | null = null

  /** Hide the snackbar, clear the auto-dismiss timer, and run any `onDismiss` callback. */
  function dismiss(): void {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    message.value = null
    actionLabel.value = null
    actionCb = null
    const cb = onDismissCb
    onDismissCb = null
    cb?.()
  }

  /**
   * Show a transient message. Replaces any visible snackbar and resets its timer.
   *
   * @param msg - Text shown in the toast.
   * @param opts.tone - Visual style (`info`, `ok`, `error`). Default `info`.
   * @param opts.ms - Auto-dismiss delay; `0` stays until dismissed. Default 10s errors, 5s otherwise (8s with action).
   * @param opts.onDismiss - Called once when the snackbar is dismissed (manual or timeout).
   * @param opts.action - Optional button (e.g. Add to collection); cleared when dismissed.
   */
  function show(
    msg: string,
    opts?: {
      tone?: SnackbarTone
      /** Auto-dismiss delay; 0 = stay until dismissed. Default 10s for errors, 5s otherwise. */
      ms?: number
      onDismiss?: () => void
      action?: SnackbarAction
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
    actionLabel.value = opts?.action?.label ?? null
    actionCb = opts?.action?.onClick ?? null
    const ms =
      opts?.ms ??
      (nextTone === 'error' ? 10_000 : opts?.action ? 8_000 : 5_000)
    if (ms > 0) {
      timer = setTimeout(() => dismiss(), ms)
    }
  }

  /** Run the optional action callback, then dismiss (action may open another UI). */
  function runAction(): void {
    const cb = actionCb
    dismiss()
    cb?.()
  }

  return { message, tone, actionLabel, show, dismiss, runAction }
})
