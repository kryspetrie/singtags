import type { IdGenerator } from '../../../ports/IdGenerator'
import type { Clock } from '../../../ports/Clock'

export function createBrowserIdGenerator(): IdGenerator {
  return {
    next(prefix: string): string {
      return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
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
