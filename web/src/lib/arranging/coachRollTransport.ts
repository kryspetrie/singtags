/**
 * Coach transport bus — mirror dock transport on the piano roll (when Coach is open).
 */
import { readonly, shallowRef } from 'vue'
import type { CoachTransportView } from '../../composables/useCoachTransport'

export type CoachRollTransportState = {
  active: boolean
  model: CoachTransportView | null
}

export type CoachRollTransportHandlers = {
  prev: () => void
  next: () => void
  primary: () => void
  hear: () => void
  lock: () => void
  skip: () => void
  secondary?: () => void
}

const empty = (): CoachRollTransportState => ({ active: false, model: null })

const state = shallowRef<CoachRollTransportState>(empty())
let handlers: CoachRollTransportHandlers | null = null

export const coachRollTransportState = readonly(state)

export function publishCoachRollTransport(next: CoachRollTransportState): void {
  state.value = next
}

export function registerCoachRollTransport(h: CoachRollTransportHandlers): () => void {
  handlers = h
  return () => {
    if (handlers === h) handlers = null
  }
}

export function coachRollTransportPrev(): void {
  handlers?.prev()
}
export function coachRollTransportNext(): void {
  handlers?.next()
}
export function coachRollTransportPrimary(): void {
  handlers?.primary()
}
export function coachRollTransportHear(): void {
  handlers?.hear()
}
export function coachRollTransportLock(): void {
  handlers?.lock()
}
export function coachRollTransportSkip(): void {
  handlers?.skip()
}

export function coachRollTransportSecondary(): void {
  handlers?.secondary?.()
}

export function clearCoachRollTransportState(): void {
  state.value = empty()
}
