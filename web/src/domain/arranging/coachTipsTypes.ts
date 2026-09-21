import type { WizardStep } from './types'

export type CoachTip = {
  step: WizardStep
  title: string
  body: string
  lessonId?: string
  glossaryIds?: string[]
  citations?: string[]
}
