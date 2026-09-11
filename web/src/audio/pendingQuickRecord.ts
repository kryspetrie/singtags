/**
 * Hand off an already-opened mic stream from Quick Record (list) to the session page.
 * Ensures getUserMedia runs on the same user gesture as the Quick Record tap.
 */

let pending: MediaStream | null = null

export function setPendingQuickRecordStream(stream: MediaStream): void {
  clearPendingQuickRecordStream()
  pending = stream
}

/** Take ownership of the pending stream (caller must stop tracks when done). */
export function takePendingQuickRecordStream(): MediaStream | null {
  const s = pending
  pending = null
  return s
}

export function clearPendingQuickRecordStream(): void {
  if (!pending) return
  for (const track of pending.getTracks()) {
    try {
      track.stop()
    } catch {
      /* ignore */
    }
  }
  pending = null
}
