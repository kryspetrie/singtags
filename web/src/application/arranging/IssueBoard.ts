/**
 * Group arrangement lints for the Coach Issue board.
 */
import type { ArrangementLint, LintSeverity } from '../../domain/arranging/qa/types'

export type IssueGroupId = 'blockers' | 'improve' | 'info'

export type IssueGroup = {
  id: IssueGroupId
  title: string
  items: ArrangementLint[]
}

const SEV_TO_GROUP: Record<LintSeverity, IssueGroupId> = {
  error: 'blockers',
  warn: 'improve',
  info: 'info',
}

const TITLES: Record<IssueGroupId, string> = {
  blockers: 'Blockers',
  improve: 'Improve',
  info: 'Info',
}

export function groupIssues(lints: readonly ArrangementLint[]): IssueGroup[] {
  const buckets: Record<IssueGroupId, ArrangementLint[]> = {
    blockers: [],
    improve: [],
    info: [],
  }
  for (const lint of lints) {
    buckets[SEV_TO_GROUP[lint.severity] ?? 'info'].push(lint)
  }
  return (Object.keys(TITLES) as IssueGroupId[])
    .map((id) => ({ id, title: TITLES[id], items: buckets[id] }))
    .filter((g) => g.items.length > 0)
}

export function issueBoardSummary(lints: readonly ArrangementLint[]): {
  blockers: number
  improve: number
  info: number
} {
  let blockers = 0
  let improve = 0
  let info = 0
  for (const lint of lints) {
    if (lint.severity === 'error') blockers++
    else if (lint.severity === 'warn') improve++
    else info++
  }
  return { blockers, improve, info }
}
