/**
 * Coach ↔ piano-roll transport bus (moment / gap / issue / problem stepping).
 */
import { readonly, shallowRef } from 'vue'

export type CoachRollNavState = {
  active: boolean
  chordMode: boolean
  issueMode: boolean
  /** Repair Check: prioritize unrecognized / empty / issues. */
  repairTour: boolean
  momentIndex: number
  momentCount: number
  emptyCount: number
  unrecognizedCount: number
  momentLabel: string
  issueCount: number
}

export type CoachRollNavHandlers = {
  stepMoment: (dir: -1 | 1) => void
  stepNextGap: () => void
  stepNextIssue: () => void
  /** Next empty → unrecognized → issue (repair tour). */
  stepNextProblem: () => void
}

const emptyState = (): CoachRollNavState => ({
  active: false,
  chordMode: false,
  issueMode: false,
  repairTour: false,
  momentIndex: -1,
  momentCount: 0,
  emptyCount: 0,
  unrecognizedCount: 0,
  momentLabel: '',
  issueCount: 0,
})

const state = shallowRef<CoachRollNavState>(emptyState())

let handlers: CoachRollNavHandlers | null = null

export const coachRollNavState = readonly(state)

export function publishCoachRollNavState(next: CoachRollNavState): void {
  state.value = next
}

export function registerCoachRollNav(h: CoachRollNavHandlers): () => void {
  handlers = h
  return () => {
    if (handlers === h) handlers = null
  }
}

export function coachRollNavStepMoment(dir: -1 | 1): void {
  handlers?.stepMoment(dir)
}

export function coachRollNavStepNextGap(): void {
  handlers?.stepNextGap()
}

export function coachRollNavStepNextIssue(): void {
  handlers?.stepNextIssue()
}

export function coachRollNavStepNextProblem(): void {
  handlers?.stepNextProblem()
}

export function clearCoachRollNavState(): void {
  state.value = emptyState()
}
