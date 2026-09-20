import type { Clock } from '../../ports/Clock'
import type { IdGenerator } from '../../ports/IdGenerator'
import { newLocalId } from '../../offline/localLibraryDb'
import { allocatePrefixedId } from '../../lib/tagRoll/ids'

/** Production IdGenerator — same ids as the rest of SingTags offline. */
export function createBrowserIdGenerator(): IdGenerator {
  return {
    next(prefix: string): string {
      return newLocalId(prefix)
    },
  }
}

/** Pure fallback IdGenerator (tests / helpers without offline). */
export function createAllocateIdGenerator(): IdGenerator {
  return {
    next(prefix: string): string {
      return allocatePrefixedId(prefix)
    },
  }
}

export function createSystemClock(): Clock {
  return { now: () => Date.now() }
}

export function createFixedClock(t: number): Clock {
  return { now: () => t }
}

export function createSequentialIdGenerator(start = 1): IdGenerator {
  let n = start
  return {
    next(prefix: string): string {
      return `${prefix}_${n++}`
    },
  }
}
