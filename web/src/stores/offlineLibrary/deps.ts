/** Shared mutable bag passed into store action modules. Lookups stay lazy. */
export type StoreDeps = Record<string, any>

export function lazyFn<T>(get: () => T): T {
  return ((...args: unknown[]) => (get() as (...a: unknown[]) => unknown)(...args)) as T
}
