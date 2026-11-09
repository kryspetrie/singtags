/**
 * IndexedDB writes (Tag Studio, My Library, recordings, arranging) don't go
 * through localStorage, so Drive sync listens here.
 */
let listener: (() => void) | null = null

export function onUserDataMutated(fn: (() => void) | null): void {
  listener = fn
}

export function markUserDataMutated(): void {
  listener?.()
}
