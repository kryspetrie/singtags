import { ref } from 'vue'
import { defineStore } from 'pinia'

/** Visual tone for snackbar messages. */
export type SnackbarTone = 'error' | 'info' | 'ok'

/** Where the snackbar appears (`center` = prominent mid-screen overlay on mobile; bottom bar on desktop). */
export type SnackbarPlacement = 'default' | 'center'

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
  const title = ref<string | null>(null)
  const tone = ref<SnackbarTone>('info')
  const placement = ref<SnackbarPlacement>('default')
  const actionLabel = ref<string | null>(null)
  /** Remaining auto-dismiss window in ms; 0 = manual dismiss only (no countdown bar). */
  const autoDismissMs = ref(0)
  /** Increments each `show()` so countdown animations restart. */
  const showToken = ref(0)
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
    title.value = null
    placement.value = 'default'
    actionLabel.value = null
    actionCb = null
    autoDismissMs.value = 0
    const cb = onDismissCb
    onDismissCb = null
    cb?.()
  }

  /**
   * Show a transient message. Replaces any visible snackbar and resets its timer.
   *
   * @param msg - Body text (second line when `title` is set).
   * @param opts.title - Optional headline (e.g. centered mode toasts).
   * @param opts.tone - Visual style (`info`, `ok`, `error`). Default `info`.
   * @param opts.ms - Auto-dismiss delay; `0` stays until dismissed. Default 10s errors, 5s otherwise (8s with action).
   * @param opts.onDismiss - Called once when the snackbar is dismissed (manual or timeout).
   * @param opts.action - Optional button (e.g. Add to collection); cleared when dismissed.
   */
  function show(
    msg: string,
    opts?: {
      tone?: SnackbarTone
      /** Optional headline above `msg` (centered mode toasts). */
      title?: string
      /** Mobile-friendly centered card (e.g. Sing mode from the More menu). */
      placement?: SnackbarPlacement
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
    title.value = opts?.title ?? null
    tone.value = nextTone
    placement.value = opts?.placement ?? 'default'
    onDismissCb = opts?.onDismiss ?? null
    actionLabel.value = opts?.action?.label ?? null
    actionCb = opts?.action?.onClick ?? null
    const ms =
      opts?.ms ??
      (nextTone === 'error' ? 10_000 : opts?.action ? 8_000 : 5_000)
    autoDismissMs.value = ms > 0 ? ms : 0
    showToken.value += 1
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

  return { message, title, tone, placement, actionLabel, autoDismissMs, showToken, show, dismiss, runAction }
})
